// UI関連の定数とスタイル

export const COLORS = {
  PRIMARY: '#0891b2', // cyan-600
  SECONDARY: '#00ffff', // cyan
  BACKGROUND: '#0f172a', // slate-900
  TEXT: {
    PRIMARY: '#ffffff',
    SECONDARY: '#94a3b8', // slate-400
    MUTED: '#64748b', // slate-500
  },
  BORDER: '#1e293b', // slate-800
  SUCCESS: '#10b981', // emerald-500
  ERROR: '#ef4444', // red-500
  WARNING: '#f59e0b', // amber-500
} as const;

export const ANIMATIONS = {
  GLOW_KEYFRAMES: `
    @keyframes glow {
      0%, 100% { box-shadow: 0 0 5px #00ffff, 0 0 10px #00ffff, 0 0 15px #00ffff; }
      50% { box-shadow: 0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 30px #00ffff; }
    }
  `,
  PULSE_KEYFRAMES: `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `,
} as const;

export const BUTTON_STYLES = {
  BASE: {
    padding: '12px 24px',
    borderRadius: '8px',
    fontWeight: '600',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  PRIMARY: {
    backgroundColor: COLORS.PRIMARY,
    color: COLORS.TEXT.PRIMARY,
    boxShadow: `0 0 10px ${COLORS.PRIMARY}`,
  },
  SECONDARY: {
    backgroundColor: 'transparent',
    color: COLORS.SECONDARY,
    border: `2px solid ${COLORS.SECONDARY}`,
    boxShadow: `0 0 10px ${COLORS.SECONDARY}`,
  },
  HOVER_GLOW: {
    boxShadow: `0 0 20px ${COLORS.SECONDARY}`,
    transform: 'scale(1.05)',
  },
} as const;

export const CONTAINER_STYLES = {
  HEADER: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: 'rgba(15, 23, 42, 0.95)', // slate-900 with opacity
    backdropFilter: 'blur(10px)',
    borderBottom: `1px solid ${COLORS.BORDER}`,
  },
  DATA_DISPLAY: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    backdropFilter: 'blur(10px)',
    border: `1px solid ${COLORS.BORDER}`,
    borderRadius: '8px',
    padding: '12px',
  },
  GLOW_CONTAINER: {
    position: 'relative' as const,
    '&::before': {
      content: '""',
      position: 'absolute',
      top: '-2px',
      left: '-2px',
      right: '-2px',
      bottom: '-2px',
      background: `linear-gradient(45deg, ${COLORS.SECONDARY}, transparent, ${COLORS.SECONDARY})`,
      borderRadius: '10px',
      zIndex: -1,
      animation: 'glow 2s ease-in-out infinite alternate',
    },
  },
} as const;

export const MAP_STYLES = {
  TILE_LAYER_URL: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  TILE_LAYER_ATTRIBUTION:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  PATH_OPTIONS: {
    color: COLORS.SECONDARY,
    weight: 3,
    opacity: 0.8,
  },
  EXPLORED_AREA_OPTIONS: {
    fillColor: COLORS.SECONDARY,
    fillOpacity: 0.1,
    color: 'transparent',
    weight: 0,
    opacity: 0,
  },
} as const;
