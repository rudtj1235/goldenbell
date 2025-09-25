import React, { useState, useEffect } from 'react';
import { Question, Player } from '../types/game';
import { useGameContext } from '../contexts/GameContext';
import Avatar from 'avataaars2';
import './GameHost.css';

const GameHost: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [eliminateMode, setEliminateMode] = useState(false);
  const [reviveMode, setReviveMode] = useState(false);
  
  const { state, dispatch } = useGameContext();
  const [localGameData, setLocalGameData] = useState<any>(null);
  
  // Context 상태 또는 localStorage에서 로드한 데이터 사용
  const gameData = localGameData || state;
  const { room, questions, players, gameState, currentQuestionIndex, gameSettings } = gameData;
  
  const currentQuestion = questions[currentQuestionIndex] || null;

  useEffect(() => {
    // localStorage에서 게임 데이터 로드 (새 탭에서 열었을 때)
    const loadGameData = () => {
      const savedGameData = localStorage.getItem('gameHostData');
      if (savedGameData) {
        const parsedData = JSON.parse(savedGameData);
        console.log('🔄 gameHostData 로드됨:', parsedData);
        setLocalGameData(parsedData);
      }
    };

    // 초기 로드
    if (!state.room) {
      loadGameData();
    }

    // localStorage 변경 감지 (같은 탭에서 변경될 때)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'gameHostData' && e.newValue) {
        console.log('🔄 localStorage 변경 감지 - gameHostData 업데이트');
        const parsedData = JSON.parse(e.newValue);
        setLocalGameData(parsedData);
      }
    };

    // 다른 탭에서의 localStorage 변경 감지
    window.addEventListener('storage', handleStorageChange);

    // 같은 탭에서의 변경을 위한 주기적 확인 (fallback)
    const interval = setInterval(() => {
      if (!state.room) {
        loadGameData();
      }
    }, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [state.room]);

  useEffect(() => {
    // 게임이 진행 중이고 현재 문제가 있으면 타이머 설정
    if (gameState === 'playing' && currentQuestion) {
      setTimeLeft(currentQuestion.timeLimit);
      setShowAnswer(false);
    } else if (gameState === 'showingAnswer') {
      setShowAnswer(true);
    }
  }, [gameState, currentQuestion]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (gameState === 'playing' && timeLeft > 0) {
      timer = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (gameState === 'playing' && timeLeft === 0) {
      setShowAnswer(true);
      // 자동 모드라면 일정 시간 후 다음 문제로
      if (gameSettings.autoMode) {
        setTimeout(() => {
          setShowAnswer(false);
          dispatch({ type: 'NEXT_QUESTION' });
        }, gameSettings.answerRevealTime * 1000);
      }
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [timeLeft, gameState, gameSettings, dispatch]);

  const handlePlayerClick = (playerId: string) => {
    if (eliminateMode) {
      // Context 상태가 있으면 dispatch, 없으면 localStorage 업데이트
      if (state.room) {
        dispatch({ type: 'ELIMINATE_PLAYER', payload: playerId });
      } else if (localGameData) {
        const updatedData = {
          ...localGameData,
          players: localGameData.players.map((p: any) => 
            p.id === playerId ? { ...p, isEliminated: true } : p
          )
        };
        setLocalGameData(updatedData);
        localStorage.setItem('gameHostData', JSON.stringify(updatedData));
      }
      setEliminateMode(false);
      document.body.style.cursor = 'default';
    } else if (reviveMode) {
      // Context 상태가 있으면 dispatch, 없으면 localStorage 업데이트
      if (state.room) {
        dispatch({ type: 'REVIVE_PLAYER', payload: playerId });
      } else if (localGameData) {
        const updatedData = {
          ...localGameData,
          players: localGameData.players.map((p: any) => 
            p.id === playerId ? { ...p, isEliminated: false } : p
          )
        };
        setLocalGameData(updatedData);
        localStorage.setItem('gameHostData', JSON.stringify(updatedData));
      }
      setReviveMode(false);
      document.body.style.cursor = 'default';
    }
  };

  const handleEliminateMode = () => {
    setEliminateMode(true);
    setReviveMode(false);
    document.body.style.cursor = 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'><text y=\'18\' font-size=\'18\'>❌</text></svg>") 12 12, auto';
  };

  const handleReviveMode = () => {
    setReviveMode(true);
    setEliminateMode(false);
    document.body.style.cursor = 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'><text y=\'18\' font-size=\'18\'>⭕</text></svg>") 12 12, auto';
  };

  const handleCancelMode = () => {
    setEliminateMode(false);
    setReviveMode(false);
    document.body.style.cursor = 'default';
  };

  const sortPlayers = (players: Player[]): Player[] => {
    return [...players].sort((a, b) => {
      // 팀이 있는 플레이어 우선, 팀 내에서는 닉네임 순
      if (a.team && b.team) {
        if (a.team !== b.team) {
          return a.team.localeCompare(b.team);
        }
        return a.nickname.localeCompare(b.nickname);
      }
      if (a.team && !b.team) return -1;
      if (!a.team && b.team) return 1;
      // 둘 다 개인인 경우 닉네임 순
      return a.nickname.localeCompare(b.nickname);
    });
  };

  const getBackgroundColor = (colorName: string): string => {
    const colorMap: { [key: string]: string } = {
      'Black': '#262e33',
      'Blue01': '#65C9FF',
      'Blue02': '#5199E4',
      'Blue03': '#25557C',
      'Gray01': '#E6E6E6',
      'Gray02': '#929598',
      'Heather': '#3C4F5C',
      'PastelBlue': '#B1E2FF',
      'PastelGreen': '#A7FFC4',
      'PastelOrange': '#FFDEB5',
      'PastelRed': '#FFAFB9',
      'PastelYellow': '#FFFFB1',
      'Pink': '#FF488E',
      'Red': '#C93305',
      'White': '#FFFFFF'
    };
    return colorMap[colorName] || '#B1E2FF';
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!room) {
    return (
      <div className="game-host loading">
        <div>방을 찾을 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="game-host" onClick={handleCancelMode}>
      <header className="game-header">
        <div className="game-title">
          <h1>🏆 골든벨 진행</h1>
          <span className="game-status">
            {gameState === 'waiting' ? '대기중' : 
             gameState === 'playing' ? '문제 진행중' :
             gameState === 'paused' ? '일시정지' :
             gameState === 'showingAnswer' ? '정답 공개' : '게임 종료'}
          </span>
        </div>
        
        <div className="timer-display">
          <div className={`timer ${timeLeft <= 5 ? 'warning' : ''}`}>
            ⏱️ {formatTime(timeLeft)}
          </div>
        </div>
      </header>

      <main className="game-main">
        <div className="question-area">
          {gameState === 'waiting' ? (
            <div className="waiting-message">
              <h2>대기 중</h2>
              <p>문제가 제시될 때까지 기다려주세요</p>
            </div>
          ) : currentQuestion ? (
            <div className="question-display">
              <div className="question-header">
                <span className="question-type">
                  {currentQuestion.type === 'ox' ? 'OX 문제' :
                   currentQuestion.type === 'multiple' ? '객관식' : '주관식'}
                </span>
                <span className="question-score">{currentQuestion.score}점</span>
              </div>
              
              <h2 className="question-text">{currentQuestion.question}</h2>
              
              {currentQuestion.type === 'ox' && (
                <div className="ox-options">
                  <div className={`ox-option ${showAnswer && currentQuestion.correctAnswer === 'O' ? 'correct' : ''}`}>
                    O (참)
                  </div>
                  <div className={`ox-option ${showAnswer && currentQuestion.correctAnswer === 'X' ? 'correct' : ''}`}>
                    X (거짓)
                  </div>
                </div>
              )}
              
              {currentQuestion.type === 'multiple' && currentQuestion.options && (
                <div className="multiple-options">
                  {currentQuestion.options.map((option: string, index: number) => (
                    <div 
                      key={index} 
                      className={`multiple-option ${showAnswer && index === currentQuestion.correctAnswer ? 'correct' : ''}`}
                    >
                      <span className="option-number">{index + 1}</span>
                      <span className="option-text">{option}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {currentQuestion.type === 'short' && showAnswer && (
                <div className="short-answer">
                  <span className="answer-label">정답:</span>
                  <span className="answer-text">{currentQuestion.correctAnswer}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="game-footer">
        <div className="players-section">
          <div className="players-header">
            <h3>참여자 현황</h3>
            <div className="player-stats">
              <span>전체: {players.length}명</span>
              <span>탈락: {players.filter((p: Player) => p.isEliminated).length}명</span>
              <span>제출: {players.filter((p: Player) => p.hasSubmitted && !p.isEliminated).length}명</span>
            </div>
          </div>
          
          <div className="players-grid">
            {sortPlayers(players).map(player => (
              <div 
                key={player.id}
                className={`player-avatar ${player.isEliminated ? 'eliminated' : ''} ${player.hasSubmitted ? 'submitted' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayerClick(player.id);
                }}
              >
                <div className="avatar-container">
                  <div 
                    className="avatar-background"
                    style={{ 
                      backgroundColor: getBackgroundColor(player.avatar.backgroundColor || 'PastelBlue'),
                      filter: player.isEliminated ? 'grayscale(100%)' : 'none'
                    }}
                  >
                    <Avatar
                      style={{ width: '60px', height: '60px' }}
                      avatarStyle="Transparent"
                      topType={player.avatar.topType || 'ShortHairShortFlat'}
                      accessoriesType={player.avatar.accessoriesType || 'Blank'}
                      hairColor={player.avatar.hairColor || 'BrownDark'}
                      facialHairType="Blank"
                      facialHairColor="BrownDark"
                      clotheType="ShirtCrewNeck"
                      clotheColor={player.avatar.clotheColor || 'Blue01'}
                      eyeType={player.avatar.eyeType || 'Happy'}
                      eyebrowType={player.avatar.eyebrowType || 'Default'}
                      mouthType={player.avatar.mouthType || 'Smile'}
                      skinColor={player.avatar.skinColor || 'Light'}
                    />
                  </div>
                  {player.hasSubmitted && !player.isEliminated && (
                    <div className="submitted-indicator">✓</div>
                  )}
                </div>
                
                <div className="player-info">
                  <div className="player-name">
                    {player.team && <span className="team-badge">{player.team}</span>}
                    {player.nickname}
                  </div>
                  <div className="player-score">{player.score}점</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {gameSettings.eliminationMode && (
          <div className="elimination-controls">
            <button 
              className={`control-btn eliminate-btn ${eliminateMode ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleEliminateMode();
              }}
            >
              ❌ 탈락시키기
            </button>
            <button 
              className={`control-btn revive-btn ${reviveMode ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleReviveMode();
              }}
            >
              ⭕ 부활시키기
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};

export default GameHost;
