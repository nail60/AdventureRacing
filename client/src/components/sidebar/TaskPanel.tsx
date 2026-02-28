import { useMemo } from 'react';
import type { TaskData } from '@adventure-racing/shared';

interface Props {
  task: TaskData;
  onDeleteTask: () => void;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function TaskPanel({ task, onDeleteTask }: Props) {
  const legDistances = useMemo(() => {
    const distances: (number | null)[] = [];
    for (let i = 0; i < task.turnpoints.length; i++) {
      if (i < task.turnpoints.length - 1) {
        const a = task.turnpoints[i];
        const b = task.turnpoints[i + 1];
        distances.push(haversineDistance(a.lat, a.lon, b.lat, b.lon));
      } else {
        distances.push(null);
      }
    }
    return distances;
  }, [task]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13, color: '#aaa' }}>
          Task <span style={badgeStyle}>{task.taskType}</span>
        </h4>
        <button onClick={onDeleteTask} style={deleteBtnStyle}>Delete</button>
      </div>

      {task.optimizedDistance != null && task.optimizedDistance > 0 && (
        <div style={{ fontSize: 15, fontWeight: 600, color: '#4fc3f7', marginBottom: 8 }}>
          Task Distance: {formatDistance(task.optimizedDistance)}
        </div>
      )}

      <div style={{ fontSize: 12 }}>
        {task.turnpoints.map((tp, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 0',
            color: '#ccc',
          }}>
            <span style={{ ...typeBadgeStyle, background: typeColor(tp.type) }}>
              {tp.type === 'TURNPOINT' ? 'TP' : tp.type}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tp.name}
            </span>
            <span style={{ color: '#888', fontSize: 11 }}>
              {formatDistance(tp.radius)}
            </span>
            {legDistances[i] != null && (
              <span style={{ color: '#666', fontSize: 11, minWidth: 50, textAlign: 'right' }}>
                {formatDistance(legDistances[i]!)}
              </span>
            )}
          </div>
        ))}
      </div>

      {task.sss && task.sss.timeGates.length > 0 && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
          Start: {task.sss.timeGates[0]} ({task.sss.direction})
        </div>
      )}
      {task.goalDeadline && (
        <div style={{ fontSize: 11, color: '#888' }}>
          Deadline: {task.goalDeadline}
        </div>
      )}
    </div>
  );
}

function typeColor(type: string): string {
  if (type === 'SSS') return '#4CAF50';
  if (type === 'ESS') return '#f44336';
  return '#FF9800';
}

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: '#333',
  color: '#aaa',
  padding: '1px 5px',
  borderRadius: 3,
  marginLeft: 6,
};

const typeBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#fff',
  padding: '1px 4px',
  borderRadius: 3,
  minWidth: 22,
  textAlign: 'center',
};

const deleteBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #555',
  color: '#f44',
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 4,
  cursor: 'pointer',
};
