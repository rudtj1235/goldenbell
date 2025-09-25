import React, { useState, useEffect, useRef } from 'react';
import Avatar from 'avataaars2';
import { useNavigate } from 'react-router-dom';
import { Question, Player } from '../types/game';
import syncManager from '../services/SyncManager';
import { useNewGameContext } from '../contexts/NewGameContext';
import './GamePlayer.css';

const GamePlayer: React.FC = () => {
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | number>('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<'correct' | 'incorrect' | null>(null);
  const [countdownActive, setCountdownActive] = useState(false);
  const navigate = useNavigate();
  
  const { state, actions } = useNewGameContext();
  const { room, questions, gameState, currentQuestionIndex, players, gameSettings, phaseStartedAt, phaseDuration, paused } = state;
  
  const currentQuestion = (gameState === 'playing' || gameState === 'showingAnswer') ? (questions[currentQuestionIndex] || null) : null;
  const currentQuestionId = currentQuestion?.id || null;

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
  const player = currentPlayer ? players.find(p => p.id === currentPlayer.id) : null;
  const myScore = player ? player.score : 0;
  const teamScore = player ? (player.team ? players.filter(p => p.team === player.team).reduce((s, p) => s + (p.score || 0), 0) : player.score) : 0;

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
  }, [navigate]);

  const prevGameStateRef = useRef<string | null>(null);
  const prevQuestionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevGameState = prevGameStateRef.current;
    const prevQuestionId = prevQuestionIdRef.current;
    const questionId = currentQuestion?.id || null;

    // 전이 감지: 상태/문제 변경시에만 타이머/표시 초기화
    const enteredPlaying = gameState === 'playing' && prevGameState !== 'playing';
    const questionChanged = questionId && questionId !== prevQuestionId;
    const enteredAnswer = gameState === 'showingAnswer' && prevGameState !== 'showingAnswer';

    if ((enteredPlaying || questionChanged) && currentQuestion) {
      setTimeLeft(gameSettings.timeLimit);
      setShowAnswer(false);
      // 새 문제로 바뀔 때만 입력/결과 초기화
      if (questionChanged) {
        setSelectedAnswer('');
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
    } else if (gameState === 'waiting') {
      setTimeLeft(0);
      setShowAnswer(false);
      setCountdownActive(false);
    } else if (gameState === 'finished') {
      setTimeLeft(0);
      setShowAnswer(false);
      setCountdownActive(false);
    }

    prevGameStateRef.current = gameState;
    prevQuestionIdRef.current = questionId;
  }, [gameState, currentQuestion, gameSettings.timeLimit, gameSettings.answerRevealTime]);

  // 플레이어 저장된 답안과 입력값 동기화(문제 제시 중에만)
  useEffect(() => {
    if (gameState === 'playing' && player && typeof player.currentAnswer !== 'undefined') {
      setSelectedAnswer(player.currentAnswer);
    }
  }, [gameState, player]);

  useEffect(() => {
    // 서버/브로드캐스트 기준 남은 시간 계산
    if ((gameState === 'playing' || gameState === 'showingAnswer') && phaseStartedAt && phaseDuration && !paused) {
      const elapsed = Math.floor((Date.now() - phaseStartedAt) / 1000);
      const remain = Math.max(0, (phaseDuration || 0) - elapsed);
      setTimeLeft(remain);
      setCountdownActive(true);
    }
  }, [gameState, phaseStartedAt, phaseDuration, paused]);

  useEffect(() => {
    if (!countdownActive) return;
    if (!(gameState === 'playing' || gameState === 'showingAnswer')) return;
    if (paused) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdownActive, gameState, paused]);

  const mountedAtRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!(gameState === 'playing' || gameState === 'showingAnswer')) return;
    if (timeLeft > 0) return;
    const mountedForMs = Date.now() - mountedAtRef.current;
    if (mountedForMs < 1500) return;
    // 서버 기준 만료 검증
    const expired = !!(phaseStartedAt && phaseDuration && (Date.now() - phaseStartedAt) / 1000 >= phaseDuration);
    if (!expired) return;
    setCountdownActive(false);
    if (gameState === 'playing') {
      if (player && !player.hasSubmitted && currentPlayer) {
        const answer = selectedAnswer !== '' ? selectedAnswer : (currentQuestion?.type === 'short' ? '' : selectedAnswer);
        actions.submitAnswer(currentPlayer.id, answer ?? '');
      }
    }
  }, [timeLeft, gameState, player, currentPlayer, selectedAnswer, currentQuestion, actions, phaseStartedAt, phaseDuration]);

  // 시간 추가/감소 동기화 수신
  useEffect(() => {
    const handler = (delta: number) => setTimeLeft(prev => Math.max(0, prev + (Number(delta) || 0)));
    (syncManager as any).addEventListener?.('ADJUST_TIME', handler);
    return () => {
      try { (syncManager as any).removeEventListener?.('ADJUST_TIME', handler); } catch {}
    };
  }, []);

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
    if (!player || player.isEliminated) return;
    setSelectedAnswer(answer);
    if (currentPlayer) {
      actions.setAnswerDraft?.(currentPlayer.id, answer);
    }
  };

  const handleSubmit = () => {
    // 수동 제출 버튼은 보조 수단(자동 제출이 기본)
    if (!player || !currentPlayer || player.hasSubmitted || player.isEliminated || gameState !== 'playing') return;
    const answer = selectedAnswer !== '' ? selectedAnswer : (currentQuestion?.type === 'short' ? '' : selectedAnswer);
    actions.submitAnswer(currentPlayer.id, answer ?? '');
  };

  const handleCancelSubmission = () => {
    if (!player || !currentPlayer || gameState !== 'playing') return;
    
    // 제출 취소 (새 컨텍스트 액션)
    (actions as any).cancelSubmission?.(currentPlayer.id);
    
    setSelectedAnswer('');
    setSubmissionResult(null);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getAnswerButtonClass = (answer: string | number, index?: number): string => {
    let baseClass = 'answer-button';
    
    if (selectedAnswer === answer || selectedAnswer === index) {
      baseClass += ' selected';
    }
    
    if (showAnswer && currentQuestion) {
      if (currentQuestion.correctAnswer === answer || currentQuestion.correctAnswer === index) {
        baseClass += ' correct';
      } else if ((selectedAnswer === answer || selectedAnswer === index) && submissionResult === 'incorrect') {
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
        
        <div className="game-timer">
          <div className={`timer ${timeLeft <= 5 ? 'warning' : ''}`}>
            ⏱️ {formatTime(timeLeft)}
          </div>
        </div>
      </header>

      <main className="player-main">
        <div className="question-section">
          {gameState === 'finished' ? (
            <div className="waiting-screen">
              <div className="waiting-content">
                <h2>축하합니다!</h2>
                <p>당신의 점수는 총 <strong>{myScore}</strong>점 입니다.</p>
                {player?.team ? (
                  <p>당신의 팀 점수는 총 <strong>{teamScore}</strong>점 입니다.</p>
                ) : (
                  <p>개인전으로 진행되었습니다.</p>
                )}
              </div>
            </div>
          ) : gameState === 'waiting' ? (
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
                <span className="question-type">
                  {currentQuestion.type === 'ox' ? 'OX 문제' :
                   currentQuestion.type === 'multiple' ? '객관식' : '주관식'}
                </span>
                <span className="question-score">{currentQuestion.score}점</span>
              </div>
              
              <h2 className="question-text">{currentQuestion.question}</h2>
              
              {showAnswer && (
                <div className={`result-indicator ${submissionResult || ''}`}>
                  {submissionResult === 'correct' ? '정답입니다! 🎉' : submissionResult === 'incorrect' ? '오답입니다 😔' : '정답 공개'}
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
          {currentQuestion && gameState === 'playing' && (
            <>
              {currentQuestion.type === 'ox' && (
                <div className="ox-answers">
                  <button 
                    className={getAnswerButtonClass('O')}
                    onClick={() => handleAnswerSelect('O')}
                    disabled={player.hasSubmitted || player.isEliminated}
                  >
                    O (참)
                  </button>
                  <button 
                    className={getAnswerButtonClass('X')}
                    onClick={() => handleAnswerSelect('X')}
                    disabled={player.hasSubmitted || player.isEliminated}
                  >
                    X (거짓)
                  </button>
                </div>
              )}
              
              {currentQuestion.type === 'multiple' && currentQuestion.options && (
                <div className="multiple-answers">
                  {currentQuestion.options.map((option, index) => (
                    <button
                      key={index}
                      className={getAnswerButtonClass(option, index)}
                      onClick={() => handleAnswerSelect(index)}
                      disabled={player.hasSubmitted || player.isEliminated}
                    >
                      <span className="option-number">{index + 1}</span>
                      <span className="option-text">{option}</span>
                    </button>
                  ))}
                </div>
              )}
              
              {currentQuestion.type === 'short' && (
                <div className="short-answer">
                  <input
                    type="text"
                    value={selectedAnswer as string}
                    onChange={(e) => handleAnswerSelect(e.target.value)}
                    placeholder="정답을 입력하세요"
                    disabled={player.hasSubmitted || player.isEliminated}
                    className="short-input"
                  />
                </div>
              )}
              
              {/* 제출 버튼 제거: 타이머 종료 시 자동 제출 */}
            </>
          )}
          
          {gameState === 'showingAnswer' && showAnswer && currentQuestion && (
            <div className="answer-reveal">
              <h3>정답</h3>
              {currentQuestion.type === 'ox' && (
                <div className="revealed-answer">
                  {currentQuestion.correctAnswer} ({currentQuestion.correctAnswer === 'O' ? '참' : '거짓'})
                </div>
              )}
              {currentQuestion.type === 'multiple' && currentQuestion.options && (
                <div className="revealed-answer">
                  {currentQuestion.options[currentQuestion.correctAnswer as number]}
                </div>
              )}
              {currentQuestion.type === 'short' && (
                <div className="revealed-answer">
                  {currentQuestion.correctAnswer}
                </div>
              )}
            </div>
          )}
          
          {gameState === 'waiting' && (
            <div className="waiting-footer">
              <p>게임이 곧 시작됩니다...</p>
            </div>
          )}
        </div>
      </footer>

      {/* 우측 하단 내 아바타 미리보기 */}
      <div style={{ position: 'fixed', right: 12, bottom: 12, borderRadius: 12, padding: 0, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', background: getBackgroundColor(player.avatar?.backgroundColor || 'PastelBlue'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Avatar
            style={{ width: 70, height: 70 }}
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
        <span style={{ fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>{player.nickname}</span>
      </div>
    </div>
  );
};

export default GamePlayer;
