import { useEffect, useRef, type RefObject } from 'react';
import type { Viewer as CesiumViewerType } from 'cesium';
import { Cartesian2, Cartographic, Math as CesiumMath } from 'cesium';
import type { CesiumComponentRef } from 'resium';

interface CompassRoseProps {
  viewerRef: RefObject<CesiumComponentRef<CesiumViewerType> | null>;
}

export function CompassRose({ viewerRef }: CompassRoseProps) {
  const dialRef = useRef<SVGGElement>(null);

  // Track heading via postRender — mutate DOM directly to avoid React re-renders.
  // The viewer ref isn't populated on first render, so poll until it's ready.
  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    const attach = () => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer || viewer.isDestroyed()) {
        if (!cancelled) requestAnimationFrame(attach);
        return;
      }

      const onPostRender = () => {
        const g = dialRef.current;
        if (!g) return;
        const deg = CesiumMath.toDegrees(viewer.camera.heading);
        g.style.transform = `rotate(${-deg}deg)`;
      };

      viewer.scene.postRender.addEventListener(onPostRender);
      removeListener = () => {
        if (!viewer.isDestroyed()) {
          viewer.scene.postRender.removeEventListener(onPostRender);
        }
      };
    };

    attach();
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [viewerRef]);

  const handleClick = () => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const camera = viewer.camera;
    const scene = viewer.scene;

    // Find the point at screen center to preserve it as the view target
    const center = new Cartesian2(
      scene.canvas.clientWidth / 2,
      scene.canvas.clientHeight / 2,
    );

    let target =
      scene.pickPosition(center) ??
      camera.pickEllipsoid(center, scene.globe.ellipsoid);

    if (!target) {
      // Fallback: project camera position onto ellipsoid surface
      const carto = Cartographic.fromCartesian(camera.positionWC);
      carto.height = 0;
      target = Cartographic.toCartesian(carto);
    }

    // Compute current altitude above target
    const targetCarto = Cartographic.fromCartesian(target);
    const camCarto = camera.positionCartographic;
    const altitude = camCarto.height - targetCarto.height;

    camera.flyTo({
      destination: Cartographic.toCartesian(
        new Cartographic(targetCarto.longitude, targetCarto.latitude, targetCarto.height + Math.max(altitude, 100)),
      ),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
      duration: 0.5,
    });
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'absolute',
        top: 54,
        left: 10,
        zIndex: 10,
        width: 72,
        height: 72,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <svg width={64} height={64} viewBox="-32 -32 64 64">
        {/* Dark background circle */}
        <circle r={30} fill="rgba(20,20,20,0.9)" stroke="#333" strokeWidth={1} />

        {/* Rotating dial group */}
        <g ref={dialRef} style={{ transformOrigin: '0 0' }}>
          {/* Tick marks at 45deg intervals */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
            <line
              key={angle}
              x1={0}
              y1={-24}
              x2={0}
              y2={angle % 90 === 0 ? -20 : -22}
              stroke="#666"
              strokeWidth={angle % 90 === 0 ? 1.5 : 1}
              transform={`rotate(${angle})`}
            />
          ))}

          {/* North triangle (red) */}
          <polygon points="0,-24 -5,-14 5,-14" fill="#e53935" />

          {/* South triangle (grey, smaller) */}
          <polygon points="0,24 -4,16 4,16" fill="#666" />

          {/* Cardinal labels */}
          <text y={-12} textAnchor="middle" fill="#e53935" fontSize={9} fontWeight="bold" fontFamily="sans-serif">N</text>
          <text y={16} textAnchor="middle" fill="#888" fontSize={7} fontFamily="sans-serif">S</text>
          <text x={16} y={3} textAnchor="middle" fill="#888" fontSize={7} fontFamily="sans-serif">E</text>
          <text x={-16} y={3} textAnchor="middle" fill="#888" fontSize={7} fontFamily="sans-serif">W</text>
        </g>
      </svg>
    </div>
  );
}
