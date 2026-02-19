import { memo, useRef, useCallback, useEffect } from 'react';
import type { Viewer as CesiumViewer } from 'cesium';

interface Props {
  getViewer: () => CesiumViewer | undefined;
  syncUI: () => void;
  onStop: () => void;
}

export const IntensityScrubber = memo(function IntensityScrubber({
  getViewer,
  syncUI,
  onStop,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const draggingRef = useRef(false);
  const offsetRef = useRef(0);

  const stopDrag = useCallback(() => {
    draggingRef.current = false;
    offsetRef.current = 0;
    if (thumbRef.current) {
      thumbRef.current.style.transform = 'translateX(0px)';
    }
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    onStop();
  }, [onStop]);

  const tick = useCallback(() => {
    if (!draggingRef.current) return;
    syncUI();
    rafRef.current = requestAnimationFrame(tick);
  }, [syncUI]);

  const computeOffset = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const halfWidth = rect.width / 2;
    return Math.max(-1, Math.min(1, (clientX - center) / halfWidth));
  }, []);

  const applyOffset = useCallback((offset: number) => {
    offsetRef.current = offset;
    const viewer = getViewer();
    const track = trackRef.current;
    if (!viewer || !track) return;

    const halfWidth = track.getBoundingClientRect().width / 2;
    const speed = Math.sign(offset) * Math.pow(Math.abs(offset), 1.5) * 256;
    viewer.clock.multiplier = speed;
    viewer.clock.shouldAnimate = true;

    if (thumbRef.current) {
      thumbRef.current.style.transform = `translateX(${offset * halfWidth}px)`;
    }
  }, [getViewer]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const offset = computeOffset(e.clientX);
    applyOffset(offset);
    rafRef.current = requestAnimationFrame(tick);
  }, [computeOffset, applyOffset, tick]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const offset = computeOffset(e.clientX);
    applyOffset(offset);
  }, [computeOffset, applyOffset]);

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    stopDrag();
  }, [stopDrag]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div style={wrapperStyle}>
      <span style={labelStyle}>REW</span>
      <div
        ref={trackRef}
        style={trackStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Center line */}
        <div style={centerLineStyle} />
        {/* Thumb */}
        <div ref={thumbRef} style={thumbStyle} />
      </div>
      <span style={labelStyle}>FF</span>
    </div>
  );
});

const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#666',
  userSelect: 'none',
};

const trackStyle: React.CSSProperties = {
  flex: 1,
  height: 44,
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 6,
  position: 'relative',
  touchAction: 'none',
  cursor: 'pointer',
};

const centerLineStyle: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 8,
  bottom: 8,
  width: 2,
  background: '#555',
  transform: 'translateX(-1px)',
};

const thumbStyle: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 20,
  height: 32,
  background: '#4fc3f7',
  borderRadius: 4,
  marginLeft: -10,
  marginTop: -16,
  willChange: 'transform',
};
