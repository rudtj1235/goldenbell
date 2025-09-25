import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Question, Player, Room, GameSettings, GameState } from '../types/game';

interface AppState {
  room: Room | null;
  questions: Question[];
  players: Player[];
  currentQuestionIndex: number;
  gameState: GameState;
  gameSettings: GameSettings;
  currentPlayer: Player | null;
}

type GameAction =
  | { type: 'CREATE_ROOM'; payload: { subject: string; isPublic: boolean; hostId: string } }
  | { type: 'JOIN_ROOM'; payload: { roomCode: string; player: Player } }
  | { type: 'ADD_QUESTION'; payload: Question }
  | { type: 'DELETE_QUESTION'; payload: string }
  | { type: 'REORDER_QUESTIONS'; payload: Question[] }
  | { type: 'UPDATE_GAME_SETTINGS'; payload: Partial<GameSettings> }
  | { type: 'START_GAME' }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'NEXT_QUESTION' }
  | { type: 'END_GAME' }
  | { type: 'UPDATE_PLAYER'; payload: Player }
  | { type: 'ELIMINATE_PLAYER'; payload: string }
  | { type: 'REVIVE_PLAYER'; payload: string }
  | { type: 'SUBMIT_ANSWER'; payload: { playerId: string; answer: string | number } }
  | { type: 'CLEAR_SUBMISSIONS' }
  | { type: 'SHOW_ANSWER' }
  | { type: 'RESET_GAME' };

const initialState: AppState = {
  room: null,
  questions: [],
  players: [],
  currentQuestionIndex: 0,
  gameState: 'waiting',
  gameSettings: {
    timeLimit: 5,
    answerRevealTime: 5,
    eliminationMode: false,
    eliminationThreshold: 3,
    autoMode: true
  },
  currentPlayer: null
};

function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function gameReducer(state: AppState, action: GameAction): AppState {
  switch (action.type) {
    case 'CREATE_ROOM': {
      const newRoom: Room = {
        id: Date.now().toString(),
        code: generateRoomCode(),
        subject: action.payload.subject,
        isPublic: action.payload.isPublic,
        hostId: action.payload.hostId,
        players: [],
        questions: [],
        currentQuestionIndex: 0,
        gameState: 'waiting',
        eliminationMode: state.gameSettings.eliminationMode,
        eliminationThreshold: state.gameSettings.eliminationThreshold,
        autoMode: state.gameSettings.autoMode,
        answerRevealTime: state.gameSettings.answerRevealTime
      };
      
      // 공개방이면 localStorage에 저장
      if (action.payload.isPublic) {
        const publicRoom = {
          id: newRoom.id,
          code: newRoom.code,
          subject: newRoom.subject,
          isPublic: true,
          playerCount: 0
        };
        
        const savedRooms = localStorage.getItem('publicRooms');
        const existingRooms = savedRooms ? JSON.parse(savedRooms) : [];
        const updatedRooms = [...existingRooms, publicRoom];
        localStorage.setItem('publicRooms', JSON.stringify(updatedRooms));
        
        console.log('🔥 공개방 저장됨:', publicRoom);
        console.log('📋 현재 공개방 목록:', updatedRooms);
      }
      
      return {
        ...state,
        room: newRoom
      };
    }

    case 'JOIN_ROOM': {
      // 방이 없는 경우 임시로 방을 생성 (실제로는 서버에서 방을 찾아야 함)
      if (!state.room) {
        // 임시 방 생성 로직 - 실제로는 서버에서 방 정보를 가져와야 함
        const tempRoom = {
          id: 'temp_room',
          code: action.payload.roomCode,
          subject: '임시 방',
          isPublic: false,
          hostId: 'temp_host',
          players: [action.payload.player],
          questions: [],
          currentQuestionIndex: 0,
          gameState: 'waiting' as const,
          eliminationMode: false,
          eliminationThreshold: 3,
          autoMode: true,
          answerRevealTime: 5
        };
        return {
          ...state,
          room: tempRoom,
          players: [action.payload.player]
        };
      }
      
      // 코드가 다르면 무시 (실제로는 서버에서 검증)
      if (state.room.code !== action.payload.roomCode) {
        console.warn('방 코드가 일치하지 않습니다:', state.room.code, 'vs', action.payload.roomCode);
        return state;
      }
      
      const playerExists = state.players.some(p => p.id === action.payload.player.id);
      if (playerExists) {
        return state; // 이미 참여한 플레이어면 무시
      }
      
      const updatedPlayers = [...state.players, action.payload.player];
      
      // 공개방이면 localStorage의 플레이어 수 업데이트
      if (state.room && state.room.isPublic) {
        const savedRooms = localStorage.getItem('publicRooms');
        if (savedRooms) {
          const existingRooms = JSON.parse(savedRooms);
          const updatedRooms = existingRooms.map((room: any) => 
            room.code === state.room?.code 
              ? { ...room, playerCount: updatedPlayers.length }
              : room
          );
          localStorage.setItem('publicRooms', JSON.stringify(updatedRooms));
        }
      }

      // 게임 진행페이지를 위한 localStorage 업데이트 (새 탭 동기화)
      const gameData = {
        room: state.room ? {
          ...state.room,
          players: updatedPlayers
        } : null,
        questions: state.questions,
        players: updatedPlayers,
        gameState: state.gameState,
        currentQuestionIndex: state.currentQuestionIndex,
        gameSettings: state.gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
      console.log('🔄 gameHostData 업데이트됨 - 플레이어 추가:', action.payload.player.nickname);
      
      return {
        ...state,
        players: updatedPlayers,
        room: {
          ...state.room,
          players: updatedPlayers
        }
      };
    }

    case 'ADD_QUESTION': {
      const newQuestions = [...state.questions, action.payload];
      return {
        ...state,
        questions: newQuestions,
        room: state.room ? {
          ...state.room,
          questions: newQuestions
        } : null
      };
    }

    case 'DELETE_QUESTION': {
      const filteredQuestions = state.questions.filter(q => q.id !== action.payload);
      return {
        ...state,
        questions: filteredQuestions,
        room: state.room ? {
          ...state.room,
          questions: filteredQuestions
        } : null
      };
    }

    case 'REORDER_QUESTIONS':
      return {
        ...state,
        questions: action.payload,
        room: state.room ? {
          ...state.room,
          questions: action.payload
        } : null
      };

    case 'UPDATE_GAME_SETTINGS':
      const newSettings = { ...state.gameSettings, ...action.payload };
      return {
        ...state,
        gameSettings: newSettings,
        room: state.room ? {
          ...state.room,
          eliminationMode: newSettings.eliminationMode,
          eliminationThreshold: newSettings.eliminationThreshold,
          autoMode: newSettings.autoMode,
          answerRevealTime: newSettings.answerRevealTime
        } : null
      };

    case 'START_GAME': {
      if (state.questions.length === 0) return state;
      
      const newState = {
        ...state,
        gameState: 'playing' as const,
        currentQuestionIndex: 0,
        room: state.room ? {
          ...state.room,
          gameState: 'playing' as const,
          currentQuestionIndex: 0
        } : null
      };
      
      // gameHostData 업데이트
      const gameData = {
        room: newState.room,
        questions: newState.questions,
        players: newState.players,
        gameState: newState.gameState,
        currentQuestionIndex: newState.currentQuestionIndex,
        gameSettings: newState.gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
      console.log('🎮 게임 시작 - gameHostData 업데이트됨');
      
      return newState;
    }

    case 'PAUSE_GAME': {
      const newState = {
        ...state,
        gameState: 'paused' as const,
        room: state.room ? {
          ...state.room,
          gameState: 'paused' as const
        } : null
      };
      
      // gameHostData 업데이트
      const gameData = {
        room: newState.room,
        questions: newState.questions,
        players: newState.players,
        gameState: newState.gameState,
        currentQuestionIndex: newState.currentQuestionIndex,
        gameSettings: newState.gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
      console.log('⏸️ 게임 일시정지 - gameHostData 업데이트됨');
      
      return newState;
    }

    case 'RESUME_GAME': {
      const newState = {
        ...state,
        gameState: 'playing' as const,
        room: state.room ? {
          ...state.room,
          gameState: 'playing' as const
        } : null
      };
      
      // gameHostData 업데이트
      const gameData = {
        room: newState.room,
        questions: newState.questions,
        players: newState.players,
        gameState: newState.gameState,
        currentQuestionIndex: newState.currentQuestionIndex,
        gameSettings: newState.gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
      console.log('▶️ 게임 재개 - gameHostData 업데이트됨');
      
      return newState;
    }

    case 'NEXT_QUESTION': {
      const nextIndex = state.currentQuestionIndex + 1;
      if (nextIndex >= state.questions.length) {
        const finishedState = {
          ...state,
          gameState: 'finished' as const,
          room: state.room ? {
            ...state.room,
            gameState: 'finished' as const
          } : null
        };
        
        // gameHostData 업데이트 (게임 종료)
        const gameData = {
          room: finishedState.room,
          questions: finishedState.questions,
          players: finishedState.players,
          gameState: finishedState.gameState,
          currentQuestionIndex: finishedState.currentQuestionIndex,
          gameSettings: finishedState.gameSettings
        };
        localStorage.setItem('gameHostData', JSON.stringify(gameData));
        console.log('🏁 게임 종료 - gameHostData 업데이트됨');
        
        return finishedState;
      }
      
      // 모든 플레이어의 제출 상태 초기화
      const resetPlayers = state.players.map(player => ({
        ...player,
        hasSubmitted: false,
        currentAnswer: undefined
      }));
      
      const nextState = {
        ...state,
        gameState: 'playing' as const,
        currentQuestionIndex: nextIndex,
        players: resetPlayers,
        room: state.room ? {
          ...state.room,
          gameState: 'playing' as const,
          currentQuestionIndex: nextIndex,
          players: resetPlayers
        } : null
      };
      
      // gameHostData 업데이트 (다음 문제)
      const gameData = {
        room: nextState.room,
        questions: nextState.questions,
        players: nextState.players,
        gameState: nextState.gameState,
        currentQuestionIndex: nextState.currentQuestionIndex,
        gameSettings: nextState.gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
      console.log('➡️ 다음 문제 - gameHostData 업데이트됨');
      
      return nextState;
    }

    case 'END_GAME': {
      const endState = {
        ...state,
        gameState: 'finished' as const,
        room: state.room ? {
          ...state.room,
          gameState: 'finished' as const
        } : null
      };
      
      // gameHostData 업데이트
      const gameData = {
        room: endState.room,
        questions: endState.questions,
        players: endState.players,
        gameState: endState.gameState,
        currentQuestionIndex: endState.currentQuestionIndex,
        gameSettings: endState.gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
      console.log('🔚 게임 강제 종료 - gameHostData 업데이트됨');
      
      return endState;
    }

    case 'UPDATE_PLAYER': {
      const updatedPlayers = state.players.map(player =>
        player.id === action.payload.id ? action.payload : player
      );
      return {
        ...state,
        players: updatedPlayers,
        room: state.room ? {
          ...state.room,
          players: updatedPlayers
        } : null
      };
    }

    case 'ELIMINATE_PLAYER': {
      const eliminatedPlayers = state.players.map(player =>
        player.id === action.payload ? { ...player, isEliminated: true } : player
      );
      
      // gameHostData 업데이트
      const gameData = {
        room: state.room ? {
          ...state.room,
          players: eliminatedPlayers
        } : null,
        questions: state.questions,
        players: eliminatedPlayers,
        gameState: state.gameState,
        currentQuestionIndex: state.currentQuestionIndex,
        gameSettings: state.gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
      
      return {
        ...state,
        players: eliminatedPlayers,
        room: state.room ? {
          ...state.room,
          players: eliminatedPlayers
        } : null
      };
    }

    case 'REVIVE_PLAYER': {
      const revivedPlayers = state.players.map(player =>
        player.id === action.payload ? { ...player, isEliminated: false } : player
      );
      
      // gameHostData 업데이트
      const gameData = {
        room: state.room ? {
          ...state.room,
          players: revivedPlayers
        } : null,
        questions: state.questions,
        players: revivedPlayers,
        gameState: state.gameState,
        currentQuestionIndex: state.currentQuestionIndex,
        gameSettings: state.gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
      
      return {
        ...state,
        players: revivedPlayers,
        room: state.room ? {
          ...state.room,
          players: revivedPlayers
        } : null
      };
    }

    case 'SUBMIT_ANSWER': {
      const submittedPlayers = state.players.map(player =>
        player.id === action.payload.playerId
          ? { ...player, hasSubmitted: true, currentAnswer: action.payload.answer.toString() }
          : player
      );
      
      // gameHostData 업데이트
      const gameData = {
        room: state.room ? {
          ...state.room,
          players: submittedPlayers
        } : null,
        questions: state.questions,
        players: submittedPlayers,
        gameState: state.gameState,
        currentQuestionIndex: state.currentQuestionIndex,
        gameSettings: state.gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
      
      return {
        ...state,
        players: submittedPlayers,
        room: state.room ? {
          ...state.room,
          players: submittedPlayers
        } : null
      };
    }

    case 'CLEAR_SUBMISSIONS': {
      const clearedPlayers = state.players.map(player => ({
        ...player,
        hasSubmitted: false,
        currentAnswer: undefined
      }));
      return {
        ...state,
        players: clearedPlayers,
        room: state.room ? {
          ...state.room,
          players: clearedPlayers
        } : null
      };
    }

    case 'SHOW_ANSWER': {
      const newState = {
        ...state,
        gameState: 'showingAnswer' as const,
        room: state.room ? {
          ...state.room,
          gameState: 'showingAnswer' as const
        } : null
      };
      
      // gameHostData 업데이트
      const gameData = {
        room: newState.room,
        questions: newState.questions,
        players: newState.players,
        gameState: newState.gameState,
        currentQuestionIndex: newState.currentQuestionIndex,
        gameSettings: newState.gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
      console.log('💡 정답 공개 - gameHostData 업데이트됨');
      
      return newState;
    }

    case 'RESET_GAME':
      return {
        ...initialState,
        gameSettings: state.gameSettings
      };

    default:
      return state;
  }
}

const GameContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<GameAction>;
} | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
}

export type { GameAction };
