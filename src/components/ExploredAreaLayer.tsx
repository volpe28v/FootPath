import { Circle } from 'react-leaflet';
import type { ExploredArea } from '../types/ExploredArea';

interface ExploredAreaLayerProps {
  exploredAreas: ExploredArea[];
  isVisible: boolean;
}

export function ExploredAreaLayer({ exploredAreas, isVisible }: ExploredAreaLayerProps) {
  if (!isVisible) return null;

  return (
    <>
      {exploredAreas.map((area, index) => {
        // timestampの型を安全に処理
        const getTimestamp = (timestamp: unknown): number => {
          if (timestamp && typeof (timestamp as { getTime?: () => number }).getTime === 'function') {
            return (timestamp as { getTime: () => number }).getTime();
          } else if (timestamp && typeof (timestamp as { toDate?: () => Date }).toDate === 'function') {
            // Firestore Timestamp
            return (timestamp as { toDate: () => Date }).toDate().getTime();
          } else if (timestamp && typeof (timestamp as { seconds?: number }).seconds === 'number') {
            // Firestore Timestamp object
            return (timestamp as { seconds: number }).seconds * 1000;
          }
          return Date.now();
        };

        return (
          <>
            {/* 最外層 - 最も薄い */}
            <Circle
              key={`explored-layer1-${index}-${getTimestamp(area.timestamp)}`}
              center={[area.lat, area.lng]}
              radius={area.radius + 20}
              pathOptions={{
                fillColor: '#00ffff',
                fillOpacity: 0.01,
                color: 'transparent',
                weight: 0,
                opacity: 0,
              }}
            />
            {/* 外層2 */}
            <Circle
              key={`explored-layer2-${index}-${getTimestamp(area.timestamp)}`}
              center={[area.lat, area.lng]}
              radius={area.radius + 15}
              pathOptions={{
                fillColor: '#00ffff',
                fillOpacity: 0.02,
                color: 'transparent',
                weight: 0,
                opacity: 0,
              }}
            />
            {/* 外層3 */}
            <Circle
              key={`explored-layer3-${index}-${getTimestamp(area.timestamp)}`}
              center={[area.lat, area.lng]}
              radius={area.radius + 12}
              pathOptions={{
                fillColor: '#00ffff',
                fillOpacity: 0.04,
                color: 'transparent',
                weight: 0,
                opacity: 0,
              }}
            />
            {/* 中間層4 */}
            <Circle
              key={`explored-layer4-${index}-${getTimestamp(area.timestamp)}`}
              center={[area.lat, area.lng]}
              radius={area.radius + 8}
              pathOptions={{
                fillColor: '#00ffff',
                fillOpacity: 0.06,
                color: 'transparent',
                weight: 0,
                opacity: 0,
              }}
            />
            {/* 中間層5 */}
            <Circle
              key={`explored-layer5-${index}-${getTimestamp(area.timestamp)}`}
              center={[area.lat, area.lng]}
              radius={area.radius + 5}
              pathOptions={{
                fillColor: '#00ffff',
                fillOpacity: 0.08,
                color: 'transparent',
                weight: 0,
                opacity: 0,
              }}
            />
            {/* メインの円 */}
            <Circle
              key={`explored-${index}-${getTimestamp(area.timestamp)}`}
              center={[area.lat, area.lng]}
              radius={area.radius}
              pathOptions={{
                fillColor: '#00ffff',
                fillOpacity: 0.12,
                color: 'transparent',
                weight: 0,
                opacity: 0,
              }}
            />
          </>
        );
      })}
    </>
  );
}