import { memo, useCallback } from 'react';

interface Props {
  sliderRef: React.RefObject<HTMLInputElement | null>;
  timeDisplayRef: React.RefObject<HTMLSpanElement | null>;
  onSeek: (seconds: number) => void;
}

export const TimeSlider = memo(function TimeSlider({ sliderRef, timeDisplayRef, onSeek }: Props) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseFloat(e.target.value));
  }, [onSeek]);

  return (
    <div style={containerStyle}>
      <span ref={timeDisplayRef} style={timeStyle}>--:--:--</span>
      <input
        ref={sliderRef}
        type="range"
        min={0}
        max={100}
        defaultValue={0}
        onChange={handleChange}
        step={1}
        style={sliderStyle}
      />
    </div>
  );
});

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
};

const timeStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#aaa',
  minWidth: 70,
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  cursor: 'pointer',
};
