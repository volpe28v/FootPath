import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import { LatLngExpression } from 'leaflet';
import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import type { GeoPoint, TrackingSession } from '../types/GeoPoint';
import 'leaflet/dist/leaflet.css';

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
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const sessionsRef = collection(db, 'sessions');
    const q = query(
      sessionsRef, 
      where('userId', '==', userId),
      orderBy('startTime', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const points: GeoPoint[] = [];
      snapshot.forEach((doc) => {
        const session = doc.data() as TrackingSession;
        points.push(...session.points);
      });
      setAllPoints(points);
    });

    return () => unsubscribe();
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
    console.log('========================');

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
          alert(`位置情報を取得できませんでした。デフォルトの位置（東京駅）を表示します。\n\nエラー詳細: ${errorDetails}\n\n位置情報を有効にするには：\n1. ブラウザの設定で位置情報を許可\n2. macOSのシステム環境設定 → セキュリティとプライバシー → 位置情報サービスで許可`);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
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

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const newPoint: GeoPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: new Date()
        };

        setCurrentPosition([newPoint.lat, newPoint.lng]);

        const sessionRef = doc(db, 'sessions', sessionId);
        const updatedPoints = trackingSession ? [...trackingSession.points, newPoint] : [newPoint];
        
        await updateDoc(sessionRef, {
          points: updatedPoints
        });

        setTrackingSession((prev) => 
          prev ? { ...prev, points: updatedPoints } : null
        );
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
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    );

    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const newPoint: GeoPoint = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            timestamp: new Date()
          };

          const sessionRef = doc(db, 'sessions', sessionId);
          const currentSession = trackingSession || { points: [] };
          const updatedPoints = [...currentSession.points, newPoint];
          
          await updateDoc(sessionRef, {
            points: updatedPoints
          });

          setTrackingSession((prev) => 
            prev ? { ...prev, points: updatedPoints } : null
          );
        }
      );
    }, 10000);
  };

  const stopTracking = async () => {
    setIsTracking(false);
    
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (trackingSession) {
      const sessionRef = doc(db, 'sessions', trackingSession.id);
      await updateDoc(sessionRef, {
        endTime: new Date(),
        isActive: false
      });
    }

    setTrackingSession(null);
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
    let lat = currentPosition[0] as number;
    let lng = currentPosition[1] as number;
    let pointCount = 0;

    const demoInterval = setInterval(async () => {
      if (pointCount >= 10) {
        clearInterval(demoInterval);
        return;
      }

      // ランダムに少しずつ移動
      lat += (Math.random() - 0.5) * 0.001;
      lng += (Math.random() - 0.5) * 0.001;

      const newPoint: GeoPoint = {
        lat,
        lng,
        timestamp: new Date()
      };

      setCurrentPosition([newPoint.lat, newPoint.lng]);

      const sessionRef = doc(db, 'sessions', sessionId);
      const updatedPoints = trackingSession ? [...trackingSession.points, newPoint] : [newPoint];
      
      await updateDoc(sessionRef, {
        points: updatedPoints
      });

      setTrackingSession((prev) => 
        prev ? { ...prev, points: updatedPoints } : null
      );

      pointCount++;
    }, 2000); // 2秒ごとに移動

    // インターバルIDを保存して、停止時にクリアできるようにする
    intervalRef.current = demoInterval;
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
        />
        
        {currentPosition && (
          <Marker position={currentPosition} />
        )}
        
        {polylinePositions.length > 0 && (
          <Polyline 
            positions={polylinePositions} 
            color="blue" 
            weight={3}
            opacity={0.5}
          />
        )}
        
        {currentTrackPositions.length > 0 && (
          <Polyline 
            positions={currentTrackPositions} 
            color="red" 
            weight={4}
          />
        )}
        
        <LocationUpdater position={currentPosition} />
      </MapContainer>
      
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] flex flex-col items-center gap-4">
        <button
          onClick={isTracking ? stopTracking : startTracking}
          className={`px-6 py-3 rounded-full text-white font-semibold shadow-lg transition-all ${
            isTracking 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {isTracking ? '記録停止' : '記録開始'}
        </button>
        
        {!isTracking && (
          <button
            onClick={startDemoMode}
            className="px-4 py-2 rounded-full bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium shadow-lg transition-all"
          >
            デモモード（位置情報不要）
          </button>
        )}
      </div>
    </div>
  );
}