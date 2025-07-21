export interface ExploredArea {
  lat: number;
  lng: number;
  radius: number; // メートル単位
  timestamp: Date;
  userId: string;
}

export interface ExplorationStats {
  totalExploredArea: number; // 平方メートル
  exploredPoints: number;
  explorationLevel: number;
  explorationPercentage: number; // 対象エリア内の探索率
}

export interface ExplorationRegion {
  id: string;
  name: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  totalArea: number; // 平方メートル
}
