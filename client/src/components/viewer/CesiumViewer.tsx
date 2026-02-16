import { useMemo, useEffect, useRef } from 'react';
import { Viewer } from 'resium';
import {
  Viewer as CesiumViewerType,
  Cartesian3,
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

      function tryFly() {
        if (cameraInitialized.current) return;
        const viewer = viewerRef.current?.cesiumElement;
        if (!viewer) {
          requestAnimationFrame(tryFly);
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

    // Hover/tap tooltip + track highlight — direct DOM manipulation, no React re-renders
    const tooltipRef = useRef<HTMLDivElement>(null);
    const hoveredEntityRef = useRef<CesiumEntity | null>(null);

    useEffect(() => {
      let handler: ScreenSpaceEventHandler | null = null;

      function showTooltip(position: { x: number; y: number }, entity: CesiumEntity) {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;
        const name = entity.name || '';
        tooltip.textContent = name;
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
          prev.path.width = new ConstantProperty(2);
        }
        // Highlight new
        hoveredEntityRef.current = entity;
        if (entity && entity.path) {
          entity.path.width = new ConstantProperty(4);
        }
      }

      function handlePick(position: { x: number; y: number }, viewer: CesiumViewerType) {
        const picked = viewer.scene.pick(position);
        if (defined(picked) && picked.id?.name) {
          const entity = picked.id as CesiumEntity;
          showTooltip(position, entity);
          highlightEntity(entity);
        } else {
          hideTooltip();
          highlightEntity(null);
        }
      }

      function trySetup() {
        const viewer = viewerRef.current?.cesiumElement;
        if (!viewer) {
          requestAnimationFrame(trySetup);
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
