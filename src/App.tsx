import { useState, useEffect } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { MapView } from './components/MapView';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('ログインエラー:', error);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('ログアウトしますか？')) {
      try {
        await signOut(auth);
      } catch (error) {
        console.error('ログアウトエラー:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-blue-500 to-purple-600 text-white">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-8">Footpath</h1>
          <p className="text-xl mb-8">あなたの歩いた道を地図で記録</p>
          <button
            onClick={handleLogin}
            className="bg-white text-blue-600 px-8 py-3 rounded-full font-semibold hover:bg-gray-100 transition-colors shadow-lg"
          >
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen">
      <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 1003 }}>
        <button
          onClick={handleLogout}
          className="bg-white rounded-full shadow-md p-1 hover:shadow-lg transition-shadow cursor-pointer"
          title={user.displayName || 'ユーザー'}
          style={{ pointerEvents: 'auto' }}
        >
          <img
            src={user.photoURL || ''}
            alt={user.displayName || ''}
            style={{ width: '40px', height: '40px', pointerEvents: 'none' }}
            className="rounded-full"
          />
        </button>
      </div>
      <MapView userId={user.uid} />
    </div>
  );
}

export default App
