import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import { NewGameProvider } from './contexts/NewGameContext';
import { AuthProvider } from './contexts/AuthContext';
import {
  NewMainPage,
  NewPlayerSetup,
  NewAdminPanel,
  NewGameHost,
  GamePlayer
} from './components/LazyComponents';
import LeaderboardModal from './components/Leaderboard';
import AvatarCustomizer from './components/AvatarCustomizer';

// 로딩 컴포넌트
const LoadingSpinner = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '18px',
    color: '#666'
  }}>
    <div>로딩 중...</div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <NewGameProvider>
        <Router>
          <div className="App">
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<NewMainPage />} />
                <Route path="/player-setup" element={<NewPlayerSetup />} />
                <Route path="/admin" element={<NewAdminPanel />} />
                <Route path="/game-host" element={<NewGameHost />} />
                <Route path="/game-player" element={<GamePlayer />} />
                <Route path="/leaderboard" element={<LeaderboardModal onClose={() => window.history.back()} />} />
                <Route path="/avatar-test" element={<AvatarCustomizer />} />
              </Routes>
            </Suspense>
          </div>
        </Router>
      </NewGameProvider>
    </AuthProvider>
  );
}

export default App;

