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
    } catch {
      // ログインエラー
    }
  };

  const handleLogout = async () => {
    if (window.confirm('ログアウトしますか？')) {
      try {
        await signOut(auth);
      } catch {
        // ログアウトエラー
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-lg text-cyan-400 font-mono">LOADING...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white relative overflow-hidden">
        {/* グリッド背景 */}
        <div className="absolute inset-0 opacity-20" 
             style={{
               backgroundImage: `
                 linear-gradient(rgba(34, 197, 94, 0.2) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(34, 197, 94, 0.2) 1px, transparent 1px)
               `,
               backgroundSize: '40px 40px'
             }}>
        </div>
        
        <div className="text-center relative z-10">
          <h1 className="text-6xl font-bold mb-4 font-mono bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            FOOTPATH
          </h1>
          <div className="text-emerald-400 text-lg font-mono mb-8 tracking-wider">
            &gt; GPS TRACKING SYSTEM
          </div>
          <p className="text-slate-300 text-lg mb-12 font-mono">
            位置情報を記録・可視化するシステム
          </p>
          <button
            onClick={handleLogin}
            className="relative px-8 py-4 rounded-xl font-mono font-bold text-sm uppercase tracking-wider bg-gradient-to-r from-cyan-600 to-emerald-600 text-white hover:from-cyan-500 hover:to-emerald-500 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/50 before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-r before:from-cyan-400 before:to-emerald-400 before:opacity-0 hover:before:opacity-20 before:transition-opacity"
          >
            <span className="relative z-10 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-300"></span>
              GOOGLE LOGIN
            </span>
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
          className="bg-slate-800 border border-slate-600 rounded-full shadow-lg p-1 hover:shadow-xl hover:border-cyan-400 transition-all duration-300 cursor-pointer transform hover:scale-105"
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
