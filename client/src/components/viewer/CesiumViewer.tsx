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

    // Hover/tap tooltip + track highlight — direct DOM manipulation, no React re-renders
    const tooltipRef = useRef<HTMLDivElement>(null);
    const hoveredEntityRef = useRef<CesiumEntity | null>(null);

    useEffect(() => {
      let handler: ScreenSpaceEventHandler | null = null;
      let rafId: number | undefined;
      const normalWidth = new ConstantProperty(2);
      const highlightWidth = new ConstantProperty(4);

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

      function trySetup() {
        const viewer = viewerRef.current?.cesiumElement;
        if (!viewer) {
          rafId = requestAnimationFrame(trySetup);
          return;
        }
        handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        // Desktop: hover
        handler.setInputAction((movement: { endPosition: { x: number; y: number } }) => {
          handlePick(movement.endPosition, viewer);
        }, ScreenSpaceEventType.MOUSE_MOVE);

        // Mobile: tap
        handler.setInputAction((click: { position: { x: number; y: number } }) => {
          handlePick(click.position, viewer);
        }, ScreenSpaceEventType.LEFT_CLICK);
      }
      trySetup();

      return () => {
        if (rafId !== undefined) cancelAnimationFrame(rafId);
        highlightEntity(null);
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
