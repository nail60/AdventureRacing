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

export function JumpButtons({ onJump }: Props) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {JUMPS.map((j) => (
        <button
          key={j.label}
          onClick={() => onJump(j.seconds)}
          style={{
            background: 'rgba(30,30,30,0.9)',
            border: '1px solid #444',
            color: '#bbb',
            padding: '4px 8px',
            borderRadius: 3,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {j.label}
        </button>
      ))}
    </div>
  );
}
