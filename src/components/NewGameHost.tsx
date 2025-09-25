/**
 * 새로운 모듈 기반 게임 진행 페이지
 * 실시간 동기화와 참여자 현황 관리
 */

import React, { useState, useEffect, useRef } from 'react';
import { Player } from '../types/game';
import { useNewGameContext } from '../contexts/NewGameContext';
import eventBus from '../services/EventBus';
import syncManager from '../services/SyncManager';
import Avatar from 'avataaars2';
import './GameHost.css';

const NewGameHost: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [eliminateMode, setEliminateMode] = useState(false);
  const [reviveMode, setReviveMode] = useState(false);
  const [countdownActive, setCountdownActive] = useState(false);

  const { state, actions } = useNewGameContext();
  const { room, questions, players, gameState, currentQuestionIndex, gameSettings, phaseStartedAt, phaseDuration, paused } = state;
  const mountedAtRef = useRef<number>(Date.now());
  
  const currentQuestion = (gameState === 'playing' || gameState === 'showingAnswer' || gameState === 'paused')
    ? (questions[currentQuestionIndex] || null)
    : null;

  const getBackgroundColor = (colorName: string): string => {
    const colorMap: { [key: string]: string } = {
      Black: '#262e33', Brown: '#8B4513', Red: '#C93305',
      Blue01: '#65C9FF', Blue02: '#5199E4', Blue03: '#25557C',
      Gray01: '#E6E6E6', Gray02: '#929598', Heather: '#3C4F5C',
      PastelBlue: '#B1E2FF', PastelGreen: '#A7FFC4', PastelOrange: '#FFDEB5',
      PastelRed: '#FFAFB9', PastelYellow: '#FFFFB1', Pink: '#FF488E', White: '#FFFFFF'
    };
    return colorMap[colorName] || '#B1E2FF';
  };

  useEffect(() => {
    // 이벤트 리스너 등록
    const unsubscribers = [
      eventBus.on('GAME_STATE_CHANGE', handleGameStateChange),
      eventBus.on('NEXT_QUESTION', handleNextQuestion),
      eventBus.on('ANSWER_SHOWN', handleAnswerShown),
      eventBus.on('PLAYER_JOIN', handlePlayerJoin),
      eventBus.on('PLAYER_LEAVE', handlePlayerLeave),
      eventBus.on('ANSWER_SUBMITTED', handleAnswerSubmitted)
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  useEffect(() => {
    console.info('[AUTO_FLOW] mount or state hydrate', {
      gameState,
      currentQuestionIndex,
      questions: questions?.length,
      phaseStartedAt,
      phaseDuration,
      paused,
      autoMode: gameSettings.autoMode
    });
  }, []);

  useEffect(() => {
    // 단계 전환 시 타이머 초기화
    if (gameState === 'playing' && currentQuestion) {
      setTimeLeft(gameSettings.timeLimit);
      setShowAnswer(false);
      setCountdownActive(true);
      console.info('[AUTO_TIMER] enter playing', {
        index: currentQuestionIndex,
        timeLimit: gameSettings.timeLimit
      });
    } else if (gameState === 'showingAnswer') {
      setTimeLeft(gameSettings.answerRevealTime);
      setShowAnswer(true);
      setCountdownActive(true);
      console.info('[AUTO_TIMER] enter showingAnswer', {
        index: currentQuestionIndex,
        answerRevealTime: gameSettings.answerRevealTime
      });
    } else {
      setCountdownActive(false);
    }
  }, [gameState, currentQuestion, gameSettings.answerRevealTime]);

  useEffect(() => {
    // 서버/브로드캐스트 기준 남은 시간 계산
    if ((gameState === 'playing' || gameState === 'showingAnswer') && phaseStartedAt && phaseDuration && !paused) {
      const elapsed = Math.floor((Date.now() - phaseStartedAt) / 1000);
      const remain = Math.max(0, (phaseDuration || 0) - elapsed);
      setTimeLeft(remain);
      setCountdownActive(true);
      console.debug('[AUTO_TIMER] phase sync', {
        gameState,
        now: Date.now(),
        phaseStartedAt,
        phaseDuration,
        elapsed,
        remain,
        paused
      });
    }
  }, [gameState, phaseStartedAt, phaseDuration, paused]);

  useEffect(() => {
    if (!countdownActive) return;
    if (!(gameState === 'playing' || gameState === 'showingAnswer')) return;
    if (paused) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        const next = Math.max(0, prev - 1);
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdownActive, gameState, paused]);

  useEffect(() => {
    if (timeLeft === 3 || timeLeft === 2 || timeLeft === 1 || timeLeft === 0) {
      console.debug('[AUTO_TIMER] tick', { gameState, timeLeft });
    }
  }, [timeLeft, gameState]);

  useEffect(() => {
    if (!(gameState === 'playing' || gameState === 'showingAnswer')) return;
    if (timeLeft > 0) return;
    // 새로 열린 진행페이지에서 즉시 단계 전환되는 현상 방지: 마운트 후 짧은 유예
    const mountedForMs = Date.now() - mountedAtRef.current;
    if (mountedForMs < 1500) return;
    // 실제 만료 검증(서버 기준 시간) 후에만 자동 전환
    const expired = !!(phaseStartedAt && phaseDuration && (Date.now() - phaseStartedAt) / 1000 >= phaseDuration);
    if (!expired) {
      console.warn('[AUTO_FLOW] not expired by server time yet', {
        now: Date.now(), phaseStartedAt, phaseDuration,
        diffSec: phaseStartedAt ? Math.floor((Date.now() - phaseStartedAt) / 1000) : null
      });
      return;
    }
    setCountdownActive(false);
    if (!gameSettings.autoMode) return;
    if (gameState === 'playing') {
      console.info('[AUTO_FLOW] calling showAnswer due to timeout', {
        index: currentQuestionIndex
      });
      actions.showAnswer();
    } else if (gameState === 'showingAnswer') {
      console.info('[AUTO_FLOW] calling nextQuestion due to timeout', {
        index: currentQuestionIndex
      });
      actions.nextQuestion();
    }
  }, [timeLeft, gameState, gameSettings.autoMode, actions, phaseStartedAt, phaseDuration]);

  // 시간 조정 이벤트
  useEffect(() => {
    const unsub = eventBus.on('ADJUST_TIME', (delta: number) => {
      setTimeLeft(prev => Math.max(0, prev + (Number(delta) || 0)));
    });
    return () => unsub();
  }, []);

  // 탭 간 시간 조정 동기화
  useEffect(() => {
    const handler = (delta: number) => {
      setTimeLeft(prev => Math.max(0, prev + (Number(delta) || 0)));
    };
    (syncManager as any).addEventListener?.('ADJUST_TIME', handler);
    return () => {
      try { (syncManager as any).removeEventListener?.('ADJUST_TIME', handler); } catch {}
    };
  }, []);

  const handleGameStateChange = (data: any) => {
    console.log('🎮 게임 상태 변경:', data);
  };

  const handleNextQuestion = (data: any) => {
    console.log('➡️ 다음 문제:', data);
    setShowAnswer(false);
  };

  const handleAnswerShown = (data: any) => {
    console.log('💡 정답 공개:', data);
    setShowAnswer(true);
  };

  const handlePlayerJoin = (player: Player) => {
    console.log('👤 새 참여자:', player.nickname);
  };

  const handlePlayerLeave = (playerId: string) => {
    console.log('👤 참여자 퇴장:', playerId);
  };

  const handleAnswerSubmitted = (data: any) => {
    console.log('📝 답안 제출:', data);
  };

  const handlePlayerClick = (playerId: string) => {
    if (eliminateMode) {
      actions.eliminatePlayer(playerId);
      setEliminateMode(false);
      document.body.style.cursor = 'default';
    } else if (reviveMode) {
      actions.revivePlayer(playerId);
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
    document.body.style.cursor = 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'><text y=\'18\' font-size=\'18\'>✅</text></svg>") 12 12, auto';
  };

  const cancelMode = () => {
    setEliminateMode(false);
    setReviveMode(false);
    document.body.style.cursor = 'default';
  };

  const sortPlayers = (players: Player[]): Player[] => {
    return [...players].sort((a, b) => {
      // 탈락자를 뒤로
      if (a.isEliminated !== b.isEliminated) {
        return a.isEliminated ? 1 : -1;
      }
      // 점수 순으로 정렬
      return b.score - a.score;
    });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!room) {
    return (
      <div className="game-host loading">
        <div className="loading-message">
          <h2>게임 데이터를 불러오는 중...</h2>
          <p>잠시만 기다려주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-host">
      {(gameState === 'playing' || gameState === 'paused' || gameState === 'showingAnswer') && (
        <div className="game-timer" style={{ position: 'fixed', top: 12, right: 12 }}>
          <div className={`timer ${timeLeft <= 5 ? 'warning' : ''}`}>⏱️ {formatTime(timeLeft)}</div>
        </div>
      )}

      <main className="game-main">
            {currentQuestion ? (
          <div className="question-display">
            <div className="question-header" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="question-info" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="question-number">문제 {currentQuestionIndex + 1}/{questions.length}</span>
                <span className="question-score">배점: {currentQuestion.score}점</span>
              </div>
            </div>

            <div className="question-content">
              <h2 className="question-text">{currentQuestion.question}</h2>

              {currentQuestion.image && (
                <div className="question-image">
                  <img src={currentQuestion.image} alt="문제 이미지" />
                </div>
              )}

              {currentQuestion.type === 'ox' && (
                <div className="ox-options">
                  <div className={`ox-option ${showAnswer && currentQuestion.correctAnswer === 'O' ? 'correct' : ''}`}>O (참)</div>
                  <div className={`ox-option ${showAnswer && currentQuestion.correctAnswer === 'X' ? 'correct' : ''}`}>X (거짓)</div>
                </div>
              )}

              {currentQuestion.type === 'multiple' && currentQuestion.options && (
                <div className="multiple-options">
                  {currentQuestion.options.map((option: string, index: number) => (
                    <div key={index} className={`multiple-option ${showAnswer && index === currentQuestion.correctAnswer ? 'correct' : ''}`}>
                      <span className="option-number">{index + 1}</span>
                      <span className="option-text">{option}</span>
                    </div>
                  ))}
                </div>
              )}

              {currentQuestion.type === 'short' && (
                <div className="short-answer" style={{ background: showAnswer ? '#28a745' : '#f8f9fa', color: showAnswer ? '#fff' : '#333' }}>
                  <h3>정답</h3>
                  <p className="answer-text">{showAnswer ? String(currentQuestion.correctAnswer) : '정답 공개 대기'}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="no-question">
            {gameState === 'waiting' || gameState === 'paused' ? (
              <div className="waiting-message">
                <h2>🎯 대기중</h2>
                <p>문제를 추가하거나 게임을 시작해 주세요.</p>
              </div>
            ) : gameState === 'finished' ? (
              <div className="finished-message">
                <h2>🎉 게임이 종료되었습니다!</h2>
                <p>모든 문제가 완료되었습니다.</p>
              </div>
            ) : (
              // 남은 문제가 없고 종료가 아닌 경우 대기 처리
              <div className="waiting-message">
                <h2>🎯 대기중</h2>
                <p>문제를 추가하거나 게임을 시작해 주세요.</p>
              </div>
            )}
          </div>
        )}
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
                className={`player-card ${player.isEliminated ? 'eliminated' : ''} ${
                  player.hasSubmitted ? 'submitted' : ''
                } ${eliminateMode || reviveMode ? 'clickable' : ''}`}
                onClick={() => handlePlayerClick(player.id)}
              >
                <div className="player-avatar">
                  <button className="hover-action" onClick={(e) => {
                    e.stopPropagation();
                    if (player.isEliminated) {
                      actions.revivePlayer(player.id);
                    } else {
                      actions.eliminatePlayer(player.id);
                    }
                  }}>
                    {player.isEliminated ? '살리기' : '탈락시키기'}
                  </button>
                  <div 
                    className="avatar-background"
                    style={{ backgroundColor: getBackgroundColor(player.avatar?.backgroundColor || 'PastelBlue') }}
                  >
                    <Avatar
                      style={{ width: '50px', height: '50px' }}
                      avatarStyle="Transparent"
                      topType={player.avatar?.topType || 'ShortHairShortFlat'}
                      accessoriesType={player.avatar?.accessoriesType || 'Blank'}
                      hairColor={player.avatar?.hairColor || 'BrownDark'}
                      facialHairType="Blank"
                      facialHairColor="BrownDark"
                      clotheType="ShirtCrewNeck"
                      clotheColor={player.avatar?.clotheColor || 'Blue01'}
                      eyeType={player.avatar?.eyeType || 'Happy'}
                      eyebrowType={player.avatar?.eyebrowType || 'Default'}
                      mouthType={player.avatar?.mouthType || 'Smile'}
                      skinColor={player.avatar?.skinColor || 'Light'}
                    />
                  </div>
                  {player.hasSubmitted && !player.isEliminated && (
                    <div className="submitted-indicator">✓</div>
                  )}
                  {player.isEliminated && (
                    <div className="eliminated-overlay">❌</div>
                  )}
                </div>
                <div className="player-info">
                  <span className="player-name">{player.nickname}</span>
                  <span className="player-score">{player.score}점</span>
                  {player.team && (
                    <span className="player-team">{player.team}팀</span>
                  )}
                </div>
              </div>
            ))}
            
            {players.length === 0 && (
              <div className="no-players">
                <p>아직 참여자가 없습니다</p>
                <small>방 코드: <strong>{room.code}</strong></small>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default NewGameHost;
