/**
 * EventDots — SVG <g> rendering commission/retirement/event markers on timeline.
 */

import type { ChartGeometry } from './svg-utils.js';
import type { EventMarker } from './types.js';

const EVENT_COLORS: Record<EventMarker['type'], string> = {
  commission: 'var(--construction)',
  retirement: 'var(--deficit)',
  event: 'var(--warning)',
};

interface Props {
  geometry: ChartGeometry;
  markers: EventMarker[];
}

export function EventDots({ geometry, markers }: Props) {
  const { px, pad, chartH } = geometry;

  return (
    <g>
      {markers.map((marker, i) => {
        const x = px(marker.year);
        // commission dots at top, retirement at bottom, events at middle
        const yOffset = marker.type === 'commission' ? pad.top + 4
          : marker.type === 'retirement' ? pad.top + chartH - 4
          : pad.top + chartH / 2;

        return (
          <circle
            key={i}
            cx={x}
            cy={yOffset}
            r={3}
            fill={EVENT_COLORS[marker.type]}
            opacity={0.8}
          >
            <title>{`${marker.year}: ${marker.label}`}</title>
          </circle>
        );
      })}
    </g>
  );
}
