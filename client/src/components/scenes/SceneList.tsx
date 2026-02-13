import type { SceneMeta } from '@adventure-racing/shared';
import { SceneCard } from './SceneCard';

interface Props {
  scenes: SceneMeta[];
  loading: boolean;
  onDelete?: (id: string) => void;
}

export function SceneList({ scenes, loading, onDelete }: Props) {
  if (loading) {
    return <p style={{ color: '#888' }}>Loading scenes...</p>;
  }

  if (scenes.length === 0) {
    return <p style={{ color: '#666' }}>No scenes yet. Upload some track files to get started.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {scenes.map(scene => (
        <SceneCard key={scene.id} scene={scene} onDelete={onDelete} />
      ))}
    </div>
  );
}
