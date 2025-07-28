import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { GeoPoint, TrackingSession } from '../types/GeoPoint';
import type { ExploredArea, ExplorationStats } from '../types/ExploredArea';
import { TRACKING_CONFIG } from '../constants/tracking';
import { generateExploredAreas, calculateExplorationStats } from '../utils/explorationUtils';

interface DataManagementOptions {
  userId: string;
}

export function useDataManagement({ userId }: DataManagementOptions) {
  const [exploredAreas, setExploredAreas] = useState<ExploredArea[]>([]);
  const [historyExploredAreas, setHistoryExploredAreas] = useState<ExploredArea[]>([]);
  const [explorationStats, setExplorationStats] = useState<ExplorationStats>({
    totalExploredArea: 0,
    exploredPoints: 0,
    explorationLevel: 1,
    explorationPercentage: 0,
  });
  const [totalPointsCount, setTotalPointsCount] = useState(0);
  const [showExplorationLayer] = useState(true);

  // データキャッシュ用のRef
  const dataCache = useRef<{
    sessions: TrackingSession[];
    lastFetch: number;
    cacheExpiry: number;
  }>({
    sessions: [],
    lastFetch: 0,
    cacheExpiry: TRACKING_CONFIG.CACHE_EXPIRY,
  });

  // 探索エリアの結合をメモ化（パフォーマンス最適化）
  const combinedExploredAreas = useMemo(
    () => [...historyExploredAreas, ...exploredAreas],
    [historyExploredAreas, exploredAreas]
  );

  // セッションデータを取得（キャッシュ対応）
  const loadSessionData = useCallback(
    async (forceRefresh = false) => {
      try {
        const now = Date.now();

        // キャッシュが有効でforceRefreshでない場合はキャッシュを使用
        if (
          !forceRefresh &&
          dataCache.current.sessions.length > 0 &&
          now - dataCache.current.lastFetch < dataCache.current.cacheExpiry
        ) {
          console.log('Using cached session data');
          // キャッシュデータを直接処理
          const points: GeoPoint[] = [];
          dataCache.current.sessions.forEach((session) => {
            if (session.points && session.points.length > 0 && !session.isActive) {
              points.push(...session.points);
            }
          });

          setTotalPointsCount(points.length);

          if (points.length > 0) {
            const historicalAreas = generateExploredAreas(points, userId);
            setHistoryExploredAreas(historicalAreas);
            const historicalStats = calculateExplorationStats(historicalAreas);
            setExplorationStats(historicalStats);
          } else {
            setHistoryExploredAreas([]);
          }
          return;
        }

        const sessionsRef = collection(db, 'sessions');
        const userQuery = query(sessionsRef, where('userId', '==', userId));

        const snapshot = await getDocs(userQuery);
        const sessions: TrackingSession[] = [];

        snapshot.forEach((doc) => {
          const session = doc.data() as TrackingSession;

          // pointsのtimestampをDate型に変換
          if (session.points && session.points.length > 0) {
            const convertedPoints = session.points.map((point) => ({
              ...point,
              timestamp:
                point.timestamp &&
                typeof (point.timestamp as unknown as { toDate: () => Date }).toDate === 'function'
                  ? (point.timestamp as unknown as { toDate: () => Date }).toDate()
                  : point.timestamp,
            }));
            session.points = convertedPoints;
          }

          sessions.push(session);
        });

        // キャッシュ更新
        dataCache.current = {
          sessions,
          lastFetch: now,
          cacheExpiry: TRACKING_CONFIG.CACHE_EXPIRY,
        };

        // セッションデータを直接処理
        const points: GeoPoint[] = [];

        sessions.forEach((session) => {
          if (session.points && session.points.length > 0 && !session.isActive) {
            points.push(...session.points);
          }
        });

        // 総データ数を更新
        setTotalPointsCount(points.length);

        // 全履歴ポイントから探索エリアを生成
        if (points.length > 0) {
          const historicalAreas = generateExploredAreas(points, userId);
          setHistoryExploredAreas(historicalAreas);

          // 統計を履歴込みで更新
          const historicalStats = calculateExplorationStats(historicalAreas);
          setExplorationStats(historicalStats);
        } else {
          setHistoryExploredAreas([]);
        }
        console.log('Session data loaded:', sessions.length, 'sessions');
      } catch (error) {
        console.error('Error loading session data:', error);
      }
    },
    [userId]
  );

  // 初回データ読み込み
  useEffect(() => {
    loadSessionData();
  }, [userId, loadSessionData]);

  return {
    // State
    exploredAreas,
    setExploredAreas,
    historyExploredAreas,
    combinedExploredAreas,
    explorationStats,
    setExplorationStats,
    totalPointsCount,
    showExplorationLayer,

    // Actions
    loadSessionData,
  };
}
