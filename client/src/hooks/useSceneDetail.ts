import { useState, useEffect, useRef } from 'react';
import type { SceneDetail, TrackData } from '@adventure-racing/shared';
import { getScene, getCompressedTrack } from '../api/scenesApi';

export function useSceneDetail(sceneId: string) {
  const [scene, setScene] = useState<SceneDetail | null>(null);
  const [tracks, setTracks] = useState<Map<string, TrackData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const detail = await getScene(sceneId);
        if (cancelled) return;
        setScene(detail);

        if (detail.status === 'ready') {
          // Stop polling
          if (pollingRef.current) clearInterval(pollingRef.current);

          // Fetch all compressed tracks
          const trackMap = new Map<string, TrackData>();
          await Promise.all(
            detail.tracks.map(async (t) => {
              const data = await getCompressedTrack(sceneId, t.tracklogId);
              trackMap.set(t.tracklogId, data);
            })
          );
          if (!cancelled) {
            setTracks(trackMap);
            setLoading(false);
          }
        } else if (detail.status === 'error') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setError('Scene processing failed');
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load scene');
          setLoading(false);
        }
      }
    }

    poll();
    pollingRef.current = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [sceneId]);

  return { scene, tracks, loading, error };
}
