import { memo, useMemo } from 'react';
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

export const TrackSidebar = memo(function TrackSidebar({ scene, trackIds, visibleTrackIds, onToggleTrack, onShowAll, onHideAll }: Props) {
  // Pre-build lookup to avoid O(n*m) find() per track
  const pilotNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of scene.tracks) {
      map.set(t.tracklogId, t.pilotName);
    }
    return map;
  }, [scene]);

  return (
    <div style={containerStyle}>
      <h3 style={titleStyle}>{scene.name}</h3>
      <div style={btnRowStyle}>
        <button onClick={onShowAll} style={smallBtn}>Show All</button>
        <button onClick={onHideAll} style={smallBtn}>Hide All</button>
      </div>
      <div>
        {trackIds.map((id, index) => (
          <TrackToggle
            key={id}
            trackId={id}
            pilotName={pilotNameMap.get(id) || 'Unknown'}
            index={index}
            visible={visibleTrackIds.has(id)}
            onToggle={onToggleTrack}
          />
        ))}
      </div>
    </div>
  );
});

const containerStyle: React.CSSProperties = {
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
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  marginBottom: 8,
  color: '#fff',
};

const btnRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 8,
};

const smallBtn: React.CSSProperties = {
  background: '#333',
  border: 'none',
  color: '#aaa',
  padding: '4px 10px',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
};
