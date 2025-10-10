import React, { useState } from 'react';
import './Leaderboard.css';
import { useNewGameContext } from '../contexts/NewGameContext';

const LeaderboardModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state } = useNewGameContext();
  const { players } = state;
  const [tab, setTab] = useState<'team' | 'individual'>('team');

  // 팀 순위: 팀이 있는 플레이어는 팀별 집계, 개인은 닉네임을 팀명으로 사용
  const teamRanks = Object.values(
    players.reduce((acc: any, p) => {
      const key = p.team || p.nickname; // 팀이 없으면 닉네임을 팀명으로 사용
      acc[key] = acc[key] || { team: key, score: 0 };
      acc[key].score += p.score;
      return acc;
    }, {})
  ).sort((a: any, b: any) => b.score - a.score);

  const individualRanks = [...players].sort((a, b) => b.score - a.score);

  // 공동 순위 계산 함수
  const calculateRank = (sortedList: any[], index: number): number => {
    if (index === 0) return 1;
    // 이전 항목과 점수가 같으면 같은 순위
    if (sortedList[index].score === sortedList[index - 1].score) {
      return calculateRank(sortedList, index - 1);
    }
    // 다르면 현재 인덱스 + 1 (앞에 있는 사람 수 + 1)
    return index + 1;
  };

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
                  <span className="rank">{calculateRank(teamRanks, i)}</span>
                  <span className="name" style={{ color: '#111' }}>{t.team}</span>
                  <span className="score">{t.score}점</span>
                </li>
              ))}
            </ol>
          ) : (
            <ol className="lb-list">
              {individualRanks.map((p, i) => (
                <li key={p.id}>
                  <span className="rank">{calculateRank(individualRanks, i)}</span>
                  <span className="name" style={{ color: '#111' }}>{p.nickname}{p.team ? ` (${p.team})` : ''}</span>
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
