export interface Photo {
  id: string;
  userId: string;
  sessionId?: string;
  location: {
    lat: number;
    lng: number;
  };
  imageUrl: string;
  thumbnailUrl: string;
  caption?: string;
  timestamp: Date;
  tags?: string[];
  isPublic: boolean;
}

export interface PhotoUploadProgress {
  status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number; // 0-100
  error?: string;
}

export interface PhotoFilter {
  userId?: string;
  sessionId?: string;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
}
