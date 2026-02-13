import { useMemo } from 'react';
import { Entity } from 'resium';
import {
  Cartesian3,
  JulianDate,
  SampledPositionProperty,
  LinearApproximation,
  Color,
  CallbackProperty,
  Ellipsoid,
} from 'cesium';
import type { TrackData } from '@adventure-racing/shared';

interface Props {
  track: TrackData;
  color: [number, number, number, number];
  visible: boolean;
}

export function PilotFlag({ track, color, visible }: Props) {
  const { positionProperty, cesiumColor } = useMemo(() => {
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

    const cesiumColor = new Color(color[0] / 255, color[1] / 255, color[2] / 255, 0.4);

    return { positionProperty, cesiumColor };
  }, [track, color]);

  // Vertical pole: CallbackProperty polyline from ground to pilot
  const polePositions = useMemo(() => {
    return new CallbackProperty((time?: JulianDate) => {
      if (!time) return [];
      const pos = positionProperty.getValue(time);
      if (!pos) return [];

      const cartoPos = Ellipsoid.WGS84.cartesianToCartographic(pos);
      if (cartoPos) {
        const groundPos = Cartesian3.fromRadians(cartoPos.longitude, cartoPos.latitude, 0);
        return [groundPos, pos];
      }
      return [pos, pos];
    }, false);
  }, [positionProperty]);

  if (!visible) return null;

  return (
    <Entity
      polyline={{
        positions: polePositions as any,
        width: 1,
        material: cesiumColor,
      }}
    />
  );
}
