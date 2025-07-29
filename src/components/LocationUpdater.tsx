import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';

interface LocationUpdaterProps {
  position: LatLngExpression | null;
}

export function LocationUpdater({ position }: LocationUpdaterProps) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom());
    }
  }, [position, map]);

  return null;
}
