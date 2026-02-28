import { useMemo, memo } from 'react';
import { Entity } from 'resium';
import {
  Cartesian3,
  JulianDate,
  SampledPositionProperty,
  LinearApproximation,
  Color,
  DistanceDisplayCondition,
  NearFarScalar,
  Cartesian2,
  LabelStyle,
} from 'cesium';
import type { TrackData } from '@adventure-racing/shared';

interface Props {
  track: TrackData;
  color: [number, number, number, number];
  visible: boolean;
}

interface Segment {
  startIndex: number;
  endIndex: number;
  isGround: boolean;
}

/** Convert flight pairs into a full segment list (ground + flight, in order). */
function buildSegments(flights: [number, number][], pointCount: number): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of flights) {
    if (start > cursor) {
      segments.push({ startIndex: cursor, endIndex: start, isGround: true });
    }
    segments.push({ startIndex: start, endIndex: end, isGround: false });
    cursor = end;
  }
  if (cursor < pointCount - 1) {
    segments.push({ startIndex: cursor, endIndex: pointCount - 1, isGround: true });
  }
  return segments;
}

export const TrackEntity = memo(function TrackEntity({ track, color, visible }: Props) {
  const { positionProperty, pointGraphics, pathGraphics, labelGraphics, segmentData } = useMemo(() => {
    // Full-track position property for animated point + label
    const positionProperty = new SampledPositionProperty();
    positionProperty.setInterpolationOptions({
      interpolationDegree: 1,
      interpolationAlgorithm: LinearApproximation,
    });

    for (let i = 0; i < track.positions.length; i++) {
      const [lat, lon, alt] = track.positions[i];
      const time = JulianDate.fromDate(new Date(track.timestamps[i]));
      positionProperty.addSample(time, Cartesian3.fromDegrees(lon, lat, alt));
    }

    const cesiumColor = new Color(color[0] / 255, color[1] / 255, color[2] / 255, color[3] / 255);
    const groundColor = new Color(color[0] / 255 * 0.45, color[1] / 255 * 0.45, color[2] / 255 * 0.45, color[3] / 255);

    const pointGraphics = {
      pixelSize: 8,
      color: cesiumColor,
      outlineColor: Color.WHITE,
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new NearFarScalar(1000, 1.5, 500000, 0.5),
    };

    const labelGraphics = {
      text: track.pilotName,
      font: '13px sans-serif',
      fillColor: cesiumColor,
      outlineColor: Color.BLACK,
      outlineWidth: 2,
      style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cartesian2(0, -20),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new DistanceDisplayCondition(0, 100000),
      scaleByDistance: new NearFarScalar(1000, 1, 100000, 0.3),
    };

    // No flight data → single path (backward compat)
    if (!track.flights || track.flights.length === 0) {
      return {
        positionProperty,
        pointGraphics,
        labelGraphics,
        pathGraphics: {
          resolution: 60,
          material: cesiumColor,
          width: 2,
          trailTime: 86400,
          leadTime: 0,
        },
        segmentData: null,
      };
    }

    // Build segments and their SampledPositionProperties
    const segments = buildSegments(track.flights, track.positions.length);
    const segmentData = segments.map(seg => {
      const segPos = new SampledPositionProperty();
      segPos.setInterpolationOptions({
        interpolationDegree: 1,
        interpolationAlgorithm: LinearApproximation,
      });
      for (let i = seg.startIndex; i <= seg.endIndex; i++) {
        const [lat, lon, alt] = track.positions[i];
        const time = JulianDate.fromDate(new Date(track.timestamps[i]));
        segPos.addSample(time, Cartesian3.fromDegrees(lon, lat, alt));
      }
      return {
        positionProperty: segPos,
        material: seg.isGround ? groundColor : cesiumColor,
      };
    });

    return { positionProperty, pointGraphics, labelGraphics, pathGraphics: null, segmentData };
  }, [track, color]);

  if (segmentData) {
    return (
      <>
        {/* Animated point + label */}
        <Entity
          name={track.pilotName}
          show={visible}
          position={positionProperty}
          point={pointGraphics}
          label={labelGraphics}
        />
        {/* Per-segment paths (typically 3-10 entities) */}
        {segmentData.map((seg, idx) => (
          <Entity
            key={idx}
            name={track.pilotName}
            show={visible}
            position={seg.positionProperty}
            path={{
              resolution: 60,
              material: seg.material,
              width: 2,
              trailTime: 86400,
              leadTime: 0,
            }}
          />
        ))}
      </>
    );
  }

  // Legacy: single path entity
  return (
    <Entity
      name={track.pilotName}
      show={visible}
      position={positionProperty}
      point={pointGraphics}
      path={pathGraphics!}
      label={labelGraphics}
    />
  );
});
