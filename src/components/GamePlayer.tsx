import React, { useState, useEffect, useRef } from 'react';
import AvatarDisplay from './AvatarDisplay';
import { useNavigate } from 'react-router-dom';
import { Player } from '../types/game';
import { firestoreSyncManager as syncManager } from '../services/FirestoreSyncManager';
import { useNewGameContext } from '../contexts/NewGameContext';
import { renderSimpleFractions } from '../utils/fractionUtils';
import Toast from './Toast';
import './GamePlayer.css';

// 공동 순위 계산 함수
const calculateRank = (sortedList: any[], index: number): number => {
  if (index === 0) return 1;
  if (sortedList[index].score === sortedList[index - 1].score) {
    return calculateRank(sortedList, index - 1);
  }
  return index + 1;
};

const GamePlayer: React.FC = () => {
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<'correct' | 'incorrect' | null>(null);
  const [countdownActive, setCountdownActive] = useState(false);
  const [rankTab, setRankTab] = useState<'team' | 'individual'>('team'); // 순위 탭
  const [finalPlayers, setFinalPlayers] = useState<Player[]>([]); // 게임 종료 시 최종 순위 데이터
  const navigate = useNavigate();
  
  const { state, actions } = useNewGameContext();
  const { room, questions, gameState, currentQuestionIndex, players, gameSettings, phaseStartedAt, phaseDuration, paused, pausedPrevState } = state as any;
  
  // finished 화면 표시 조건: finalPlayers가 있으면 무조건 finished
  const displayGameState = finalPlayers.length > 0 ? 'finished' : gameState;
  
  const currentQuestion = gameState !== 'waiting' ? (questions[currentQuestionIndex] || null) : null;
  
  // const currentQuestionId = currentQuestion?.id || null;

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
  const player = currentPlayer ? players.find((p: Player) => p.id === currentPlayer.id) : null;
  
  // 강퇴된 플레이어 확인
  useEffect(() => {
    if (currentPlayer && players.length > 0) {
      const isPlayerStillInRoom = players.some((p: Player) => p.id === currentPlayer.id);
      if (!isPlayerStillInRoom) {
        // 플레이어가 방에서 제거되었으면 메인으로 리다이렉트
        alert('방에서 제거되었습니다.');
        localStorage.removeItem('currentPlayer');
        localStorage.removeItem('currentRoomCode');
        navigate('/');
      }
    }
  }, [players, currentPlayer, navigate]);
  // 결과 화면용 점수/순위 계산 (finalPlayers 사용)
  const playersForResult = finalPlayers.length > 0 ? finalPlayers : players;
  const playerForResult = playersForResult.find((p: Player) => p.id === player?.id);
  const myScore = playerForResult ? playerForResult.score : 0;
  
  const teamScore = player
    ? (player.team
      ? players
          .filter((p: Player) => p.team === player.team)
          .reduce((s: number, p: Player) => s + (p.score || 0), 0)
      : player.score)
    : 0;

  useEffect(() => {
    // 로컬 스토리지에서 현재 플레이어 데이터 로드
    const storedPlayer = localStorage.getItem('currentPlayer');
    if (storedPlayer) {
      setCurrentPlayer(JSON.parse(storedPlayer));
    } else {
      // 플레이어 데이터가 없으면 메인으로 리다이렉트
      navigate('/');
      return;
    }

    // 더 이상 이벤트 구독 불필요
    // gameState 변화로 finished 감지
  }, [navigate]);

  // 페이지 이탈 감지 및 자동 정리
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentPlayer) {
        try {
          // 플레이어를 방에서 제거
          syncManager.leavePlayer(currentPlayer.id);
        } catch (e) {
          console.warn('플레이어 나가기 실패:', e);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentPlayer]);
  
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

  const prevGameStateRef = useRef<string | null>(null);
  const prevQuestionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevGameState = prevGameStateRef.current;
    const prevQuestionId = prevQuestionIdRef.current;
    const questionId = currentQuestion?.id || null;

    // 전이 감지: 상태/문제 변경시에만 타이머/표시 초기화
    const enteredPlaying = displayGameState === 'playing' && prevGameState !== 'playing';
    const questionChanged = questionId && questionId !== prevQuestionId;
    const enteredAnswer = displayGameState === 'showingAnswer' && prevGameState !== 'showingAnswer';

    if ((enteredPlaying || questionChanged) && currentQuestion) {
      setTimeLeft(gameSettings.timeLimit);
      setShowAnswer(false);
      // 새 문제로 바뀔 때만 입력/결과 초기화
      if (questionChanged) {
        setSelectedAnswer(null);
        setSubmissionResult(null);
      }
      setCountdownActive(true);
    } else if (enteredAnswer) {
      setTimeLeft(gameSettings.answerRevealTime);
      setShowAnswer(true);
      setCountdownActive(true);
      // 정답 공개 시 내 정답 정오 표시
      if (player && currentQuestion) {
        const correct = currentQuestion.type === 'multiple'
          ? String(currentQuestion.correctAnswer) === String(player.currentAnswer)
          : String(currentQuestion.correctAnswer).toString().trim() === String((player.currentAnswer || '')).trim();
        setSubmissionResult(correct ? 'correct' : 'incorrect');
      }
    } else if (displayGameState === 'waiting') {
      setTimeLeft(0);
      setShowAnswer(false);
      setCountdownActive(false);
    } else if (displayGameState === 'finished') {
      setTimeLeft(0);
      setShowAnswer(false);
      setCountdownActive(false);
    }

    prevGameStateRef.current = displayGameState;
    prevQuestionIdRef.current = questionId;
  }, [displayGameState, currentQuestion, gameSettings.timeLimit, gameSettings.answerRevealTime]);

  // 플레이어 저장된 답안과 입력값 동기화(문제 제시 중에만) - 타입 보존
  useEffect(() => {
    if (gameState === 'playing' && player && typeof player.currentAnswer !== 'undefined') {
      // 객관식의 경우 number 타입 보존
      if (currentQuestion?.type === 'multiple' && typeof player.currentAnswer === 'string') {
        const numAnswer = parseInt(player.currentAnswer, 10);
        if (!isNaN(numAnswer)) {
          setSelectedAnswer(numAnswer);
        } else {
          setSelectedAnswer(player.currentAnswer);
        }
      } else {
        setSelectedAnswer(player.currentAnswer);
      }
    }
  }, [gameState, player, currentQuestion?.type]);

  useEffect(() => {
    // 서버/브로드캐스트 기준 남은 시간 계산 (phaseStartedAt 변경 시 무조건 반영)
    if (displayGameState === 'finished' || displayGameState === 'waiting') {
      setTimeLeft(0);
      setCountdownActive(false);
      return;
    }
    if ((displayGameState === 'playing' || displayGameState === 'showingAnswer') && phaseStartedAt && phaseDuration && !paused) {
      const elapsed = Math.floor((Date.now() - phaseStartedAt) / 1000);
      const remain = Math.max(0, (phaseDuration || 0) - elapsed);
      setTimeLeft(remain); // 서버 시간을 무조건 반영
      setCountdownActive(true);
    }
  }, [displayGameState, phaseStartedAt, phaseDuration, paused]);

  useEffect(() => {
    if (!countdownActive) return;
    if (displayGameState === 'finished' || displayGameState === 'waiting') return; // 종료/대기 상태에서는 타이머 중지
    if (!(displayGameState === 'playing' || displayGameState === 'showingAnswer')) return;
    if (paused) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdownActive, gameState, paused]);

  const mountedAtRef = useRef<number>(Date.now());
  // 자동제출은 호스트 원자 전이에서 처리 → 참가자는 화면 변화 없이 대기
  // (이 effect는 더 이상 제출을 발생시키지 않음)
  useEffect(() => {
    if (!(gameState === 'playing' || gameState === 'showingAnswer')) return;
    if (timeLeft > 0) return;
    const mountedForMs = Date.now() - mountedAtRef.current;
    if (mountedForMs < 1500) return;
    // 서버 기준 만료 검증만 수행하고, 제출은 호스트에서 일괄 처리
    const expired = !!(phaseStartedAt && phaseDuration && (Date.now() - phaseStartedAt) / 1000 >= phaseDuration);
    if (!expired) return;
    setCountdownActive(false);
  }, [timeLeft, gameState, phaseStartedAt, phaseDuration]);

  // ADJUST_TIME 이벤트는 phaseStartedAt/phaseDuration 업데이트로 자동 처리됨 (중복 제거)

  // 정오 결과 브로드캐스트 수신 → 안전망으로 재계산 및 표시
  useEffect(() => {
    const finalize = (payload: any) => {
      if (!currentQuestion || payload?.questionId !== currentQuestion.id || !player) return;
      const correct = currentQuestion.type === 'multiple'
        ? String(currentQuestion.correctAnswer) === String(player.currentAnswer)
        : String(currentQuestion.correctAnswer).toString().trim() === String((player.currentAnswer || '')).trim();
      setSubmissionResult(correct ? 'correct' : 'incorrect');
    };
    (syncManager as any).addEventListener?.('FINALIZE_ANSWERS', finalize);
    return () => {
      try { (syncManager as any).removeEventListener?.('FINALIZE_ANSWERS', finalize); } catch {}
    };
  }, [currentQuestion, player]);

  const handleAnswerSelect = (answer: string | number) => {
    if (!player || player.isEliminated || player.hasSubmitted) return;
    
    setSelectedAnswer(answer);
    
    if (currentPlayer) {
      actions.setAnswerDraft?.(currentPlayer.id, answer);
    }
  };

  // 수동 제출/취소는 자동 제출 흐름으로 대체됨 (경고 방지용 제거)

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isSelected = (answer: string | number): boolean => {
    if (selectedAnswer === null) return false;
    
    // 타입 안전한 비교
    if (typeof answer === typeof selectedAnswer) {
      return selectedAnswer === answer;
    }
    
    // 크로스 타입 비교 (number ↔ string)
    return String(selectedAnswer) === String(answer);
  };

  const getAnswerButtonClass = (answer: string | number): string => {
    let baseClass = 'answer-button';
    
    // 선택된 상태
    if (isSelected(answer)) {
      baseClass += ' selected';
    }
    
    // 정답 공개 시 색상
    if (showAnswer && currentQuestion) {
      if (currentQuestion.correctAnswer === answer) {
        baseClass += ' correct';
      } else if (isSelected(answer) && submissionResult === 'incorrect') {
        baseClass += ' incorrect';
      }
    }
    
    return baseClass;
  };

  if (!currentPlayer) {
    return <div className="game-player loading">플레이어 정보를 로딩 중...</div>;
  }

  // 방에 참여하지 않은 경우 (room이 없거나 플레이어가 목록에 없음)
  if (!room || !player) {
    return (
      <div className="game-player loading">
        <div>방에 연결 중...</div>
        <div>잠시만 기다려주세요</div>
      </div>
    );
  }

  return (
    <div className="game-player">
      <Toast />
      <header className="player-header">
        <div className="player-info">
          <div className="player-details">
            <span className="nickname">{player.nickname}</span>
            {player.team && (
              <span className="team-info">{player.team}팀</span>
            )}
          </div>
          <div className="player-score">
            점수: {player.score}점
          </div>
        </div>
        
        {(gameState === 'playing' || gameState === 'showingAnswer' || gameState === 'paused') && (
          <div className="game-timer">
            <div className={`timer ${timeLeft <= 5 ? 'warning' : ''}`}>
              ⏱️ {formatTime(timeLeft)}
            </div>
          </div>
        )}
      </header>

      <main className="player-main">
        <div className="question-section">
          {displayGameState === 'finished' ? (
            <div className="waiting-screen">
              <div className="waiting-content" style={{ width: '100%', maxWidth: '600px' }}>
                <h2 style={{ color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.3)', marginBottom: '20px' }}>🎉 게임 종료!</h2>
                <div style={{ color: 'white', textShadow: '1px 1px 3px rgba(0,0,0,0.4)', fontSize: '1.15rem', lineHeight: '1.4', marginBottom: '20px' }}>
                  <p style={{ margin: '5px 0' }}>
                    <strong>{player?.nickname}</strong> 님의 점수는 <strong style={{ fontSize: '1.3rem', color: '#ffc107' }}>{myScore}점</strong>입니다.
                  </p>
                  <p style={{ margin: '5px 0' }}>
                    팀 순위는 <strong style={{ fontSize: '1.2rem', color: '#ffc107' }}>
                    {(() => {
                      const teamRanks = Object.values(
                        playersForResult.reduce((acc: any, p: Player) => {
                          const key = p.team || p.nickname;
                          acc[key] = acc[key] || { team: key, score: 0 };
                          acc[key].score += p.score;
                          return acc;
                        }, {})
                      ).sort((a: any, b: any) => b.score - a.score);
                      const myTeamKey = playerForResult?.team || playerForResult?.nickname;
                      const myTeamIndex = teamRanks.findIndex((t: any) => t.team === myTeamKey);
                      return myTeamIndex >= 0 ? calculateRank(teamRanks, myTeamIndex) : '-';
                    })()}등</strong>, 개인 순위는 <strong style={{ fontSize: '1.2rem', color: '#ffc107' }}>
                    {(() => {
                      const individualRanks = [...playersForResult].sort((a, b) => b.score - a.score);
                      const myIndex = individualRanks.findIndex(p => p.id === playerForResult?.id);
                      return myIndex >= 0 ? calculateRank(individualRanks, myIndex) : '-';
                    })()}등</strong> 입니다.
                  </p>
                </div>
                
                {/* 순위 탭 */}
                <div style={{ background: 'white', borderRadius: '15px', padding: '20px', marginTop: '20px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <button 
                      onClick={() => setRankTab('team')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        fontWeight: 600,
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
                        padding: '12px',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        fontWeight: 600,
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
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {rankTab === 'team' ? (
                      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
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
                              padding: '12px',
                              marginBottom: '8px',
                              background: '#f8f9fa',
                              borderRadius: '8px',
                              border: '2px solid #e9ecef'
                            }}>
                              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#111', minWidth: '40px' }}>
                                {calculateRank(teamRanks, i)}위
                              </span>
                              <span style={{ flex: 1, fontWeight: 600, color: '#111', fontSize: '1rem' }}>
                                {t.team}
                              </span>
                              <span style={{ fontWeight: 700, color: '#ffc107', fontSize: '1.1rem' }}>
                                {t.score}점
                              </span>
                            </li>
                          ));
                        })()}
                      </ol>
                    ) : (
                      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {(() => {
                          const playersToShow = finalPlayers.length > 0 ? finalPlayers : players;
                          const individualRanks = [...playersToShow].sort((a, b) => b.score - a.score);
                          return individualRanks.map((p: Player, i: number) => (
                            <li key={p.id} style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              padding: '12px',
                              marginBottom: '8px',
                              background: '#f8f9fa',
                              borderRadius: '8px',
                              border: '2px solid #e9ecef'
                            }}>
                              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#111', minWidth: '40px' }}>
                                {calculateRank(individualRanks, i)}위
                              </span>
                              <span style={{ flex: 1, fontWeight: 600, color: '#111', fontSize: '1rem' }}>
                                {p.nickname}{p.team ? ` (${p.team})` : ''}
                              </span>
                              <span style={{ fontWeight: 700, color: '#ffc107', fontSize: '1.1rem' }}>
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
            </div>
          ) : displayGameState === 'waiting' ? (
            <div className="waiting-screen">
              <div className="waiting-content">
                <h2>대기중</h2>
                <p>문제가 시작될 때까지 기다려주세요</p>
                <div className="waiting-animation">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
              </div>
            </div>
          ) : currentQuestion ? (
            <div className="question-display">
              <div className="question-header">
                <span className="badge badge--neutral">
                  {currentQuestion.type === 'ox' ? 'OX' : currentQuestion.type === 'multiple' ? '객관식' : '단답형'}
                </span>
                <span className="badge badge--warn">{currentQuestion.score}점</span>
              </div>
              
              <h2 className="question-text">{renderSimpleFractions(currentQuestion.question)}</h2>
              {/* 정답 공개 단계에는 question-display에 정답을 보여준다 (일시정지에서도 유지) */}
              {displayGameState === 'showingAnswer' && showAnswer && currentQuestion && (
                <div className="answer-reveal">
                  <h3>정답</h3>
                  {currentQuestion.type === 'ox' && (
                    <div className="revealed-answer">
                      {currentQuestion.correctAnswer} ({currentQuestion.correctAnswer === 'O' ? '참' : '거짓'})
                    </div>
                  )}
                  {currentQuestion.type === 'multiple' && currentQuestion.options && (
                    <div className="revealed-answer">
                      {renderSimpleFractions(currentQuestion.options[currentQuestion.correctAnswer as number])}
                    </div>
                  )}
                  {currentQuestion.type === 'short' && (
                    <div className="revealed-answer">
                      {renderSimpleFractions(String(currentQuestion.correctAnswer))}
                    </div>
                  )}
                </div>
              )}
              
              {player.isEliminated && (
                <div className="elimination-notice">
                  <h3>탈락하였습니다</h3>
                  <p>게임을 관전할 수 있습니다</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="player-footer">
        <div className="answer-section">
          {gameState === 'waiting' ? (
            <div className="waiting-footer">
              <p>게임이 곧 시작됩니다...</p>
            </div>
          ) : (
            <>
              {currentQuestion && displayGameState !== 'showingAnswer' && displayGameState !== 'waiting' && displayGameState !== 'finished' && (
                <>
                  {currentQuestion.type === 'ox' && (
                    <div className="ox-answers">
                      <button 
                        className={getAnswerButtonClass('O')}
                        data-selected={String(isSelected('O'))}
                        onClick={() => handleAnswerSelect('O')}
                        disabled={player.isEliminated || gameState === 'paused'}
                      >
                        O (참)
                      </button>
                      <button 
                        className={getAnswerButtonClass('X')}
                        data-selected={String(isSelected('X'))}
                        onClick={() => handleAnswerSelect('X')}
                        disabled={player.isEliminated || gameState === 'paused'}
                      >
                        X (거짓)
                      </button>
                    </div>
                  )}
                  
                  {currentQuestion.type === 'multiple' && currentQuestion.options && (
                    <div className="multiple-answers">
                      {currentQuestion.options.map((option: string, index: number) => {
                        const selected = isSelected(index);
                        
                        return (
                          <button
                            key={index}
                            className={`answer-button ${selected ? 'selected' : ''}`}
                            data-selected={String(selected)}
                            onClick={() => handleAnswerSelect(index)}
                            disabled={player.hasSubmitted || player.isEliminated || gameState === 'paused'}
                          >
                            <span className="option-number">
                              {index + 1}
                            </span>
                            <span className="option-text">{renderSimpleFractions(option)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  
                  {currentQuestion.type === 'short' && (
                    <div className="short-answer">
                      <input
                        type="text"
                        value={(selectedAnswer as string) || ''}
                        onChange={(e) => handleAnswerSelect(e.target.value)}
                        placeholder="정답을 입력하세요"
                        disabled={player.isEliminated || gameState === 'paused'}
                        className="short-input"
                      />
                    </div>
                  )}
                </>
              )}
              
              {displayGameState === 'showingAnswer' && showAnswer && currentQuestion && (
                <div className="my-answer">
                  <span className="my-answer-label">내 답안:</span>
                  <span className="my-answer-text">
                    {currentQuestion.type === 'multiple' && typeof player.currentAnswer !== 'undefined'
                      ? currentQuestion.options?.[Number(player.currentAnswer)]
                      : String(player.currentAnswer ?? '')}
                  </span>
                  {submissionResult && (
                    <span className={`my-answer-badge ${submissionResult === 'correct' ? 'badge-correct' : 'badge-incorrect'}`}>
                      {submissionResult === 'correct' ? '정답입니다' : '오답입니다'}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </footer>

      {/* 우측 하단 내 아바타 미리보기 (크기 2배) */}
      <div style={{ position: 'fixed', right: 12, bottom: 12, borderRadius: 12, padding: 0, color: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <AvatarDisplay avatar={player.avatar} size={160} />
        <span style={{ fontWeight: 700, color: '#111', textShadow: '0 1px 2px rgba(255,255,255,0.6)', fontSize: 18 }}>{player.nickname}</span>
      </div>
    </div>
  );
};

export default GamePlayer;
