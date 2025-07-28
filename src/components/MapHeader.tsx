import React, { useCallback } from 'react';
import type { MapHeaderProps } from '../types/MapHeader';

export const MapHeader = React.memo<MapHeaderProps>(
  ({
    user,
    isTracking,
    totalPointsCount,
    pendingCount,
    lastLocationUpdate,
    isUploading,
    fileInputRef,
    onStartTracking,
    onStopTracking,
    onCameraClick,
    onFileSelect,
    onLogout,
  }) => {
    // ボタンイベントハンドラー（メモ化）
    const handleRecordButtonMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.background = isTracking
          ? 'linear-gradient(to right, #ef4444, #dc2626)'
          : 'linear-gradient(to right, #10b981, #059669)';
      },
      [isTracking]
    );

    const handleRecordButtonMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.background = isTracking
          ? 'linear-gradient(to right, #dc2626, #b91c1c)'
          : 'linear-gradient(to right, #059669, #047857)';
      },
      [isTracking]
    );

    const handleCameraButtonMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isUploading) {
          e.currentTarget.style.transform = 'scale(1.02)';
          e.currentTarget.style.background = 'linear-gradient(to right, #06b6d4, #0891b2)';
        }
      },
      [isUploading]
    );

    const handleCameraButtonMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isUploading) {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.background = 'linear-gradient(to right, #0891b2, #0284c7)';
        }
      },
      [isUploading]
    );

    const handleUserButtonMouseEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.transform = 'scale(1.05)';
      e.currentTarget.style.boxShadow = '0 6px 8px -1px rgba(6, 182, 212, 0.3)';
      e.currentTarget.style.borderColor = '#06b6d4';
    }, []);

    const handleUserButtonMouseLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.transform = 'scale(1)';
      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
      e.currentTarget.style.borderColor = '#475569';
    }, []);

    const handleRecordButtonClick = useCallback(() => {
      if (isTracking) {
        onStopTracking();
      } else {
        onStartTracking();
      }
    }, [isTracking, onStartTracking, onStopTracking]);

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid #1e293b',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          height: '48px',
        }}
      >
        {/* 左側：記録ボタン */}
        <button
          onClick={handleRecordButtonClick}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 12px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            background: isTracking
              ? 'linear-gradient(to right, #dc2626, #b91c1c)'
              : 'linear-gradient(to right, #059669, #047857)',
            boxShadow: isTracking
              ? '0 0 10px rgba(239, 68, 68, 0.5)'
              : '0 0 10px rgba(16, 185, 129, 0.5)',
            color: 'white',
            fontWeight: '600',
            fontSize: '12px',
            fontFamily: 'monospace',
            letterSpacing: '0.5px',
            minWidth: '48px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={handleRecordButtonMouseEnter}
          onMouseLeave={handleRecordButtonMouseLeave}
        >
          <span
            style={{
              position: 'relative',
              textShadow: '0 0 10px rgba(255, 255, 255, 0.8)',
            }}
          >
            {isTracking ? 'STOP' : 'REC'}
          </span>
        </button>

        {/* カメラボタン */}
        <button
          onClick={onCameraClick}
          disabled={isUploading}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 12px',
            cursor: isUploading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            background: 'linear-gradient(to right, #0891b2, #0284c7)',
            boxShadow: '0 0 10px rgba(8, 145, 178, 0.5)',
            color: 'white',
            fontWeight: '600',
            fontSize: '12px',
            fontFamily: 'monospace',
            minWidth: '48px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isUploading ? 0.6 : 1,
          }}
          onMouseEnter={handleCameraButtonMouseEnter}
          onMouseLeave={handleCameraButtonMouseLeave}
        >
          <span
            style={{
              position: 'relative',
              textShadow: '0 0 10px rgba(255, 255, 255, 0.8)',
              fontSize: '12px',
              lineHeight: '1',
            }}
          >
            📷
          </span>
        </button>

        {/* 隠しファイル入力 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileSelect}
          style={{ display: 'none' }}
        />

        {/* データ数表示 */}
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '6px 12px',
            color: '#67e8f9',
            fontFamily: 'monospace',
            fontSize: '12px',
            fontWeight: '600',
            minWidth: '80px',
            textAlign: 'center',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span>{totalPointsCount}</span>
          <span style={{ margin: '0 4px', opacity: 0.7 }}>:</span>
          <span style={{ color: pendingCount > 0 ? '#fbbf24' : '#67e8f9' }}>{pendingCount}</span>
        </div>

        {/* 位置情報取得日時表示 */}
        {lastLocationUpdate && (
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              backdropFilter: 'blur(10px)',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '6px 12px',
              color: '#94a3b8',
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '32px',
            }}
          >
            <span style={{ fontSize: '12px', lineHeight: '1' }}>📍</span>
            <span>
              {lastLocationUpdate.toLocaleString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}

        {/* アップロード中のローディングアイコン */}
        {isUploading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              border: '1px solid #475569',
              height: '32px',
              fontFamily: 'monospace',
              fontWeight: '600',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                border: '2px solid #67e8f9',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            ></div>
            <span
              style={{
                color: '#67e8f9',
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: '1',
              }}
            >
              📷
            </span>
          </div>
        )}

        {/* 右側：Googleアカウントアイコン */}
        <div style={{ marginLeft: 'auto' }}>
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
              overflow: 'hidden',
            }}
            onMouseEnter={handleUserButtonMouseEnter}
            onMouseLeave={handleUserButtonMouseLeave}
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
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  color: '#94a3b8',
                }}
              >
                👤
              </div>
            )}
          </button>
        </div>

        {/* アニメーション用CSS */}
        <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      </div>
    );
  }
);

MapHeader.displayName = 'MapHeader';
