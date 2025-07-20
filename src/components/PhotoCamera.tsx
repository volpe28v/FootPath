import { useState, useEffect } from 'react';
import { useCamera } from '../hooks/useCamera';
import type { LatLngExpression } from 'leaflet';

interface PhotoCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoTaken: (photo: Blob, location: LatLngExpression) => void;
  currentLocation: LatLngExpression | null;
}

export function PhotoCamera({ isOpen, onClose, onPhotoTaken, currentLocation }: PhotoCameraProps) {
  const { 
    isSupported, 
    isLoading, 
    error, 
    videoRef, 
    startCamera, 
    stopCamera, 
    takePhoto 
  } = useCamera();

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);

  useEffect(() => {
    console.log('PhotoCamera effect:', { isOpen, isSupported });
    if (isOpen && isSupported) {
      console.log('Starting camera...');
      startCamera();
    }
    return () => {
      console.log('Stopping camera...');
      stopCamera();
    };
  }, [isOpen, isSupported]);

  const handleTakePhoto = async () => {
    const photo = await takePhoto();
    if (photo) {
      setCapturedPhoto(photo);
      // プレビュー用のURLを作成
      const previewUrl = URL.createObjectURL(photo);
      setPhotoPreview(previewUrl);
    }
  };

  const handleRetake = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(null);
    setCapturedPhoto(null);
  };

  const handleSave = () => {
    if (capturedPhoto && currentLocation) {
      onPhotoTaken(capturedPhoto, currentLocation);
      handleClose();
    }
  };

  const handleClose = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(null);
    setCapturedPhoto(null);
    stopCamera();
    onClose();
  };

  console.log('PhotoCamera render - isOpen:', isOpen);
  
  if (!isOpen) {
    console.log('PhotoCamera returning null (not open)');
    return null;
  }
  
  console.log('PhotoCamera rendering full component');

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      {/* ヘッダー */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex justify-between items-center">
          <button
            onClick={handleClose}
            className="text-white p-2 rounded-full hover:bg-white/20 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="text-white font-mono text-sm">
            {currentLocation ? '📍 位置情報取得済み' : '⚠️ 位置情報なし'}
          </span>
        </div>
      </div>

      {/* カメラビュー/プレビュー */}
      <div className="h-full flex items-center justify-center">
        {!isSupported ? (
          <div className="text-white text-center p-8">
            <p className="text-xl mb-4">😢</p>
            <p>お使いのブラウザはカメラをサポートしていません</p>
          </div>
        ) : error ? (
          <div className="text-white text-center p-8">
            <p className="text-xl mb-4">⚠️</p>
            <p>{error}</p>
            <button
              onClick={startCamera}
              className="mt-4 px-6 py-2 bg-cyan-600 rounded-lg hover:bg-cyan-500 transition-colors"
            >
              再試行
            </button>
          </div>
        ) : isLoading ? (
          <div className="text-white text-center">
            <p className="text-cyan-400 font-mono animate-pulse">LOADING CAMERA...</p>
          </div>
        ) : photoPreview ? (
          <img 
            src={photoPreview} 
            alt="撮影した写真" 
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>

      {/* コントロール */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-8">
        {!photoPreview ? (
          <div className="flex justify-center">
            <button
              onClick={handleTakePhoto}
              disabled={!isSupported || isLoading || !!error || !currentLocation}
              className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-16 h-16 bg-white rounded-full border-4 border-black"></div>
            </button>
          </div>
        ) : (
          <div className="flex justify-around items-center max-w-md mx-auto">
            <button
              onClick={handleRetake}
              className="px-6 py-3 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-colors font-mono"
            >
              RETAKE
            </button>
            <button
              onClick={handleSave}
              className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-emerald-600 text-white rounded-xl hover:from-cyan-500 hover:to-emerald-500 transition-all font-mono font-bold"
            >
              SAVE PHOTO
            </button>
          </div>
        )}
      </div>
    </div>
  );
}