import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import {
  collection,
  addDoc,
  query,
  where,
  updateDoc,
  doc,
  arrayUnion,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { GeoPoint, TrackingSession } from '../types/GeoPoint';
import { ExploredAreaLayer } from './ExploredAreaLayer';
import { MapHeader } from './MapHeader';
import { usePhotoUpload } from '../hooks/usePhotoUpload';
import { useDataManagement } from '../hooks/useDataManagement';
import { TRACKING_CONFIG } from '../constants/tracking';
import { addPointToExploredAreas, calculateDistance } from '../utils/explorationUtils';
import 'leaflet/dist/leaflet.css';

// Leafletのデフォルトマーカーアイコンを修正
delete (L.Icon.Default.prototype as unknown as { _getIconUrl: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// カスタム位置マーカーアイコン（予備用）
// const locationIcon = new L.Icon({
//   iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
//   iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
//   shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
//   iconSize: [25, 41],
//   iconAnchor: [12, 41],
//   popupAnchor: [1, -34],
//   shadowSize: [41, 41]
// });

// 絵文字マーカーアイコン（フォールバック用）
// EmojiIconを事前生成（コンポーネント外で1回のみ生成）
const createEmojiIcon = () => {
  const div = document.createElement('div');
  div.innerHTML = '📍';
  div.style.fontSize = '24px';
  div.style.textAlign = 'center';
  div.style.lineHeight = '1';

  return new L.DivIcon({
    html: div.outerHTML,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
    className: 'emoji-marker',
  });
};

// 写真マーカーアイコンを事前生成（コンポーネント外で1回のみ生成）
const createPhotoIcon = () => {
  const div = document.createElement('div');
  div.innerHTML = '📷';
  div.style.fontSize = '28px';
  div.style.textAlign = 'center';
  div.style.lineHeight = '1';
  div.style.filter = 'drop-shadow(2px 2px 4px rgba(0,0,0,0.5))';

  return new L.DivIcon({
    html: div.outerHTML,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
    className: 'photo-marker',
  });
};

// アイコンを事前生成してキャッシュ
const emojiIcon = createEmojiIcon();
const photoIcon = createPhotoIcon();

interface MapViewProps {
  userId: string;
  user: { displayName: string | null; photoURL: string | null };
  onLogout: () => void;
}

function LocationUpdater({ position }: { position: LatLngExpression | null }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom());
    }
  }, [position, map]);

  return null;
}

export function MapView({ userId, user, onLogout }: MapViewProps) {
  const [currentPosition, setCurrentPosition] = useState<LatLngExpression | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingSession, setTrackingSession] = useState<TrackingSession | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<Date | null>(null);

  // データ管理機能をカスタムフックで管理
  const {
    setExploredAreas,
    combinedExploredAreas,
    totalPointsCount,
    showExplorationLayer,
    loadSessionData,
  } = useDataManagement({
    userId,
  });

  const watchIdRef = useRef<number | null>(null);
  const batchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number; timestamp: number } | null>(null);
  const pendingPointsRef = useRef<GeoPoint[]>([]);
  const autoStartRef = useRef<boolean>(false);

  // 写真アップロード機能をカスタムフックで管理
  const { photos, isUploading, fileInputRef, handleCameraClick, handleFileSelect, loadPhotoData } =
    usePhotoUpload({
      userId,
      currentPosition,
      trackingSessionId: trackingSession?.id,
      onUploadComplete: () => {
        console.log('Photo upload completed');
      },
    });

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

  // 最適化設定（固定）- useMemoで無駄な再レンダリングを防止
  const optimizationSettings = useMemo(
    () => ({
      minDistance: TRACKING_CONFIG.MIN_DISTANCE,
      batchInterval: TRACKING_CONFIG.BATCH_INTERVAL,
    }),
    []
  );

  // 距離ベースの位置更新判定
  const shouldUpdatePosition = useCallback(
    (newLat: number, newLng: number): boolean => {
      if (!lastPositionRef.current) {
        return true;
      }

      const distance = calculateDistance(
        lastPositionRef.current.lat,
        lastPositionRef.current.lng,
        newLat,
        newLng
      );

      return distance >= optimizationSettings.minDistance;
    },
    [optimizationSettings.minDistance]
  );

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

      pendingPointsRef.current.push(newPoint);
      setPendingCount(pendingPointsRef.current.length);

      setTrackingSession((prev) => {
        if (!prev) return null;
        return { ...prev, points: [...prev.points, newPoint] };
      });

      // 増分更新で探索エリアを効率的に更新
      setExploredAreas((prevAreas) => {
        return addPointToExploredAreas(prevAreas, newPoint, userId);
      });
    },
    [validatePosition, shouldUpdatePosition, userId, setExploredAreas]
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
      }, optimizationSettings.batchInterval);

      // 位置情報監視開始
      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          handlePositionUpdate,
          handleGeolocationError,
          TRACKING_CONFIG.GEOLOCATION_OPTIONS.BATTERY_SAVING
        );
      }
    },
    [
      handlePositionUpdate,
      handleGeolocationError,
      flushPendingPoints,
      optimizationSettings.batchInterval,
    ]
  );

  // Catmull-Romスプライン補間（メモ化）
  const interpolateSpline = useCallback((points: [number, number][]) => {
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
  }, []);

  // ポイント間引き処理（パフォーマンス最適化）
  const optimizePoints = useCallback((points: [number, number][]) => {
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
  }, []);

  // スプライン補間結果をメモ化 - ポイント数とセッションIDのみで再計算判定
  const smoothedPositions = useMemo(() => {
    if (!trackingSession?.points || trackingSession.points.length < 2) {
      return [];
    }

    const validPoints = trackingSession.points
      .filter((point) => point && point.lat && point.lng)
      .map((point) => [point.lat, point.lng] as [number, number]);

    // パフォーマンス最適化：大量ポイント時は間引き処理
    const optimizedPoints = optimizePoints(validPoints);

    return interpolateSpline(optimizedPoints);
  }, [trackingSession?.points, interpolateSpline, optimizePoints]);

  // 起動時の孤立セッションクリーンアップ
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isTracking, startLocationWatching]);

  // ページ終了時のクリーンアップとvisibility管理
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && trackingSession?.isActive && isTracking) {
        // フォアグラウンド復帰時、記録中なら位置情報監視を再開
        console.log('App returned to foreground - resuming position watching');

        if (trackingSession) {
          startLocationWatching(trackingSession.id);
        }
      } else if (document.visibilityState === 'hidden' && isTracking) {
        // バックグラウンド時の処理 - リソース節約のため位置情報監視とタイマーを停止
        console.log('App moved to background - pausing tracking resources');

        // バッチ処理タイマーを停止
        if (batchIntervalRef.current) {
          clearInterval(batchIntervalRef.current);
          batchIntervalRef.current = null;
        }

        // 位置情報監視を停止
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }

        // pending pointsがあれば最後に一度フラッシュ
        if (trackingSession && pendingPointsRef.current.length > 0) {
          flushPendingPoints(trackingSession.id);
        }
      }
    };

    // beforeunloadイベントでは非同期処理が制限されるため、
    // 同期的にFirestoreに送信を試みる
    const handleSyncBeforeUnload = () => {
      if (trackingSession?.isActive) {
        // Navigator.sendBeacon を使用して同期的に送信
        const updateData = {
          endTime: new Date(),
          isActive: false,
        };

        // 可能であれば sendBeacon で送信
        if (navigator.sendBeacon) {
          const url = `https://firestore.googleapis.com/v1/projects/${process.env.REACT_APP_FIREBASE_PROJECT_ID}/databases/(default)/documents/sessions/${trackingSession.id}`;
          const payload = JSON.stringify(updateData);
          navigator.sendBeacon(url, payload);
        }
      }
    };

    window.addEventListener('beforeunload', handleSyncBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleSyncBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    trackingSession?.id,
    isTracking,
    flushPendingPoints,
    optimizationSettings,
    startLocationWatching,
    trackingSession,
  ]);

  // 写真データの初回ロード
  useEffect(() => {
    loadPhotoData();
  }, [loadPhotoData]);

  // コンポーネントアンマウント時の確実なクリーンアップ
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

  useEffect(() => {
    // デバッグ情報の出力

    // HTTPS確認
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      // HTTPS環境でのみ動作
    }

    // パーミッション状態の確認
    if ('permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          if (result.state === 'denied') {
            // パーミッションが拒否されている
          } else if (result.state === 'prompt') {
            // パーミッションプロンプト表示
          } else if (result.state === 'granted') {
            // パーミッション許可済み
          }
        })
        .catch(() => {
          // パーミッション状態確認エラー
        });
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking]);

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
      minDistance: optimizationSettings.minDistance,
    };

    const docRef = await addDoc(collection(db, 'sessions'), newSession);
    const sessionId = docRef.id;

    setTrackingSession({ ...newSession, id: sessionId });

    // 位置情報監視開始
    startLocationWatching(sessionId);
  }, [userId, startLocationWatching, optimizationSettings.minDistance]);

  const stopTracking = async () => {
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

      // セッション終了後にデータを強制リフレッシュ
      await loadSessionData(true);
    }

    // 状態をリセット
    setTrackingSession(null);
    lastPositionRef.current = null;
    pendingPointsRef.current = [];
    setPendingCount(0);
  };

  return (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f172a',
      }}
    >
      {/* ヘッダー部分 */}
      <MapHeader
        user={user}
        isTracking={isTracking}
        totalPointsCount={totalPointsCount}
        pendingCount={pendingCount}
        lastLocationUpdate={lastLocationUpdate}
        isUploading={isUploading}
        fileInputRef={fileInputRef}
        onStartTracking={startTracking}
        onStopTracking={stopTracking}
        onCameraClick={handleCameraClick}
        onFileSelect={handleFileSelect}
        onLogout={onLogout}
      />

      {/* 地図部分 */}
      <div className="flex-1 relative" style={{ paddingTop: '48px' }}>
        {/* グリッド背景効果 */}
        <div
          className="absolute inset-0 bg-slate-900 opacity-20 z-[1000] pointer-events-none"
          style={{
            backgroundImage: `
                 linear-gradient(rgba(34, 197, 94, 0.1) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(34, 197, 94, 0.1) 1px, transparent 1px)
               `,
            backgroundSize: '20px 20px',
          }}
        ></div>

        <MapContainer
          center={currentPosition || [35.6762, 139.6503]}
          zoom={17}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | &copy; <a href="https://cartodb.com/attributions">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            opacity={0.8}
          />

          {/* 写真マーカー */}

          <ExploredAreaLayer
            exploredAreas={combinedExploredAreas}
            isVisible={showExplorationLayer}
          />

          {/* 軌跡線を最上位レイヤーに再配置（最適化済みスプライン補間） */}
          {trackingSession &&
            trackingSession.points &&
            trackingSession.points.length > 1 &&
            smoothedPositions.length > 0 && (
              <>
                {/* 外側のグロー効果 */}
                <Polyline
                  positions={smoothedPositions}
                  pathOptions={{
                    color: '#ff6b00',
                    weight: 12,
                    opacity: 0.2,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                  pane="tooltipPane"
                />
                {/* 中間のグロー効果 */}
                <Polyline
                  positions={smoothedPositions}
                  pathOptions={{
                    color: '#ff6b00',
                    weight: 8,
                    opacity: 0.4,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                  pane="tooltipPane"
                />
                {/* メインの線 */}
                <Polyline
                  positions={smoothedPositions}
                  pathOptions={{
                    color: '#ffaa44',
                    weight: 4,
                    opacity: 0.95,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                  pane="tooltipPane"
                />
              </>
            )}

          {/* 写真マーカーを最上位に配置 */}
          {photos.map((photo) => (
            <Marker
              key={photo.id}
              position={[photo.location.lat, photo.location.lng]}
              icon={photoIcon}
              pane="markerPane"
              zIndexOffset={1000}
            >
              <Popup maxWidth={180} className="photo-popup">
                <div className="text-center w-full">
                  <img
                    src={photo.thumbnailUrl || photo.imageUrl}
                    alt={photo.caption || '写真'}
                    className="w-full max-w-[150px] h-auto object-cover rounded mb-2 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => window.open(photo.imageUrl, '_blank')}
                    title="クリックで別タブに拡大表示"
                  />
                  {photo.caption && (
                    <p className="text-xs text-gray-700 mb-1 break-words">{photo.caption}</p>
                  )}
                  <p className="text-xs text-gray-500 mb-1">
                    {photo.timestamp.toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-500 mb-1">
                    {photo.timestamp.toLocaleTimeString()}
                  </p>
                  <p className="text-xs text-blue-500">📱 タップで拡大</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* 現在位置マーカーを最上位に配置 */}
          {currentPosition && (
            <Marker
              position={currentPosition}
              icon={emojiIcon}
              pane="popupPane"
              zIndexOffset={3000}
            />
          )}

          <LocationUpdater position={currentPosition} />
        </MapContainer>

        {/* Leafletのズームコントロール位置調整 */}
        <style>{`
          .leaflet-control-zoom {
            margin-top: 20px !important;
          }
        `}</style>
      </div>
    </div>
  );
}
