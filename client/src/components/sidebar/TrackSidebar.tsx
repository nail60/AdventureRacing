import { memo, useMemo } from 'react';
import type { SceneDetail, TaskData } from '@adventure-racing/shared';
import { TrackToggle } from './TrackToggle';
import { TaskPanel } from './TaskPanel';

interface Props {
  scene: SceneDetail;
  trackIds: string[];
  visibleTrackIds: Set<string>;
  onToggleTrack: (trackId: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
  measuringActive?: boolean;
  onToggleMeasuring?: () => void;
  task?: TaskData | null;
  onDeleteTask?: () => void;
}

export const TrackSidebar = memo(function TrackSidebar({
  scene,
  trackIds,
  visibleTrackIds,
  onToggleTrack,
  onShowAll,
  onHideAll,
  collapsed,
  onToggleCollapse,
  isMobile,
  measuringActive,
  onToggleMeasuring,
  task,
  onDeleteTask,
}: Props) {
  const pilotNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of scene.tracks) {
      map.set(t.tracklogId, t.pilotName);
    }
    return map;
  }, [scene]);

  if (collapsed) {
    return (
      <div style={collapsedRowStyle}>
        {isMobile && onToggleMeasuring && (
          <button onClick={onToggleMeasuring} style={{
            ...collapsedBtnStyle,
            position: undefined,
            top: undefined,
            right: undefined,
            background: measuringActive ? 'rgba(79,195,247,0.25)' : 'rgba(20,20,20,0.92)',
            border: measuringActive ? '1px solid #4fc3f7' : '1px solid #333',
            color: measuringActive ? '#4fc3f7' : '#fff',
          }}>
            {'\uD83D\uDCCF'}
          </button>
        )}
        <button onClick={onToggleCollapse} style={{ ...collapsedBtnStyle, position: undefined, top: undefined, right: undefined }}>
          {'\u{1FA82}'} {'\u2630'}
        </button>
      </div>
    );
  }

  const containerStyle: React.CSSProperties = isMobile
    ? mobileContainerStyle
    : desktopContainerStyle;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>{scene.name}</h3>
        <button onClick={onToggleCollapse} style={closeBtnStyle}>{'\u2715'}</button>
      </div>
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
      {task && onDeleteTask && (
        <TaskPanel task={task} onDeleteTask={onDeleteTask} />
      )}
    </div>
  );
});

const collapsedRowStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  display: 'flex',
  gap: 10,
  zIndex: 30,
};

const collapsedBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  background: 'rgba(20,20,20,0.92)',
  border: '1px solid #333',
  color: '#fff',
  padding: '12px 16px',
  borderRadius: 8,
  fontSize: 20,
  cursor: 'pointer',
  zIndex: 30,
  minWidth: 48,
  minHeight: 48,
};

const baseContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  maxHeight: 'calc(100vh - 120px)',
  background: 'rgba(20,20,20,0.92)',
  borderRadius: 8,
  padding: 12,
  overflow: 'auto',
  zIndex: 30,
  border: '1px solid #333',
};

const desktopContainerStyle: React.CSSProperties = {
  ...baseContainerStyle,
  right: 10,
  width: 360,
};

const mobileContainerStyle: React.CSSProperties = {
  ...baseContainerStyle,
  left: 10,
  right: 10,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#fff',
  margin: 0,
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  fontSize: 16,
  cursor: 'pointer',
  padding: '2px 6px',
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
