interface Props {
  sliderRef: React.RefObject<HTMLInputElement | null>;
  timeDisplayRef: React.RefObject<HTMLSpanElement | null>;
  onSeek: (seconds: number) => void;
}

export function TimeSlider({ sliderRef, timeDisplayRef, onSeek }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseFloat(e.target.value));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
      <span ref={timeDisplayRef} style={{ fontSize: 12, color: '#aaa', minWidth: 70 }}>--:--:--</span>
      <input
        ref={sliderRef}
        type="range"
        min={0}
        max={100}
        defaultValue={0}
        onChange={handleChange}
        step={1}
        style={{ flex: 1, cursor: 'pointer' }}
      />
    </div>
  );
}
