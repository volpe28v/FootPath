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
          <Circle
            key={`explored-${index}-${getTimestamp(area.timestamp)}`}
            center={[area.lat, area.lng]}
            radius={area.radius}
            pathOptions={{
              fillColor: '#00ff00',
              fillOpacity: 0.5,
              color: '#00ff00',
              weight: 0,
              opacity: 0,
            }}
          />
        );
      })}
    </>
  );
}