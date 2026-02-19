import { memo } from 'react';

interface Props {
  playing: boolean;
  togglePlay: () => void;
}

export const PlaybackControls = memo(function PlaybackControls({
  playing,
  togglePlay,
}: Props) {
  return (
    <button onClick={togglePlay} style={btnStyle}>
      {playing ? '||' : '\u25B6'}
    </button>
  );
});

const btnStyle: React.CSSProperties = {
  background: 'rgba(30,30,30,0.9)',
  border: '1px solid #555',
  color: '#fff',
  padding: '6px 12px',
  borderRadius: 4,
  fontSize: 14,
  cursor: 'pointer',
  minWidth: 36,
};
