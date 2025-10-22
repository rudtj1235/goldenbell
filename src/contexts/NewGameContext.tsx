/**
 * 새로운 모듈 기반 게임 컨텍스트
 * FirestoreSyncManager를 활용한 실시간 상태 관리
 */

import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useMemo } from 'react';
import { Room, Player, Question, GameState, GameSettings } from '../types/game';
import { firestoreSyncManager as syncManager } from '../services/FirestoreSyncManager';
import { useAuth } from './AuthContext';
import logger from '../utils/logger';

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
  pausedPrevState?: GameState | null;
  isLoading: boolean;
  error: string | null;
  resumeGuardUntil?: number | null;
}

interface GameContextValue {
  state: GameContextState;
  actions: {
    createRoom: (subject: string, isPublic: boolean) => Promise<void>;
    joinRoom: (roomCode: string, player: Player) => Promise<boolean>;
    addQuestion: (question: Question) => void;
    addQuestionsBulk: (questions: Question[]) => void;
    updateQuestion: (question: Question) => void;
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
    kickPlayer: (playerId: string) => void;
    setAnswerDraft: (playerId: string, answer: string | number) => void;
    submitAnswer: (playerId: string, answer: string | number) => void;
    gradeCurrentQuestion: () => void;
    updateGameSettings: (settings: Partial<GameSettings>) => void;
    resetGame: () => void;
    updateHostActivity: (roomCode: string) => void;
    adjustTime?: (delta: number) => void;
  };
}

const GameContext = createContext<GameContextValue | null>(null);

const initialGameSettings: GameSettings = {
  timeLimit: 30,
  answerRevealTime: 10,
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
  pausedPrevState: null,
  isLoading: true,
  error: null,
  resumeGuardUntil: null
};

export function NewGameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameContextState>(initialState);
  const { user } = useAuth();
  const isHost = useMemo(() => {
    const uid = user?.uid || (typeof window !== 'undefined' ? (window as any).firebaseAuthUid : null);
    return !!(state.room?.hostId && uid && state.room.hostId === uid);
  }, [state.room?.hostId, user?.uid]);
  const autoTickRef = useRef<any>(null); // legacy (removed)
  const lastAutoKeyRef = useRef<string | null>(null);
  const deadlineTimerRef = useRef<any>(null);
  const deadlineKeyRef = useRef<string | null>(null);

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

    // SyncManager 리스너만 사용 (eventBus 중복 제거)
    const syncListeners: Array<{type: string; cb: Function}> = [];
    const addSync = (type: string, cb: Function) => {
      syncManager.addEventListener(type, cb);
      syncListeners.push({ type, cb });
    };
    addSync('GAME_DATA_UPDATE', handleSyncDataUpdate);
    addSync('PLAYER_JOIN', handleSyncPlayerJoin);
    addSync('PLAYER_LEAVE', handleSyncPlayerLeave);
    addSync('GAME_STATE_CHANGE', handleSyncGameStateChange);

    logger.debug('🎮 NewGameContext 초기화됨');

    // 새로고침 복원: 저장된 roomCode가 있으면 자동 재연결 시도
    const saved = (() => { try { return localStorage.getItem('currentRoomCode'); } catch { return null; } })();
    if (saved) {
      (async () => {
        try {
          await (syncManager as any).connectToRoom(saved);
          logger.debug('🔄 재연결 완료:', saved);
        } catch (e) {
          console.warn('재연결 실패:', e);
        }
      })();
    }

    return () => {
      // SyncManager 리스너 해제
      syncListeners.forEach(({ type, cb }) => {
        try {
          (syncManager as any).removeEventListener?.(type, cb);
        } catch {}
      });
      
      // Firestore 연결 해제
      try {
        (syncManager as any).disconnect?.();
      } catch {}
      
      logger.debug('🎮 NewGameContext 정리됨');
    };
  }, []);

  // Deadline 기반 단일 타임아웃 스케줄러로 자동 전환
  const clearDeadline = () => {
    if (deadlineTimerRef.current) {
      try { clearTimeout(deadlineTimerRef.current); } catch {}
      deadlineTimerRef.current = null;
      deadlineKeyRef.current = null;
    }
  };

  useEffect(() => {
    clearDeadline();
    const s = state as any;
    if (!s?.gameSettings?.autoMode) return; // 자동 모드가 아닐 때 미사용
    if (s.paused) return; // 일시정지 시 스케줄 정지
    if (s.gameState === 'finished' || s.gameState === 'waiting') return; // 종료 또는 대기 상태에서는 자동 진행 중지
    if (!(s.gameState === 'playing' || s.gameState === 'showingAnswer')) return;
    // 호스트만 상태 전이 스케줄 실행 (참가자는 수신만)
    if (!isHost) return;
    if (!s.phaseStartedAt || !s.phaseDuration) return;

    const now = Date.now();
    const elapsed = Math.floor((now - s.phaseStartedAt) / 1000);
    const remain = Math.max(0, s.phaseDuration - elapsed);
    const key = `${s.gameState}:${s.currentQuestionIndex}`;
    deadlineKeyRef.current = key;

    if (remain === 0) {
      // 즉시 전환
      if (lastAutoKeyRef.current !== key) {
        lastAutoKeyRef.current = key;
        if (s.gameState === 'playing') actions.showAnswer(); else actions.nextQuestion();
      }
      return;
    }

    deadlineTimerRef.current = setTimeout(() => {
      // 최신 키/상태 확인으로 레이스 방지
      const t = state as any;
      if (!t?.gameSettings?.autoMode || t.paused) return;
      if (t.gameState === 'finished' || t.gameState === 'waiting') return; // 종료/대기 상태 체크
      if (!(t.gameState === 'playing' || t.gameState === 'showingAnswer')) return;
      const currentKey = `${t.gameState}:${t.currentQuestionIndex}`;
      if (currentKey !== deadlineKeyRef.current) return;
      if (lastAutoKeyRef.current === currentKey) return;
      lastAutoKeyRef.current = currentKey;
      if (t.gameState === 'playing') actions.showAnswer(); else actions.nextQuestion();
    }, remain * 1000);

    return clearDeadline;
  }, [state.gameSettings?.autoMode, state.gameState, state.phaseStartedAt, state.phaseDuration, state.paused, state.currentQuestionIndex, isHost]);

  // 사용하지 않는 핸들러 제거 (syncManager가 직접 처리)

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
      // 내 답안 초안은 해당 플레이어 필드만 부분 업데이트로 전송 (트래픽 절감)
      syncManager.updatePlayer(playerId, { currentAnswer: String(answer) } as any);
    },
    createRoom: async (subject: string, isPublic: boolean) => {
      try {
        setState(prev => ({ ...prev, isLoading: true }));
        
        // 현재 로그인한 사용자의 UID를 hostId로 사용
        const hostId = (window as any).firebaseAuthUid || `host_${Date.now()}`;
        
        // 방 생성 (roomManager 대신 직접 구현)
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const room: Room = {
          id: roomCode,
          code: roomCode,
          subject: subject.trim(),
          isPublic,
          hostId,
          players: [],
          questions: [],
          gameState: 'waiting',
          currentQuestionIndex: 0,
          gameSettings: {
            timeLimit: 30,
            showCorrectAnswer: true,
            allowMultipleAttempts: false,
            randomizeQuestions: false,
            randomizeOptions: false
          },
          hasStarted: false,
          phaseStartedAt: null,
          phaseDuration: null,
          paused: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        // 기본 예시 문제 3개(OX/객관식/주관식)
        const now = Date.now();
        const defaultQuestions: Question[] = [
          {
            id: `q_1_${now}`,
            type: 'ox',
            question: '태양은 서쪽에서 뜬다.',
            score: 10,
            timeLimit: 10,
            options: ['O', 'X'],
            correctAnswer: 'X'
          },
          {
            id: `q_2_${now}`,
            type: 'multiple',
            question: '대한민국의 수도는?',
            score: 20,
            timeLimit: 15,
            options: ['서울', '부산', '대구', '인천'],
            correctAnswer: 0
          },
          {
            id: `q_3_${now}`,
            type: 'short',
            question: '3 x 7 = ?',
            score: 30,
            timeLimit: 20,
            correctAnswer: '21'
          }
        ];

        // Firestore에 방 생성 및 연결
        await syncManager.createRoom(room);
        
        // 초기 게임 데이터 설정
        await syncManager.updateGameData({ 
          room, 
          players: [], 
          questions: defaultQuestions,
          gameState: 'waiting',
          currentQuestionIndex: 0,
          hasStarted: false,
          gameSettings: state.gameSettings
        });

        setState(prev => ({ 
          ...prev, 
          room, 
          players: [], 
          questions: defaultQuestions,
          gameState: 'waiting',
          currentQuestionIndex: 0,
          hasStarted: false,
          gameSettings: prev.gameSettings,
          isLoading: false
        }));
        logger.debug('🔥 Firestore 방 생성 완료:', room.code);
      } catch (error) {
        console.error('방 생성 실패:', error);
        setState(prev => ({ 
          ...prev, 
          error: '방 생성에 실패했습니다.',
          isLoading: false 
        }));
      }
    },

    joinRoom: async (roomCode: string, player: Player) => {
      try {
        // Firestore 방에 연결 후 참여 처리
        await (syncManager as any).connectToRoom(roomCode);
        await (syncManager as any).addPlayer(player);

        // 상태는 실시간 리스너에서 최신 데이터로 반영됨
        logger.debug('[JOIN_TRACE] success (firestore)', { roomCode, player: player.nickname });
        return true;
      } catch (error) {
        console.error('방 참여 실패 (firestore):', error);
        setState(prev => ({ ...prev, error: '방 참여에 실패했습니다.' }));
        return false;
      }
    },

    addQuestion: (question: Question) => {
      setState(prev => {
        const normalizedGameState = prev.gameState === 'finished' ? 'waiting' : prev.gameState;
        const normalizedIndex = prev.gameState === 'finished' ? 0 : prev.currentQuestionIndex;
        const newQuestions = [...prev.questions, question];
        
        // 낙관적 UI 업데이트: 즉시 로컬 상태 반영
        
        // Firestore는 백그라운드에서 (깜빡임 방지)
        setTimeout(() => {
          syncManager.updateGameData({
            questions: newQuestions,
            gameState: normalizedGameState,
            currentQuestionIndex: normalizedIndex,
            players: prev.players,
            room: prev.room
          } as any);
        }, 0);
        
        return { ...prev, questions: newQuestions, gameState: normalizedGameState, currentQuestionIndex: normalizedIndex };
      });
    },

    addQuestionsBulk: (questionsToAdd: Question[]) => {
      if (!questionsToAdd || questionsToAdd.length === 0) return;
      setState(prev => {
        const normalizedGameState = prev.gameState === 'finished' ? 'waiting' : prev.gameState;
        const normalizedIndex = prev.gameState === 'finished' ? 0 : prev.currentQuestionIndex;
        const newQuestions = [...prev.questions, ...questionsToAdd];
        
        // 낙관적 UI 업데이트: 즉시 로컬 상태 반영
        
        // Firestore는 백그라운드에서 (깜빡임 방지)
        setTimeout(() => {
          syncManager.updateGameData({
            questions: newQuestions,
            gameState: normalizedGameState,
            currentQuestionIndex: normalizedIndex,
            players: prev.players,
            room: prev.room
          } as any);
        }, 0);
        
        return { ...prev, questions: newQuestions, gameState: normalizedGameState, currentQuestionIndex: normalizedIndex };
      });
    },

    updateQuestion: (updatedQuestion: Question) => {
      setState(prev => {
        const newQuestions = prev.questions.map(q => 
          q.id === updatedQuestion.id ? updatedQuestion : q
        );
        
        // 낙관적 UI 업데이트: 즉시 로컬 상태 반영
        
        // Firestore는 백그라운드에서 (깜빡임 방지)
        setTimeout(() => {
          syncManager.updateGameData({
            questions: newQuestions,
            gameState: prev.gameState,
            currentQuestionIndex: prev.currentQuestionIndex,
            players: prev.players,
            room: prev.room
          } as any);
        }, 0);
        
        return { ...prev, questions: newQuestions };
      });
    },

    deleteQuestion: (questionId: string) => {
      const newQuestions = state.questions.filter(q => q.id !== questionId);
      
      // 낙관적 UI 업데이트: 즉시 로컬 상태 반영
      setState(prev => ({ ...prev, questions: newQuestions }));
      
      // Firestore 업데이트는 백그라운드에서 (깜빡임 방지)
      setTimeout(() => {
        syncManager.updateGameData({ questions: newQuestions });
      }, 0);
    },

    reorderQuestions: (questions: Question[]) => {
      // 낙관적 UI 업데이트: 즉시 로컬 상태 반영
      setState(prev => ({ ...prev, questions }));
      
      // Firestore는 백그라운드에서 (깜빡임 방지)
      setTimeout(() => {
        syncManager.updateGameData({ questions });
      }, 0);
    },

    startGame: () => {
      if (state.questions.length === 0) {
        setState(prev => ({ ...prev, error: '문제를 먼저 추가해주세요.' }));
        return;
      }

      // finished 상태면 처음부터 + 점수 초기화
      const isRestart = state.gameState === 'finished';
      let startIndex = 0;
      
      if (isRestart || !state.hasStarted) {
        // finished 또는 최초 시작: 처음부터
        startIndex = 0;
      } else {
        // waiting 상태에서 재시작: 다음 문제부터 (완료된 문제 건너뛰기)
        startIndex = state.currentQuestionIndex + 1;
        if (startIndex >= state.questions.length) {
          // 모든 문제 끝났고 추가된 문제가 없으면 시작 불가
          logger.debug('[START] 진행할 문제가 없습니다', { currentIndex: state.currentQuestionIndex, total: state.questions.length });
          return;
        }
      }

      const resetPlayers = state.players.map(player => ({
        ...player,
        score: isRestart ? 0 : player.score, // finished 재시작이면 점수 0, 아니면 유지
        hasSubmitted: false,
        currentAnswer: undefined,
        isEliminated: isRestart ? false : player.isEliminated // finished 재시작이면 제거 해제
      }));

      const nowMs = Date.now();
      const newState = { gameState: 'playing' as const, currentQuestionIndex: startIndex, hasStarted: true, players: resetPlayers, phaseStartedAt: nowMs, phaseDuration: state.gameSettings.timeLimit, paused: false } as const;
      logger.debug('[AUTO_FLOW] startGame', newState);
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
      
      // 호스트 활동 업데이트는 FirestoreSyncManager에서 처리
    },

    pauseGame: () => {
      // 남은 시간을 고정하고, 전역 상태를 'paused'로 전환
      const nowMs = Date.now();
      const remain = state.phaseStartedAt && state.phaseDuration
        ? Math.max(1, state.phaseDuration - Math.floor((nowMs - (state.phaseStartedAt || nowMs)) / 1000))
        : (state.gameState === 'showingAnswer' ? state.gameSettings.answerRevealTime : state.gameSettings.timeLimit);
      logger.debug('[PAUSE] prevState=', state.gameState, 'idx=', state.currentQuestionIndex, 'remain=', remain);
      const next = {
        gameState: 'paused' as const,
        paused: true,
        pausedPrevState: state.gameState,
        // 기준점을 재설정해 정밀도를 확보 (재개 시 now 기준 비교가 되도록)
        phaseStartedAt: nowMs,
        phaseDuration: remain,
        resumeGuardUntil: null
      } as const;
      setState(prev => ({ ...prev, ...next }));
      syncManager.updateGameState(next as any);
    },

    resumeGame: () => {
      // 일시정지 해제: 'playing'으로 복귀하여 저장된 남은 시간을 기준으로 재시작
      const nowMs = Date.now();
      const remain = state.phaseDuration && state.phaseDuration > 0
        ? state.phaseDuration
        : (state.gameState === 'showingAnswer' ? state.gameSettings.answerRevealTime : state.gameSettings.timeLimit);
      const restoredState: GameState = (state.pausedPrevState && state.pausedPrevState !== 'paused') ? state.pausedPrevState : 'playing';
      logger.debug('[RESUME] restoredState=', restoredState, 'idx=', state.currentQuestionIndex, 'remain=', remain);
      const next = {
        gameState: restoredState,
        paused: false,
        pausedPrevState: null,
        phaseStartedAt: nowMs,
        phaseDuration: remain,
        resumeGuardUntil: nowMs + 1200
      } as const;
      setState(prev => ({ ...prev, ...next }));
      syncManager.updateGameState(next as any);
    },

    nextQuestion: () => {
      if (!isHost) return; // 호스트만 전이 수행
      if (state.gameState !== 'showingAnswer') return; // showingAnswer 상태에서만 가능
      logger.debug('[NEXT] nextQuestion called', { current: state.currentQuestionIndex, total: state.questions.length });
      const nextIndex = state.currentQuestionIndex + 1;
      
      if (nextIndex >= state.questions.length) {
        // 마지막 문제 끝: waiting으로 전환 (finished는 명시적 종료 버튼으로만)
        const newState = { gameState: 'waiting' as const };
        logger.debug('[AUTO_FLOW] no more questions → waiting', { lastIndex: state.currentQuestionIndex });
        setState(prev => ({ ...prev, ...newState }));
        syncManager.updateGameData({ gameState: 'waiting', hasStarted: true } as any);
        return;
      }

      const resetPlayers = state.players.map(player => ({
        ...player,
        hasSubmitted: false,
        currentAnswer: undefined
      }));

      const nowMs = Date.now();
      const newState = { gameState: 'playing' as const, currentQuestionIndex: nextIndex, players: resetPlayers, phaseStartedAt: nowMs, phaseDuration: state.gameSettings.timeLimit, paused: false } as const;

      logger.debug('[AUTO_FLOW] move to next playing', newState);
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
    },

    showAnswer: () => {
      const newState = { gameState: 'showingAnswer' as const };
      if (!isHost) return; // 호스트만 정답 공개 수행 (참가자는 수신만)
      if (state.gameState !== 'playing') return; // playing 상태에서만 가능
      logger.debug('[ANSWER] showAnswer called', { index: state.currentQuestionIndex });
      // 최신 데이터로 채점(브로드캐스트 지연 보정)
      const latest = syncManager.getGameData();
      const q = latest.questions.find((qq: any) => qq.id === (latest as any).activeQuestionId) || latest.questions[latest.currentQuestionIndex];
      if (q) {
        // 이미 채점된 문제인지 확인
        if (latest.lastGradedQuestionId === q.id) {
          console.debug('[AUTO_FLOW] already graded', { qid: q.id });
          return;
        }
        
        console.debug('[AUTO_FLOW] grading begin', { qid: q.id, score: q.score });
        // 로컬 grade lock (탭 간 중복 방지)
        try {
          const lockKey = state.room ? `grade_lock_${state.room.code}` : null;
          if (lockKey) {
            const locked = localStorage.getItem(lockKey);
            if (locked === q.id) {
              console.warn('[AUTO_FLOW] grade locked by other tab', { qid: q.id });
              return; // 중복 채점 방지를 위해 함수 종료
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
          
          // 오답 탈락 모드가 활성화되어 있고, 답이 틀렸거나 제출하지 않았으면 탈락 처리
          const shouldEliminate = latest.gameSettings?.eliminationMode && 
            (!isCorrect || !p.hasSubmitted || !p.currentAnswer);
          
          return isCorrect 
            ? { ...p, score: p.score + q.score } 
            : { ...p, isEliminated: shouldEliminate || p.isEliminated };
        });
        // 변경된 점수와 탈락 상태만 추려 배치 업데이트 (대규모 인원 최적화)
        const updates: { [pid: string]: Partial<Player> } = {} as any;
        latest.players.forEach((p: any) => {
          const after = gradedPlayers.find((gp: any) => gp.id === p.id);
          if (!after) return;
          const hasScoreChange = (after.score || 0) !== (p.score || 0);
          const hasEliminationChange = after.isEliminated !== p.isEliminated;
          if (hasScoreChange || hasEliminationChange) {
            updates[p.id] = { 
              score: after.score,
              isEliminated: after.isEliminated
            } as any;
          }
        });
        setState(prev => ({ ...prev, players: gradedPlayers }));
        if (Object.keys(updates).length > 0) {
          syncManager.batchUpdatePlayers(updates).catch(() => {});
        }
        // 메타 필드만 별도로 업데이트
        syncManager.updateGameData({ lastGradedQuestionId: q.id } as any);
        // 정오 결과를 즉시 브로드캐스트해 참여자 UI가 동일하게 반영
        syncManager.broadcast('FINALIZE_ANSWERS', { questionId: q.id, players: gradedPlayers });
        console.debug('[AUTO_FLOW] grading done + broadcast', { qid: q.id });
      }
      // 호스트 원자 전이: 정답공개 전환과 동시에 미제출자 자동제출을 한 번에 처리
      const nowMs = Date.now();
      const autoSubmit: any = {};
      latest.players.forEach((p: any) => {
        if (!p.isEliminated && !p.hasSubmitted) {
          autoSubmit[`players.${p.id}.hasSubmitted`] = true;
        }
      });

      setState(prev => ({ ...prev, ...newState, phaseStartedAt: nowMs, phaseDuration: state.gameSettings.answerRevealTime, paused: false }));
      syncManager.updateGameState({
        ...newState,
        phaseStartedAt: nowMs,
        phaseDuration: state.gameSettings.answerRevealTime,
        paused: false,
        ...autoSubmit
      } as any);
    },

    endGame: () => {
      const newState = { gameState: 'finished' as const };
      setState(prev => ({ ...prev, ...newState }));
      syncManager.updateGameState(newState);
    },

    eliminatePlayer: (playerId: string) => {
      const updatedPlayers = state.players.map(player =>
        player.id === playerId ? { ...player, isEliminated: true } : player
      );
      setState(prev => ({ ...prev, players: updatedPlayers }));
      syncManager.updateGameData({ players: updatedPlayers });
    },

    revivePlayer: (playerId: string) => {
      const updatedPlayers = state.players.map(player =>
        player.id === playerId ? { ...player, isEliminated: false } : player
      );
      setState(prev => ({ ...prev, players: updatedPlayers }));
      syncManager.updateGameData({ players: updatedPlayers });
    },

    kickPlayer: async (playerId: string) => {
      if (!isHost) return; // 호스트만 강퇴 가능
      
      try {
        // Firestore에서 플레이어 제거
        await syncManager.kickPlayer(playerId);
        
        // 로컬 상태에서도 제거
        const updatedPlayers = state.players.filter(player => player.id !== playerId);
        setState(prev => ({ ...prev, players: updatedPlayers }));
        
        logger.debug('플레이어 강퇴 완료:', playerId);
      } catch (error) {
        logger.error('플레이어 강퇴 실패:', error);
        throw error;
      }
    },

    submitAnswer: (playerId: string, answer: string | number) => {
      const updatedPlayers = state.players.map(player =>
        player.id === playerId 
          ? { ...player, hasSubmitted: true, currentAnswer: String(answer) }
          : player
      );
      setState(prev => ({ ...prev, players: updatedPlayers }));
      // 부분 업데이트로 해당 플레이어만 전송
      syncManager.updatePlayer(playerId, { hasSubmitted: true, currentAnswer: String(answer) } as any);
    },

    gradeCurrentQuestion: () => {},

    updateGameSettings: (settings: Partial<GameSettings>) => {
      const newSettings = { ...state.gameSettings, ...settings };
      setState(prev => ({ ...prev, gameSettings: newSettings }));
      // 설정은 전파/영구화 되어야 함
      syncManager.updateGameData({ gameSettings: newSettings });
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
    },

    updateHostActivity: (roomCode: string) => {
      // 호스트 활동 업데이트는 FirestoreSyncManager에서 처리
      syncManager.broadcast('HOST_ACTIVITY', { roomCode, sessionId: 'current_session' });
    },

    adjustTime: (delta: number) => {
      if (!isHost) return; // 호스트만 조정 가능
      if (state.gameState !== 'playing' && state.gameState !== 'showingAnswer' && state.gameState !== 'paused') return;
      
      // 현재 남은 시간 계산
      const nowMs = Date.now();
      const elapsed = state.phaseStartedAt ? Math.floor((nowMs - state.phaseStartedAt) / 1000) : 0;
      const currentRemain = Math.max(0, (state.phaseDuration || 0) - elapsed);
      
      // 새로운 남은 시간 (최소 1초)
      const newRemain = Math.max(1, currentRemain + delta);
      
      // phaseStartedAt을 현재 시간으로, phaseDuration을 새로운 남은 시간으로 재설정
      const updates = {
        phaseStartedAt: nowMs,
        phaseDuration: newRemain
      };
      
      logger.debug('[ADJUST_TIME] delta=', delta, 'currentRemain=', currentRemain, 'newRemain=', newRemain);
      
      setState(prev => ({ ...prev, ...updates }));
      syncManager.updateGameState(updates as any);
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
