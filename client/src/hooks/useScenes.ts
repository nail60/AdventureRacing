import { useState, useEffect, useCallback } from 'react';
import type { SceneMeta } from '@adventure-racing/shared';
import { listScenes } from '../api/scenesApi';

export function useScenes() {
  const [scenes, setScenes] = useState<SceneMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listScenes();
      setScenes(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load scenes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { scenes, loading, error, refresh };
}
