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
    try {
      await signOut(auth);
    } catch (error) {
      console.error('ログアウトエラー:', error);
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
      <div className="absolute top-4 right-4 z-[1000] bg-white rounded-lg shadow-md p-2 flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <img
            src={user.photoURL || ''}
            alt={user.displayName || ''}
            className="w-8 h-8 rounded-full"
          />
          <span className="text-sm font-medium">{user.displayName}</span>
        </div>
        <button
          onClick={handleLogout}
          className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 transition-colors"
        >
          ログアウト
        </button>
      </div>
      <MapView userId={user.uid} />
    </div>
  );
}

export default App
