// Catmull-Romスプライン補間
export const interpolateSpline = (points: [number, number][]) => {
  if (points.length < 2) return points;
  if (points.length === 2) return points;

  const interpolated: [number, number][] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : points[i + 1];

    interpolated.push(p1);

    // スプライン補間で中間点を生成（パフォーマンス最適化のため5分割に削減）
    const segments = 5;
    for (let j = 1; j < segments; j++) {
      const t = j / segments;
      const t2 = t * t;
      const t3 = t2 * t;

      const lat =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);

      const lng =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

      interpolated.push([lat, lng] as [number, number]);
    }
  }

  // 最後の点を追加
  interpolated.push(points[points.length - 1]);
  return interpolated;
};

// ポイント間引き処理（パフォーマンス最適化）
export const optimizePoints = (points: [number, number][]) => {
  if (points.length <= 100) return points; // 100点以下はそのまま

  const step = Math.ceil(points.length / 100); // 最大100点に削減
  const optimized: [number, number][] = [];

  // 最初の点は必ず含める
  optimized.push(points[0]);

  // 間引き処理
  for (let i = step; i < points.length - 1; i += step) {
    optimized.push(points[i]);
  }

  // 最後の点は必ず含める
  if (points.length > 1) {
    optimized.push(points[points.length - 1]);
  }

  return optimized;
};
