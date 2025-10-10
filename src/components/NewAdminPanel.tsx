/**
 * 새로운 모듈 기반 관리자 패널
 * 실시간 동기화와 참여자 현황 관리
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Question, GameSettings, QuestionType, Player } from '../types/game';
import { useNewGameContext } from '../contexts/NewGameContext';
import AvatarDisplay from './AvatarDisplay';
// import syncManager from '../services/SyncManager'; // 사용하지 않음
import QuestionModal from './QuestionModal';
import EditQuestionModal from './EditQuestionModal';
import QuestionStack from './QuestionStack';
import eventBus from '../services/EventBus';
import roomManager from '../services/RoomManager';
import { firestoreSyncManager as syncManagerFs } from '../services/FirestoreSyncManager';
import Toast from './Toast';
import './AdminPanel.css';
import './GameHost.css'; // player-card 스타일을 위해 추가
import LeaderboardModal from './Leaderboard';
import AiQuestionModal from './AiQuestionModal';
import { AiQuestion } from '../services/ai';

const NewAdminPanel: React.FC = () => {
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
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
  
  // finished 상태도 그대로 표시 (UI 유지)
  const adminGameState = gameState;
  const adminPlayers = players;
  
  // 버튼 입력 최소 간격 (1초)
  const lastActionTimeRef = useRef<number>(0);
  
  const canPerformAction = () => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < 1000) {
      return false;
    }
    lastActionTimeRef.current = now;
    return true;
  };

  // 브라우저 닫을 때 방 정리
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (room) {
        try {
          syncManagerFs.deleteRoom();
        } catch (e) {
          console.error('방 삭제 실패:', e);
        }
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [room]);

  // 호스트 활동 주기적 업데이트 및 방 자동 복구
  useEffect(() => {
    if (!room) {
      // 초기 하이드레이션 중에는 리다이렉트하지 않음
      if (isLoading) return;
      
      // 로그인한 사용자가 만든 방이 있는지 확인하여 자동 복구
      const tryAutoReconnect = async () => {
        try {
          const currentUid = (window as any).firebaseAuthUid;
          if (!currentUid) return;
          
          // Firestore에서 현재 사용자가 호스트인 방 찾기
          const { collection, query, where, getDocs } = await import('firebase/firestore');
          const { db } = await import('../config/firebase');
          
          const roomsRef = collection(db, 'game_rooms');
          const q = query(roomsRef, where('room.hostId', '==', currentUid));
          const snap = await getDocs(q);
          
          if (!snap.empty) {
            const roomDoc = snap.docs[0];
            const roomData = roomDoc.data();
            await (syncManagerFs as any).connectToRoom(roomDoc.id);
            console.log('🔄 자동 방 복구:', roomDoc.id);
          }
        } catch (e) {
          console.warn('방 자동 복구 실패:', e);
        }
      };
      
      tryAutoReconnect();
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
    const msg = { message: `👤 ${player.nickname} 님이 참여했습니다.`, type: 'info' };
    syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
  };

  const handlePlayerLeave = (playerId: string) => {
    const player = adminPlayers.find(p => p.id === playerId);
    if (player) {
      const msg = { message: `👋 ${player.nickname} 님이 퇴장했습니다.`, type: 'warning' };
      syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
    }
  };

  const handleGameStateChange = (data: any) => {
    // 상태 변경 처리
  };

  const handleRoomDeleted = (roomCode: string) => {
    if (room?.code === roomCode) {
      alert('방이 삭제되었습니다.');
      navigate('/');
    }
  };

  const handleDeleteQuestion = (questionId: string) => {
    // 낙관적 업데이트: UI에서 즉시 삭제 (백그라운드 처리)
    actions.deleteQuestion(questionId);
  };

  const handleReorderQuestions = (reorderedQuestions: Question[]) => {
    actions.reorderQuestions(reorderedQuestions);
  };

  const handleStartGame = () => {
    if (!canPerformAction()) return;
    if (questions.length === 0) {
      alert('문제를 먼저 추가해주세요.');
      return;
    }
    actions.startGame();
    
    const msg = { message: '🎮 게임이 시작되었습니다!', type: 'success' };
    syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
  };

  const handlePauseGame = () => {
    if (!canPerformAction()) return;
    actions.pauseGame();
    
    const remain = state.phaseDuration || 0;
    const msg = { message: `⏸️ 게임이 일시정지되었습니다. (남은 시간: ${remain}초)`, type: 'warning' };
    syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
  };

  const handleResumeGame = () => {
    if (!canPerformAction()) return;
    actions.resumeGame();
    
    const remain = state.phaseDuration || 0;
    const msg = { message: `▶️ 게임이 재개되었습니다. (남은 시간: ${remain}초)`, type: 'info' };
    syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
  };

  const handleEndGame = () => {
    if (!canPerformAction()) return;
    if (!window.confirm('게임을 종료하시겠습니까?')) return;
    
    actions.endGame();
    
    const msg = { message: '🏁 게임이 종료되었습니다!', type: 'success' };
    syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
  };

  const handleSubmitQuestion = () => {
    if (!canPerformAction()) return;
    
    const nextIndex = currentQuestionIndex + 1;
    actions.nextQuestion();
    
    if (nextIndex < questions.length) {
      const msg = { message: `➡️ 다음 문제로 넘어갑니다. (${nextIndex + 1}/${questions.length})`, type: 'info' };
      syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
    }
  };

  const handleRevealAnswer = () => {
    if (!canPerformAction()) return;
    actions.showAnswer();
    
    const msg = { message: '✅ 정답이 공개되었습니다!', type: 'success' };
    syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
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

        // CSV 업로드 시에도 연속된 번호 적용
        const getNextQuestionNumber = (): number => {
          if (questions.length === 0) return 1;
          
          const existingNumbers = questions
            .map(q => {
              const match = q.id.match(/^q_(\d+)_/);
              return match ? parseInt(match[1], 10) : 0;
            })
            .filter(num => num > 0);
          
          return existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
        };

        let nextNumber = getNextQuestionNumber();
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
            id: `q_${nextNumber++}_${Date.now()}`,
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
        
        // 문제 교체 및 게임 상태 초기화
        actions.reorderQuestions(imported);
        
        // CSV 업로드 시에는 완료 상태를 초기화하기 위해 hasStarted를 false로 설정
        if (hasStarted) {
          syncManagerFs.updateGameData({
            questions: imported,
            gameState: 'waiting',
            currentQuestionIndex: 0,
            hasStarted: false, // 이것이 핵심!
            paused: false,
            players: state.players,
            room: state.room,
            gameSettings: state.gameSettings,
            phaseStartedAt: null,
            phaseDuration: null
          } as any);
        }
        
        const msg = { message: `📄 CSV에서 ${imported.length}개의 문제를 불러왔습니다!`, type: 'success' };
        syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
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

  const handleBackToMain = async () => {
    // 방 삭제 후 메인으로 이동 (Firestore 삭제)
    try {
      if (room) {
        await syncManagerFs.deleteRoom();
      }
    } catch (e) {
      console.error('방 삭제 실패:', e);
    } finally {
      actions.resetGame();
      navigate('/');
    }
  };

  const handleQuestionSubmit = (question: Omit<Question, 'id'>) => {
    // 다음 문제 번호 계산 (기존 문제들의 최대 번호 + 1)
    const getNextQuestionNumber = (): number => {
      if (questions.length === 0) return 1;
      
      // 기존 문제 ID에서 번호 추출 (q_숫자_ 형태)
      const existingNumbers = questions
        .map(q => {
          const match = q.id.match(/^q_(\d+)_/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => num > 0);
      
      // 최대 번호 + 1 반환
      return existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    };

    const nextNumber = getNextQuestionNumber();
    const newQuestion: Question = {
      id: `q_${nextNumber}_${Date.now()}`,
      ...question,
    };
    actions.addQuestion(newQuestion);
    setShowQuestionModal(false);
    const msg = { message: '✅ 문제가 추가되었습니다.', type: 'success' };
    syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
  };

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setShowEditModal(true);
  };

  const handleEditSubmit = (updatedQuestion: Question) => {
    actions.updateQuestion(updatedQuestion);
    setShowEditModal(false);
    setEditingQuestion(null);
    const msg = { message: '✏️ 문제가 수정되었습니다.', type: 'success' };
    syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
  };

  // 팀별 정렬 함수
  const sortPlayersByTeam = (players: Player[]): Player[] => {
    return [...players].sort((a, b) => {
      // 1. 팀별 정렬 (개인 → A → B → C → ... → H)
      const getTeamOrder = (team?: string): number => {
        if (!team) return 0; // 개인전이 가장 앞
        return team.charCodeAt(0) - 64; // A=1, B=2, C=3, ...
      };
      
      const teamOrderA = getTeamOrder(a.team);
      const teamOrderB = getTeamOrder(b.team);
      
      if (teamOrderA !== teamOrderB) {
        return teamOrderA - teamOrderB;
      }
      
      // 2. 같은 팀 내에서는 점수 순
      if (a.team === b.team) {
        return b.score - a.score;
      }
      
      // 3. 개인전끼리는 점수 순
      return b.score - a.score;
    });
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
      <Toast />
      <header className="admin-header">
        <div className="header-left">
          <button className="btn btn--light" onClick={handleBackToMain}>
            나가기
          </button>
        </div>
        <div className="room-info">
          <h1>골든벨 관리자 페이지</h1>
          <div className="room-details">
            <span className="badge badge--neutral">방 코드: <strong>{room.code}</strong></span>
            <span className="badge badge--neutral">주제: {room.subject}</span>
            <span className="badge badge--neutral">
              {room.isPublic ? '공개방' : '비공개방'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className="btn btn--light" 
            onClick={handleOpenGameHost}
            disabled={!room}
          >
            진행페이지 열기
          </button>
        </div>
      </header>

      <div className="admin-content">
        {/* 진행페이지 버튼은 헤더 우측 고정으로 이동 */}
        <div className="left-panel">
          <div className="control-section">
            <h3>게임 제어</h3>
            <div className="control-buttons" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              <button 
                className="btn btn--y-gold" 
                onClick={handleStartGame}
                disabled={questions.length === 0 || !(adminGameState === 'waiting' || adminGameState === 'finished')}
              >
                시작
              </button>

              <button 
                className="btn btn--y-sunset" 
                onClick={adminGameState === 'paused' ? handleResumeGame : handlePauseGame}
                disabled={!(adminGameState === 'playing' || adminGameState === 'showingAnswer' || adminGameState === 'paused')}
              >
                {adminGameState === 'paused' ? '재개' : '일시정지'}
              </button>

              <button 
                className="btn btn--y-butter" 
                onClick={handleEndGame}
                disabled={!hasStarted}
              >
                종료
              </button>

              <div className="time-controls">
                <input
                  type="number"
                  placeholder="시간(초)"
                  className="input"
                  min={1}
                  defaultValue={10}
                  style={{ width: '80px' }}
                  id="time-adjust-input"
                  onInput={(e) => {
                    const el = e.target as HTMLInputElement;
                    const n = parseInt(el.value || '');
                    if (isNaN(n) || n < 1) {
                      el.value = '1';
                    }
                  }}
                />
                <span className={`time-unit ${!(adminGameState === 'playing' || adminGameState === 'showingAnswer' || adminGameState === 'paused') ? 'disabled' : ''}`}>(초)</span>
                <button 
                  className="btn btn--y-light" 
                  onClick={() => { 
                    if (adminGameState === 'playing' || adminGameState === 'showingAnswer' || adminGameState === 'paused') {
                      const input = document.getElementById('time-adjust-input') as HTMLInputElement;
                      const value = parseInt(input?.value || '10');
                      actions.adjustTime?.(value);
                      
                      const elapsed = state.phaseStartedAt ? Math.floor((Date.now() - state.phaseStartedAt) / 1000) : 0;
                      const currentRemain = Math.max(0, (state.phaseDuration || 0) - elapsed);
                      const newRemain = Math.max(1, currentRemain + value);
                      const msg = { message: `⏱️ 시간이 ${value}초 추가되었습니다. (남은 시간: ${newRemain}초)`, type: 'info' };
                      syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
                    }
                  }} 
                  disabled={!(adminGameState === 'playing' || adminGameState === 'showingAnswer' || adminGameState === 'paused')}
                >+</button>
                <button 
                  className="btn btn--y-light" 
                  onClick={() => { 
                    if (adminGameState === 'playing' || adminGameState === 'showingAnswer' || adminGameState === 'paused') {
                      const input = document.getElementById('time-adjust-input') as HTMLInputElement;
                      const value = parseInt(input?.value || '10');
                      actions.adjustTime?.(-value);
                      
                      const elapsed = state.phaseStartedAt ? Math.floor((Date.now() - state.phaseStartedAt) / 1000) : 0;
                      const currentRemain = Math.max(0, (state.phaseDuration || 0) - elapsed);
                      const newRemain = Math.max(1, currentRemain - value);
                      const msg = { message: `⏱️ 시간이 ${value}초 감소되었습니다. (남은 시간: ${newRemain}초)`, type: 'info' };
                      syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
                    }
                  }} 
                  disabled={!(adminGameState === 'playing' || adminGameState === 'showingAnswer' || adminGameState === 'paused')}
                >-</button>
              </div>

              <button className="btn btn--y-sunset" onClick={() => {
                if (adminGameState === 'playing') {
                  handleRevealAnswer();
                } else if (adminGameState === 'showingAnswer') {
                  handleSubmitQuestion();
                }
              }} disabled={!(adminGameState === 'playing' || adminGameState === 'showingAnswer')}>
                넘기기
              </button>

              <button 
                className="btn btn--y-gold" 
                onClick={handleShowLeaderboard}
              >
                순위 보기
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h3>기본 설정</h3>
            <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <div className="setting-item">
                <div className="setting-row">
                  <span className="badge badge--y-light">문제 제시(초)</span>
                  <input
                    className="input"
                    type="number"
                    value={gameSettings.timeLimit}
                    min={1}
                    max={300}
                    onChange={(e) => handleGameSettingsChange({ timeLimit: Math.max(1, parseInt(e.target.value) || 1) })}
                  />
                </div>
              </div>
              <div className="setting-item">
                <div className="setting-row">
                  <span className="badge badge--y-sunset">정답 공개(초)</span>
                  <input
                    className="input"
                    type="number"
                    value={gameSettings.answerRevealTime}
                    min={1}
                    max={120}
                    onChange={(e) => handleGameSettingsChange({ answerRevealTime: Math.max(1, parseInt(e.target.value) || 1) })}
                  />
                </div>
              </div>
              <div className="setting-item">
                <div className="setting-row">
                  <span className="badge badge--y-butter">수동 모드</span>
                  <div className="fill">
                    <label className="checkbox-label checkbox-lg">
                      <input
                        type="checkbox"
                        checked={!gameSettings.autoMode}
                        onChange={(e) => handleGameSettingsChange({ autoMode: !e.target.checked })}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 실시간 참여자 현황 */}
          <div className="participants-section">
            <h3>실시간 참여자 현황</h3>
            {adminPlayers.length === 0 ? (
              <div className="no-participants">
                <p>아직 참여자가 없습니다</p>
                <small>방 코드: <strong>{room.code}</strong>를 공유해주세요</small>
              </div>
            ) : (
              <div className="players-grid">
                {sortPlayersByTeam(adminPlayers).map(player => {
                  const getTeamBg = (team?: string): string => {
                    if (!team) return 'rgba(255,255,255,0.85)';
                    const teamColors: { [key: string]: string } = {
                      'A': 'rgba(244,67,54,0.20)',
                      'B': 'rgba(255,152,0,0.20)', 
                      'C': 'rgba(255,235,59,0.20)',
                      'D': 'rgba(76,175,80,0.20)',
                      'E': 'rgba(33,150,243,0.20)',
                      'F': 'rgba(63,81,181,0.20)', 
                      'G': 'rgba(156,39,176,0.20)',
                      'H': 'rgba(158,158,158,0.20)'
                    };
                    return teamColors[team] || 'rgba(255,255,255,0.85)';
                  };

                  return (
                    <div key={player.id} className="player-card">
                      <div className="player-avatar" style={{ background: getTeamBg(player.team) }}>
                        <div 
                          className="avatar-background"
                          style={{ backgroundColor: getTeamBg(player.team) }}
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
                          <span className="player-score" style={{ backgroundColor: getTeamBg(player.team) }}>
                            {player.score || 0}점
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                    className="btn btn--light"
                    onClick={() => setShowQuestionModal(true)}
                  >
                    문제 추가
                  </button>
                  <button 
                    className="btn btn--light"
                    onClick={() => setShowAiModal(true)}
                  >
                    AI 문제 추가
                  </button>
                  <button 
                    className="btn btn--light"
                    onClick={handleDownloadQuestions}
                  >
                    문제 다운로드
                  </button>
                  <button 
                    className="btn btn--light"
                    onClick={handleUploadClick}
                  >
                    문제 업로드
                  </button>
                  <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
                </div>
              </div>
            <QuestionStack
              questions={questions}
              onDelete={handleDeleteQuestion}
              onEdit={handleEditQuestion}
              onReorder={handleReorderQuestions}
              currentIndex={adminGameState === 'finished' ? -1 : currentQuestionIndex}
              gameState={adminGameState}
              hasStarted={adminGameState === 'finished' ? false : hasStarted}
            />
          </div>
        </div>
      </div>

      {showQuestionModal && (
        <QuestionModal
          onSubmit={handleQuestionSubmit}
          onClose={() => setShowQuestionModal(false)}
        />
      )}
      {showEditModal && editingQuestion && (
        <EditQuestionModal
          question={editingQuestion}
          onSubmit={handleEditSubmit}
          onClose={() => {
            setShowEditModal(false);
            setEditingQuestion(null);
          }}
        />
      )}
      {showAiModal && (
        <AiQuestionModal
          onClose={() => setShowAiModal(false)}
          onGenerate={(list: AiQuestion[]) => {
            console.info('[AI_GEN_WIRE] 수신 항목 수', list.length);
            
            // 다음 문제 번호 계산 함수
            const getNextQuestionNumber = (): number => {
              if (questions.length === 0) return 1;
              
              const existingNumbers = questions
                .map(q => {
                  const match = q.id.match(/^q_(\d+)_/);
                  return match ? parseInt(match[1], 10) : 0;
                })
                .filter(num => num > 0);
              
              return existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
            };

            let nextNumber = getNextQuestionNumber();
            const mapped = list.map(q => {
              const base: any = {
                id: `q_${nextNumber++}_${Date.now()}`,
                type: q.type as QuestionType,
                question: q.question,
                score: typeof q.score === 'number' ? q.score : 10,
                timeLimit: gameSettings.timeLimit,
                correctAnswer: q.correctAnswer
              };
              
              // options가 유효한 경우에만 포함 (undefined/빈 배열 방지)
              if (Array.isArray(q.options) && q.options.length > 0) {
                base.options = q.options;
              }
              
              return base;
            }) as any[];
            actions.addQuestionsBulk(mapped as any);
            setShowAiModal(false);
            const msg = { message: `🤖 AI가 ${list.length}개의 문제를 생성했습니다!`, type: 'success' };
            syncManagerFs.broadcast('SYSTEM_MESSAGE', msg);
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
