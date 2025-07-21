import type { GeoPoint } from '../types/GeoPoint';
import type { ExploredArea, ExplorationStats } from '../types/ExploredArea';

// 2点間の距離を計算（ハーバサイン公式）
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 地球の半径（メートル）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 軌跡から探索済みエリアを生成
export function generateExploredAreas(
  points: GeoPoint[],
  userId: string,
  explorationRadius: number = 25
): ExploredArea[] {
  const areas: ExploredArea[] = [];
  const minDistance = explorationRadius * 0.3; // より小さな最小距離（15m）

  points.forEach((point) => {
    // 既存のエリアと重複していないかチェック
    const hasNearbyArea = areas.some((area) => {
      const distance = calculateDistance(area.lat, area.lng, point.lat, point.lng);
      return distance < minDistance;
    });

    if (!hasNearbyArea) {
      const newArea = {
        lat: point.lat,
        lng: point.lng,
        radius: explorationRadius,
        timestamp: point.timestamp,
        userId,
      };
      areas.push(newArea);
    }
  });

  return areas;
}

// 探索統計を計算
export function calculateExplorationStats(exploredAreas: ExploredArea[]): ExplorationStats {
  const totalExploredArea = exploredAreas.reduce((sum, area) => {
    return sum + Math.PI * area.radius * area.radius;
  }, 0);

  const exploredPoints = exploredAreas.length;

  // 探索レベル（100平方メートルごとに1レベル）
  const explorationLevel = Math.floor(totalExploredArea / 10000) + 1;

  // 仮の探索率（実際の実装では特定地域の境界が必要）
  const explorationPercentage = Math.min(exploredPoints * 2, 100);

  return {
    totalExploredArea,
    exploredPoints,
    explorationLevel,
    explorationPercentage,
  };
}

// エリアをフォーマット
export function formatArea(areaInSquareMeters: number): string {
  if (areaInSquareMeters < 1000) {
    return `${Math.round(areaInSquareMeters)}m²`;
  } else if (areaInSquareMeters < 1000000) {
    return `${(areaInSquareMeters / 1000).toFixed(1)}km²`;
  } else {
    return `${(areaInSquareMeters / 1000000).toFixed(2)}km²`;
  }
}
