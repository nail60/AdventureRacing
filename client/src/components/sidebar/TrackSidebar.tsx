import type { SceneDetail } from '@adventure-racing/shared';
import { TrackToggle } from './TrackToggle';

interface Props {
  scene: SceneDetail;
  trackIds: string[];
  visibleTrackIds: Set<string>;
  onToggleTrack: (trackId: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

export function TrackSidebar({ scene, trackIds, visibleTrackIds, onToggleTrack, onShowAll, onHideAll }: Props) {
  return (
    <div style={{
      position: 'absolute',
      top: 10,
      right: 10,
      width: 240,
      maxHeight: 'calc(100vh - 120px)',
      background: 'rgba(20,20,20,0.92)',
      borderRadius: 8,
      padding: 12,
      overflow: 'auto',
      zIndex: 10,
      border: '1px solid #333',
    }}>
      <h3 style={{ fontSize: 14, marginBottom: 8, color: '#fff' }}>{scene.name}</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={onShowAll} style={smallBtn}>Show All</button>
        <button onClick={onHideAll} style={smallBtn}>Hide All</button>
      </div>
      <div>
        {trackIds.map((id, index) => {
          const info = scene.tracks.find(t => t.tracklogId === id);
          return (
            <TrackToggle
              key={id}
              trackId={id}
              pilotName={info?.pilotName || 'Unknown'}
              index={index}
              visible={visibleTrackIds.has(id)}
              onToggle={onToggleTrack}
            />
          );
        })}
      </div>
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  background: '#333',
  border: 'none',
  color: '#aaa',
  padding: '4px 10px',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
};
