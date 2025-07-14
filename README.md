# Footpath

RPGのダンジョンマップのように、ユーザーが歩いた道を地図上で可視化・記録するWebアプリです。

## 機能

- Googleアカウントでのログイン認証
- GPS位置情報の取得と記録
- 地図上での移動軌跡の表示
- 記録データのFirestoreへの保存
- レスポンシブなスマホ対応UI

## 技術スタック

- **Frontend**: React + TypeScript + Vite
- **Map**: Leaflet.js + OpenStreetMap
- **Backend**: Firebase (Auth, Firestore)
- **Styling**: Tailwind CSS
- **Hosting**: Firebase Hosting

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Firebase プロジェクトの設定

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作成
2. Authentication で Google ログインを有効化
3. Firestore データベースを作成

### 3. 環境変数の設定

`.env.local` ファイルを作成し、Firebase の設定値を入力：

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

### 4. Firebase CLI の設定

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
```

`.firebaserc` ファイルでプロジェクトIDを設定：

```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

## 開発

```bash
npm run dev
```

## ビルド

```bash
npm run build
```

## デプロイ

```bash
npm run build
firebase deploy
```

## フォルダ構成

```
footpath/
├── src/
│   ├── App.tsx           # メインアプリケーション
│   ├── components/
│   │   └── MapView.tsx   # 地図コンポーネント
│   ├── firebase.ts       # Firebase設定
│   └── types/
│       └── GeoPoint.ts   # 型定義
├── firebase.json         # Firebase Hosting設定
└── tailwind.config.js    # Tailwind CSS設定
```

## 使い方

1. Googleアカウントでログイン
2. 位置情報の許可を与える
3. 「記録開始」ボタンで移動軌跡の記録を開始
4. 移動すると地図上に軌跡が描画される
5. 「記録停止」ボタンで記録を終了
