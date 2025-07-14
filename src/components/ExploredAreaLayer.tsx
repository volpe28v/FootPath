import { Circle } from 'react-leaflet';
import type { ExploredArea } from '../types/ExploredArea';

interface ExploredAreaLayerProps {
  exploredAreas: ExploredArea[];
  isVisible: boolean;
}

export function ExploredAreaLayer({ exploredAreas, isVisible }: ExploredAreaLayerProps) {
  console.log('ExploredAreaLayer render:', { 
    isVisible, 
    areasCount: exploredAreas.length, 
    firstArea: exploredAreas[0],
    allAreas: exploredAreas
  });
  
  if (!isVisible) return null;

  return (
    <>
      {exploredAreas.map((area, index) => {
        // timestampの型を安全に処理
        const getTimestamp = (timestamp: any): number => {
          if (timestamp && typeof timestamp.getTime === 'function') {
            return timestamp.getTime();
          } else if (timestamp && typeof timestamp.toDate === 'function') {
            // Firestore Timestamp
            return timestamp.toDate().getTime();
          } else if (timestamp && typeof timestamp.seconds === 'number') {
            // Firestore Timestamp object
            return timestamp.seconds * 1000;
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