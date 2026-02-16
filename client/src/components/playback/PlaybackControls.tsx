import { memo } from 'react';

interface Props {
  playing: boolean;
  togglePlay: () => void;
  speedIndex: number;
  speedOptions: number[];
  speedUp: () => void;
  speedDown: () => void;
}

export const PlaybackControls = memo(function PlaybackControls({
  playing,
  togglePlay,
  speedIndex,
  speedOptions,
  speedUp,
  speedDown,
}: Props) {
  return (
    <div style={containerStyle}>
      <button onClick={togglePlay} style={btnStyle}>
        {playing ? '||' : '\u25B6'}
      </button>

      <button onClick={speedDown} disabled={speedIndex === 0} style={btnStyle}>
        -
      </button>
      <span style={speedLabelStyle}>
        {speedOptions[speedIndex]}x
      </span>
      <button onClick={speedUp} disabled={speedIndex === speedOptions.length - 1} style={btnStyle}>
        +
      </button>
    </div>
  );
});

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

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

const speedLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#ccc',
  minWidth: 40,
  textAlign: 'center',
};
