export interface MapHeaderProps {
  // ユーザー情報
  user: {
    displayName: string | null;
    photoURL: string | null;
  };

  // トラッキング状態
  isTracking: boolean;

  // データ表示用
  totalPointsCount: number;
  pendingCount: number;

  // 位置情報
  lastLocationUpdate: Date | null;

  // アップロード状態
  isUploading: boolean;

  // Ref
  fileInputRef: React.RefObject<HTMLInputElement | null>;

  // イベントハンドラー
  onStartTracking: () => void;
  onStopTracking: () => void;
  onCameraClick: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onLogout: () => void;
}
