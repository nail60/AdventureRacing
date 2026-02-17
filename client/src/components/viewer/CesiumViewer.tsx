import { useMemo, useEffect, useRef } from 'react';
import { Viewer } from 'resium';
import {
  Viewer as CesiumViewerType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Ion,
  Terrain,
  JulianDate,
  ClockRange,
  ClockStep,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  ConstantProperty,
  CallbackProperty,
  Color,
  HeightReference,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  defined,
} from 'cesium';
import type { Entity as CesiumEntity } from 'cesium';
import type { CesiumComponentRef } from 'resium';
import type { TrackData } from '@adventure-racing/shared';
import { TrackEntity } from './TrackEntity';
import { getTrackColorCesium } from '../../utils/colorPalette';

// Only set Ion token if provided via env
const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (ionToken) {
  Ion.defaultAccessToken = ionToken;
}

// Create terrain once at module level
const worldTerrain = ionToken ? Terrain.fromWorldTerrain() : undefined;

interface Props {
  viewerRef: React.RefObject<CesiumComponentRef<CesiumViewerType> | null>;
  tracks: Map<string, TrackData>;
  trackIds: string[];
  visibleTrackIds: Set<string>;
  startTime: JulianDate | null;
  stopTime: JulianDate | null;
}

export function CesiumViewer({ viewerRef, tracks, trackIds, visibleTrackIds, startTime, stopTime }: Props) {

    // Fly to starting area on load — retry until viewer ref is ready
    const cameraInitialized = useRef(false);
    useEffect(() => {
      if (trackIds.length === 0) return;
      cameraInitialized.current = false;
      let rafId: number | undefined;

      function tryFly() {
        if (cameraInitialized.current) return;
        const viewer = viewerRef.current?.cesiumElement;
        if (!viewer) {
          rafId = requestAnimationFrame(tryFly);
          return;
        }

        let startLat = 47.3;
        let startLon = 12.1;
        for (const id of trackIds) {
          const track = tracks.get(id);
          if (track && track.positions.length > 0) {
            startLat = track.positions[0][0];
            startLon = track.positions[0][1];
            break;
          }
        }

        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(startLon, startLat, 100000),
          orientation: {
            heading: 0,
            pitch: CesiumMath.toRadians(-90),
            roll: 0,
          },
          duration: 0,
        });

        // Set clock to track time range so entities have valid positions
        if (startTime && stopTime) {
          viewer.clock.startTime = startTime;
          viewer.clock.stopTime = stopTime;
          viewer.clock.currentTime = JulianDate.clone(startTime);
          viewer.clock.clockRange = ClockRange.LOOP_STOP;
          viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK_MULTIPLIER;
          viewer.clock.multiplier = 4;
          viewer.clock.shouldAnimate = false;
        }

        cameraInitialized.current = true;
      }
      tryFly();

      return () => {
        if (rafId !== undefined) cancelAnimationFrame(rafId);
      };
    }, [tracks, trackIds, startTime, stopTime]);

    // Memoize track entities to avoid re-creating on every render
    const trackEntities = useMemo(() => {
      return trackIds.map((id, index) => {
        const track = tracks.get(id);
        if (!track) return null;
        const color = getTrackColorCesium(index);
        return { id, track, color };
      }).filter(Boolean) as { id: string; track: TrackData; color: [number, number, number, number] }[];
    }, [tracks, trackIds]);

    // Build lookup keyed by pilotName for tooltip — uses server metrics when available
    interface TrackLookup {
      positions: [number, number, number][];
      timestamps: number[];
      speed: (number | null)[];
      lift: (number | null)[];
      glideRatio: (number | null)[];
      optimizedDistance: number[];
    }
    const trackLookupRef = useRef<Map<string, TrackLookup>>(new Map());
    useMemo(() => {
      const lookup = new Map<string, TrackLookup>();
      for (const track of tracks.values()) {
        if (track.speed) {
          // Server-side metrics available
          lookup.set(track.pilotName, {
            positions: track.positions,
            timestamps: track.timestamps,
            speed: track.speed,
            lift: track.lift || [],
            glideRatio: track.glideRatio || [],
            optimizedDistance: track.optimizedDistance || [],
          });
        } else {
          // Fallback: compute speed client-side for old data
          const speed: (number | null)[] = [null];
          for (let i = 1; i < track.positions.length; i++) {
            const [lat1, lon1, alt1] = track.positions[i - 1];
            const [lat2, lon2, alt2] = track.positions[i];
            const dt = (track.timestamps[i] - track.timestamps[i - 1]) / 1000;
            if (dt <= 0) { speed.push(speed[speed.length - 1]); continue; }
            const dLat = (lat2 - lat1) * 111320;
            const dLon = (lon2 - lon1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
            const dAlt = alt2 - alt1;
            const dist = Math.sqrt(dLat * dLat + dLon * dLon + dAlt * dAlt);
            speed.push((dist / dt) * 3.6);
          }
          lookup.set(track.pilotName, {
            positions: track.positions,
            timestamps: track.timestamps,
            speed,
            lift: [],
            glideRatio: [],
            optimizedDistance: [],
          });
        }
      }
      trackLookupRef.current = lookup;
    }, [tracks]);

    // Measurement tool state
    const measureStateRef = useRef<'IDLE' | 'FIRST_PLACED' | 'MEASURED'>('IDLE');
    const measurePoint1Ref = useRef<Cartesian3 | null>(null);
    const measurePoint2Ref = useRef<Cartesian3 | null>(null);
    const measureMouseRef = useRef<Cartesian3 | null>(null);
    const measureEntitiesRef = useRef<CesiumEntity[]>([]);
    const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

    // Hover/tap tooltip + track highlight — direct DOM manipulation, no React re-renders
    const tooltipRef = useRef<HTMLDivElement>(null);
    const hoveredEntityRef = useRef<CesiumEntity | null>(null);

    useEffect(() => {
      let handler: ScreenSpaceEventHandler | null = null;
      let rafId: number | undefined;
      const normalWidth = new ConstantProperty(2);
      const highlightWidth = new ConstantProperty(4);

      // --- Measurement helpers ---

      function clearMeasurement(viewer: CesiumViewerType) {
        for (const entity of measureEntitiesRef.current) {
          viewer.entities.remove(entity);
        }
        measureEntitiesRef.current = [];
        measurePoint1Ref.current = null;
        measurePoint2Ref.current = null;
        measureMouseRef.current = null;
      }

      function formatDistance(meters: number): string {
        return meters >= 1000
          ? `${(meters / 1000).toFixed(2)} km`
          : `${Math.round(meters)} m`;
      }

      function getTerrainAltitude(viewer: CesiumViewerType, cartesian: Cartesian3): { msl: number } {
        const carto = Cartographic.fromCartesian(cartesian);
        const terrainHeight = viewer.scene.globe.getHeight(carto);
        const msl = terrainHeight != null ? Math.round(terrainHeight) : Math.round(carto.height);
        return { msl };
      }

      function altitudeLabel(alt: { msl: number }): string {
        return `${alt.msl}m`;
      }

      function placeFirstPoint(viewer: CesiumViewerType, position: Cartesian3) {
        measurePoint1Ref.current = position;
        measureMouseRef.current = position;

        const alt = getTerrainAltitude(viewer, position);

        // Point marker
        measureEntitiesRef.current.push(viewer.entities.add({
          position,
          point: {
            pixelSize: 10,
            color: Color.YELLOW,
            outlineColor: Color.BLACK,
            outlineWidth: 1,
            heightReference: HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: altitudeLabel(alt),
            font: '13px sans-serif',
            fillColor: Color.YELLOW,
            style: LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.CENTER,
            pixelOffset: new Cartesian2(0, -10),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }));

        // Rubber-band polyline
        measureEntitiesRef.current.push(viewer.entities.add({
          polyline: {
            positions: new CallbackProperty(() => {
              const p1 = measurePoint1Ref.current;
              const p2 = measureMouseRef.current;
              return p1 && p2 ? [p1, p2] : [];
            }, false) as any,
            width: 2,
            material: Color.YELLOW.withAlpha(0.7),
            clampToGround: false,
          },
        }));

        // Live distance label at midpoint
        measureEntitiesRef.current.push(viewer.entities.add({
          position: new CallbackProperty(() => {
            const p1 = measurePoint1Ref.current;
            const p2 = measureMouseRef.current;
            if (!p1 || !p2) return p1 || Cartesian3.ZERO;
            return Cartesian3.midpoint(p1, p2, new Cartesian3());
          }, false) as any,
          label: {
            text: new CallbackProperty(() => {
              const p1 = measurePoint1Ref.current;
              const p2 = measureMouseRef.current;
              if (!p1 || !p2) return '';
              return formatDistance(Cartesian3.distance(p1, p2));
            }, false) as any,
            font: 'bold 15px sans-serif',
            fillColor: Color.WHITE,
            style: LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Color.BLACK,
            outlineWidth: 4,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.CENTER,
            pixelOffset: new Cartesian2(0, -8),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }));
      }

      function finalizeMeasurement(viewer: CesiumViewerType, position: Cartesian3) {
        measurePoint2Ref.current = position;

        const p1 = measurePoint1Ref.current!;
        const alt1 = getTerrainAltitude(viewer, p1);
        const alt2 = getTerrainAltitude(viewer, position);
        const dist = Cartesian3.distance(p1, position);
        const midpoint = Cartesian3.midpoint(p1, position, new Cartesian3());

        // Remove rubber-band entities (polyline + live label), keep point 1 marker
        const rubberBandEntities = measureEntitiesRef.current.splice(1, 2);
        for (const entity of rubberBandEntities) {
          viewer.entities.remove(entity);
        }

        // Update point 1 label to refreshed altitude (in case terrain loaded more)
        const p1Entity = measureEntitiesRef.current[0];
        if (p1Entity?.label) {
          p1Entity.label.text = new ConstantProperty(altitudeLabel(alt1));
        }

        // Static polyline
        measureEntitiesRef.current.push(viewer.entities.add({
          polyline: {
            positions: [p1, position],
            width: 3,
            material: Color.YELLOW,
            clampToGround: false,
          },
        }));

        // Second point marker with altitude label
        measureEntitiesRef.current.push(viewer.entities.add({
          position,
          point: {
            pixelSize: 10,
            color: Color.YELLOW,
            outlineColor: Color.BLACK,
            outlineWidth: 1,
            heightReference: HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: altitudeLabel(alt2),
            font: '13px sans-serif',
            fillColor: Color.YELLOW,
            style: LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.CENTER,
            pixelOffset: new Cartesian2(0, -10),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }));

        // Distance label at midpoint
        measureEntitiesRef.current.push(viewer.entities.add({
          position: midpoint,
          label: {
            text: formatDistance(dist),
            font: 'bold 15px sans-serif',
            fillColor: Color.WHITE,
            style: LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Color.BLACK,
            outlineWidth: 4,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.CENTER,
            pixelOffset: new Cartesian2(0, -8),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }));
      }

      // --- Tooltip helpers (unchanged) ---

      function showTooltip(position: { x: number; y: number }, entity: CesiumEntity, viewer: CesiumViewerType) {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;
        const name = entity.name || '';

        // Get altitude + metrics from the exact point under the cursor
        let detailLine = '';
        let timeStr = '';
        const pickedPos = viewer.scene.pickPosition(new Cartesian2(position.x, position.y));
        if (pickedPos) {
          const carto = Cartographic.fromCartesian(pickedPos);
          const altMSL = Math.round(carto.height);
          const terrainHeight = viewer.scene.globe.getHeight(carto);
          const agl = terrainHeight != null ? Math.round(carto.height - terrainHeight) : null;

          // Find nearest track point for metric lookup
          let metricsHtml = '';
          const info = trackLookupRef.current.get(name);
          if (info) {
            const lat = CesiumMath.toDegrees(carto.latitude);
            const lon = CesiumMath.toDegrees(carto.longitude);
            let minDist = Infinity;
            let nearestIdx = 0;
            for (let i = 0; i < info.positions.length; i++) {
              const dLat = info.positions[i][0] - lat;
              const dLon = info.positions[i][1] - lon;
              const d = dLat * dLat + dLon * dLon;
              if (d < minDist) { minDist = d; nearestIdx = i; }
            }

            const ts = info.timestamps[nearestIdx];
            if (ts != null) {
              timeStr = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }

            const spd = info.speed[nearestIdx];
            const spdStr = spd != null ? ` · ${Math.round(spd)} km/h` : '';

            const lft = info.lift[nearestIdx];
            const lftStr = lft != null ? ` · ${lft >= 0 ? '+' : ''}${lft.toFixed(1)} m/s` : '';

            const ld = info.glideRatio[nearestIdx];
            const ldStr = ld != null ? ` · L/D ${Math.round(ld)}` : '';

            metricsHtml = spdStr + lftStr + ldStr;

            const optDist = info.optimizedDistance[nearestIdx];
            if (optDist != null && optDist > 0) {
              const optStr = optDist >= 1000
                ? `${(optDist / 1000).toFixed(1)} km`
                : `${Math.round(optDist)} m`;
              metricsHtml += `<br/><span style="color:#8cf">OPT ${optStr}</span>`;
            }
          }

          detailLine = `<div style="font-size:12px;color:#aaa;margin-top:2px">${altMSL}m MSL${agl != null ? ` · ${agl}m AGL` : ''}${metricsHtml}</div>`;
        }

        tooltip.innerHTML = `<div style="font-weight:600">${name}${timeStr ? `<span style="font-weight:400;color:#aaa;margin-left:8px">${timeStr}</span>` : ''}</div>${detailLine}`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${position.x + 15}px`;
        tooltip.style.top = `${position.y - 10}px`;
      }

      function hideTooltip() {
        const tooltip = tooltipRef.current;
        if (tooltip) tooltip.style.display = 'none';
      }

      function highlightEntity(entity: CesiumEntity | null) {
        // Restore previous
        const prev = hoveredEntityRef.current;
        if (prev && prev.path) {
          prev.path.width = normalWidth;
        }
        // Highlight new
        hoveredEntityRef.current = entity;
        if (entity && entity.path) {
          entity.path.width = highlightWidth;
        }
      }

      function handlePick(position: { x: number; y: number }, viewer: CesiumViewerType) {
        const picked = viewer.scene.pick(new Cartesian2(position.x, position.y));
        if (defined(picked) && picked.id?.name) {
          const entity = picked.id as CesiumEntity;
          showTooltip(position, entity, viewer);
          highlightEntity(entity);
        } else {
          hideTooltip();
          highlightEntity(null);
        }
      }

      // --- Escape key handler ---
      function onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape' && measureStateRef.current === 'FIRST_PLACED') {
          const viewer = viewerRef.current?.cesiumElement;
          if (viewer) clearMeasurement(viewer);
          measureStateRef.current = 'IDLE';
        }
      }
      document.addEventListener('keydown', onKeyDown);

      function trySetup() {
        const viewer = viewerRef.current?.cesiumElement;
        if (!viewer) {
          rafId = requestAnimationFrame(trySetup);
          return;
        }
        handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        // Desktop: hover + rubber-band update
        handler.setInputAction((movement: { endPosition: { x: number; y: number } }) => {
          handlePick(movement.endPosition, viewer);

          // Update rubber-band cursor position
          if (measureStateRef.current === 'FIRST_PLACED') {
            const pos = viewer.scene.pickPosition(new Cartesian2(movement.endPosition.x, movement.endPosition.y));
            if (pos) {
              measureMouseRef.current = pos;
            }
          }
        }, ScreenSpaceEventType.MOUSE_MOVE);

        // Drag-safe click detection: record mouse-down position
        handler.setInputAction((click: { position: { x: number; y: number } }) => {
          mouseDownPosRef.current = { x: click.position.x, y: click.position.y };
        }, ScreenSpaceEventType.LEFT_DOWN);

        // On mouse-up: if moved < 5px, treat as click → measurement state machine
        handler.setInputAction((click: { position: { x: number; y: number } }) => {
          const down = mouseDownPosRef.current;
          mouseDownPosRef.current = null;
          if (!down) return;

          const dx = click.position.x - down.x;
          const dy = click.position.y - down.y;
          if (dx * dx + dy * dy > 25) return; // dragged — not a click

          const pos = viewer.scene.pickPosition(new Cartesian2(click.position.x, click.position.y));

          if (measureStateRef.current === 'FIRST_PLACED') {
            if (!pos) {
              // Clicked sky/void — cancel
              clearMeasurement(viewer);
              measureStateRef.current = 'IDLE';
              return;
            }
            finalizeMeasurement(viewer, pos);
            measureStateRef.current = 'MEASURED';
          } else {
            // IDLE or MEASURED — clear and start new
            if (!pos) return; // clicked sky with no active measurement — ignore
            clearMeasurement(viewer);
            placeFirstPoint(viewer, pos);
            measureStateRef.current = 'FIRST_PLACED';
          }
        }, ScreenSpaceEventType.LEFT_UP);
      }
      trySetup();

      return () => {
        if (rafId !== undefined) cancelAnimationFrame(rafId);
        highlightEntity(null);
        document.removeEventListener('keydown', onKeyDown);
        const viewer = viewerRef.current?.cesiumElement;
        if (viewer) clearMeasurement(viewer);
        handler?.destroy();
      };
    }, [viewerRef]);

    return (<>
      <div ref={tooltipRef} style={tooltipStyle} />
      <Viewer
        ref={viewerRef}
        full
        terrain={worldTerrain}
        timeline={false}
        animation={false}
        homeButton={false}
        baseLayerPicker={false}
        navigationHelpButton={false}
        geocoder={false}
        sceneModePicker={false}
        fullscreenButton={false}
        selectionIndicator={false}
        infoBox={false}
        shouldAnimate={false}
      >
        {trackEntities.map(({ id, track, color }) => (
          <TrackEntity
            key={id}
            track={track}
            color={color}
            visible={visibleTrackIds.has(id)}
          />
        ))}
      </Viewer>
    </>);
}

const tooltipStyle: React.CSSProperties = {
  position: 'fixed',
  display: 'none',
  pointerEvents: 'none',
  zIndex: 20,
  fontSize: 14,
  fontWeight: 600,
  color: '#fff',
  background: 'rgba(20,20,20,0.92)',
  border: '1px solid #333',
  borderRadius: 6,
  padding: '4px 10px',
  whiteSpace: 'nowrap',
};
