import React from 'react';
import { Circle } from 'react-leaflet';
import type { ExploredArea } from '../types/ExploredArea';

interface ExploredAreaLayerProps {
  exploredAreas: ExploredArea[];
  isVisible: boolean;
}

export function ExploredAreaLayer({ exploredAreas, isVisible }: ExploredAreaLayerProps) {
  console.log('ExploredAreaLayer:', { 
    isVisible, 
    areasCount: exploredAreas.length, 
    firstArea: exploredAreas[0] 
  });
  
  if (!isVisible) return null;

  return (
    <>
      {exploredAreas.map((area, index) => (
        <Circle
          key={`explored-${index}-${area.timestamp.getTime()}`}
          center={[area.lat, area.lng]}
          radius={area.radius}
          pathOptions={{
            fillColor: '#00ff00',
            fillOpacity: 0.3,
            color: '#ff0000',
            weight: 3,
            opacity: 0.8,
          }}
        />
      ))}
    </>
  );
}