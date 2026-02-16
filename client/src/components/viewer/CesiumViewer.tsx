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
  defined,
} from 'cesium';
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

    // Build pilotName → CSS color lookup for hover tooltip
    const colorLookup = useMemo(() => {
      const map = new Map<string, string>();
      for (const { track, color } of trackEntities) {
        const [r, g, b] = color;
        map.set(track.pilotName, `rgb(${r},${g},${b})`);
      }
      return map;
    }, [trackEntities]);

    // Hover tooltip — direct DOM manipulation, no React re-renders
    const tooltipRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      let handler: ScreenSpaceEventHandler | null = null;

      function trySetup() {
        const viewer = viewerRef.current?.cesiumElement;
        if (!viewer) {
          requestAnimationFrame(trySetup);
          return;
        }
        handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement: { endPosition: { x: number; y: number } }) => {
          const tooltip = tooltipRef.current;
          if (!tooltip) return;

          const picked = viewer.scene.pick(movement.endPosition);
          if (defined(picked) && picked.id?.name) {
            const name = picked.id.name as string;
            const color = colorLookup.get(name) || '#fff';
            tooltip.textContent = name;
            tooltip.style.display = 'block';
            tooltip.style.left = `${movement.endPosition.x + 15}px`;
            tooltip.style.top = `${movement.endPosition.y - 10}px`;
            tooltip.style.color = color;
          } else {
            tooltip.style.display = 'none';
          }
        }, ScreenSpaceEventType.MOUSE_MOVE);
      }
      trySetup();

      return () => handler?.destroy();
    }, [viewerRef, colorLookup]);

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
  fontWeight: 'bold',
  fontSize: 12,
  fontFamily: 'system-ui',
  textShadow: '0 0 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)',
  whiteSpace: 'nowrap',
};
