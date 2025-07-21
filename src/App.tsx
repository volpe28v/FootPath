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
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* グリッド背景 */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
                 linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)
               `,
            backgroundSize: '40px 40px',
          }}
        ></div>

        <div className="relative z-10 text-center">
          {/* ネオン風ローディングテキスト */}
          <div
            className="text-4xl font-mono font-bold text-cyan-400 mb-6 animate-pulse"
            style={{
              textShadow: '0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 30px #00ffff',
              lineHeight: '1.4',
            }}
          >
            LOADING
          </div>

          {/* ローディングバー */}
          <div className="w-64 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-cyan-300 rounded-full animate-pulse"
              style={{
                boxShadow: '0 0 10px #00ffff, 0 0 20px #00ffff',
              }}
            ></div>
          </div>

          {/* ドット */}
          <div className="flex justify-center gap-2 mt-6">
            <div
              className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"
              style={{ animationDelay: '0s' }}
            ></div>
            <div
              className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"
              style={{ animationDelay: '0.2s' }}
            ></div>
            <div
              className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"
              style={{ animationDelay: '0.4s' }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white relative overflow-hidden">
        {/* グリッド背景 */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
                 linear-gradient(rgba(0, 255, 255, 0.15) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(0, 255, 255, 0.15) 1px, transparent 1px)
               `,
            backgroundSize: '40px 40px',
          }}
        ></div>

        <div className="text-center relative z-10">
          <h1
            className="text-6xl font-bold mb-6 font-mono text-cyan-400"
            style={{
              textShadow: '0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 30px #00ffff',
              lineHeight: '1.3',
            }}
          >
            FOOTPATH
          </h1>

          <div
            className="text-cyan-400 text-lg font-mono mb-12 tracking-wider"
            style={{
              textShadow: '0 0 5px #00ffff',
              lineHeight: '1.5',
            }}
          >
            &gt; GPS TRACKING SYSTEM
          </div>
          <button
            onClick={handleLogin}
            className="group relative px-16 py-4 font-mono font-bold text-xl uppercase tracking-[0.3em] bg-transparent border-2 border-cyan-400 text-cyan-400 hover:text-slate-900 transition-all duration-500 transform hover:scale-105 active:scale-95 overflow-hidden"
            style={{
              background: 'rgba(0, 255, 255, 0.1)',
              boxShadow: `
                0 0 20px rgba(0, 255, 255, 0.5),
                inset 0 0 20px rgba(0, 255, 255, 0.2)
              `,
              textShadow: '0 0 10px #00ffff, 0 0 20px #00ffff',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(45deg, #00ffff, #67e8f9)';
              e.currentTarget.style.boxShadow = `
                0 0 40px rgba(0, 255, 255, 0.8),
                0 0 80px rgba(0, 255, 255, 0.4),
                inset 0 0 40px rgba(255, 255, 255, 0.2)
              `;
              e.currentTarget.style.textShadow = '0 0 5px rgba(0, 0, 0, 0.8)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)';
              e.currentTarget.style.boxShadow = `
                0 0 20px rgba(0, 255, 255, 0.5),
                inset 0 0 20px rgba(0, 255, 255, 0.2)
              `;
              e.currentTarget.style.textShadow = '0 0 10px #00ffff, 0 0 20px #00ffff';
            }}
          >
            {/* スキャンライン効果 */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-0 group-hover:opacity-20 transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>

            {/* 四隅のアクセント */}
            <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-cyan-300 opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-cyan-300 opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2 border-cyan-300 opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-cyan-300 opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>

            {/* メインテキスト */}
            <span className="relative z-10 block">GOOGLE LOGIN</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen">
      <MapView userId={user.uid} user={user} onLogout={handleLogout} />
    </div>
  );
}

export default App;
