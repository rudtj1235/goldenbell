import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import { NewGameProvider } from './contexts/NewGameContext';
import { AuthProvider } from './contexts/AuthContext';
import NewMainPage from './components/NewMainPage';
import NewPlayerSetup from './components/NewPlayerSetup';
import NewAdminPanel from './components/NewAdminPanel';
import NewGameHost from './components/NewGameHost';
import GamePlayer from './components/GamePlayer';
import LeaderboardModal from './components/Leaderboard';
import AvatarCustomizer from './components/AvatarCustomizer';

function App() {
  return (
    <AuthProvider>
      <NewGameProvider>
        <Router>
          <div className="App">
            <Routes>
              <Route path="/" element={<NewMainPage />} />
              <Route path="/player-setup" element={<NewPlayerSetup />} />
              <Route path="/admin" element={<NewAdminPanel />} />
              <Route path="/game-host" element={<NewGameHost />} />
              <Route path="/game-player" element={<GamePlayer />} />
              <Route path="/leaderboard" element={<LeaderboardModal onClose={() => window.history.back()} />} />
              <Route path="/avatar-test" element={<AvatarCustomizer />} />
            </Routes>
          </div>
        </Router>
      </NewGameProvider>
    </AuthProvider>
  );
}

export default App;

