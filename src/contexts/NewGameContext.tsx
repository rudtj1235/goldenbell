/**
 * 새로운 모듈 기반 게임 컨텍스트
 * SyncManager, RoomManager, EventBus를 활용한 독립적인 상태 관리
 */

import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { Room, Player, Question, GameState, GameSettings } from '../types/game';
import syncManager from '../services/SyncManager';
import roomManager from '../services/RoomManager';
import eventBus from '../services/EventBus';

interface GameContextState {
  room: Room | null;
  players: Player[];
  questions: Question[];
  gameState: GameState;
  currentQuestionIndex: number;
  gameSettings: GameSettings;
  hasStarted: boolean;
  phaseStartedAt: number | null;
  phaseDuration: number | null;
  paused: boolean;
  isLoading: boolean;
  error: string | null;
}

interface GameContextValue {
  state: GameContextState;
  actions: {
    createRoom: (subject: string, isPublic: boolean) => void;
    joinRoom: (roomCode: string, player: Player) => boolean;
    addQuestion: (question: Question) => void;
    addQuestionsBulk: (questions: Question[]) => void;
    deleteQuestion: (questionId: string) => void;
    reorderQuestions: (questions: Question[]) => void;
    startGame: () => void;
    pauseGame: () => void;
    resumeGame: () => void;
    nextQuestion: () => void;
    showAnswer: () => void;
    endGame: () => void;
    eliminatePlayer: (playerId: string) => void;
    revivePlayer: (playerId: string) => void;
    setAnswerDraft: (playerId: string, answer: string | number) => void;
    submitAnswer: (playerId: string, answer: string | number) => void;
    gradeCurrentQuestion: () => void;
    updateGameSettings: (settings: Partial<GameSettings>) => void;
    resetGame: () => void;
    updateHostActivity: (roomCode: string) => void;
  };
}

const GameContext = createContext<GameContextValue | null>(null);

const initialGameSettings: GameSettings = {
  timeLimit: 5,
  answerRevealTime: 5,
  eliminationMode: false,
  eliminationThreshold: 3,
  autoMode: true
};

const initialState: GameContextState = {
  room: null,
  players: [],
  questions: [],
  gameState: 'waiting',
  currentQuestionIndex: 0,
  gameSettings: initialGameSettings,
  hasStarted: false,
  phaseStartedAt: null,
  phaseDuration: null,
  paused: false,
  isLoading: true,
  error: null
};

export function NewGameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameContextState>(initialState);
  const autoTickRef = useRef<any>(null);
  const lastAutoKeyRef = useRef<string | null>(null);
  const autoTimerRef = useRef<any>(null);

  useEffect(() => {
    // SyncManager에서 초기 데이터 로드
    const gameData = syncManager.getGameData();
    setState(prev => ({
      ...prev,
      room: gameData.room,
      players: gameData.players,
      questions: gameData.questions,
      gameState: gameData.gameState,
      currentQuestionIndex: gameData.currentQuestionIndex,
      gameSettings: gameData.gameSettings || prev.gameSettings,
      hasStarted: typeof (gameData as any).hasStarted === 'boolean' ? (gameData as any).hasStarted : false,
      phaseStartedAt: (gameData as any).phaseStartedAt ?? null,
      phaseDuration: (gameData as any).phaseDuration ?? null,
      paused: (gameData as any).paused ?? false,
      isLoading: false
    }));

    // 이벤트 리스너 등록
    const unsubscribers: Array<() => void> = [
      eventBus.on('PLAYER_JOIN', handlePlayerJoin),
      eventBus.on('PLAYER_LEAVE', handlePlayerLeave),
    ];

    // SyncManager 리스너는 해제 함수가 없으므로 별도 관리
    const syncListeners: Array<{type: string; cb: Function}> = [];
    const addSync = (type: string, cb: Function) => {
      syncManager.addEventListener(type, cb);
      syncListeners.push({ type, cb });
    };
    addSync('GAME_DATA_UPDATE', handleSyncDataUpdate);
    addSync('PLAYER_JOIN', handleSyncPlayerJoin);
    addSync('PLAYER_LEAVE', handleSyncPlayerLeave);
    addSync('GAME_STATE_CHANGE', handleSyncGameStateChange);

    console.log('🎮 NewGameContext 초기화됨');

    return () => {
      unsubscribers.forEach(unsub => unsub());
      // SyncManager 리스너 해제
      syncListeners.forEach(({ type, cb }) => {
        try {
          (syncManager as any).removeEventListener?.(type, cb);
        } catch {}
      });
      console.log('🎮 NewGameContext 정리됨');
    };
  }, []);

  // 단일 간단 타임아웃 체크 루프: 타이머가 끝나면 다음 단계로 전환
  useEffect(() => {
    if (autoTickRef.current) {
      try { clearInterval(autoTickRef.current); } catch {}
      autoTickRef.current = null;
    }
    autoTickRef.current = setInterval(() => {
      const s = state as any;
      if (!s?.gameSettings?.autoMode) return;
      if (s.paused) return;
      if (!(s.gameState === 'playing' || s.gameState === 'showingAnswer')) return;
      if (!s.phaseStartedAt || !s.phaseDuration) return;
      const expired = (Date.now() - s.phaseStartedAt) / 1000 >= s.phaseDuration;
      if (!expired) return;
      const key = `${s.gameState}:${s.currentQuestionIndex}`;
      if (lastAutoKeyRef.current === key) return;
      lastAutoKeyRef.current = key;
      if (s.gameState === 'playing') actions.showAnswer();
      else actions.nextQuestion();
    }, 300);
    return () => {
      if (autoTickRef.current) {
        try { clearInterval(autoTickRef.current); } catch {}
        autoTickRef.current = null;
      }
    };
  }, [state.gameSettings?.autoMode, state.gameState, state.phaseStartedAt, state.phaseDuration, state.paused, state.currentQuestionIndex]);

  const handleGameDataUpdate = (data: any) => {
    console.log('🔄 게임 데이터 업데이트:', data);
    setState(prev => ({ ...prev, ...data }));
  };

  const handlePlayerJoin = (player: Player) => {
    setState(prev => ({
      ...prev,
      players: prev.players.find(p => p.id === player.id) 
        ? prev.players 
        : [...prev.players, player]
    }));
  };

  const handlePlayerLeave = (playerId: string) => {
    setState(prev => ({
      ...prev,
      players: prev.players.filter(p => p.id !== playerId)
    }));
  };

  const handleGameStateChange = (data: any) => {
    setState(prev => ({ ...prev, ...data }));
  };

  const handleRoomCreated = (room: any) => {
    console.log('🏠 방 생성됨:', room);
  };

  const handleRoomDeleted = (roomCode: string) => {
    console.log('🗑️ 방 삭제됨:', roomCode);
    if (state.room?.code === roomCode) {
      setState(prev => ({ ...prev, room: null, players: [] }));
    }
  };

  // Sync 이벤트 핸들러들
  const handleSyncDataUpdate = (data: any) => {
    // 방어: 질문이 없는데 finished로 들어오는 등 비정상 상태 정규화
    setState(prev => {
      const next = { ...prev, ...data } as any;
      if (!next.questions || next.questions.length === 0) {
        next.gameState = 'waiting';
        next.currentQuestionIndex = 0;
      } else if (
        typeof next.currentQuestionIndex !== 'number' ||
        next.currentQuestionIndex < 0 ||
        next.currentQuestionIndex >= next.questions.length
      ) {
        next.currentQuestionIndex = 0;
        if (next.gameState === 'finished') next.gameState = 'waiting';
      }
      if (!next.gameSettings) next.gameSettings = prev.gameSettings;
      if (typeof next.hasStarted !== 'boolean') next.hasStarted = prev.hasStarted;
      return next;
    });
  };

  const handleSyncPlayerJoin = (player: Player) => {
    setState(prev => ({
      ...prev,
      players: prev.players.find(p => p.id === player.id) 
        ? prev.players 
        : [...prev.players, player]
    }));
  };

  const handleSyncPlayerLeave = (playerId: string) => {
    setState(prev => ({
      ...prev,
      players: prev.players.filter(p => p.id !== playerId)
    }));
  };

  const handleSyncGameStateChange = (data: any) => {
    setState(prev => ({ ...prev, ...data }));
  };

  const actions = {
    setAnswerDraft: (playerId: string, answer: string | number) => {
      const updatedPlayers = state.players.map(player =>
        player.id === playerId 
          ? { ...player, currentAnswer: String(answer) }
          : player
      );
      setState(prev => ({ ...prev, players: updatedPlayers }));
      syncManager.updateGameData({ players: updatedPlayers });
    },
    createRoom: (subject: string, isPublic: boolean) => {
      try {
        const hostId = 'host_' + Date.now();
        const room = roomManager.createRoom(subject, isPublic, hostId);
        // 기본 예시 문제 3개(OX/객관식/주관식)
        const now = Date.now();
        const defaultQuestions: Question[] = [
          {
            id: 'q_' + now + '_ox',
            type: 'ox',
            question: '태양은 서쪽에서 뜬다.',
            score: 10,
            timeLimit: 10,
            options: ['O', 'X'],
            correctAnswer: 'X'
          },
          {
            id: 'q_' + now + '_mc',
            type: 'multiple',
            question: '대한민국의 수도는?',
            score: 20,
            timeLimit: 15,
            options: ['서울', '부산', '대구', '인천'],
            correctAnswer: 0
          },
          {
            id: 'q_' + now + '_short',
            type: 'short',
            question: '3 x 7 = ?',
            score: 30,
            timeLimit: 20,
            correctAnswer: '21'
          }
        ];

        setState(prev => ({ 
          ...prev, 
          room, 
          players: [], 
          questions: defaultQuestions,
          gameState: 'waiting',
          currentQuestionIndex: 0,
          hasStarted: false,
          gameSettings: prev.gameSettings
        }));
        syncManager.updateGameData({ 
          room, 
          players: [], 
          questions: defaultQuestions,
          gameState: 'waiting',
          currentQuestionIndex: 0,
          hasStarted: false,
          gameSettings: state.gameSettings
        });
        eventBus.emit('ROOM_CREATED', room);
        
        console.log('🏠 방 생성 완료:', room.code);
      } catch (error) {
        console.error('방 생성 실패:', error);
        setState(prev => ({ ...prev, error: '방 생성에 실패했습니다.' }));
      }
    },

    joinRoom: (roomCode: string, player: Player) => {
      try {
        // 상세 로그: 참여 시도 전 상태
        try {
          const before = {
            at: new Date().toISOString(),
            roomCode,
            localRoomExists: !!roomManager.getRoom(roomCode),
            publicRooms: roomManager.getPublicRooms().map(r => r.code),
            playersCount: state.players.length
          };
          console.info('[JOIN_TRACE] before joinRoom', before);
        } catch {}

        const room = roomManager.joinRoom(roomCode, player);
        
        if (room) {
          setState(prev => ({ 
            ...prev, 
            room, 
            players: room.players,
            error: null 
          }));
          
          eventBus.emit('PLAYER_JOIN', player);
          console.info('[JOIN_TRACE] success', { roomCode, playersCount: room.players.length });
          return true;
        } else {
          setState(prev => ({ ...prev, error: '방을 찾을 수 없습니다.' }));
          try {
            const after = {
              at: new Date().toISOString(),
              roomCode,
              localRoomExists: !!roomManager.getRoom(roomCode),
              publicRooms: roomManager.getPublicRooms().map(r => r.code)
            };
            console.warn('[JOIN_TRACE] fail', after);
          } catch {}
          return false;
        }
      } catch (error) {
        console.error('방 참여 실패:', error);
        setState(prev => ({ ...prev, error: '방 참여에 실패했습니다.' }));
        return false;
      }
    },

    addQuestion: (question: Question) => {
      setState(prev => {
        const normalizedGameState = prev.gameState === 'finished' ? 'waiting' : prev.gameState;
        const normalizedIndex = prev.gameState === 'finished' ? 0 : prev.currentQuestionIndex;
        const newQuestions = [...prev.questions, question];
        // 동기화는 prev 기준으로 정확히 반영
        syncManager.updateGameData({
          questions: newQuestions,
          gameState: normalizedGameState,
          currentQuestionIndex: normalizedIndex,
          players: prev.players,
          room: prev.room
        } as any);
        eventBus.emit('QUESTION_ADDED', question);
        return { ...prev, questions: newQuestions, gameState: normalizedGameState, currentQuestionIndex: normalizedIndex };
      });
    },

    addQuestionsBulk: (questionsToAdd: Question[]) => {
      if (!questionsToAdd || questionsToAdd.length === 0) return;
      setState(prev => {
        const normalizedGameState = prev.gameState === 'finished' ? 'waiting' : prev.gameState;
        const normalizedIndex = prev.gameState === 'finished' ? 0 : prev.currentQuestionIndex;
        const newQuestions = [...prev.questions, ...questionsToAdd];
        syncManager.updateGameData({
          questions: newQuestions,
          gameState: normalizedGameState,
          currentQuestionIndex: normalizedIndex,
          players: prev.players,
          room: prev.room
        } as any);
        eventBus.emit('QUESTIONS_ADDED', { count: questionsToAdd.length });
        return { ...prev, questions: newQuestions, gameState: normalizedGameState, currentQuestionIndex: normalizedIndex };
      });
    },

    deleteQuestion: (questionId: string) => {
      const newQuestions = state.questions.filter(q => q.id !== questionId);
      setState(prev => ({ ...prev, questions: newQuestions }));
      syncManager.updateGameData({ questions: newQuestions });
      eventBus.emit('QUESTION_DELETED', questionId);
    },

    reorderQuestions: (questions: Question[]) => {
      setState(prev => ({ ...prev, questions }));
      syncManager.updateGameData({ questions });
      eventBus.emit('QUESTIONS_REORDERED', questions);
    },

    startGame: () => {
      if (state.questions.length === 0) {
        setState(prev => ({ ...prev, error: '문제를 먼저 추가해주세요.' }));
        return;
      }

      const isFirstStart = !state.hasStarted;
      let startIndex = 0;
      if (isFirstStart) {
        startIndex = 0;
      } else {
        const nextIndex = state.currentQuestionIndex + 1;
        if (nextIndex >= state.questions.length) {
          // 진행할 다음 문제가 없으면 대기 유지
          return;
        }
        startIndex = nextIndex;
      }

      const resetPlayers = state.players.map(player => ({
        ...player,
        hasSubmitted: false,
        currentAnswer: undefined
      }));

      const nowMs = Date.now();
      const newState = { gameState: 'playing' as const, currentQuestionIndex: startIndex, hasStarted: true, players: resetPlayers, phaseStartedAt: nowMs, phaseDuration: state.gameSettings.timeLimit, paused: false } as const;
      console.info('[AUTO_FLOW] startGame', newState);
      setState(prev => ({ ...prev, ...newState }));
      syncManager.updateGameData({
        gameState: 'playing',
        currentQuestionIndex: startIndex,
        questions: state.questions,
        players: resetPlayers,
        room: state.room,
        hasStarted: true,
        gameSettings: state.gameSettings,
        phaseStartedAt: newState.phaseStartedAt,
        phaseDuration: newState.phaseDuration,
        paused: false,
        activeQuestionId: state.questions[startIndex]?.id || null,
        lastGradedQuestionId: null
      } as any);
      // grade lock 초기화
      try {
        if (state.room) localStorage.removeItem(`grade_lock_${state.room.code}`);
      } catch {}
      eventBus.emit('GAME_STARTED', newState);
      
      if (state.room) {
        roomManager.updateHostActivity(state.room.code, 'current_session');
      }
    },

    pauseGame: () => {
      const newState = { gameState: 'paused' as const, paused: true } as const;
      setState(prev => ({ ...prev, ...newState }));
      syncManager.updateGameState(newState as any);
      eventBus.emit('GAME_PAUSED', newState);
    },

    resumeGame: () => {
      const newState = { gameState: 'playing' as const, paused: false } as const;
      setState(prev => ({ ...prev, ...newState }));
      syncManager.updateGameState(newState as any);
      eventBus.emit('GAME_RESUMED', newState);
    },

    nextQuestion: () => {
      console.info('[AUTO_FLOW] nextQuestion called', { current: state.currentQuestionIndex, total: state.questions.length });
      const nextIndex = state.currentQuestionIndex + 1;
      
      if (nextIndex >= state.questions.length) {
        // 자동 종료하지 않고 대기 상태로 전환. 인덱스는 마지막 문제에서 유지
        const newState = { gameState: 'waiting' as const };
        console.info('[AUTO_FLOW] no more questions → waiting', { lastIndex: state.currentQuestionIndex });
        setState(prev => ({ ...prev, ...newState, currentQuestionIndex: Math.max(0, prev.currentQuestionIndex) }));
        syncManager.updateGameData({ gameState: 'waiting', currentQuestionIndex: state.currentQuestionIndex, hasStarted: true });
        return;
      }

      const resetPlayers = state.players.map(player => ({
        ...player,
        hasSubmitted: false,
        currentAnswer: undefined
      }));

      const nowMs = Date.now();
      const newState = { gameState: 'playing' as const, currentQuestionIndex: nextIndex, players: resetPlayers, phaseStartedAt: nowMs, phaseDuration: state.gameSettings.timeLimit, paused: false } as const;

      console.info('[AUTO_FLOW] move to next playing', newState);
      setState(prev => ({ ...prev, ...newState }));
      syncManager.updateGameData({
        gameState: 'playing',
        currentQuestionIndex: nextIndex,
        players: resetPlayers,
        questions: state.questions,
        room: state.room,
        phaseStartedAt: newState.phaseStartedAt,
        phaseDuration: newState.phaseDuration,
        paused: false,
        activeQuestionId: state.questions[nextIndex]?.id || null,
        lastGradedQuestionId: null
      } as any);
      // grade lock 초기화
      try {
        if (state.room) localStorage.removeItem(`grade_lock_${state.room.code}`);
      } catch {}
      eventBus.emit('NEXT_QUESTION', newState);
    },

    showAnswer: () => {
      const newState = { gameState: 'showingAnswer' as const };
      console.info('[AUTO_FLOW] showAnswer called', { index: state.currentQuestionIndex });
      // 최신 데이터로 채점(브로드캐스트 지연 보정)
      const latest = syncManager.getGameData();
      const q = latest.questions.find((qq: any) => qq.id === (latest as any).activeQuestionId) || latest.questions[latest.currentQuestionIndex];
      if (q) {
        console.debug('[AUTO_FLOW] grading begin', { qid: q.id, score: q.score });
        // 로컬 grade lock (탭 간 중복 방지)
        try {
          const lockKey = state.room ? `grade_lock_${state.room.code}` : null;
          if (lockKey) {
            const locked = localStorage.getItem(lockKey);
            if (locked === q.id) {
              console.warn('[AUTO_FLOW] grade locked by other tab', { qid: q.id });
            } else {
              localStorage.setItem(lockKey, q.id);
            }
          }
        } catch {}
        const gradedPlayers = latest.players.map(p => {
          const answerStr = String(p.currentAnswer ?? '').trim();
          let isCorrect = false;
          if (q.type === 'multiple') {
            isCorrect = String(q.correctAnswer) === answerStr;
          } else {
            isCorrect = String(q.correctAnswer).toString().trim() === answerStr;
          }
          return isCorrect ? { ...p, score: p.score + q.score } : p;
        });
        setState(prev => ({ ...prev, players: gradedPlayers }));
        syncManager.updateGameData({ players: gradedPlayers, lastGradedQuestionId: q.id } as any);
        // 정오 결과를 즉시 브로드캐스트해 참여자 UI가 동일하게 반영
        syncManager.broadcast('FINALIZE_ANSWERS', { questionId: q.id, players: gradedPlayers });
        console.debug('[AUTO_FLOW] grading done + broadcast', { qid: q.id });
      }
      const nowMs = Date.now();
      setState(prev => ({ ...prev, ...newState, phaseStartedAt: nowMs, phaseDuration: state.gameSettings.answerRevealTime, paused: false }));
      syncManager.updateGameState({ ...newState, phaseStartedAt: nowMs, phaseDuration: state.gameSettings.answerRevealTime, paused: false } as any);
      eventBus.emit('ANSWER_SHOWN', newState);
    },

    endGame: () => {
      const newState = { gameState: 'finished' as const };
      setState(prev => ({ ...prev, ...newState }));
      syncManager.updateGameState(newState);
      eventBus.emit('GAME_ENDED', newState);
    },

    eliminatePlayer: (playerId: string) => {
      const updatedPlayers = state.players.map(player =>
        player.id === playerId ? { ...player, isEliminated: true } : player
      );
      setState(prev => ({ ...prev, players: updatedPlayers }));
      syncManager.updateGameData({ players: updatedPlayers });
      eventBus.emit('PLAYER_ELIMINATED', { playerId, players: updatedPlayers });
    },

    revivePlayer: (playerId: string) => {
      const updatedPlayers = state.players.map(player =>
        player.id === playerId ? { ...player, isEliminated: false } : player
      );
      setState(prev => ({ ...prev, players: updatedPlayers }));
      syncManager.updateGameData({ players: updatedPlayers });
      eventBus.emit('PLAYER_REVIVED', { playerId, players: updatedPlayers });
    },

    submitAnswer: (playerId: string, answer: string | number) => {
      const updatedPlayers = state.players.map(player =>
        player.id === playerId 
          ? { ...player, hasSubmitted: true, currentAnswer: String(answer) }
          : player
      );
      setState(prev => ({ ...prev, players: updatedPlayers }));
      syncManager.updateGameData({ players: updatedPlayers });
      eventBus.emit('ANSWER_SUBMITTED', { playerId, answer, players: updatedPlayers });
    },

    gradeCurrentQuestion: () => {},

    updateGameSettings: (settings: Partial<GameSettings>) => {
      const newSettings = { ...state.gameSettings, ...settings };
      setState(prev => ({ ...prev, gameSettings: newSettings }));
      // 설정은 전파/영구화 되어야 함
      syncManager.updateGameData({ gameSettings: newSettings });
      eventBus.emit('SETTINGS_UPDATED', newSettings);
    },

    resetGame: () => {
      setState(initialState);
      syncManager.updateGameState({
        room: null,
        players: [],
        questions: [],
        gameState: 'waiting',
        currentQuestionIndex: 0,
      });
      eventBus.emit('GAME_RESET');
    },

    updateHostActivity: (roomCode: string) => {
      roomManager.updateHostActivity(roomCode, 'current_session');
      syncManager.broadcast('HOST_ACTIVITY', { roomCode, sessionId: 'current_session' });
    }
  };

  const value: GameContextValue = {
    state,
    actions
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}

export function useNewGameContext(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useNewGameContext must be used within a NewGameProvider');
  }
  return context;
}

export default GameContext;
