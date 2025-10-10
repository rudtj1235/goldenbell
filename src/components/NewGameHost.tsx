/**
 * 새로운 모듈 기반 게임 진행 페이지
 * 실시간 동기화와 참여자 현황 관리
 */

import React, { useState, useEffect, useRef } from 'react';
import { Player } from '../types/game';
import { useNewGameContext } from '../contexts/NewGameContext';
import eventBus from '../services/EventBus';
import syncManager from '../services/SyncManager';
import AvatarDisplay from './AvatarDisplay';
import { renderSimpleFractions } from '../utils/fractionUtils';
import Toast from './Toast';
import './GameHost.css';

// 공동 순위 계산 함수
const calculateRank = (sortedList: any[], index: number): number => {
  if (index === 0) return 1;
  if (sortedList[index].score === sortedList[index - 1].score) {
    return calculateRank(sortedList, index - 1);
  }
  return index + 1;
};

const NewGameHost: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [eliminateMode, setEliminateMode] = useState(false);
  const [reviveMode, setReviveMode] = useState(false);
  const [countdownActive, setCountdownActive] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [rankTab, setRankTab] = useState<'team' | 'individual'>('team'); // 순위 탭
  const [finalPlayers, setFinalPlayers] = useState<Player[]>([]); // 게임 종료 시 최종 순위 데이터

  const { state, actions } = useNewGameContext();
  const { room, questions, players, gameState, currentQuestionIndex, gameSettings, phaseStartedAt, phaseDuration, paused } = state;
  
  // finished 화면 표시 조건: finalPlayers가 있으면 무조건 finished
  const displayGameState = finalPlayers.length > 0 ? 'finished' : gameState;
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

  const getTeamBg = (team?: string): string => {
    const map: Record<string, string> = {
      '': 'rgba(255,255,255,0.85)',
      'A': 'rgba(244,67,54,0.2)',
      'B': 'rgba(255,152,0,0.2)',
      'C': 'rgba(255,235,59,0.2)',
      'D': 'rgba(76,175,80,0.2)',
      'E': 'rgba(33,150,243,0.2)',
      'F': 'rgba(63,81,181,0.2)',
      'G': 'rgba(156,39,176,0.2)',
      'H': 'rgba(158,158,158,0.2)'
    };
    return map[String(team || '')] ?? 'rgba(255,255,255,0.85)';
  };

  useEffect(() => {
    // 이벤트 리스너 등록
    const unsubscribers = [
      eventBus.on('GAME_STATE_CHANGE', handleGameStateChange),
      eventBus.on('NEXT_QUESTION', handleNextQuestion),
      eventBus.on('ANSWER_SHOWN', handleAnswerShown),
      eventBus.on('PLAYER_JOIN', handlePlayerJoin),
      eventBus.on('PLAYER_LEAVE', handlePlayerLeave),
      eventBus.on('ANSWER_SUBMITTED', handleAnswerSubmitted),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);
  
  // gameState가 finished로 변경되면 finalPlayers 저장
  const prevGameStateForFinished = useRef<string>('');
  const snapshotPlayers = useRef<Player[]>([]);
  
  useEffect(() => {
    // playing/showingAnswer 중에는 계속 스냅샷 업데이트
    if (gameState === 'playing' || gameState === 'showingAnswer') {
      snapshotPlayers.current = [...players];
    }
    
    // finished로 전환되면 마지막 스냅샷 저장
    if (gameState === 'finished' && prevGameStateForFinished.current !== 'finished') {
      setFinalPlayers(snapshotPlayers.current.length > 0 ? snapshotPlayers.current : [...players]);
    }
    
    // finished가 아닌 다른 상태로 가면 초기화
    if (prevGameStateForFinished.current === 'finished' && gameState !== 'finished') {
      setFinalPlayers([]);
      snapshotPlayers.current = [];
    }
    
    prevGameStateForFinished.current = gameState;
  }, [gameState, players]);

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

  // 진행페이지는 타이머의 원천이 아님: 컨텍스트 phaseStartedAt/phaseDuration로만 시간 계산
  useEffect(() => {
    setShowAnswer(gameState === 'showingAnswer');
  }, [gameState]);

  // 타이머 계산 (phaseStartedAt 기준) - 실시간 업데이트
  useEffect(() => {
    if (displayGameState === 'finished' || displayGameState === 'waiting') {
      setTimeLeft(0);
      return;
    }
    if (!phaseStartedAt || !phaseDuration) {
      setTimeLeft(0);
      return;
    }
    
    if (paused) return; // 일시정지 중에는 타이머 업데이트 중단
    
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - phaseStartedAt) / 1000);
      const remain = Math.max(0, phaseDuration - elapsed);
      setTimeLeft(remain);
    };
    
    updateTimer(); // 즉시 한 번 업데이트
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [gameState, phaseStartedAt, phaseDuration, paused]);

  useEffect(() => {
    if (timeLeft === 3 || timeLeft === 2 || timeLeft === 1 || timeLeft === 0) {
      console.debug('[AUTO_TIMER] tick', { gameState, timeLeft });
    }
  }, [timeLeft, gameState]);

  useEffect(() => {
    if (displayGameState === 'finished' || displayGameState === 'waiting') return; // 종료/대기 상태에서는 자동 진행 중지
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

  // ADJUST_TIME 이벤트는 phaseStartedAt/phaseDuration 업데이트로 자동 처리됨 (중복 제거)

  const handleGameStateChange = (data: any) => {
    // 상태 변경 처리
  };

  const handleNextQuestion = (data: any) => {
    setShowAnswer(false);
  };

  const handleAnswerShown = (data: any) => {
    setShowAnswer(true);
  };

  const handlePlayerJoin = (player: Player) => {
    // 참여자 처리
  };

  const handlePlayerLeave = (playerId: string) => {
    // 퇴장 처리
  };

  const handleAnswerSubmitted = (data: any) => {
    // 답안 제출 처리
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
      // 1. 탈락자를 뒤로
      if (a.isEliminated !== b.isEliminated) {
        return a.isEliminated ? 1 : -1;
      }
      
      // 2. 팀별 정렬 (개인 → A → B → C → ... → H)
      const getTeamOrder = (team?: string): number => {
        if (!team) return 0; // 개인전이 가장 앞
        return team.charCodeAt(0) - 64; // A=1, B=2, C=3, ...
      };
      
      const teamOrderA = getTeamOrder(a.team);
      const teamOrderB = getTeamOrder(b.team);
      
      if (teamOrderA !== teamOrderB) {
        return teamOrderA - teamOrderB;
      }
      
      // 3. 같은 팀 내에서는 점수 순
      if (a.team === b.team) {
        return b.score - a.score;
      }
      
      // 4. 개인전끼리는 점수 순
      return b.score - a.score;
    });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 글로벌 클릭으로 카드 선택 상태 해제 (훅은 조건문 이전에서 호출)
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.player-card')) return;
      setActiveCardId(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

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
      <Toast />
      {(gameState === 'playing' || gameState === 'showingAnswer' || gameState === 'paused') && (
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
                <span className="badge badge--warn">배점: {currentQuestion.score}점</span>
              </div>
            </div>

            <div className="question-content">
              <h2 className="question-text">{renderSimpleFractions(currentQuestion.question)}</h2>

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
                    <div key={index} className={`multiple-option ${showAnswer && index === currentQuestion.correctAnswer ? 'correct' : ''}`} style={{ color: '#111' }}>
                      <span className="option-number">{index + 1}</span>
                      <span className="option-text">{renderSimpleFractions(option)}</span>
                    </div>
                  ))}
                </div>
              )}

              {currentQuestion.type === 'short' && showAnswer && (
                <div className="short-answer">
                  <h3>정답</h3>
                  <p className="answer-text">{renderSimpleFractions(String(currentQuestion.correctAnswer))}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="no-question">
            {gameState === 'waiting' || gameState === 'paused' ? (
              <div className="waiting-message">
                <h2>대기중</h2>
                <p>문제를 추가하거나 게임을 시작해 주세요.</p>
              </div>
            ) : displayGameState === 'finished' ? (
              <div className="finished-message" style={{ width: '100%', maxWidth: 'min(90vw, 1200px)', margin: '0 auto' }}>
                <h2 style={{ color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.3)', marginBottom: '30px', fontSize: '2.5rem' }}>🎉 게임 종료!</h2>
                
                {/* 순위 탭 */}
                <div style={{ background: 'white', borderRadius: '20px', padding: 'clamp(20px, 4vw, 50px)', marginTop: '20px', minHeight: '500px' }}>
                  <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
                    <button 
                      onClick={() => setRankTab('team')}
                      style={{
                        flex: 1,
                        padding: '18px',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '1.3rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: rankTab === 'team' ? '#ffc107' : '#f0f0f0',
                        color: rankTab === 'team' ? '#111' : '#666',
                        transition: 'all 0.3s'
                      }}
                    >
                      팀 순위
                    </button>
                    <button 
                      onClick={() => setRankTab('individual')}
                      style={{
                        flex: 1,
                        padding: '18px',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '1.3rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: rankTab === 'individual' ? '#ffc107' : '#f0f0f0',
                        color: rankTab === 'individual' ? '#111' : '#666',
                        transition: 'all 0.3s'
                      }}
                    >
                      개인 순위
                    </button>
                  </div>
                  
                  {/* 순위 리스트 */}
                  <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
                    {rankTab === 'team' ? (
                      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '15px' }}>
                        {(() => {
                          const playersToShow = finalPlayers.length > 0 ? finalPlayers : players;
                          const teamRanks = Object.values(
                            playersToShow.reduce((acc: any, p: Player) => {
                              const key = p.team || p.nickname;
                              acc[key] = acc[key] || { team: key, score: 0 };
                              acc[key].score += p.score;
                              return acc;
                            }, {})
                          ).sort((a: any, b: any) => b.score - a.score);
                          
                          return teamRanks.map((t: any, i: number) => (
                            <li key={t.team} style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              padding: '18px 25px',
                              marginBottom: '12px',
                              background: '#f8f9fa',
                              borderRadius: '12px',
                              border: '3px solid #e9ecef'
                            }}>
                              <span style={{ fontWeight: 700, fontSize: '1.5rem', color: '#111', minWidth: '60px' }}>
                                {calculateRank(teamRanks, i)}위
                              </span>
                              <span style={{ flex: 1, fontWeight: 600, color: '#111', fontSize: '1.3rem' }}>
                                {t.team}
                              </span>
                              <span style={{ fontWeight: 700, color: '#ffc107', fontSize: '1.5rem' }}>
                                {t.score}점
                              </span>
                            </li>
                          ));
                        })()}
                      </ol>
                    ) : (
                      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '15px' }}>
                        {(() => {
                          const playersToShow = finalPlayers.length > 0 ? finalPlayers : players;
                          const individualRanks = [...playersToShow].sort((a, b) => b.score - a.score);
                          return individualRanks.map((p: Player, i: number) => (
                            <li key={p.id} style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              padding: '18px 25px',
                              marginBottom: '12px',
                              background: '#f8f9fa',
                              borderRadius: '12px',
                              border: '3px solid #e9ecef'
                            }}>
                              <span style={{ fontWeight: 700, fontSize: '1.5rem', color: '#111', minWidth: '60px' }}>
                                {calculateRank(individualRanks, i)}위
                              </span>
                              <span style={{ flex: 1, fontWeight: 600, color: '#111', fontSize: '1.3rem' }}>
                                {p.nickname}{p.team ? ` (${p.team})` : ''}
                              </span>
                              <span style={{ fontWeight: 700, color: '#ffc107', fontSize: '1.5rem' }}>
                                {p.score}점
                              </span>
                            </li>
                          ));
                        })()}
                      </ol>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // 남은 문제가 없고 종료가 아닌 경우 대기 처리
              <div className="waiting-message">
                <h2>대기중</h2>
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
          
          <div className="players-grid" onClick={(e)=>e.stopPropagation()}>
            {sortPlayers(players).map(player => (
              <div 
                key={player.id}
                className={`player-card ${player.isEliminated ? 'eliminated' : ''} ${
                  player.hasSubmitted ? 'submitted' : ''
                } ${eliminateMode || reviveMode ? 'clickable' : ''}`}
                onClick={() => {
                  setActiveCardId(prev => prev === player.id ? null : player.id);
                }}
              >
                <div className="player-avatar" style={{ background: getTeamBg(player.team) }}>
                  {/* player-card 내부에서만 정보와 컨트롤이 배치되도록 유지 */}
                  <div 
                    className="avatar-background"
                    style={{ backgroundColor: getTeamBg(player.team) }}
                  >
                    <AvatarDisplay avatar={player.avatar} size={50} />
                  </div>
                  {player.hasSubmitted && !player.isEliminated && (
                    <div className="submitted-indicator">✓</div>
                  )}
                  {player.isEliminated && (
                    <div className="eliminated-overlay">❌</div>
                  )}
                </div>
                <div className="player-info">
                  <div className="row-top">
                    <span className="player-name">{player.nickname}</span>
                    {player.team && (
                      <span className="player-team">{player.team}팀</span>
                    )}
                  </div>
                  <div className="row-bottom">
                    <span className="player-score" style={{ background: getTeamBg(player.team) }}>{player.score}점</span>
                  </div>
                </div>

                {activeCardId === player.id && (
                  <div className="card-actions-overlay" onClick={(e)=>e.stopPropagation()}>
                    {!player.isEliminated ? (
                      <button
                        className="card-action-btn"
                        onClick={() => { actions.eliminatePlayer(player.id); setActiveCardId(null); }}
                      >
                        탈락시키기
                      </button>
                    ) : (
                      <button
                        className="card-action-btn"
                        onClick={() => { actions.revivePlayer(player.id); setActiveCardId(null); }}
                      >
                        부활시키기
                      </button>
                    )}
                  </div>
                )}
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
        {/* 카드 클릭 시 표시되는 탈락/부활 컨트롤 */}
        {(eliminateMode || reviveMode) && (
          <div className="elimination-controls">
            <button className="control-btn" onClick={(e)=>{e.stopPropagation(); setEliminateMode(true); setReviveMode(false);}}>탈락시키기 모드</button>
            <button className="control-btn" onClick={(e)=>{e.stopPropagation(); setReviveMode(true); setEliminateMode(false);}}>부활시키기 모드</button>
            <button className="control-btn" onClick={(e)=>{e.stopPropagation(); cancelMode();}}>모드 해제</button>
          </div>
        )}
      </footer>
    </div>
  );
};

export default NewGameHost;
