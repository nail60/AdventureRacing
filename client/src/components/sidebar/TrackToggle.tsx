import { memo, useCallback, useMemo } from 'react';
import { getTrackColor } from '../../utils/colorPalette';

interface Props {
  trackId: string;
  pilotName: string;
  index: number;
  visible: boolean;
  onToggle: (trackId: string) => void;
}

export const TrackToggle = memo(function TrackToggle({ trackId, pilotName, index, visible, onToggle }: Props) {
  const handleChange = useCallback(() => onToggle(trackId), [onToggle, trackId]);
  const color = getTrackColor(index);

  const labelStyle = useMemo((): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    cursor: 'pointer',
    opacity: visible ? 1 : 0.4,
  }), [visible]);

  const dotStyle = useMemo((): React.CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }), [color]);

  return (
    <label style={labelStyle}>
      <input
        type="checkbox"
        checked={visible}
        onChange={handleChange}
        style={{ accentColor: color }}
      />
      <span style={dotStyle} />
      <span style={nameStyle}>{pilotName}</span>
    </label>
  );
});

const nameStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#ddd',
};
