import { useState, useRef, useMemo, useCallback, useEffect, Component, type ReactNode, type ErrorInfo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { JulianDate } from 'cesium';
import type { Viewer as CesiumViewerType } from 'cesium';
import type { CesiumComponentRef } from 'resium';
import { useSceneDetail } from '../hooks/useSceneDetail';
import { usePlayback } from '../hooks/usePlayback';
import { useIsMobile } from '../hooks/useIsMobile';
import { CesiumViewer } from '../components/viewer/CesiumViewer';
import { PlaybackControls } from '../components/playback/PlaybackControls';
import { TimeSlider } from '../components/playback/TimeSlider';
import { SpeedButtons } from '../components/playback/SpeedButtons';
import { TrackSidebar } from '../components/sidebar/TrackSidebar';

// Error boundary to catch Cesium/Resium crashes and show them on screen
class ViewerErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CesiumViewer crashed:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, color: '#f44', background: '#1a0000', height: '100%', overflow: 'auto' }}>
          <h2>Viewer Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#888', marginTop: 10 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SceneViewerPage() {
  const { id } = useParams<{ id: string }>();
  const { scene, tracks, loading, error } = useSceneDetail(id!);
  const isMobile = useIsMobile();

  const viewerRef = useRef<CesiumComponentRef<CesiumViewerType>>(null);

  const trackIds = useMemo(() => {
    if (!scene) return [];
    return scene.tracks.map(t => t.tracklogId);
  }, [scene]);

  // null = no user overrides yet, treat all tracks as visible
  const [visibilityOverride, setVisibilityOverride] = useState<Set<string> | null>(null);
  const visibleTrackIds = useMemo(
    () => visibilityOverride ?? new Set(trackIds),
    [visibilityOverride, trackIds]
  );

  const toggleTrack = useCallback((id: string) => {
    setVisibilityOverride(prev => {
      const base = prev ?? new Set(trackIds);
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [trackIds]);

  const showAll = useCallback(() => setVisibilityOverride(new Set(trackIds)), [trackIds]);
  const hideAll = useCallback(() => setVisibilityOverride(new Set()), []);

  // Sidebar collapse state — defaults collapsed on mobile, expanded on desktop
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isMobile);
  useEffect(() => {
    setSidebarCollapsed(isMobile);
  }, [isMobile]);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);

  // Measurement mode — on mobile, gated behind an explicit ruler button
  const [measuringActive, setMeasuringActive] = useState(false);
  const [showMeasureHint, setShowMeasureHint] = useState(false);
  const toggleMeasuring = useCallback(() => {
    setMeasuringActive(prev => {
      if (!prev) setShowMeasureHint(true);
      return !prev;
    });
  }, []);

  // Auto-dismiss instruction toast after 4s or on any tap
  useEffect(() => {
    if (!showMeasureHint) return;
    const timer = setTimeout(() => setShowMeasureHint(false), 4000);
    const dismiss = () => setShowMeasureHint(false);
    document.addEventListener('pointerdown', dismiss, { once: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [showMeasureHint]);

  // Compute time bounds from all tracks
  const { startTime, stopTime } = useMemo(() => {
    if (tracks.size === 0) return { startTime: null, stopTime: null };

    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const track of tracks.values()) {
      if (track.timestamps.length === 0) continue;
      minTime = Math.min(minTime, track.timestamps[0]);
      maxTime = Math.max(maxTime, track.timestamps[track.timestamps.length - 1]);
    }

    if (minTime === Infinity) return { startTime: null, stopTime: null };

    return {
      startTime: JulianDate.fromDate(new Date(minTime)),
      stopTime: JulianDate.fromDate(new Date(maxTime)),
    };
  }, [tracks]);

  const playback = usePlayback(viewerRef, startTime, stopTime);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        background: '#0a0a0a',
      }}>
        <div style={{ fontSize: 18, color: '#aaa' }}>
          {scene?.status === 'processing'
            ? (scene.processingStep || 'Processing tracks...')
            : 'Loading scene...'}
        </div>
        {scene && (
          <div style={{ fontSize: 14, color: '#666' }}>
            {scene.trackCount} track{scene.trackCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        background: '#0a0a0a',
      }}>
        <div style={{ fontSize: 18, color: '#f44' }}>{error}</div>
        <Link to="/" style={{ color: '#4fc3f7' }}>Back to Home</Link>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <ViewerErrorBoundary>
        <CesiumViewer
          viewerRef={viewerRef}
          tracks={tracks}
          trackIds={trackIds}
          visibleTrackIds={visibleTrackIds}
          startTime={startTime}
          stopTime={stopTime}
          isMobile={isMobile}
          measuringActive={measuringActive}
        />
      </ViewerErrorBoundary>

      {/* Playback bar overlay — full width on all devices */}
      <div style={playbackBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PlaybackControls
            playing={playback.playing}
            togglePlay={playback.togglePlay}
          />
          <TimeSlider
            sliderRef={playback.sliderRef}
            timeDisplayRef={playback.timeDisplayRef}
            onSeek={playback.seekTo}
          />
        </div>
        <SpeedButtons
          speedOptions={playback.speedOptions}
          speedIndex={playback.speedIndex}
          onSetSpeed={playback.setSpeed}
        />
      </div>

      {/* Back button */}
      <Link to="/" style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'rgba(20,20,20,0.9)',
        color: '#4fc3f7',
        padding: '6px 14px',
        borderRadius: 6,
        fontSize: 13,
        zIndex: 10,
        border: '1px solid #333',
      }}>
        Back
      </Link>

      {/* Instruction toast when ruler activated */}
      {showMeasureHint && (
        <div style={{
          position: 'fixed',
          top: 68,
          left: 10,
          right: 10,
          zIndex: 40,
          background: 'rgba(20,20,20,0.92)',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '10px 16px',
          textAlign: 'center',
          color: '#ccc',
          fontSize: 14,
        }}>
          Tap two locations on the map to measure the straight line distance between them.
        </div>
      )}

      {/* Track sidebar */}
      {scene && (
        <TrackSidebar
          scene={scene}
          trackIds={trackIds}
          visibleTrackIds={visibleTrackIds}
          onToggleTrack={toggleTrack}
          onShowAll={showAll}
          onHideAll={hideAll}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          isMobile={isMobile}
          measuringActive={measuringActive}
          onToggleMeasuring={toggleMeasuring}
        />
      )}
    </div>
  );
}

const playbackBarStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  left: 10,
  right: 10,
  background: 'rgba(20,20,20,0.92)',
  borderRadius: 8,
  padding: 10,
  zIndex: 10,
  border: '1px solid #333',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
