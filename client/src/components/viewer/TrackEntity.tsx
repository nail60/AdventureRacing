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

export const TrackEntity = memo(function TrackEntity({ track, color, visible }: Props) {
  const { positionProperty, pointGraphics, pathGraphics, labelGraphics } = useMemo(() => {
    const positionProperty = new SampledPositionProperty();
    positionProperty.setInterpolationOptions({
      interpolationDegree: 1,
      interpolationAlgorithm: LinearApproximation,
    });

    for (let i = 0; i < track.positions.length; i++) {
      const [lat, lon, alt] = track.positions[i];
      const time = JulianDate.fromDate(new Date(track.timestamps[i]));
      positionProperty.addSample(
        time,
        Cartesian3.fromDegrees(lon, lat, alt)
      );
    }

    const cesiumColor = new Color(color[0] / 255, color[1] / 255, color[2] / 255, color[3] / 255);

    const pointGraphics = {
      pixelSize: 8,
      color: cesiumColor,
      outlineColor: Color.WHITE,
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new NearFarScalar(1000, 1.5, 500000, 0.5),
    };

    const pathGraphics = {
      resolution: 60,
      material: cesiumColor,
      width: 2,
      trailTime: 86400,
      leadTime: 0,
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

    return { positionProperty, pointGraphics, pathGraphics, labelGraphics };
  }, [track, color]);

  return (
    <Entity
      name={track.pilotName}
      show={visible}
      position={positionProperty}
      point={pointGraphics}
      path={pathGraphics}
      label={labelGraphics}
    />
  );
});
