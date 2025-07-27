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
          if (
            timestamp &&
            typeof (timestamp as { getTime?: () => number }).getTime === 'function'
          ) {
            return (timestamp as { getTime: () => number }).getTime();
          } else if (
            timestamp &&
            typeof (timestamp as { toDate?: () => Date }).toDate === 'function'
          ) {
            // Firestore Timestamp
            return (timestamp as { toDate: () => Date }).toDate().getTime();
          } else if (timestamp && typeof (timestamp as { seconds?: number }).seconds === 'number') {
            // Firestore Timestamp object
            return (timestamp as { seconds: number }).seconds * 1000;
          }
          return Date.now();
        };

        const timestamp = getTimestamp(area.timestamp);

        return (
          <div key={`explored-area-${index}-${timestamp}`}>
            {/* 最外層グロー効果 */}
            <Circle
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
            {/* 外側グロー効果 */}
            <Circle
              center={[area.lat, area.lng]}
              radius={area.radius + 10}
              pathOptions={{
                fillColor: '#00ffff',
                fillOpacity: 0.04,
                color: 'transparent',
                weight: 0,
                opacity: 0,
              }}
            />
            {/* 中間グロー効果 */}
            <Circle
              center={[area.lat, area.lng]}
              radius={area.radius + 5}
              pathOptions={{
                fillColor: '#00ffff',
                fillOpacity: 0.06,
                color: 'transparent',
                weight: 0,
                opacity: 0,
              }}
            />
            {/* メインの円 */}
            <Circle
              center={[area.lat, area.lng]}
              radius={area.radius}
              pathOptions={{
                fillColor: '#00ffff',
                fillOpacity: 0.1,
                color: 'transparent',
                weight: 0,
                opacity: 0,
              }}
            />
          </div>
        );
      })}
    </>
  );
}
