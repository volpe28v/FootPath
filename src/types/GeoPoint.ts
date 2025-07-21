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
  storageMode?: 'full' | 'areas_only' | 'incremental'; // 保存モード
  minDistance?: number; // 最小記録距離（メートル）
}
