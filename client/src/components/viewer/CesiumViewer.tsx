import { useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Viewer } from 'resium';
import {
  Viewer as CesiumViewerType,
  Cartesian3,
  Math as CesiumMath,
  Ion,
  Terrain,
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
  tracks: Map<string, TrackData>;
  trackIds: string[];
  visibleTrackIds: Set<string>;
}

export const CesiumViewer = forwardRef<CesiumComponentRef<CesiumViewerType>, Props>(
  ({ tracks, trackIds, visibleTrackIds }, ref) => {
    const viewerRef = useRef<CesiumComponentRef<CesiumViewerType>>(null);

    useImperativeHandle(ref, () => viewerRef.current!);

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
        cameraInitialized.current = true;
      }
      tryFly();
    }, [tracks, trackIds]);

    // Memoize track entities to avoid re-creating on every render
    const trackEntities = useMemo(() => {
      return trackIds.map((id, index) => {
        const track = tracks.get(id);
        if (!track) return null;
        const color = getTrackColorCesium(index);
        return { id, track, color };
      }).filter(Boolean) as { id: string; track: TrackData; color: [number, number, number, number] }[];
    }, [tracks, trackIds]);

    return (
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
    );
  }
);
