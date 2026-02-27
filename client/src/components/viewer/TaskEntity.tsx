import { useMemo, Fragment } from 'react';
import { Entity } from 'resium';
import {
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  NearFarScalar,
  Cartesian2,
  LabelStyle,
  HeightReference,
  VerticalOrigin,
} from 'cesium';
import type { TaskData } from '@adventure-racing/shared';

interface Props {
  task: TaskData;
}

const SSS_COLOR = Color.fromCssColorString('#4CAF50').withAlpha(0.3);
const ESS_COLOR = Color.fromCssColorString('#f44336').withAlpha(0.3);
const TP_COLOR = Color.fromCssColorString('#FF9800').withAlpha(0.3);

const SSS_OUTLINE = Color.fromCssColorString('#4CAF50');
const ESS_OUTLINE = Color.fromCssColorString('#f44336');
const TP_OUTLINE = Color.fromCssColorString('#FF9800');

function getTurnpointColor(type: string) {
  if (type === 'SSS') return { fill: SSS_COLOR, outline: SSS_OUTLINE };
  if (type === 'ESS') return { fill: ESS_COLOR, outline: ESS_OUTLINE };
  return { fill: TP_COLOR, outline: TP_OUTLINE };
}

export function TaskEntity({ task }: Props) {
  const courseLinePositions = useMemo(() => {
    const pts = task.optimizedPoints && task.optimizedPoints.length > 0
      ? task.optimizedPoints
      : task.turnpoints.map(tp => [tp.lat, tp.lon] as [number, number]);

    return Cartesian3.fromDegreesArrayHeights(
      pts.flatMap(([lat, lon]) => [lon, lat, 100])
    );
  }, [task]);

  const turnpointEntities = useMemo(() => {
    return task.turnpoints.map((tp, i) => {
      const { fill, outline } = getTurnpointColor(tp.type);
      const label = tp.type === 'TURNPOINT' ? `${i}. ${tp.name}` : `${tp.type}: ${tp.name}`;
      return { tp, fill, outline, label, key: `task-tp-${i}` };
    });
  }, [task]);

  return (
    <Fragment>
      {/* Optimized course line */}
      <Entity
        polyline={{
          positions: courseLinePositions,
          width: 3,
          material: Color.WHITE.withAlpha(0.9),
          clampToGround: false,
        }}
      />

      {/* Turnpoint cylinders + labels */}
      {turnpointEntities.map(({ tp, fill, outline, label, key }) => (
        <Entity
          key={key}
          position={Cartesian3.fromDegrees(tp.lon, tp.lat, 0)}
          ellipse={{
            semiMajorAxis: tp.radius,
            semiMinorAxis: tp.radius,
            material: fill,
            outline: true,
            outlineColor: outline,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          }}
          label={{
            text: label,
            font: 'bold 13px sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cartesian2(0, -25),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new DistanceDisplayCondition(0, 200000),
            scaleByDistance: new NearFarScalar(1000, 1, 200000, 0.3),
            verticalOrigin: VerticalOrigin.BOTTOM,
          }}
        />
      ))}
    </Fragment>
  );
}
