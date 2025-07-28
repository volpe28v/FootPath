import { useState, useRef, useCallback } from 'react';
import type { LatLngExpression } from 'leaflet';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import type { Photo } from '../types/Photo';
import { PHOTO_CONFIG, TRACKING_CONFIG } from '../constants/tracking';

interface PhotoUploadOptions {
  userId: string;
  currentPosition: LatLngExpression | null;
  trackingSessionId?: string | null;
  onUploadComplete?: () => void;
}

export function usePhotoUpload({
  userId,
  currentPosition,
  trackingSessionId,
  onUploadComplete,
}: PhotoUploadOptions) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoCacheRef = useRef<{
    photos: Photo[];
    lastFetch: number;
    cacheExpiry: number;
  }>({
    photos: [],
    lastFetch: 0,
    cacheExpiry: TRACKING_CONFIG.CACHE_EXPIRY,
  });

  // サムネイル生成関数
  const generateThumbnail = useCallback(
    (file: File, maxSize: number = PHOTO_CONFIG.THUMBNAIL_SIZE): Promise<Blob> => {
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
    },
    []
  );

  // 写真データ読み込み
  const loadPhotoData = useCallback(
    async (forceRefresh: boolean = false) => {
      try {
        const now = Date.now();

        // キャッシュが有効でforceRefreshでない場合はキャッシュを使用
        if (
          !forceRefresh &&
          photoCacheRef.current.photos.length > 0 &&
          now - photoCacheRef.current.lastFetch < photoCacheRef.current.cacheExpiry
        ) {
          console.log('Using cached photo data');
          setPhotos(photoCacheRef.current.photos);
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
            isPublic: photoData.isPublic || false,
          };
          photoList.push(photo);
        });

        // キャッシュ更新
        photoCacheRef.current = {
          photos: photoList,
          lastFetch: now,
          cacheExpiry: TRACKING_CONFIG.CACHE_EXPIRY,
        };

        console.log('Photo data loaded:', photoList.length, 'photos');
        setPhotos(photoList);
      } catch (error) {
        console.error('Error loading photo data:', error);
      }
    },
    [userId]
  );

  // カメラボタンクリック処理
  const handleCameraClick = useCallback(() => {
    if (!currentPosition) {
      alert('位置情報を取得してから写真を撮影してください');
      return;
    }

    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [currentPosition]);

  // ファイル選択時の処理
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !currentPosition) {
        return;
      }

      console.log('Photo selected:', file.name, file.size);

      // ファイルサイズチェック（5MB制限）
      const maxSize = PHOTO_CONFIG.MAX_FILE_SIZE;
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
          sessionId: trackingSessionId || null,
          location: {
            lat: Array.isArray(currentPosition)
              ? currentPosition[0]
              : (currentPosition as { lat: number }).lat,
            lng: Array.isArray(currentPosition)
              ? currentPosition[1]
              : (currentPosition as { lng: number }).lng,
          },
          imageUrl: downloadURL,
          thumbnailUrl: thumbnailURL,
          fileName: file.name,
          fileSize: file.size,
          thumbnailSize: thumbnailBlob.size,
          timestamp: new Date(),
          isPublic: false, // デフォルトは非公開
          createdAt: new Date(),
        };

        console.log('Saving photo data to Firestore:', photoData);

        try {
          const docRef = await addDoc(collection(db, 'photos'), photoData);
          console.log('Photo saved with ID:', docRef.id);

          // 写真アップロード後に写真データを強制リフレッシュ
          await loadPhotoData(true);

          // コールバック実行
          onUploadComplete?.();
        } catch (firestoreError) {
          console.error('Firestore save error:', firestoreError);
          setIsUploading(false);
          // Storageアップロードは成功したので、そのことをユーザーに伝える
          alert(
            `写真「${file.name}」のアップロードは成功しましたが、データベースへの保存でエラーが発生しました。`
          );
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
        alert(
          '写真のアップロードに失敗しました: ' +
            (error instanceof Error ? error.message : 'Unknown error')
        );
        event.target.value = '';
      }
    },
    [currentPosition, generateThumbnail, userId, trackingSessionId, loadPhotoData, onUploadComplete]
  );

  return {
    // State
    photos,
    isUploading,
    fileInputRef,

    // Actions
    handleCameraClick,
    handleFileSelect,
    loadPhotoData,
  };
}
