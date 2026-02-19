import { memo, useCallback } from 'react';

interface Props {
  speedOptions: number[];
  speedIndex: number;
  onSetSpeed: (index: number) => void;
}

export const SpeedButtons = memo(function SpeedButtons({
  speedOptions,
  speedIndex,
  onSetSpeed,
}: Props) {
  const handleClick = useCallback(
    (index: number) => () => onSetSpeed(index),
    [onSetSpeed]
  );

  return (
    <div style={containerStyle}>
      {speedOptions.map((speed, i) => (
        <button
          key={speed}
          onClick={handleClick(i)}
          style={i === speedIndex ? activeBtnStyle : btnStyle}
        >
          {speed}x
        </button>
      ))}
    </div>
  );
});

const containerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
};

const btnStyle: React.CSSProperties = {
  background: 'rgba(30,30,30,0.9)',
  border: '1px solid #444',
  color: '#bbb',
  padding: '4px 8px',
  borderRadius: 3,
  fontSize: 11,
  cursor: 'pointer',
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: '#4fc3f7',
  color: '#000',
  border: '1px solid #4fc3f7',
};
