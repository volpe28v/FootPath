import { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import { collection, addDoc, query, where, updateDoc, doc, arrayUnion, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import type { GeoPoint, TrackingSession } from '../types/GeoPoint';
import type { ExploredArea, ExplorationStats } from '../types/ExploredArea';
import type { Photo } from '../types/Photo';
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

// 写真マーカーアイコン
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
    className: 'photo-marker'
  });
};

interface MapViewProps {
  userId: string;
  user: { displayName: string | null; photoURL: string | null; };
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
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const batchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef<{lat: number, lng: number, timestamp: number} | null>(null);
  const pendingPointsRef = useRef<GeoPoint[]>([]);
  const autoStartRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // サムネイル生成関数
  const generateThumbnail = (file: File, maxSize: number = 200): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // アスペクト比を保持しながらリサイズ
        const { width, height } = img;
        let newWidth = width;
        let newHeight = height;
        
        if (width > height) {
          if (width > maxSize) {
            newWidth = maxSize;
            newHeight = (height * maxSize) / width;
          }
        } else {
          if (height > maxSize) {
            newHeight = maxSize;
            newWidth = (width * maxSize) / height;
          }
        }
        
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // 画像を描画
        ctx?.drawImage(img, 0, 0, newWidth, newHeight);
        
        // Blobに変換
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('サムネイル生成に失敗しました'));
            }
          },
          'image/jpeg',
          0.7 // 品質70%
        );
      };
      
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = URL.createObjectURL(file);
    });
  };

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
        
        snapshot.docs.forEach((docSnapshot: any) => {
          const session = { ...docSnapshot.data(), id: docSnapshot.id } as TrackingSession;
          const startTime = session.startTime instanceof Date 
            ? session.startTime 
            : (session.startTime as any).toDate();
          
          const minutesDiff = (now.getTime() - startTime.getTime()) / (1000 * 60);
          
          if (minutesDiff > 10) {
            // 10分以上経過したセッションは強制終了
            expiredSessions.push(session);
          } else {
            // 10分以内のセッションは自動継続
            autoResumeSessions.push(session);
          }
        });
        
        // 10分以上前のセッションは自動的に終了
        const cleanupPromises = expiredSessions.map(async (session) => {
          const sessionRef = doc(db, 'sessions', session.id);
          await updateDoc(sessionRef, {
            isActive: false,
            endTime: now
          });
        });
        
        await Promise.all(cleanupPromises);
        
        // 10分以内のセッションは自動継続
        if (autoResumeSessions.length > 0) {
          const sessionToResume = autoResumeSessions[0];
          
          // 既存セッションを継続
          setTrackingSession(sessionToResume);
          setIsTracking(true);
          
          // 位置情報監視を再開
          const sessionId = sessionToResume.id;
          
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
              (position) => {
                if (!validatePosition(position)) return;
                
                const newLat = position.coords.latitude;
                const newLng = position.coords.longitude;
                const now = Date.now();
                
                if (!shouldUpdatePosition(newLat, newLng)) return;
                
                const newPoint: GeoPoint = {
                  lat: newLat,
                  lng: newLng,
                  timestamp: new Date()
                };
                
                setCurrentPosition([newLat, newLng]);
                lastPositionRef.current = { lat: newLat, lng: newLng, timestamp: now };
                
                pendingPointsRef.current.push(newPoint);
                setPendingCount(pendingPointsRef.current.length);
                
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
                enableHighAccuracy: false,
                maximumAge: 30000,
                timeout: 10000
              }
            );
          }
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
        // クリーンアップエラーは無視（アプリは継続動作）
      }
    };
    
    cleanupOrphanedSessions();
  }, [userId]);

  // ページ終了時のクリーンアップとvisibility管理
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && trackingSession?.isActive && !isTracking) {
        // アクティブ復帰時に記録が停止していたら自動再開
        setIsTracking(true);
        
        // 位置情報監視を再開
        if (navigator.geolocation && trackingSession) {
          const sessionId = trackingSession.id;
          
          // バッチ処理タイマー開始
          if (batchIntervalRef.current) {
            clearInterval(batchIntervalRef.current);
          }
          
          batchIntervalRef.current = setInterval(() => {
            flushPendingPoints(sessionId);
          }, optimizationSettings.batchInterval);
          
          // 位置情報監視開始
          watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              if (!validatePosition(position)) return;
              
              const newLat = position.coords.latitude;
              const newLng = position.coords.longitude;
              const now = Date.now();
              
              if (!shouldUpdatePosition(newLat, newLng)) return;
              
              const newPoint: GeoPoint = {
                lat: newLat,
                lng: newLng,
                timestamp: new Date()
              };
              
              setCurrentPosition([newLat, newLng]);
              lastPositionRef.current = { lat: newLat, lng: newLng, timestamp: now };
              
              pendingPointsRef.current.push(newPoint);
              setPendingCount(pendingPointsRef.current.length);
              
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
              enableHighAccuracy: false,
              maximumAge: 30000,
              timeout: 10000
            }
          );
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
          isActive: false
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
  }, [trackingSession, isTracking, flushPendingPoints, optimizationSettings.batchInterval, validatePosition, shouldUpdatePosition]);

  // データキャッシュ用のRef
  const dataCache = useRef<{
    sessions: TrackingSession[];
    lastFetch: number;
    cacheExpiry: number;
  }>({
    sessions: [],
    lastFetch: 0,
    cacheExpiry: 5 * 60 * 1000 // 5分キャッシュ
  });

  // セッションデータを取得（キャッシュ対応）
  const loadSessionData = async (forceRefresh = false) => {
    try {
      const now = Date.now();
      
      // キャッシュが有効でforceRefreshでない場合はキャッシュを使用
      if (!forceRefresh && 
          dataCache.current.sessions.length > 0 && 
          (now - dataCache.current.lastFetch) < dataCache.current.cacheExpiry) {
        console.log('Using cached session data');
        processSessionData(dataCache.current.sessions);
        return;
      }

      const sessionsRef = collection(db, 'sessions');
      const userQuery = query(
        sessionsRef, 
        where('userId', '==', userId)
      );

      const snapshot = await getDocs(userQuery);
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
        }
        
        sessions.push(session);
      });
      
      // キャッシュ更新
      dataCache.current = {
        sessions,
        lastFetch: now,
        cacheExpiry: 5 * 60 * 1000
      };
      
      processSessionData(sessions);
      console.log('Session data loaded:', sessions.length, 'sessions');
    } catch (error) {
      console.error('Error loading session data:', error);
    }
  };

  // セッションデータ処理を分離
  const processSessionData = (sessions: TrackingSession[]) => {
    const points: GeoPoint[] = [];
    
    sessions.forEach(session => {
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
  };

  useEffect(() => {
    loadSessionData();
  }, [userId]);

  // 写真データキャッシュ
  const photoCache = useRef<{
    photos: Photo[];
    lastFetch: number;
    cacheExpiry: number;
  }>({
    photos: [],
    lastFetch: 0,
    cacheExpiry: 5 * 60 * 1000 // 5分キャッシュ
  });

  // 写真データを取得（キャッシュ対応）
  const loadPhotoData = async (forceRefresh = false) => {
    try {
      const now = Date.now();
      
      // キャッシュが有効でforceRefreshでない場合はキャッシュを使用
      if (!forceRefresh && 
          photoCache.current.photos.length > 0 && 
          (now - photoCache.current.lastFetch) < photoCache.current.cacheExpiry) {
        console.log('Using cached photo data');
        setPhotos(photoCache.current.photos);
        return;
      }

      const photosRef = collection(db, 'photos');
      const photosQuery = query(photosRef, where('userId', '==', userId));
      
      const snapshot = await getDocs(photosQuery);
      const photoList: Photo[] = [];
      
      snapshot.forEach((doc) => {
        const photoData = doc.data();
        const photo: Photo = {
          id: doc.id,
          userId: photoData.userId,
          sessionId: photoData.sessionId,
          location: photoData.location,
          imageUrl: photoData.imageUrl,
          thumbnailUrl: photoData.thumbnailUrl || photoData.imageUrl,
          caption: photoData.caption,
          timestamp: photoData.timestamp?.toDate() || new Date(),
          tags: photoData.tags || [],
          isPublic: photoData.isPublic || false
        };
        photoList.push(photo);
      });
      
      // キャッシュ更新
      photoCache.current = {
        photos: photoList,
        lastFetch: now,
        cacheExpiry: 5 * 60 * 1000
      };
      
      console.log('Photo data loaded:', photoList.length, 'photos');
      setPhotos(photoList);
    } catch (error) {
      console.error('Error loading photo data:', error);
    }
  };

  useEffect(() => {
    loadPhotoData();
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
    
    // 記録状態をLocalStorageに保存
    localStorage.setItem('footpath_was_tracking', 'true');
    
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
        isActive: false
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

  const currentTrackPositions: LatLngExpression[] = trackingSession 
    ? trackingSession.points.map(point => [point.lat, point.lng])
    : [];

  // カメラボタンクリック（標準カメラアプリを起動）
  const handleCameraClick = () => {
    if (!currentPosition) {
      alert('位置情報を取得してから写真を撮影してください');
      return;
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // ファイル選択時の処理
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentPosition) {
      return;
    }

    console.log('Photo selected:', file.name, file.size);
    
    // ファイルサイズチェック（5MB制限）
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert('ファイルサイズが大きすぎます。5MB以下の画像を選択してください。');
      event.target.value = '';
      return;
    }
    
    try {
      // 認証状態確認
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert('写真をアップロードするには認証が必要です');
        event.target.value = '';
        return;
      }
      
      console.log('Current user:', currentUser.uid);
      console.log('User ID from props:', userId);
      
      // アップロード開始
      setIsUploading(true);
      
      // ファイル名を生成（タイムスタンプ + ランダム文字列）
      const timestamp = new Date().getTime();
      const randomId = Math.random().toString(36).substring(2, 15);
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const fileName = `photos/${currentUser.uid}/${timestamp}_${randomId}.${fileExtension}`;
      const thumbFileName = `photos/${currentUser.uid}/${timestamp}_${randomId}_thumb.${fileExtension}`;
      
      console.log('Uploading original to:', fileName);
      console.log('Uploading thumbnail to:', thumbFileName);
      
      // サムネイル生成
      console.log('Generating thumbnail...');
      const thumbnailBlob = await generateThumbnail(file, 200);
      console.log('Thumbnail generated, size:', thumbnailBlob.size);
      
      // 元画像をFirebase Storageにアップロード
      const storageRef = ref(storage, fileName);
      const uploadResult = await uploadBytes(storageRef, file);
      console.log('Original upload successful:', uploadResult);
      
      // サムネイルをFirebase Storageにアップロード
      const thumbStorageRef = ref(storage, thumbFileName);
      const thumbUploadResult = await uploadBytes(thumbStorageRef, thumbnailBlob);
      console.log('Thumbnail upload successful:', thumbUploadResult);
      
      // ダウンロードURLを取得
      const downloadURL = await getDownloadURL(uploadResult.ref);
      const thumbnailURL = await getDownloadURL(thumbUploadResult.ref);
      console.log('Original URL:', downloadURL);
      console.log('Thumbnail URL:', thumbnailURL);
      
      // Firestoreに写真情報を保存
      const photoData = {
        userId: currentUser.uid,
        sessionId: trackingSession?.id || null,
        location: {
          lat: Array.isArray(currentPosition) ? currentPosition[0] : (currentPosition as any).lat,
          lng: Array.isArray(currentPosition) ? currentPosition[1] : (currentPosition as any).lng
        },
        imageUrl: downloadURL,
        thumbnailUrl: thumbnailURL,
        fileName: file.name,
        fileSize: file.size,
        thumbnailSize: thumbnailBlob.size,
        timestamp: new Date(),
        isPublic: false, // デフォルトは非公開
        createdAt: new Date()
      };
      
      console.log('Saving photo data to Firestore:', photoData);
      
      try {
        const docRef = await addDoc(collection(db, 'photos'), photoData);
        console.log('Photo saved with ID:', docRef.id);
        
        // 写真アップロード後に写真データを強制リフレッシュ
        await loadPhotoData(true);
      } catch (firestoreError) {
        console.error('Firestore save error:', firestoreError);
        setIsUploading(false);
        // Storageアップロードは成功したので、そのことをユーザーに伝える
        alert(`写真「${file.name}」のアップロードは成功しましたが、データベースへの保存でエラーが発生しました。`);
        event.target.value = '';
        return;
      }
      
      // 成功時の処理
      setIsUploading(false);
      alert(`写真「${file.name}」をアップロードしました！`);
      
      // ファイル入力をリセット（同じファイルを再選択可能にする）
      event.target.value = '';
    } catch (error) {
      console.error('Photo upload error:', error);
      setIsUploading(false);
      alert('写真のアップロードに失敗しました: ' + (error instanceof Error ? error.message : 'Unknown error'));
      event.target.value = '';
    }
  };


  return (
    <div className="relative h-screen w-full flex flex-col bg-slate-900">
      {/* ヘッダー部分 */}
      <div style={{background: 'linear-gradient(to right, #1e293b, #0f172a)', borderBottom: '1px solid #334155', padding: '8px 16px', zIndex: 1002, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'}}>
        {/* 記録開始/停止ボタン */}
        <button
          onClick={isTracking ? stopTracking : startTracking}
          style={{
            position: 'relative',
            padding: '8px 16px',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            transition: 'all 0.2s ease',
            background: isTracking 
              ? 'linear-gradient(to right, #dc2626, #b91c1c)' 
              : 'linear-gradient(to right, #059669, #047857)',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: isTracking 
              ? '0 4px 6px -1px rgba(220, 38, 38, 0.2)' 
              : '0 4px 6px -1px rgba(5, 150, 105, 0.2)',
            height: '32px',
            display: 'flex',
            alignItems: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.02)';
            e.currentTarget.style.background = isTracking 
              ? 'linear-gradient(to right, #ef4444, #dc2626)' 
              : 'linear-gradient(to right, #10b981, #059669)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.background = isTracking 
              ? 'linear-gradient(to right, #dc2626, #b91c1c)' 
              : 'linear-gradient(to right, #059669, #047857)';
          }}
        >
          <span style={{position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px'}}>
            {isTracking ? 'STOP' : 'REC'}
          </span>
        </button>
        
        {/* カメラボタン */}
        <button
          onClick={handleCameraClick}
          disabled={isUploading}
          style={{
            position: 'relative',
            padding: '8px 16px',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            transition: 'all 0.2s ease',
            background: isUploading 
              ? '#6b7280' 
              : 'linear-gradient(to right, #0891b2, #0284c7)',
            color: '#ffffff',
            border: 'none',
            cursor: isUploading ? 'not-allowed' : 'pointer',
            opacity: isUploading ? 0.7 : 1,
            boxShadow: '0 4px 6px -1px rgba(8, 145, 178, 0.2)',
            height: '32px',
            display: 'flex',
            alignItems: 'center'
          }}
          onMouseEnter={(e) => {
            if (!isUploading) {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.background = 'linear-gradient(to right, #06b6d4, #0891b2)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isUploading) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = 'linear-gradient(to right, #0891b2, #0284c7)';
            }
          }}
        >
          <span style={{position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px'}}>
            {isUploading ? (
              <div style={{width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ffffff', animation: 'pulse 2s infinite'}}></div>
            ) : (
              <span style={{fontSize: '20px'}}>📷</span>
            )}
          </span>
        </button>
        
        {/* 隠しファイル入力 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          style={{display: 'none'}}
        />
        
        {/* リフレッシュボタン */}
        <button
          onClick={() => {
            loadSessionData(true);
            loadPhotoData(true);
          }}
          style={{
            position: 'relative',
            padding: '8px 12px',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            transition: 'all 0.2s ease',
            background: 'linear-gradient(to right, #475569, #334155)',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(71, 85, 105, 0.2)',
            height: '32px',
            display: 'flex',
            alignItems: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.02)';
            e.currentTarget.style.background = 'linear-gradient(to right, #64748b, #475569)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.background = 'linear-gradient(to right, #475569, #334155)';
          }}
        >
          <span style={{position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px'}}>
            <span style={{fontSize: '18px'}}>🔄</span>
          </span>
        </button>

        {/* データ数表示 */}
        <div style={{
          backgroundColor: '#1e293b', 
          border: '1px solid #475569', 
          borderRadius: '8px', 
          padding: '0 12px', 
          fontFamily: 'monospace', 
          fontWeight: 'bold', 
          fontSize: '14px',
          position: 'relative',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          height: '32px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <div style={{position: 'absolute', inset: '0', background: 'linear-gradient(to right, rgba(6, 182, 212, 0.1), rgba(59, 130, 246, 0.1))', borderRadius: '8px'}}></div>
          <div style={{position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px'}}>
            <span style={{color: '#ffffff'}}>{totalPointsCount + (trackingSession?.points?.length || 0) - pendingCount}</span>
            <span style={{color: '#94a3b8'}}>:</span>
            <span style={{color: '#67e8f9'}}>{pendingCount}</span>
          </div>
        </div>
        
        {/* ローディングアイコン */}
        {isUploading && (
          <div style={{display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #475569', height: '32px'}}>
            <div style={{width: '12px', height: '12px', border: '2px solid #67e8f9', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite'}}></div>
            <span style={{color: '#67e8f9', fontFamily: 'monospace', fontSize: '20px'}}>📷</span>
          </div>
        )}

        {/* 右側：Googleアカウントアイコン */}
        <div style={{marginLeft: 'auto'}}>
          <button
            onClick={onLogout}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '2px solid #475569',
              background: '#1e293b',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              padding: '0',
              overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 6px 8px -1px rgba(6, 182, 212, 0.3)';
              e.currentTarget.style.borderColor = '#06b6d4';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
              e.currentTarget.style.borderColor = '#475569';
            }}
            title={`${user.displayName || 'ユーザー'} - クリックでログアウト`}
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || ''}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
              />
            ) : (
              <span style={{fontSize: '16px', color: '#ffffff'}}>👤</span>
            )}
          </button>
        </div>
      </div>

      {/* 地図部分 */}
      <div className="flex-1 relative">
        {/* グリッド背景効果 */}
        <div className="absolute inset-0 bg-slate-900 opacity-20 z-[1000] pointer-events-none" 
             style={{
               backgroundImage: `
                 linear-gradient(rgba(34, 197, 94, 0.1) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(34, 197, 94, 0.1) 1px, transparent 1px)
               `,
               backgroundSize: '20px 20px'
             }}>
        </div>
        
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
        
        {currentPosition && (
          <Marker position={currentPosition} icon={createEmojiIcon()} />
        )}
        
        {/* 写真マーカー */}
        {photos.map((photo) => (
          <Marker
            key={photo.id}
            position={[photo.location.lat, photo.location.lng]}
            icon={createPhotoIcon()}
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
        
        {currentTrackPositions.length > 0 && (
          <Polyline 
            positions={currentTrackPositions} 
            color="#00d9ff" 
            weight={4}
            opacity={0.9}
            dashArray="8, 4"
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