# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Notes

- 変更したらビルド確認して

## Commands

### Development
```bash
npm run dev        # 開発サーバー起動 (HTTPS)
npm run build      # TypeScriptチェック + Viteビルド
npm run preview    # ビルド結果プレビュー
```

### Code Quality
```bash
npm run lint       # ESLintチェック
npm run lint:fix   # ESLint自動修正
npm run format     # Prettierフォーマット
npm run typecheck  # TypeScript型チェック
```

### Deployment
```bash
npm run build
firebase deploy
```

## Architecture Overview

### Core Components
- **MapView.tsx** (1500+ lines): メインコンポーネント。位置情報トラッキング、地図表示、データ管理を統括
  - GPS位置情報の取得・検証・最適化
  - Firestoreへのバッチ保存（30秒間隔）
  - セッション管理（自動再開機能付き）
  - 写真アップロード連携
  
- **ExploredAreaLayer.tsx**: 探索エリアの視覚化レイヤー
  - シアングロー効果の実装
  - React-Leafletカスタムレイヤー

### State Management
- Reactのローカルステートで管理（Context API不使用）
- MapView内で全状態を集中管理
- キャッシュ機構（5分間）でFirestore読み込み最適化

### Data Flow
1. 位置情報取得（10m間隔）→ バリデーション → ローカル配列に蓄積
2. 30秒ごとにFirestoreへバッチ保存（arrayUnion使用）
3. セッションデータはuserId単位で管理
4. 写真はFirebase Storageにアップロード後、メタデータをFirestoreに保存

### Performance Optimizations
- `useMemo`/`useCallback`による再レンダリング防止
- スプライン補間のセグメント数削減（10→5）
- アイコンの事前生成・キャッシュ化
- 位置情報の距離ベースフィルタリング（10m以下は記録しない）

## Key Development Patterns

### Firebase Operations
- 増分保存（`arrayUnion`）でデータ効率化
- セッションの`isActive`フラグで記録中判定
- タイムスタンプは`serverTimestamp()`使用

### Error Handling
- 位置情報エラーは詳細メッセージ表示
- Firestore書き込みエラーはconsole.errorのみ（UIブロックしない）
- オフライン時も記録継続（ローカルバッファ使用）

### UI/UX Principles
- サイバーパンク風デザイン（ダークテーマ、シアングロー）
- リアルタイムフィードバック（保存済み/未保存カウント）
- 最小限のユーザー操作（自動記録開始など）

### ドキュメント
docs 配下を参照