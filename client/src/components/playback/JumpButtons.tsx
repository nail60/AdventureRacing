import { memo, useCallback } from 'react';

interface Props {
  onJump: (seconds: number) => void;
}

const JUMPS = [
  { label: '-1hr', seconds: -3600 },
  { label: '-10m', seconds: -600 },
  { label: '-5m', seconds: -300 },
  { label: '+5m', seconds: 300 },
  { label: '+10m', seconds: 600 },
  { label: '+30m', seconds: 1800 },
  { label: '+1hr', seconds: 3600 },
  { label: '+6hr', seconds: 21600 },
];

export const JumpButtons = memo(function JumpButtons({ onJump }: Props) {
  const handleClick = useCallback((seconds: number) => () => onJump(seconds), [onJump]);

  return (
    <div style={containerStyle}>
      {JUMPS.map((j) => (
        <button
          key={j.label}
          onClick={handleClick(j.seconds)}
          style={btnStyle}
        >
          {j.label}
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
