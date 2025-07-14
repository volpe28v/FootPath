import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import type { GeoPoint, TrackingSession } from '../types/GeoPoint';
import type { ExploredArea, ExplorationStats } from '../types/ExploredArea';
import { ExploredAreaLayer } from './ExploredAreaLayer';
import { ExplorationStatsComponent } from './ExplorationStats';
import { generateExploredAreas, calculateExplorationStats, calculateDistance } from '../utils/explorationUtils';
import 'leaflet/dist/leaflet.css';

// Leafletのデフォルトマーカーアイコンを修正
delete (L.Icon.Default.prototype as any)._getIconUrl;
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
  const [allPoints, setAllPoints] = useState<GeoPoint[]>([]);
  const [exploredAreas, setExploredAreas] = useState<ExploredArea[]>([]);
  const [historyExploredAreas, setHistoryExploredAreas] = useState<ExploredArea[]>([]);
  const [explorationStats, setExplorationStats] = useState<ExplorationStats>({
    totalExploredArea: 0,
    exploredPoints: 0,
    explorationLevel: 1,
    explorationPercentage: 0
  });
  const [showExplorationLayer, setShowExplorationLayer] = useState(true);
  const watchIdRef = useRef<number | null>(null);
  const batchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef<{lat: number, lng: number} | null>(null);
  const pendingPointsRef = useRef<GeoPoint[]>([]);

  // バッチ処理でFirestoreに送信
  const flushPendingPoints = async (sessionId: string) => {
    if (pendingPointsRef.current.length === 0) return;
    
    try {
      setTrackingSession((prev) => {
        if (!prev) return null;
        const updatedPoints = [...prev.points, ...pendingPointsRef.current];
        
        // Firestoreを更新
        const sessionRef = doc(db, 'sessions', sessionId);
        updateDoc(sessionRef, {
          points: updatedPoints
        });
        
        console.log(`Batch upload: ${pendingPointsRef.current.length} points`);
        pendingPointsRef.current = []; // クリア
        
        return { ...prev, points: updatedPoints };
      });
    } catch (error) {
      console.error('Batch upload error:', error);
    }
  };

  // 距離ベースの位置更新判定
  const shouldUpdatePosition = (newLat: number, newLng: number): boolean => {
    if (!lastPositionRef.current) {
      console.log('No previous position - allowing update');
      return true;
    }
    
    const distance = calculateDistance(
      lastPositionRef.current.lat, 
      lastPositionRef.current.lng, 
      newLat, 
      newLng
    );
    
    console.log(`Distance moved: ${distance.toFixed(2)}m (threshold: 25m)`);
    return distance >= 25; // 25m以上移動した場合のみ更新
  };

  // 現在のトラッキングセッションの軌跡から探索エリアを更新
  useEffect(() => {
    console.log('trackingSession', trackingSession);
    if (trackingSession && trackingSession.points.length > 0) {
      console.log('Updating exploration areas from current session:', trackingSession.points.length);
      
      // 現在のセッションから探索エリアを生成
      const newExploredAreas = generateExploredAreas(trackingSession.points, userId);
      console.log('Generated areas from current session:', newExploredAreas.length);
      
      setExploredAreas(newExploredAreas);
    }
  }, [trackingSession?.points?.length, userId]);

  useEffect(() => {
    console.log('Setting up Firestore listener for userId:', userId);
    
    const sessionsRef = collection(db, 'sessions');
    
    // まず全てのセッションを取得してデバッグ
    const allSessionsQuery = query(sessionsRef);
    
    const unsubscribe = onSnapshot(allSessionsQuery, (snapshot) => {
      console.log('All Firestore documents:', snapshot.size);
      
      // 全てのセッションをログ出力
      snapshot.forEach((doc) => {
        const data = doc.data();
        console.log('Document found:', {
          id: doc.id,
          userId: data.userId,
          pointsCount: data.points?.length || 0,
          startTime: data.startTime,
          rawData: data
        });
      });
    });
    
    // ユーザー固有のクエリ
    const userQuery = query(
      sessionsRef, 
      where('userId', '==', userId)
    );

    const userUnsubscribe = onSnapshot(userQuery, (snapshot) => {
      console.log('Firestore snapshot received, documents count:', snapshot.size);
      
      const points: GeoPoint[] = [];
      const sessions: TrackingSession[] = [];
      
      snapshot.forEach((doc) => {
        const session = doc.data() as TrackingSession;
        
        // pointsのtimestampをDate型に変換
        if (session.points && session.points.length > 0) {
          const convertedPoints = session.points.map(point => ({
            ...point,
            timestamp: point.timestamp && typeof (point.timestamp as any).toDate === 'function' 
              ? (point.timestamp as any).toDate() 
              : point.timestamp
          }));
          session.points = convertedPoints;
          points.push(...convertedPoints);
        }
        
        sessions.push(session);
        console.log('Session found:', {
          id: doc.id,
          userId: session.userId,
          pointsCount: session.points?.length || 0,
          startTime: session.startTime,
          isActive: session.isActive
        });
      });
      
      console.log('Total sessions found:', sessions.length);
      console.log('Total points from all sessions:', points.length);
      console.log('Current userId:', userId);
      
      setAllPoints(points);
      
      // 全履歴ポイントから探索エリアを生成
      if (points.length > 0) {
        console.log('Generating exploration areas from', points.length, 'points');
        const historicalAreas = generateExploredAreas(points, userId);
        console.log('Generated historical areas:', historicalAreas.length);
        setHistoryExploredAreas(historicalAreas);
        
        // 統計を履歴込みで更新
        const historicalStats = calculateExplorationStats(historicalAreas);
        setExplorationStats(historicalStats);
      } else {
        console.log('No historical points found - setting empty arrays');
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
    console.log('=== 位置情報デバッグ情報 ===');
    console.log('現在のURL:', window.location.href);
    console.log('プロトコル:', window.location.protocol);
    console.log('HTTPS接続:', window.location.protocol === 'https:');
    console.log('Geolocation API利用可能:', 'geolocation' in navigator);
    console.log('Permissions API利用可能:', 'permissions' in navigator);
    console.log('User Agent:', navigator.userAgent);
    console.log('オンライン状態:', navigator.onLine);
    console.log('言語設定:', navigator.language);
    console.log('========================');

    // HTTPS確認
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      console.warn('⚠️ HTTPS接続が必要です。位置情報APIはHTTPS環境でのみ動作します。');
    }

    // パーミッション状態の確認
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        console.log('Geolocation permission state:', result.state);
        if (result.state === 'denied') {
          console.error('位置情報のパーミッションが拒否されています');
        } else if (result.state === 'prompt') {
          console.log('位置情報のパーミッションはまだ要求されていません');
        } else if (result.state === 'granted') {
          console.log('位置情報のパーミッションが許可されています');
          // パーミッションが既に許可されている場合、自動的に記録を開始
          if (!isTracking) {
            console.log('自動的に記録を開始します');
            setTimeout(() => {
              startTracking();
            }, 1000); // 1秒後に開始
          }
        }
      }).catch((error) => {
        console.error('パーミッション状態の確認エラー:', error);
      });
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos: LatLngExpression = [position.coords.latitude, position.coords.longitude];
          setCurrentPosition(pos);
          
          // 位置情報取得成功時、自動的に記録を開始
          if (!isTracking) {
            console.log('位置情報取得成功 - 自動的に記録を開始します');
            setTimeout(() => {
              startTracking();
            }, 1000); // 1秒後に開始
          }
        },
        (error) => {
          console.error('Error getting location:', error);
          console.error('Error code:', error.code);
          console.error('Error message:', error.message);
          
          // エラーコードによる詳細な診断
          let errorDetails = '';
          switch(error.code) {
            case 1: // PERMISSION_DENIED
              errorDetails = 'PERMISSION_DENIED: 位置情報の使用が拒否されました';
              console.error('Permission denied - ブラウザまたはシステムレベルで位置情報が拒否されています');
              break;
            case 2: // POSITION_UNAVAILABLE
              errorDetails = 'POSITION_UNAVAILABLE: 位置情報を取得できませんでした';
              console.error('Position unavailable - デバイスから位置情報を取得できません');
              break;
            case 3: // TIMEOUT
              errorDetails = 'TIMEOUT: 位置情報の取得がタイムアウトしました';
              console.error('Timeout - 位置情報の取得に時間がかかりすぎています');
              break;
            default:
              errorDetails = `Unknown error (code: ${error.code})`;
          }
          
          console.error('詳細なエラー情報:', errorDetails);
          
          // エラー時は東京駅の座標を設定
          const tokyoStation: LatLngExpression = [35.6812, 139.7671];
          setCurrentPosition(tokyoStation);
          
          // CoreLocationエラーの詳細対応
          if (error.message.includes('CoreLocation') || error.message.includes('kCLErrorLocationUnknown')) {
            alert(`位置情報を取得できませんでした（CoreLocationエラー）。\n\n対処法：\n1. Safari: 設定 → プライバシーとセキュリティ → 位置情報サービス → Safari → 許可\n2. Chrome: アドレスバー左の🔒 → 位置情報 → 許可\n3. デバイス設定: システム環境設定 → セキュリティとプライバシー → 位置情報サービス\n4. WiFi接続を確認（位置精度向上）\n\nデフォルト位置（東京駅）を表示します。デモモードをお試しください。`);
          } else {
            alert(`位置情報を取得できませんでした。デフォルトの位置（東京駅）を表示します。\n\nエラー詳細: ${errorDetails}\n\n位置情報を有効にするには：\n1. ブラウザの設定で位置情報を許可\n2. macOSのシステム環境設定 → セキュリティとプライバシー → 位置情報サービスで許可`);
          }
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

  const startTracking = async () => {
    if (!navigator.geolocation) {
      alert('位置情報がサポートされていません');
      return;
    }

    setIsTracking(true);
    
    const newSession: Omit<TrackingSession, 'id'> = {
      userId,
      points: [],
      startTime: new Date(),
      isActive: true
    };

    const docRef = await addDoc(collection(db, 'sessions'), newSession);
    const sessionId = docRef.id;
    
    setTrackingSession({ ...newSession, id: sessionId });

    // バッチ処理タイマー開始（60秒間隔）
    batchIntervalRef.current = setInterval(() => {
      flushPendingPoints(sessionId);
    }, 60000);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLat = position.coords.latitude;
        const newLng = position.coords.longitude;
        
        // 距離ベースフィルタリング
        if (!shouldUpdatePosition(newLat, newLng)) {
          console.log('Position update skipped - insufficient movement');
          return;
        }

        const newPoint: GeoPoint = {
          lat: newLat,
          lng: newLng,
          timestamp: new Date()
        };

        // 現在位置更新（UI用）
        setCurrentPosition([newLat, newLng]);
        lastPositionRef.current = { lat: newLat, lng: newLng };

        // ペンディングキューに追加（Firestore更新は後でバッチ処理）
        pendingPointsRef.current.push(newPoint);
        console.log(`Point queued. Pending: ${pendingPointsRef.current.length}`);

        // ローカル状態は即座に更新（UI反応性維持）
        setTrackingSession((prev) => {
          if (!prev) return null;
          return { ...prev, points: [...prev.points, newPoint] };
        });
      },
      (error) => {
        console.error('Error tracking location:', error);
        console.error('Tracking error code:', error.code);
        console.error('Tracking error message:', error.message);
        
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
        
        console.error('トラッキングエラーの詳細:', errorDetails);
        alert(`位置情報のトラッキング中にエラーが発生しました:\n${errorDetails}`);
      },
      {
        enableHighAccuracy: false, // バッテリー節約
        maximumAge: 30000, // 30秒キャッシュ許可
        timeout: 10000 // 10秒タイムアウト
      }
    );
  };

  const stopTracking = async () => {
    setIsTracking(false);
    
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
        isActive: false
      });
    }

    // 状態をリセット
    setTrackingSession(null);
    lastPositionRef.current = null;
    pendingPointsRef.current = [];
  };

  const polylinePositions: LatLngExpression[] = allPoints.map(point => [point.lat, point.lng]);
  const currentTrackPositions: LatLngExpression[] = trackingSession 
    ? trackingSession.points.map(point => [point.lat, point.lng])
    : [];

  // デモモード用の関数
  const startDemoMode = async () => {
    if (!currentPosition) {
      alert('位置情報を設定してください');
      return;
    }

    setIsTracking(true);
    
    const newSession: Omit<TrackingSession, 'id'> = {
      userId,
      points: [],
      startTime: new Date(),
      isActive: true
    };

    const docRef = await addDoc(collection(db, 'sessions'), newSession);
    const sessionId = docRef.id;
    
    setTrackingSession({ ...newSession, id: sessionId });

    // デモ用の移動シミュレーション
    let lat = Array.isArray(currentPosition) ? currentPosition[0] as number : 35.6812;
    let lng = Array.isArray(currentPosition) ? currentPosition[1] as number : 139.7671;
    let pointCount = 0;

    // バッチ処理タイマー開始（60秒間隔）
    batchIntervalRef.current = setInterval(() => {
      flushPendingPoints(sessionId);
    }, 60000);

    const demoInterval = setInterval(() => {
      if (pointCount >= 20) { // より多くのポイントでテスト
        clearInterval(demoInterval);
        return;
      }

      // デモ用により大きな移動（確実に50m以上移動するように）
      lat += (Math.random() - 0.5) * 0.003; // さらに大きな移動距離
      lng += (Math.random() - 0.5) * 0.003;

      // デモモードでは距離フィルターを緩和
      const demoDistance = lastPositionRef.current ? 
        calculateDistance(lastPositionRef.current.lat, lastPositionRef.current.lng, lat, lng) : 0;
      
      console.log(`Demo movement distance: ${demoDistance.toFixed(2)}m`);
      
      // デモモードでは10m以上で更新（通常は25m）
      if (lastPositionRef.current && demoDistance < 10) {
        console.log('Demo: Position update skipped - insufficient movement');
        pointCount++; // カウンターは進める
        return;
      }

      const newPoint: GeoPoint = {
        lat,
        lng,
        timestamp: new Date()
      };

      setCurrentPosition([newPoint.lat, newPoint.lng]);
      lastPositionRef.current = { lat, lng };

      // ペンディングキューに追加
      pendingPointsRef.current.push(newPoint);
      console.log(`Demo point queued. Pending: ${pendingPointsRef.current.length}`);

      // ローカル状態は即座に更新
      setTrackingSession((prev) => {
        const currentSession = prev || { points: [], id: sessionId, userId, startTime: new Date(), isActive: true };
        return { ...currentSession, points: [...currentSession.points, newPoint] };
      });

      pointCount++;
    }, 5000); // 5秒ごとに移動（頻度を下げる）

    // インターバルIDを保存
    watchIdRef.current = demoInterval as any; // デモモード用に再利用
  };

  return (
    <div className="relative h-screen w-full">
      <MapContainer
        center={currentPosition || [35.6762, 139.6503]}
        zoom={15}
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
        
        {/* デバッグ情報表示 */}
        <div className="absolute top-20 left-4 z-[1002] bg-black bg-opacity-70 text-white p-2 rounded text-xs">
          履歴エリア: {historyExploredAreas.length}<br/>
          現在エリア: {exploredAreas.length}<br/>
          合計エリア: {historyExploredAreas.length + exploredAreas.length}<br/>
          全ポイント: {allPoints.length}<br/>
          ユーザーID: {userId}
        </div>
        
        <LocationUpdater position={currentPosition} />
      </MapContainer>
      
      {/* 探索統計パネル - 左上 */}
      <ExplorationStatsComponent 
        stats={explorationStats}
        isVisible={showExplorationLayer}
      />
      
      {/* コントロールボタン群 - 下部に横並び配置 */}
      <div className="absolute bottom-4 left-4 right-4 z-[1001] flex justify-between items-center gap-4">
        {/* 記録開始/停止ボタン - 左 */}
        <button
          onClick={isTracking ? stopTracking : startTracking}
          className={`px-6 py-3 rounded-lg text-white font-semibold shadow-lg transition-all ${
            isTracking 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {isTracking ? '📍 記録停止' : '📍 記録開始'}
        </button>
        
        {/* デモモードボタン - 中央 */}
        <button
          onClick={startDemoMode}
          className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all"
          disabled={isTracking}
        >
          🎮 デモモード
        </button>
        
        {/* 探索表示切替ボタン - 右 */}
        <button
          onClick={() => setShowExplorationLayer(!showExplorationLayer)}
          className={`px-4 py-2 rounded-lg text-white text-sm font-medium shadow-lg transition-all ${
            showExplorationLayer 
              ? 'bg-green-500 hover:bg-green-600' 
              : 'bg-gray-500 hover:bg-gray-600'
          }`}
        >
          🗺️ {showExplorationLayer ? '探索表示ON' : '探索表示OFF'}
        </button>
      </div>
    </div>
  );
}