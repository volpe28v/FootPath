import { useState, useRef, useCallback } from 'react';

interface UseCameraOptions {
  facingMode?: 'user' | 'environment';
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export function useCamera(options: UseCameraOptions = {}) {
  const {
    facingMode = 'environment', // デフォルトは背面カメラ
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
  } = options;

  const [isSupported] = useState(() => {
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const isSecureContext =
      window.isSecureContext ||
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost';
    console.log('Camera support check:', { hasMediaDevices, isSecureContext });
    return hasMediaDevices && isSecureContext;
  });

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // カメラを開始
  const startCamera = useCallback(async () => {
    console.log('startCamera called, isSupported:', isSupported);
    console.log('navigator.mediaDevices:', !!navigator.mediaDevices);
    console.log('getUserMedia:', !!navigator.mediaDevices?.getUserMedia);
    console.log('location protocol:', window.location.protocol);
    console.log('location hostname:', window.location.hostname);

    if (!isSupported) {
      setError('カメラがサポートされていません');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Requesting camera access...');
      // より基本的な制約から始める
      const constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { max: maxWidth },
          height: { max: maxHeight },
        },
      };

      console.log('Camera constraints:', constraints);
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log('Camera stream obtained:', mediaStream);
      console.log('Stream tracks:', mediaStream.getTracks());
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        console.log('Video element set');
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (err instanceof Error) {
        console.error('Error name:', err.name);
        console.error('Error message:', err.message);

        if (err.name === 'NotAllowedError') {
          setError(
            'カメラへのアクセスが拒否されました。ブラウザの設定でカメラの許可を確認してください。'
          );
        } else if (err.name === 'NotFoundError') {
          setError('カメラが見つかりません。デバイスにカメラが接続されているか確認してください。');
        } else if (err.name === 'NotReadableError') {
          setError(
            'カメラにアクセスできません。他のアプリがカメラを使用している可能性があります。'
          );
        } else if (err.name === 'OverconstrainedError') {
          setError('カメラの設定に問題があります。デバイスがサポートしていない設定です。');
        } else if (err.name === 'SecurityError') {
          setError('セキュリティエラー: HTTPSまたはlocalhostでアクセスしてください。');
        } else {
          setError(`カメラエラー: ${err.name} - ${err.message}`);
        }
      } else {
        setError('不明なカメラエラーが発生しました');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, facingMode, maxWidth, maxHeight]);

  // カメラを停止
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  // 写真を撮影
  const takePhoto = useCallback(async (): Promise<Blob | null> => {
    if (!videoRef.current || !stream) {
      setError('カメラが起動していません');
      return null;
    }

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      setError('Canvas contextの取得に失敗しました');
      return null;
    }

    // アスペクト比を保持しながらリサイズ
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const aspectRatio = videoWidth / videoHeight;

    let width = videoWidth;
    let height = videoHeight;

    if (width > maxWidth) {
      width = maxWidth;
      height = width / aspectRatio;
    }

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    canvas.width = width;
    canvas.height = height;

    // 画像を描画
    context.drawImage(video, 0, 0, width, height);

    // Blobに変換
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    });
  }, [stream, maxWidth, maxHeight, quality]);

  // カメラの切り替え（前面/背面）
  const switchCamera = useCallback(async () => {
    stopCamera();
    // TODO: facingModeを動的に切り替える実装
    await startCamera();
  }, [startCamera, stopCamera]);

  return {
    isSupported,
    isLoading,
    error,
    stream,
    videoRef,
    startCamera,
    stopCamera,
    takePhoto,
    switchCamera,
  };
}
