import { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import type { GeoPoint, TrackingSession } from '../types/GeoPoint';
import type { ExploredArea, ExplorationStats } from '../types/ExploredArea';
import { ExploredAreaLayer } from './ExploredAreaLayer';
import { generateExploredAreas, calculateExplorationStats, calculateDistance } from '../utils/explorationUtils';
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
    className: 'emoji-marker'
  });
};

interface MapViewProps {
  userId: string;
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

export function MapView({ userId }: MapViewProps) {
  const [currentPosition, setCurrentPosition] = useState<LatLngExpression | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingSession, setTrackingSession] = useState<TrackingSession | null>(null);
  const [exploredAreas, setExploredAreas] = useState<ExploredArea[]>([]);
  const [historyExploredAreas, setHistoryExploredAreas] = useState<ExploredArea[]>([]);
  const [, setExplorationStats] = useState<ExplorationStats>({
    totalExploredArea: 0,
    exploredPoints: 0,
    explorationLevel: 1,
    explorationPercentage: 0
  });
  const [showExplorationLayer] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalPointsCount, setTotalPointsCount] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const batchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef<{lat: number, lng: number, timestamp: number} | null>(null);
  const pendingPointsRef = useRef<GeoPoint[]>([]);

  // バッチ処理でFirestoreに送信（増分保存）
  const flushPendingPoints = async (sessionId: string) => {
    if (pendingPointsRef.current.length === 0) return;
    
    try {
      const pointsToUpload = [...pendingPointsRef.current];
      console.log('flushPendingPoints: pointsToUpload: ', pointsToUpload.length);
      
      // Firestoreに新しいポイントのみを追加
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        points: arrayUnion(...pointsToUpload),
        storageMode: 'incremental',
        minDistance: optimizationSettings.minDistance
      });
      
      // 成功後にクリア
      pendingPointsRef.current = [];
      setPendingCount(0);
    } catch (error) {
      // アップロードエラー
    }
  };


  // 位置情報の妥当性チェック
  const validatePosition = (position: GeolocationPosition): boolean => {
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
  };


  // 最適化設定（固定）
  const optimizationSettings = {
    minDistance: 10,    // 10m間隔で記録
    batchInterval: 30000 // 30秒間隔でバッチ保存
  };

  // 距離ベースの位置更新判定
  const shouldUpdatePosition = (newLat: number, newLng: number): boolean => {
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
  };

  // 現在のトラッキングセッションの軌跡から探索エリアを更新
  useEffect(() => {
    if (trackingSession && trackingSession.points.length > 0) {
      
      // 現在のセッションから探索エリアを生成
      const newExploredAreas = generateExploredAreas(trackingSession.points, userId);
      
      setExploredAreas(newExploredAreas);
    }
  }, [trackingSession?.points?.length, userId, trackingSession]);

  useEffect(() => {
    
    const sessionsRef = collection(db, 'sessions');
    
    // まず全てのセッションを取得してデバッグ
    const allSessionsQuery = query(sessionsRef);
    
    const unsubscribe = onSnapshot(allSessionsQuery, (snapshot) => {
      
      // 全てのセッションをログ出力
      snapshot.forEach((doc) => {
        doc.data();
      });
    });
    
    // ユーザー固有のクエリ
    const userQuery = query(
      sessionsRef, 
      where('userId', '==', userId)
    );

    const userUnsubscribe = onSnapshot(userQuery, (snapshot) => {
      
      const points: GeoPoint[] = [];
      const sessions: TrackingSession[] = [];
      
      snapshot.forEach((doc) => {
        const session = doc.data() as TrackingSession;
        
        // pointsのtimestampをDate型に変換
        if (session.points && session.points.length > 0) {
          const convertedPoints = session.points.map(point => ({
            ...point,
            timestamp: point.timestamp && typeof (point.timestamp as unknown as { toDate: () => Date }).toDate === 'function' 
              ? (point.timestamp as unknown as { toDate: () => Date }).toDate() 
              : point.timestamp
          }));
          session.points = convertedPoints;
          
          // アクティブでないセッションのポイントのみを履歴に追加
          if (!session.isActive) {
            points.push(...convertedPoints);
          }
        }
        
        sessions.push(session);
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
      
    });

    return () => {
      unsubscribe();
      userUnsubscribe();
    };
  }, [userId]);


  useEffect(() => {
    // デバッグ情報の出力

    // HTTPS確認
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      // HTTPS環境でのみ動作
    }

    // パーミッション状態の確認
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'denied') {
          // パーミッションが拒否されている
        } else if (result.state === 'prompt') {
          // パーミッションプロンプト表示
        } else if (result.state === 'granted') {
          // パーミッション許可済み
        }
      }).catch(() => {
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
            return;
          }

          const pos: LatLngExpression = [position.coords.latitude, position.coords.longitude];
          setCurrentPosition(pos);
          lastPositionRef.current = { 
            lat: position.coords.latitude, 
            lng: position.coords.longitude, 
            timestamp: Date.now() 
          };
          
        },
        () => {
          // エラー時は東京駅の座標を設定
          const tokyoStation: LatLngExpression = [35.6812, 139.7671];
          setCurrentPosition(tokyoStation);
        },
        {
          enableHighAccuracy: false, // モバイルでの精度を下げて成功率向上
          timeout: 15000, // タイムアウトを延長
          maximumAge: 300000 // 5分間キャッシュを許可
        }
      );
    } else {
      alert('お使いのブラウザは位置情報をサポートしていません');
    }
  }, []);

  const startTracking = useCallback(async () => {
    if (!navigator.geolocation) {
      return;
    }

    setIsTracking(true);
    
    const newSession: Omit<TrackingSession, 'id'> = {
      userId,
      points: [],
      startTime: new Date(),
      isActive: true,
      storageMode: 'incremental',
      minDistance: optimizationSettings.minDistance
    };

    const docRef = await addDoc(collection(db, 'sessions'), newSession);
    const sessionId = docRef.id;
    
    setTrackingSession({ ...newSession, id: sessionId });

    // 既存のバッチ処理タイマーをクリア
    if (batchIntervalRef.current) {
      clearInterval(batchIntervalRef.current);
    }

    // バッチ処理タイマー開始（30秒間隔）
    batchIntervalRef.current = setInterval(() => {
      flushPendingPoints(sessionId);
      console.log('startTracking: flush');
    }, optimizationSettings.batchInterval);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        // 位置情報の妥当性チェック
        if (!validatePosition(position)) {
          return;
        }

        // 位置情報を直接使用
        const newLat = position.coords.latitude;
        const newLng = position.coords.longitude;
        const now = Date.now();
        
        // 距離ベースフィルタリング
        if (!shouldUpdatePosition(newLat, newLng)) {
          return;
        }

        const newPoint: GeoPoint = {
          lat: newLat,
          lng: newLng,
          timestamp: new Date()
        };

        // 現在位置更新（UI用）
        setCurrentPosition([newLat, newLng]);
        lastPositionRef.current = { lat: newLat, lng: newLng, timestamp: now };

        // ペンディングキューに追加（Firestore更新は後でバッチ処理）
        pendingPointsRef.current.push(newPoint);
        setPendingCount(pendingPointsRef.current.length);

        // ローカル状態は即座に更新（UI反応性維持）
        setTrackingSession((prev) => {
          if (!prev) return null;
          return { ...prev, points: [...prev.points, newPoint] };
        });
      },
      (error) => {
        let errorDetails = '';
        switch(error.code) {
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
      },
      {
        enableHighAccuracy: false, // バッテリー節約
        maximumAge: 30000, // 30秒キャッシュ許可
        timeout: 10000 // 10秒タイムアウト
      }
    );
  }, [userId, optimizationSettings.minDistance, optimizationSettings.batchInterval, flushPendingPoints, shouldUpdatePosition]);

  const stopTracking = async () => {
    setIsTracking(false);
    
    if (watchIdRef.current !== null) {
      // 通常のgeolocation watchまたはデモモードのintervalをクリア
      if (typeof watchIdRef.current === 'number') {
        // デモモードの場合：setIntervalのIDをクリア
        clearInterval(watchIdRef.current);
      } else {
        // 通常モードの場合：geolocation watchをクリア
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
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
        isActive: false
      });
    }

    // 状態をリセット
    setTrackingSession(null);
    lastPositionRef.current = null;
    pendingPointsRef.current = [];
    setPendingCount(0);
  };

  const currentTrackPositions: LatLngExpression[] = trackingSession 
    ? trackingSession.points.map(point => [point.lat, point.lng])
    : [];

  // デモモード用の関数 - より現実的な散策シミュレーション
  const startDemoMode = async () => {
    setIsTracking(true);
    
    const newSession: Omit<TrackingSession, 'id'> = {
      userId,
      points: [],
      startTime: new Date(),
      isActive: true,
      storageMode: 'incremental',
      minDistance: optimizationSettings.minDistance
    };

    const docRef = await addDoc(collection(db, 'sessions'), newSession);
    const sessionId = docRef.id;
    
    setTrackingSession({ ...newSession, id: sessionId });

    // デモ用の移動シミュレーション状態
    let lat = Array.isArray(currentPosition) ? currentPosition[0] as number : 35.6812;
    let lng = Array.isArray(currentPosition) ? currentPosition[1] as number : 139.7671;
    
    // 散策の状態
    let direction = Math.random() * Math.PI * 2; // 初期方向（ラジアン）
    let speed = 1.2; // 歩行速度 (m/s) - 時速約4.3km
    let isResting = false;
    let restTimer = 0;
    let walkDuration = 0;
    const turnTendency = (Math.random() - 0.5) * 0.3; // 左右への曲がり癖

    // 既存のバッチ処理タイマーをクリア
    if (batchIntervalRef.current) {
      clearInterval(batchIntervalRef.current);
    }

    // バッチ処理タイマー開始（30秒間隔）
    batchIntervalRef.current = setInterval(() => {
      flushPendingPoints(sessionId);
      console.log('startDemoMode: flush');
    }, optimizationSettings.batchInterval);

    const demoInterval = setInterval(() => {
      walkDuration++;
      
      // 休憩の処理
      if (isResting) {
        restTimer--;
        if (restTimer <= 0) {
          isResting = false;
        }
        return;
      }
      
      // 10-30分ごとにランダムに休憩（1-3分）
      if (walkDuration > 0 && walkDuration % (600 + Math.floor(Math.random() * 1200)) === 0) {
        isResting = true;
        restTimer = 60 + Math.floor(Math.random() * 120); // 1-3分休憩
        return;
      }
      
      // 歩行速度を5m/s固定
      speed = 5.0;
      
      // 方向の自然な変化
      direction += (Math.random() - 0.5) * 0.15 + turnTendency; // 基本的な揺らぎ + 曲がり癖
      
      // たまに大きく方向転換（交差点など）
      if (Math.random() < 0.05) {
        direction += (Math.random() - 0.5) * Math.PI / 2; // 最大90度の方向転換
      }
      
      // 移動距離の計算（1秒あたり）
      const distanceMeters = speed;
      
      // 緯度経度への変換（おおよその計算）
      const metersPerDegLat = 111000; // 緯度1度あたり約111km
      const metersPerDegLng = 111000 * Math.cos(lat * Math.PI / 180); // 経度は緯度により変化
      
      const deltaLat = (distanceMeters * Math.cos(direction)) / metersPerDegLat;
      const deltaLng = (distanceMeters * Math.sin(direction)) / metersPerDegLng;
      
      lat += deltaLat;
      lng += deltaLng;

      // 現在位置を常に更新（UI表示用）
      setCurrentPosition([lat, lng]);
      
      // 距離ベースフィルタリング（デモモードでも適用）
      if (!shouldUpdatePosition(lat, lng)) {
        // 位置は更新するが、記録はスキップ
        return;
      }

      const newPoint: GeoPoint = {
        lat,
        lng,
        timestamp: new Date()
      };

      lastPositionRef.current = { lat, lng, timestamp: Date.now() };

      // ペンディングキューに追加
      pendingPointsRef.current.push(newPoint);
      setPendingCount(pendingPointsRef.current.length);

      // ローカル状態は即座に更新
      setTrackingSession((prev) => {
        const currentSession = prev || { points: [], id: sessionId, userId, startTime: new Date(), isActive: true };
        return { ...currentSession, points: [...currentSession.points, newPoint] };
      });
    }, 1000); // 1秒ごとに更新（現実的な更新頻度）

    // インターバルIDを保存
    watchIdRef.current = demoInterval as unknown as number; // デモモード用に再利用
    
  };

  return (
    <div className="relative h-screen w-full flex flex-col">
      {/* ヘッダー部分 */}
      <div className="bg-white shadow-lg p-4 z-[1002] flex items-center gap-4">
        {/* 左側：コントロールボタン */}
        <div className="flex items-center gap-3">
          {/* 記録開始/停止ボタン */}
          <button
            onClick={isTracking ? stopTracking : startTracking}
            className={`px-4 py-2 rounded-lg text-white font-semibold shadow-md transition-all ${
              isTracking 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isTracking ? '📍 記録停止' : '📍 記録開始'}
          </button>
          
          {/* デモモードボタン */}
          <button
            onClick={startDemoMode}
            className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-medium shadow-md transition-all"
            disabled={isTracking}
          >
            🎮 デモモード
          </button>
          
          {/* データ数表示 */}
          <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg font-medium shadow-md">
            📊 {totalPointsCount + (trackingSession?.points?.length || 0) - pendingCount}:{pendingCount}
          </div>
          
        </div>
      </div>

      {/* 地図部分 */}
      <div className="flex-1">
        <MapContainer
          center={currentPosition || [35.6762, 139.6503]}
          zoom={17}
          className="h-full w-full"
        >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          opacity={0.4}
        />
        
        {currentPosition && (
          <Marker position={currentPosition} icon={createEmojiIcon()} />
        )}
        
        
        {currentTrackPositions.length > 0 && (
          <Polyline 
            positions={currentTrackPositions} 
            color="red" 
            weight={4}
          />
        )}
        
        <ExploredAreaLayer 
          exploredAreas={[...historyExploredAreas, ...exploredAreas]} 
          isVisible={showExplorationLayer} 
        />
        
        
        <LocationUpdater position={currentPosition} />
      </MapContainer>
      
      </div>
    </div>
  );
}