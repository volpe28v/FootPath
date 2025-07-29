import L from 'leaflet';

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
    className: 'emoji-marker',
  });
};

// 写真マーカーアイコンを事前生成
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
    className: 'photo-marker',
  });
};

// アイコンを事前生成してキャッシュ
export const emojiIcon = createEmojiIcon();
export const photoIcon = createPhotoIcon();
