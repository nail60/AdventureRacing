import { Link } from 'react-router-dom';
import type { SceneMeta } from '@adventure-racing/shared';
import { formatDate } from '../../utils/timeUtils';

interface Props {
  scene: SceneMeta;
  onDelete?: (id: string) => void;
}

export function SceneCard({ scene, onDelete }: Props) {
  const statusColor = scene.status === 'ready' ? '#4caf50'
    : scene.status === 'processing' ? '#ff9800'
    : '#f44336';

  return (
    <div style={{
      background: '#161616',
      borderRadius: 8,
      padding: 16,
      border: '1px solid #333',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Link to={`/scenes/${scene.id}`} style={{ fontSize: 16, fontWeight: 600 }}>
          {scene.name}
        </Link>
        <span style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 10,
          background: statusColor + '22',
          color: statusColor,
          fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          {scene.status}
        </span>
      </div>
      <div style={{ fontSize: 13, color: '#888', marginTop: 8, display: 'flex', gap: 16 }}>
        <span>{scene.trackCount} track{scene.trackCount !== 1 ? 's' : ''}</span>
        <span>{formatDate(scene.createdAt)}</span>
      </div>
      {scene.status === 'processing' && scene.processingStep && (
        <div style={{ fontSize: 12, color: '#ff9800', marginTop: 6 }}>
          {scene.processingStep}
        </div>
      )}
      {onDelete && (
        <button
          onClick={() => onDelete(scene.id)}
          style={{
            marginTop: 8,
            background: 'none',
            border: 'none',
            color: '#666',
            fontSize: 12,
            padding: 0,
          }}
        >
          Delete
        </button>
      )}
    </div>
  );
}
