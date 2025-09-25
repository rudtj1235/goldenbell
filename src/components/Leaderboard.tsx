import React, { useState } from 'react';
import './Leaderboard.css';
import { useNewGameContext } from '../contexts/NewGameContext';

const LeaderboardModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state } = useNewGameContext();
  const { players } = state;
  const [tab, setTab] = useState<'team' | 'individual'>('team');

  const teamRanks = Object.values(
    players.reduce((acc: any, p) => {
      const key = p.team || '개인';
      acc[key] = acc[key] || { team: key, score: 0 };
      acc[key].score += p.score;
      return acc;
    }, {})
  ).sort((a: any, b: any) => b.score - a.score);

  const individualRanks = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="lb-overlay" onClick={onClose}>
      <div className="lb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lb-header">
          <h3>순위</h3>
          <button className="lb-close" onClick={onClose}>×</button>
        </div>
        <div className="lb-tabs">
          <button className={`lb-tab ${tab==='team'?'active':''}`} onClick={() => setTab('team')}>팀 순위</button>
          <button className={`lb-tab ${tab==='individual'?'active':''}`} onClick={() => setTab('individual')}>개인 순위</button>
        </div>
        <div className="lb-content">
          {tab === 'team' ? (
            <ol className="lb-list">
              {teamRanks.map((t: any, i: number) => (
                <li key={t.team}>
                  <span className="rank">{i+1}</span>
                  <span className="name">{t.team}</span>
                  <span className="score">{t.score}점</span>
                </li>
              ))}
            </ol>
          ) : (
            <ol className="lb-list">
              {individualRanks.map((p, i) => (
                <li key={p.id}>
                  <span className="rank">{i+1}</span>
                  <span className="name">{p.nickname}{p.team ? ` (${p.team})` : ''}</span>
                  <span className="score">{p.score}점</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeaderboardModal;
