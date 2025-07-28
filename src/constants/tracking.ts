// 位置情報トラッキング関連の定数

export const TRACKING_CONFIG = {
  // 距離設定
  MIN_DISTANCE: 10, // 最小記録距離 (m)
  MAX_ACCURACY: 100, // 最大許容精度 (m)

  // 時間設定
  BATCH_INTERVAL: 30000, // バッチ保存間隔 (ms)
  SESSION_TIMEOUT: 10 * 60 * 1000, // セッションタイムアウト (10分)
  CACHE_EXPIRY: 5 * 60 * 1000, // キャッシュ有効期限 (5分)

  // 速度制限
  MAX_SPEED_KMH: 20, // 最大許容速度 (km/h)

  // 位置情報設定
  GEOLOCATION_OPTIONS: {
    HIGH_ACCURACY: {
      enableHighAccuracy: true,
      maximumAge: 30000, // 30秒
      timeout: 15000, // 15秒
    },
    BATTERY_SAVING: {
      enableHighAccuracy: false,
      maximumAge: 300000, // 5分
      timeout: 10000, // 10秒
    },
  },

  // 最適化設定
  SMOOTHING_SEGMENTS: 5, // スプライン補間セグメント数
  POINT_OPTIMIZATION_THRESHOLD: 100, // ポイント間引き閾値
} as const;

export const PHOTO_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  THUMBNAIL_SIZE: 200, // サムネイルサイズ (px)
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'] as const,
} as const;

export const ERROR_MESSAGES = {
  GEOLOCATION: {
    PERMISSION_DENIED: 'PERMISSION_DENIED: トラッキング中に位置情報の使用が拒否されました',
    POSITION_UNAVAILABLE: 'POSITION_UNAVAILABLE: 位置情報が取得できません',
    TIMEOUT: 'TIMEOUT: 位置情報の取得がタイムアウトしました',
    UNKNOWN: 'UNKNOWN_ERROR: 位置情報の取得中に不明なエラーが発生しました',
  },
  PHOTO: {
    FILE_TOO_LARGE: 'ファイルサイズが大きすぎます（5MB以下にしてください）',
    UNSUPPORTED_FORMAT: 'サポートされていない画像形式です',
    UPLOAD_FAILED: '写真のアップロードに失敗しました',
  },
} as const;
