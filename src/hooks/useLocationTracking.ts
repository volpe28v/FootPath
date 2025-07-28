import { useState, useRef, useCallback, useEffect } from 'react';
import type { LatLngExpression } from 'leaflet';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  arrayUnion,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { GeoPoint, TrackingSession } from '../types/GeoPoint';
import { TRACKING_CONFIG } from '../constants/tracking';
import { calculateDistance } from '../utils/explorationUtils';

interface LocationTrackingOptions {
  userId: string;
  onLocationUpdate?: (
    position: LatLngExpression,
    explorationData?: { lat: number; lng: number }
  ) => void;
  onSessionChange?: (session: TrackingSession | null) => void;
}

export function useLocationTracking({
  userId,
  onLocationUpdate,
  onSessionChange,
}: LocationTrackingOptions) {
  const [currentPosition, setCurrentPosition] = useState<LatLngExpression | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingSession, setTrackingSession] = useState<TrackingSession | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<Date | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const batchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number; timestamp: number } | null>(null);
  const pendingPointsRef = useRef<GeoPoint[]>([]);
  const autoStartRef = useRef<boolean>(false);

  // セッション変更時のコールバック実行
  useEffect(() => {
    onSessionChange?.(trackingSession);
  }, [trackingSession, onSessionChange]);

  // バッチ処理でFirestoreに送信（増分保存）
  const flushPendingPoints = useCallback(
    async (sessionId: string) => {
      if (pendingPointsRef.current.length === 0) return;

      try {
        const pointsToUpload = [...pendingPointsRef.current];
        console.log('flushPendingPoints: pointsToUpload: ', pointsToUpload.length);

        // Firestoreに新しいポイントのみを追加
        const sessionRef = doc(db, 'sessions', sessionId);
        await updateDoc(sessionRef, {
          points: arrayUnion(...pointsToUpload),
          storageMode: 'incremental',
          minDistance: 10, // 固定値を使用
        });

        // 成功後にクリア
        pendingPointsRef.current = [];
        setPendingCount(0);
      } catch (error) {
        console.error('Failed to flush pending points:', error);
      }
    },
    [setPendingCount]
  );

  // 位置情報の妥当性チェック
  const validatePosition = useCallback((position: GeolocationPosition): boolean => {
    const { accuracy, latitude, longitude } = position.coords;
    const now = Date.now();

    // 1. 精度フィルタリング（100m以上の誤差は除外）
    if (accuracy > 100) {
      return false;
    }

    // 2. 緯度経度の妥当性チェック
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return false;
    }

    // 3. 移動速度チェック（前の位置がある場合）
    if (lastPositionRef.current) {
      const distance = calculateDistance(
        lastPositionRef.current.lat,
        lastPositionRef.current.lng,
        latitude,
        longitude
      );

      const timeDiff = (now - (lastPositionRef.current.timestamp || 0)) / 1000; // 秒
      const speed = distance / timeDiff; // m/s
      const speedKmh = speed * 3.6; // km/h

      // 人間の歩行速度（時速20km以下に制限）
      if (speedKmh > 20) {
        return false;
      }
    }

    return true;
  }, []);

  // 距離ベースの位置更新判定
  const shouldUpdatePosition = useCallback((newLat: number, newLng: number): boolean => {
    if (!lastPositionRef.current) {
      return true;
    }

    const distance = calculateDistance(
      lastPositionRef.current.lat,
      lastPositionRef.current.lng,
      newLat,
      newLng
    );

    return distance >= TRACKING_CONFIG.MIN_DISTANCE;
  }, []);

  // 位置情報エラーハンドリングの共通関数
  const handleGeolocationError = useCallback((error: GeolocationPositionError) => {
    let errorDetails = '';
    switch (error.code) {
      case 1:
        errorDetails = 'PERMISSION_DENIED: トラッキング中に位置情報の使用が拒否されました';
        break;
      case 2:
        errorDetails = 'POSITION_UNAVAILABLE: トラッキング中に位置情報を取得できませんでした';
        break;
      case 3:
        errorDetails = 'TIMEOUT: トラッキング中に位置情報の取得がタイムアウトしました';
        break;
      default:
        errorDetails = `Unknown tracking error (code: ${error.code})`;
    }
    alert(`位置情報のトラッキング中にエラーが発生しました:\n${errorDetails}`);
  }, []);

  // 位置情報取得成功時の共通処理
  const handlePositionUpdate = useCallback(
    (position: GeolocationPosition) => {
      // 位置情報取得処理のタイミングで時間を更新
      setLastLocationUpdate(new Date());

      if (!validatePosition(position)) return;

      const newLat = position.coords.latitude;
      const newLng = position.coords.longitude;
      const now = Date.now();

      if (!shouldUpdatePosition(newLat, newLng)) return;

      const newPoint: GeoPoint = {
        lat: newLat,
        lng: newLng,
        timestamp: new Date(),
      };

      setCurrentPosition([newLat, newLng]);
      lastPositionRef.current = { lat: newLat, lng: newLng, timestamp: now };

      // 外部コールバック実行（探索エリア更新用）
      onLocationUpdate?.([newLat, newLng], { lat: newLat, lng: newLng });

      // トラッキング中の場合のみ記録
      if (isTracking && trackingSession) {
        pendingPointsRef.current.push(newPoint);
        setPendingCount(pendingPointsRef.current.length);

        setTrackingSession((prev) => {
          if (!prev) return null;
          return { ...prev, points: [...prev.points, newPoint] };
        });
      }
    },
    [validatePosition, shouldUpdatePosition, onLocationUpdate, isTracking, trackingSession]
  );

  // 位置情報監視開始の共通関数
  const startLocationWatching = useCallback(
    (sessionId: string) => {
      // 既存の監視をクリア
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      // バッチ処理タイマー開始
      if (batchIntervalRef.current) {
        clearInterval(batchIntervalRef.current);
      }

      batchIntervalRef.current = setInterval(() => {
        flushPendingPoints(sessionId);
      }, TRACKING_CONFIG.BATCH_INTERVAL);

      // 位置情報監視開始
      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          handlePositionUpdate,
          handleGeolocationError,
          TRACKING_CONFIG.GEOLOCATION_OPTIONS.BATTERY_SAVING
        );
      }
    },
    [handlePositionUpdate, handleGeolocationError, flushPendingPoints]
  );

  // トラッキング開始
  const startTracking = useCallback(async () => {
    if (!navigator.geolocation) {
      return;
    }

    setIsTracking(true);

    // 記録状態をLocalStorageに保存
    localStorage.setItem('footpath_was_tracking', 'true');

    const newSession: Omit<TrackingSession, 'id'> = {
      userId,
      points: [],
      startTime: new Date(),
      isActive: true,
      storageMode: 'incremental',
      minDistance: TRACKING_CONFIG.MIN_DISTANCE,
    };

    const docRef = await addDoc(collection(db, 'sessions'), newSession);
    const sessionId = docRef.id;

    const sessionWithId = { ...newSession, id: sessionId };
    setTrackingSession(sessionWithId);

    // 位置情報監視開始
    startLocationWatching(sessionId);
  }, [userId, startLocationWatching]);

  // トラッキング停止
  const stopTracking = useCallback(async () => {
    setIsTracking(false);

    // 記録停止状態をLocalStorageに保存
    localStorage.setItem('footpath_was_tracking', 'false');

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (batchIntervalRef.current) {
      clearInterval(batchIntervalRef.current);
      batchIntervalRef.current = null;
    }

    if (trackingSession) {
      // 残りのペンディングポイントをフラッシュ
      await flushPendingPoints(trackingSession.id);

      const sessionRef = doc(db, 'sessions', trackingSession.id);
      await updateDoc(sessionRef, {
        endTime: new Date(),
        isActive: false,
      });
    }

    // 状態をリセット
    setTrackingSession(null);
    lastPositionRef.current = null;
    pendingPointsRef.current = [];
    setPendingCount(0);
  }, [trackingSession, flushPendingPoints]);

  // 起動時の孤立セッションクリーンアップ
  useEffect(() => {
    if (!userId) return;

    const cleanupOrphanedSessions = async () => {
      try {
        const activeSessionsQuery = query(
          collection(db, 'sessions'),
          where('userId', '==', userId),
          where('isActive', '==', true)
        );

        const snapshot = await getDocs(activeSessionsQuery);

        if (snapshot.empty) return;

        const now = new Date();
        const autoResumeSessions: TrackingSession[] = [];
        const expiredSessions: TrackingSession[] = [];

        snapshot.docs.forEach((docSnapshot) => {
          const session = { ...docSnapshot.data(), id: docSnapshot.id } as TrackingSession;
          const startTime =
            session.startTime instanceof Date
              ? session.startTime
              : new Date(
                  typeof session.startTime === 'object' &&
                  session.startTime !== null &&
                  'toDate' in session.startTime
                    ? (session.startTime as { toDate: () => Date }).toDate()
                    : session.startTime
                );

          const minutesDiff = (now.getTime() - startTime.getTime()) / (1000 * 60);

          if (minutesDiff > TRACKING_CONFIG.SESSION_TIMEOUT / (60 * 1000)) {
            // 設定時間以上経過したセッションは強制終了
            expiredSessions.push(session);
          } else {
            // 設定時間以内のセッションは自動継続
            autoResumeSessions.push(session);
          }
        });

        // 設定時間以上前のセッションは自動的に終了
        const cleanupPromises = expiredSessions.map(async (session) => {
          const sessionRef = doc(db, 'sessions', session.id);
          await updateDoc(sessionRef, {
            isActive: false,
            endTime: now,
          });
        });

        await Promise.all(cleanupPromises);

        // 設定時間以内のセッションは自動継続
        if (autoResumeSessions.length > 0) {
          const sessionToResume = autoResumeSessions[0];

          // 既存セッションを継続
          setTrackingSession(sessionToResume);
          setIsTracking(true);

          // 位置情報監視を再開
          startLocationWatching(sessionToResume.id);
        } else {
          // アクティブセッションがない場合、記録状態を確認
          const hasVisited = localStorage.getItem('footpath_visited');
          const wasTracking = localStorage.getItem('footpath_was_tracking');

          if (hasVisited && wasTracking === 'true' && !isTracking) {
            // 前回記録中だった場合、自動的に新しいセッションを開始
            setTimeout(() => {
              startTracking();
            }, 2000); // 2秒後に自動開始
          }
        }
      } catch (error) {
        console.error('Failed to cleanup orphaned sessions:', error);
      }
    };

    cleanupOrphanedSessions();
  }, [userId, isTracking, startLocationWatching, startTracking]);

  // 初期位置取得
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // 初期位置取得時もバリデーション
          if (!validatePosition(position)) {
            const tokyoStation: LatLngExpression = [35.6812, 139.7671];
            setCurrentPosition(tokyoStation);
            setLastLocationUpdate(new Date()); // フォールバック位置でも日時を設定
            return;
          }

          const pos: LatLngExpression = [position.coords.latitude, position.coords.longitude];
          setCurrentPosition(pos);
          lastPositionRef.current = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            timestamp: Date.now(),
          };
          setLastLocationUpdate(new Date());

          // 自動記録開始チェック
          const hasVisited = localStorage.getItem('footpath_visited');
          if (!hasVisited && !autoStartRef.current) {
            // 初回アクセス時
            autoStartRef.current = true;
            localStorage.setItem('footpath_visited', 'true');
            // 位置情報取得後に自動的に記録開始
            setTimeout(() => {
              startTracking();
            }, 1000);
          } else if (hasVisited && !autoStartRef.current && !isTracking) {
            // 再読み込み時の自動記録再開チェック
            // アクティブセッションがあるかどうかを後で確認
            autoStartRef.current = true;
          }
        },
        () => {
          // エラー時は東京駅の座標を設定
          const tokyoStation: LatLngExpression = [35.6812, 139.7671];
          setCurrentPosition(tokyoStation);
          setLastLocationUpdate(new Date()); // エラー時のフォールバック位置でも日時を設定
        },
        TRACKING_CONFIG.GEOLOCATION_OPTIONS.BATTERY_SAVING
      );
    } else {
      alert('お使いのブラウザは位置情報をサポートしていません');
      // 位置情報をサポートしていない場合は東京駅を設定
      const tokyoStation: LatLngExpression = [35.6812, 139.7671];
      setCurrentPosition(tokyoStation);
      setLastLocationUpdate(new Date()); // 非サポート時でも日時を設定
    }
  }, [isTracking, validatePosition, startTracking]);

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      // 位置情報監視のクリーンアップ
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      // バッチ処理タイマーのクリーンアップ
      if (batchIntervalRef.current) {
        clearInterval(batchIntervalRef.current);
        batchIntervalRef.current = null;
      }
    };
  }, []);

  return {
    // State
    currentPosition,
    isTracking,
    trackingSession,
    pendingCount,
    lastLocationUpdate,

    // Actions
    startTracking,
    stopTracking,
  };
}
