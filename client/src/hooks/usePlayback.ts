import { useState, useCallback, useRef, useEffect } from 'react';
import { JulianDate } from 'cesium';
import type { CesiumComponentRef } from 'resium';
import type { Viewer as CesiumViewer } from 'cesium';

const SPEED_OPTIONS = [1, 2, 4, 16, 32, 64, 128];

export function usePlayback(
  viewerRef: React.RefObject<CesiumComponentRef<CesiumViewer> | null>,
  startTime: JulianDate | null,
  stopTime: JulianDate | null
) {
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(2); // default 4x

  // Use refs for time display to avoid React re-renders every frame
  const sliderRef = useRef<HTMLInputElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(undefined);

  const getViewer = useCallback(() => {
    return viewerRef.current?.cesiumElement;
  }, [viewerRef]);

  // One-shot sync of slider/display from viewer clock
  const syncUI = useCallback(() => {
    const viewer = getViewer();
    if (!viewer || !startTime || !stopTime) return;
    const current = viewer.clock.currentTime;
    const elapsed = JulianDate.secondsDifference(current, startTime);
    const total = JulianDate.secondsDifference(stopTime, startTime);

    if (sliderRef.current) {
      sliderRef.current.value = String(Math.max(0, Math.min(total, elapsed)));
      sliderRef.current.max = String(total);
    }
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = JulianDate.toDate(current).toLocaleTimeString();
    }
  }, [getViewer, startTime, stopTime]);

  // RAF loop — only runs while playing
  useEffect(() => {
    if (!playing) return;

    function tick() {
      syncUI();
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, syncUI]);

  // Initial sync when times become available
  useEffect(() => {
    syncUI();
  }, [syncUI]);

  const togglePlay = useCallback(() => {
    const viewer = getViewer();
    if (!viewer) return;
    viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
    setPlaying(viewer.clock.shouldAnimate);
  }, [getViewer]);

  const speedIndexRef = useRef(speedIndex);
  speedIndexRef.current = speedIndex;

  const setSpeed = useCallback((index: number) => {
    const viewer = getViewer();
    if (!viewer) return;
    const clamped = Math.max(0, Math.min(SPEED_OPTIONS.length - 1, index));
    setSpeedIndex(clamped);
    viewer.clock.multiplier = SPEED_OPTIONS[clamped];
  }, [getViewer]);

  const speedUp = useCallback(() => setSpeed(speedIndexRef.current + 1), [setSpeed]);
  const speedDown = useCallback(() => setSpeed(speedIndexRef.current - 1), [setSpeed]);

  const seekTo = useCallback((seconds: number) => {
    const viewer = getViewer();
    if (!viewer || !startTime) return;
    const newTime = JulianDate.addSeconds(startTime, seconds, new JulianDate());
    viewer.clock.currentTime = newTime;
    syncUI();
  }, [getViewer, startTime, syncUI]);

  const jump = useCallback((seconds: number) => {
    const viewer = getViewer();
    if (!viewer || !stopTime || !startTime) return;
    const newTime = JulianDate.addSeconds(viewer.clock.currentTime, seconds, new JulianDate());
    if (JulianDate.greaterThan(newTime, stopTime)) {
      viewer.clock.currentTime = stopTime;
    } else if (JulianDate.lessThan(newTime, startTime)) {
      viewer.clock.currentTime = startTime;
    } else {
      viewer.clock.currentTime = newTime;
    }
    syncUI();
  }, [getViewer, startTime, stopTime, syncUI]);

  // Clock start/stop/currentTime is initialized by CesiumViewer directly
  // (avoids ref timing issues with useImperativeHandle chain)

  return {
    playing,
    togglePlay,
    speedIndex,
    speedOptions: SPEED_OPTIONS,
    speedUp,
    speedDown,
    seekTo,
    jump,
    sliderRef,
    timeDisplayRef,
  };
}
