import { getTrackColor } from '../../utils/colorPalette';

interface Props {
  trackId: string;
  pilotName: string;
  index: number;
  visible: boolean;
  onToggle: (trackId: string) => void;
}

export function TrackToggle({ trackId, pilotName, index, visible, onToggle }: Props) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 0',
      cursor: 'pointer',
      opacity: visible ? 1 : 0.4,
    }}>
      <input
        type="checkbox"
        checked={visible}
        onChange={() => onToggle(trackId)}
        style={{ accentColor: getTrackColor(index) }}
      />
      <span style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: getTrackColor(index),
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 13, color: '#ddd' }}>{pilotName}</span>
    </label>
  );
}
