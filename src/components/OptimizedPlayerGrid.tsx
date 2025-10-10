/**
 * 30명 이상의 다중 사용자를 위한 성능 최적화된 플레이어 그리드
 * React.memo, useMemo, useCallback을 활용한 불필요한 리렌더링 방지
 */

import React, { memo, useMemo, useCallback } from 'react';
import { Player } from '../types/game';
import AvatarDisplay from './AvatarDisplay';

interface OptimizedPlayerGridProps {
  players: Player[];
  onPlayerClick?: (playerId: string) => void;
  showActions?: boolean;
  className?: string;
}

// 개별 플레이어 카드 컴포넌트 (메모이제이션)
const PlayerCard = memo(({ 
  player, 
  onPlayerClick, 
  showActions,
  teamBgColor 
}: { 
  player: Player; 
  onPlayerClick?: (playerId: string) => void;
  showActions?: boolean;
  teamBgColor: string;
}) => {
  const handleClick = useCallback(() => {
    if (onPlayerClick) {
      onPlayerClick(player.id);
    }
  }, [player.id, onPlayerClick]);

  return (
    <div 
      className="player-card" 
      onClick={showActions ? handleClick : undefined}
      style={{ cursor: showActions ? 'pointer' : 'default' }}
    >
      <div className="player-avatar" style={{ background: teamBgColor }}>
        <div
          className="avatar-background"
          style={{ backgroundColor: teamBgColor }}
        >
          <AvatarDisplay avatar={player.avatar} size={50} />
        </div>
        {player.isEliminated && (
          <div className="eliminated-overlay">❌</div>
        )}
      </div>
      <div className="player-info">
        <div className="row-top">
          <span className="player-name">{player.nickname}</span>
          {player.team && <span className="player-team">{player.team}팀</span>}
        </div>
        <div className="row-bottom">
          <span className="player-score" style={{ backgroundColor: teamBgColor }}>
            {player.score || 0}점
          </span>
        </div>
      </div>
    </div>
  );
});

PlayerCard.displayName = 'PlayerCard';

// 팀별 색상 매핑 (메모이제이션)
const TEAM_COLORS = {
  'A': 'rgba(244,67,54,0.20)',
  'B': 'rgba(255,152,0,0.20)',
  'C': 'rgba(255,235,59,0.20)',
  'D': 'rgba(76,175,80,0.20)',
  'E': 'rgba(33,150,243,0.20)',
  'F': 'rgba(63,81,181,0.20)',
  'G': 'rgba(156,39,176,0.20)',
  'H': 'rgba(158,158,158,0.20)'
} as const;

// 팀별 정렬 함수 (메모이제이션)
const sortPlayersByTeam = (players: Player[]): Player[] => {
  return [...players].sort((a, b) => {
    // 1. 탈락자는 맨 뒤로
    if (a.isEliminated !== b.isEliminated) {
      return a.isEliminated ? 1 : -1;
    }
    
    // 2. 팀별 정렬 (Individual -> A -> B -> ... -> H)
    const teamA = a.team || 'Individual';
    const teamB = b.team || 'Individual';
    
    if (teamA === 'Individual' && teamB !== 'Individual') return -1;
    if (teamA !== 'Individual' && teamB === 'Individual') return 1;
    if (teamA !== teamB) return teamA.localeCompare(teamB);
    
    // 3. 같은 팀 내에서는 점수 내림차순
    return (b.score || 0) - (a.score || 0);
  });
};

// 메인 컴포넌트
export const OptimizedPlayerGrid = memo(({ 
  players, 
  onPlayerClick, 
  showActions = false,
  className = 'players-grid'
}: OptimizedPlayerGridProps) => {
  // 정렬된 플레이어 목록 (메모이제이션)
  const sortedPlayers = useMemo(() => {
    return sortPlayersByTeam(players);
  }, [players]);

  // 팀 색상 가져오기 함수 (메모이제이션)
  const getTeamBgColor = useCallback((team?: string): string => {
    if (!team) return 'rgba(255,255,255,0.85)';
    return TEAM_COLORS[team as keyof typeof TEAM_COLORS] || 'rgba(255,255,255,0.85)';
  }, []);

  // 플레이어가 없는 경우
  if (players.length === 0) {
    return (
      <div className="no-participants">
        <p>아직 참여자가 없습니다</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {sortedPlayers.map(player => (
        <PlayerCard
          key={player.id}
          player={player}
          onPlayerClick={onPlayerClick}
          showActions={showActions}
          teamBgColor={getTeamBgColor(player.team)}
        />
      ))}
    </div>
  );
});

OptimizedPlayerGrid.displayName = 'OptimizedPlayerGrid';

export default OptimizedPlayerGrid;
