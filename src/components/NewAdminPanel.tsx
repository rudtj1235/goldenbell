/**
 * 새로운 모듈 기반 관리자 패널
 * 실시간 동기화와 참여자 현황 관리
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Question, GameSettings, QuestionType } from '../types/game';
import { useNewGameContext } from '../contexts/NewGameContext';
import Avatar from 'avataaars2';
import QuestionModal from './QuestionModal';
import QuestionStack from './QuestionStack';
import eventBus from '../services/EventBus';
import roomManager from '../services/RoomManager';
import syncManager from '../services/SyncManager';
import './AdminPanel.css';
import LeaderboardModal from './Leaderboard';
import AiQuestionModal from './AiQuestionModal';
import { AiQuestion } from '../services/ai';

const NewAdminPanel: React.FC = () => {
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const { state, actions } = useNewGameContext();
  const navigate = useNavigate();

  const { 
    room, 
    questions, 
    players, 
    gameState, 
    currentQuestionIndex, 
    gameSettings,
    hasStarted,
    isLoading
  } = state;

  // 호스트 활동 주기적 업데이트
  useEffect(() => {
    if (!room) {
      // 초기 하이드레이션 중에는 리다이렉트하지 않음
      if (isLoading) return;
      return;
    }

    // 초기 호스트 활동 등록
    actions.updateHostActivity(room.code);

    // 주기적으로 호스트 활동 업데이트 (5초마다)
    const activityInterval = setInterval(() => {
      actions.updateHostActivity(room.code);
    }, 5000);

    // 이벤트 리스너 등록
    const unsubscribers = [
      eventBus.on('PLAYER_JOIN', handlePlayerJoin),
      eventBus.on('PLAYER_LEAVE', handlePlayerLeave),
      eventBus.on('GAME_STATE_CHANGE', handleGameStateChange),
      eventBus.on('ROOM_DELETED', handleRoomDeleted)
    ];

    // 페이지 언로드 시 호스트 비활성 (10초 후 삭제 타이머 작동)
    const handleBeforeUnload = () => {
      try { roomManager.markHostInactive(room.code); } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(activityInterval);
      unsubscribers.forEach(unsub => unsub());
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // StrictMode 이중 마운트로 인한 즉시 삭제 방지: cleanup에서는 삭제하지 않음
    };
  }, [room, actions, navigate, isLoading]);

  // 진행 로직은 컨텍스트에서 단일 스케줄러가 담당하므로, 관리자 페이지에서는 보조 타이머를 두지 않습니다.

  const handlePlayerJoin = (player: any) => {
    console.log('👤 새 참여자:', player.nickname);
  };

  const handlePlayerLeave = (playerId: string) => {
    console.log('👤 참여자 퇴장:', playerId);
  };

  const handleGameStateChange = (data: any) => {
    console.log('🎮 게임 상태 변경:', data);
  };

  const handleRoomDeleted = (roomCode: string) => {
    if (room?.code === roomCode) {
      alert('방이 삭제되었습니다.');
      navigate('/');
    }
  };

  const handleDeleteQuestion = (questionId: string) => {
    actions.deleteQuestion(questionId);
  };

  const handleReorderQuestions = (reorderedQuestions: Question[]) => {
    actions.reorderQuestions(reorderedQuestions);
  };

  const handleStartGame = () => {
    if (questions.length === 0) {
      alert('문제를 먼저 추가해주세요.');
      return;
    }
    actions.startGame();
  };

  const handlePauseGame = () => {
    actions.pauseGame();
  };

  const handleResumeGame = () => {
    actions.resumeGame();
  };

  const handleSubmitQuestion = () => {
    actions.nextQuestion();
  };

  const handleRevealAnswer = () => {
    actions.showAnswer();
  };

  const handleGameSettingsChange = (newSettings: Partial<GameSettings>) => {
    actions.updateGameSettings(newSettings);
  };

  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const handleShowLeaderboard = () => setShowLeaderboard(true);
  const [showAiModal, setShowAiModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toCsvValue = (value: any) => {
    const str = value === undefined || value === null ? '' : String(value);
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const handleDownloadQuestions = () => {
    if (!questions || questions.length === 0) {
      alert('다운로드할 문제가 없습니다.');
      return;
    }
    if (!window.confirm('현재 문제 세트를 파일로 저장하시겠습니까?')) return;

    const headers = ['type','question','score','timeLimit','options','correctAnswer'];
    const rows = questions.map(q => {
      const options = Array.isArray(q.options) ? JSON.stringify(q.options) : '';
      return [
        q.type,
        q.question,
        typeof q.score === 'number' ? q.score : 10,
        typeof q.timeLimit === 'number' ? q.timeLimit : gameSettings.timeLimit,
        options,
        q.correctAnswer
      ];
    });
    const csv = [headers.map(toCsvValue).join(','), ...rows.map(r => r.map(toCsvValue).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0,10);
    a.download = `goldenbell_questions_${room?.code || 'room'}_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let cur: string[] = [];
    let val = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i+1] === '"') { val += '"'; i++; }
          else { inQuotes = false; }
        } else {
          val += ch;
        }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { cur.push(val); val = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (val !== '' || cur.length > 0) { cur.push(val); rows.push(cur); cur = []; val = ''; }
          // handle \r\n by skipping next if needed
          if (ch === '\r' && text[i+1] === '\n') i++;
        } else { val += ch; }
      }
    }
    if (val !== '' || cur.length > 0) { cur.push(val); rows.push(cur); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const rows = parseCsv(text);
        if (rows.length === 0) throw new Error('빈 파일');
        const header = rows[0].map(h => h.trim());
        const colIndex = (name: string) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
        const idx = {
          type: colIndex('type'),
          question: colIndex('question'),
          score: colIndex('score'),
          timeLimit: colIndex('timeLimit'),
          options: colIndex('options'),
          correctAnswer: colIndex('correctAnswer')
        } as const;
        const missing = Object.entries(idx).filter(([,v]) => v < 0).map(([k]) => k);
        if (missing.length) throw new Error('누락된 컬럼: ' + missing.join(', '));

        const imported: Question[] = rows.slice(1).map((r) => {
          const rawType = r[idx.type] || '';
          const type = (String(rawType).toLowerCase() as QuestionType);
          const question = r[idx.question] || '';
          const score = parseInt(String(r[idx.score] || '10')) || 10;
          const timeLimit = parseInt(String(r[idx.timeLimit] || String(gameSettings.timeLimit))) || gameSettings.timeLimit;
          let options: string[] | undefined;
          const rawOptions = r[idx.options];
          if (rawOptions) {
            try { options = JSON.parse(rawOptions); }
            catch { options = String(rawOptions).split('|').map(s => s.trim()).filter(Boolean); }
          }
          const rawCorrect = r[idx.correctAnswer];
          let correctAnswer: string | number = rawCorrect ?? '';
          if (type === 'multiple' && options && options.length) {
            const num = Number(correctAnswer);
            if (!isNaN(num)) correctAnswer = num; else {
              const found = options.findIndex(o => String(o) === String(correctAnswer));
              correctAnswer = found >= 0 ? found : 0;
            }
          }
          return {
            id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            type,
            question,
            score,
            timeLimit,
            options,
            correctAnswer
          } as Question;
        }).filter(q => q.question && q.type);

        if (imported.length === 0) throw new Error('유효한 문제가 없습니다.');

        if (!window.confirm(`현재 문제를 ${imported.length}개의 항목으로 교체하시겠습니까?`)) return;
        actions.reorderQuestions(imported);
        alert(`문제 ${imported.length}개를 불러왔습니다.`);
      } catch (err: any) {
        console.error('문제 업로드 실패:', err);
        alert('업로드에 실패했습니다: ' + (err?.message || String(err)));
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleOpenGameHost = () => {
    // 새 탭에서 진행 페이지 열기
    window.open('/game-host', '_blank');
  };

  const handleBackToMain = () => {
    // 방 삭제 후 메인으로 이동
    if (room) {
      roomManager.deleteRoom(room.code);
    }
    actions.resetGame();
    navigate('/');
  };

  const handleQuestionSubmit = (question: Omit<Question, 'id'>) => {
    const newQuestion: Question = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      ...question,
    };
    actions.addQuestion(newQuestion);
    setShowQuestionModal(false);
  };

  if (!room) {
    return (
      <div className="admin-panel">
        <div className="loading-message">
          <h2>방 정보를 불러오는 중...</h2>
          <p>잠시만 기다려주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <button className="back-btn" onClick={handleBackToMain}>
          ← 뒤로가기
        </button>
        <div className="room-info">
          <h1>골든벨 관리자</h1>
          <div className="room-details">
            <span className="room-code">방 코드: <strong>{room.code}</strong></span>
            <span className="room-subject">주제: {room.subject}</span>
            <span className="room-type">
              {room.isPublic ? '🌐 공개방' : '🔒 비공개방'}
            </span>
          </div>
        </div>
      </header>

      <div className="admin-content">
        <button 
          className="open-host-floating" 
          onClick={handleOpenGameHost}
          disabled={!room}
        >
          진행페이지 열기
        </button>
        <div className="left-panel">
          <div className="control-section">
            <h3>게임 제어</h3>
            <div className="control-buttons">
              {/* 시작 / 일시정지 / 넘어가기 / 종료 순서, 시작 전에는 일시정지/넘어가기 비활성 */}
              <button 
                className="start-btn control-btn" 
                onClick={handleStartGame}
                disabled={questions.length === 0 || gameState === 'playing' || gameState === 'showingAnswer'}
              >
                {hasStarted ? '다시 시작' : '시작'}
              </button>

              <button className="pause-btn control-btn" onClick={handlePauseGame} disabled={!(gameState === 'playing' || gameState === 'showingAnswer')}>
                일시정지
              </button>

              <div className="time-controls">
                <input type="number" placeholder="시간" className="time-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const v = parseInt((e.target as HTMLInputElement).value);
                      if (!isNaN(v)) {
                        if (gameState === 'playing' || gameState === 'showingAnswer' || gameState === 'paused') {
                          eventBus.emit('ADJUST_TIME', v);
                          syncManager.broadcast('ADJUST_TIME', v);
                        }
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
                <span className={`time-unit ${!(gameState === 'playing' || gameState === 'showingAnswer' || gameState === 'paused') ? 'disabled' : ''}`}>(초)</span>
                <button className="control-btn" onClick={() => { eventBus.emit('ADJUST_TIME', 5); syncManager.broadcast('ADJUST_TIME', 5); }} disabled={!(gameState === 'playing' || gameState === 'showingAnswer' || gameState === 'paused')}>+</button>
                <button className="control-btn" onClick={() => { eventBus.emit('ADJUST_TIME', -5); syncManager.broadcast('ADJUST_TIME', -5); }} disabled={!(gameState === 'playing' || gameState === 'showingAnswer' || gameState === 'paused')}>-</button>
              </div>

              <button className="submit-btn control-btn" onClick={() => {
                if (gameState === 'playing') {
                  actions.showAnswer();
                } else if (gameState === 'showingAnswer') {
                  actions.nextQuestion();
                }
              }} disabled={!(gameState === 'playing' || gameState === 'showingAnswer')}>
                넘어가기
              </button>

              <button className="control-btn" onClick={() => actions.endGame()}>
                종료
              </button>

              <button 
                className="leaderboard-btn" 
                onClick={handleShowLeaderboard}
              >
                순위
              </button>
            </div>
          </div>

          {/* 실시간 참여자 현황 */}
          <div className="participants-section">
            <h3>실시간 참여자 현황</h3>
            {players.length === 0 ? (
              <div className="no-participants">
                <p>🎯 아직 참여자가 없습니다</p>
                <small>방 코드: <strong>{room.code}</strong>를 공유해주세요</small>
              </div>
            ) : (
              <div className="participants-list">
                {players.map(player => (
                  <div key={player.id} className="participant-item">
                    <div className="participant-avatar">
                      <Avatar {...player.avatar} />
                    </div>
                    <div className="participant-info">
                      <span className="participant-name">{player.nickname}</span>
                      <span className="participant-team">
                        {player.team || '개인'} {player.team ? '팀' : ''}
                      </span>
                      <span className="participant-status">
                        {player.isEliminated ? '❌ 탈락' : '✅ 참여중'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="right-panel">
          <div className="questions-section">
            <div className="questions-header">
              <h3>문제 관리</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  className="btn-primary add-question-btn"
                  onClick={() => setShowQuestionModal(true)}
                >
                  + 문제 추가
                </button>
                <button 
                  className="btn-primary add-question-btn ai-add-btn"
                  onClick={() => setShowAiModal(true)}
                >
                  AI 문제 추가
                </button>
                <button 
                  className="btn-primary"
                  onClick={handleDownloadQuestions}
                >
                  문제 다운로드(CSV)
                </button>
                <button 
                  className="btn-primary"
                  onClick={handleUploadClick}
                >
                  문제 업로드(CSV)
                </button>
                <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
              </div>
            </div>
            
            <QuestionStack
              questions={questions}
              onDelete={handleDeleteQuestion}
              onReorder={handleReorderQuestions}
              currentIndex={currentQuestionIndex}
              gameState={gameState}
              hasStarted={hasStarted}
            />
          </div>

          <div className="settings-section">
            <h3>타이머 설정</h3>
            <div className="setting-group">
              <label>문제 시간(초)</label>
              <input
                type="number"
                value={gameSettings.timeLimit}
                min={1}
                max={300}
                onChange={(e) => handleGameSettingsChange({ timeLimit: parseInt(e.target.value) || 1 })}
              />
              <small>문제가 공개되는 시간입니다.</small>
            </div>
            <div className="setting-group">
              <label>정답 공개 시간(초)</label>
              <input
                type="number"
                value={gameSettings.answerRevealTime}
                min={1}
                max={120}
                onChange={(e) => handleGameSettingsChange({ answerRevealTime: parseInt(e.target.value) || 1 })}
              />
              <small>정답을 공개하는 시간입니다.</small>
            </div>
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!gameSettings.autoMode}
                  onChange={(e) => handleGameSettingsChange({ autoMode: !e.target.checked })}
                />
                수동 모드
              </label>
              <small>수동 모드는 다음 단계로 넘어갈 때 직접 ‘넘어가기’를 눌러야 합니다.</small>
            </div>
          </div>
        </div>
      </div>

      {showQuestionModal && (
        <QuestionModal
          onSubmit={handleQuestionSubmit}
          onClose={() => setShowQuestionModal(false)}
        />
      )}
      {showAiModal && (
        <AiQuestionModal
          onClose={() => setShowAiModal(false)}
          onGenerate={(list: AiQuestion[]) => {
            console.info('[AI_GEN_WIRE] 수신 항목 수', list.length);
            const mapped = list.map(q => ({
              id: q.id || 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
              type: q.type as QuestionType,
              question: q.question,
              score: typeof q.score === 'number' ? q.score : 10,
              timeLimit: gameSettings.timeLimit,
              options: q.options,
              correctAnswer: q.correctAnswer,
            })) as any[];
            actions.addQuestionsBulk(mapped as any);
            setShowAiModal(false);
          }}
        />
      )}
      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}
    </div>
  );
};

export default NewAdminPanel;
