export interface GeoPoint {
  lat: number;
  lng: number;
  timestamp: Date;
}

export interface TrackingSession {
  id: string;
  userId: string;
  points: GeoPoint[];
  startTime: Date;
  endTime?: Date;
  isActive: boolean;
}