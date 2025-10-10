/**
 * Firestore 기반 동기화 매니저
 * 기존 SyncManager와 호환되는 인터페이스를 제공하면서
 * 내부적으로는 Firestore를 사용하여 실시간 다중 사용자 동기화 지원
 */

import { Room, Player, Question, GameState, GameSettings } from '../types/game';
import { realtimeGameSync, RealtimeGameData } from './RealtimeGameSync';
import logger from '../utils/logger';

export interface GameSyncData {
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
  lastGradedQuestionId: string | null;
  activeQuestionId: string | null;
  lastUpdated: number;
}

class FirestoreSyncManager {
  private sessionId: string;
  private listeners: Map<string, Set<Function>> = new Map();
  private gameData: GameSyncData;
  private currentRoomCode: string | null = null;
  private lastMessageId: string = '';

  constructor() {
    this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    this.gameData = this.getInitialGameData();
    
    this.setupFirestoreListeners();
    
    logger.debug('🔥 FirestoreSyncManager 초기화됨 - SessionID:', this.sessionId);
  }

  private getInitialGameData(): GameSyncData {
    return {
      room: null,
      players: [],
      questions: [],
      gameState: 'waiting',
      currentQuestionIndex: 0,
      gameSettings: {
        timeLimit: 30,
        answerRevealTime: 10,
        eliminationMode: false,
        eliminationThreshold: 3,
        autoMode: true
      },
      hasStarted: false,
      phaseStartedAt: null,
      phaseDuration: null,
      paused: false,
      lastGradedQuestionId: null,
      activeQuestionId: null,
      lastUpdated: Date.now()
    };
  }

  private setupFirestoreListeners() {
    // Firestore 실시간 동기화 리스너 설정
    realtimeGameSync.addEventListener('GAME_DATA_UPDATE', (data: RealtimeGameData) => {
      // 낙관적 업데이트 깜빡임 방지: 200ms 이내 중복 업데이트 무시
      const timeDiff = data.lastUpdated - this.gameData.lastUpdated;
      if (timeDiff > 0 && timeDiff < 200) {
        logger.debug('🔥 중복 업데이트 무시 (깜빡임 방지):', timeDiff + 'ms');
        return;
      }
      
      // lastMessage 처리 (다른 탭의 Toast 알림)
      if ((data as any).lastMessage) {
        const { id, message, type } = (data as any).lastMessage;
        // 새 메시지만 전달
        if (id && id !== this.lastMessageId) {
          this.lastMessageId = id;
          this.notifyListeners('SYSTEM_MESSAGE', { message, type });
        }
      }
      
      // players 객체를 배열로 변환
      const playersArray = data.players ? Object.values(data.players) : [];
      
      // questions 처리: 빈 배열도 유효하므로 undefined/null만 체크
      const questions = data.questions !== undefined && data.questions !== null 
        ? data.questions 
        : this.gameData.questions;
      
      // gameSettings 기본값 처리 (기존 방의 경우 timeLimit이 5일 수 있으므로)
      const gameSettings = data.gameSettings || {};
      
      this.gameData = {
        room: data.room,
        players: playersArray, // 객체를 배열로 변환
        questions: questions,
        gameState: data.gameState,
        currentQuestionIndex: data.currentQuestionIndex,
        gameSettings: {
          timeLimit: gameSettings.timeLimit ?? 30,
          answerRevealTime: gameSettings.answerRevealTime ?? 10,
          eliminationMode: gameSettings.eliminationMode ?? false,
          eliminationThreshold: gameSettings.eliminationThreshold ?? 3,
          autoMode: gameSettings.autoMode ?? true
        },
        hasStarted: data.hasStarted,
        phaseStartedAt: data.phaseStartedAt,
        phaseDuration: data.phaseDuration,
        paused: data.paused,
        lastGradedQuestionId: (data as any).lastGradedQuestionId || null,
        activeQuestionId: (data as any).activeQuestionId || null,
        lastUpdated: data.lastUpdated
      };
      
      this.notifyListeners('GAME_DATA_UPDATE', this.gameData);
    });

    realtimeGameSync.addEventListener('SYNC_ERROR', (error: any) => {
      console.error('🔥 Firestore 동기화 오류:', error);
      this.notifyListeners('SYNC_ERROR', error);
    });

    realtimeGameSync.addEventListener('ROOM_NOT_FOUND', () => {
      console.warn('🔥 방을 찾을 수 없음');
      this.gameData = this.getInitialGameData();
      this.notifyListeners('ROOM_NOT_FOUND', null);
    });
  }

  /**
   * 방에 연결 (호스트 또는 참여자)
   */
  async connectToRoom(roomCode: string): Promise<void> {
    this.currentRoomCode = roomCode;
    await realtimeGameSync.connectToRoom(roomCode);
    try { localStorage.setItem('currentRoomCode', roomCode); } catch {}
  }

  /**
   * 방 생성 (호스트용)
   */
  async createRoom(room: Room): Promise<void> {
    this.currentRoomCode = room.code;
    await realtimeGameSync.connectToRoom(room.code);
    try { localStorage.setItem('currentRoomCode', room.code); } catch {}
    
    const roomData: Partial<RealtimeGameData> = {
      room,
      questions: [],
      gameSettings: this.gameData.gameSettings
    };
    
    await realtimeGameSync.createRoom(roomData);
  }

  /**
   * 플레이어 추가
   */
  async addPlayer(player: Player): Promise<void> {
    await realtimeGameSync.joinPlayer(player);
    this.notifyListeners('PLAYER_JOIN', player);
  }

  /**
   * 플레이어 제거
   */
  async removePlayer(playerId: string): Promise<void> {
    await realtimeGameSync.leavePlayer(playerId);
    this.notifyListeners('PLAYER_LEAVE', playerId);
  }

  /**
   * 플레이어 업데이트 (점수, 답안 등)
   */
  async updatePlayer(playerId: string, updates: Partial<Player>): Promise<void> {
    await realtimeGameSync.updatePlayer(playerId, updates);
  }

  /**
   * 게임 데이터 업데이트
   */
  async updateGameData(updates: Partial<GameSyncData>): Promise<void> {
    // GameSyncData를 RealtimeGameData 형식으로 변환
    const firestoreUpdates: Partial<RealtimeGameData> = {
      room: updates.room,
      questions: updates.questions,
      gameState: updates.gameState,
      currentQuestionIndex: updates.currentQuestionIndex,
      gameSettings: updates.gameSettings,
      hasStarted: updates.hasStarted,
      phaseStartedAt: updates.phaseStartedAt,
      phaseDuration: updates.phaseDuration,
      paused: updates.paused
    };

    // players 배열을 객체로 변환 (Firestore 최적화, undefined 값 제거)
    if (updates.players) {
      const playersObj: { [key: string]: Player } = {};
      updates.players.forEach(player => {
        // undefined 값 제거
        const cleanPlayer = Object.fromEntries(
          Object.entries(player).filter(([_, v]) => v !== undefined)
        ) as Player;
        playersObj[player.id] = cleanPlayer;
      });
      firestoreUpdates.players = playersObj;
    }

    await realtimeGameSync.updateGameState(firestoreUpdates);
  }

  /**
   * 배치 플레이어 업데이트 (성능 최적화)
   */
  async batchUpdatePlayers(playerUpdates: { [playerId: string]: Partial<Player> }): Promise<void> {
    await realtimeGameSync.batchUpdatePlayers(playerUpdates);
  }

  /**
   * 현재 게임 데이터 가져오기
   */
  getGameData(): GameSyncData {
    return { ...this.gameData };
  }

  /**
   * 이벤트 리스너 등록
   */
  addEventListener(eventType: string, callback: Function): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
  }

  /**
   * 이벤트 리스너 제거
   */
  removeEventListener(eventType: string, callback: Function): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * 리스너들에게 알림
   */
  private notifyListeners(eventType: string, data: any): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('🔥 리스너 콜백 오류:', error);
        }
      });
    }
  }

  /**
   * 방 삭제
   */
  async deleteRoom(): Promise<void> {
    if (this.currentRoomCode) {
      await realtimeGameSync.deleteRoom();
      this.currentRoomCode = null;
      this.gameData = this.getInitialGameData();
      try { localStorage.removeItem('currentRoomCode'); } catch {}
    }
  }

  /**
   * 연결 해제
   */
  disconnect(): void {
    realtimeGameSync.disconnect();
    this.currentRoomCode = null;
    this.gameData = this.getInitialGameData();
    try { localStorage.removeItem('currentRoomCode'); } catch {}
  }

  /**
   * 연결 상태 확인
   */
  isConnected(): boolean {
    return realtimeGameSync.isConnected();
  }

  /**
   * 현재 방 코드 가져오기
   */
  getCurrentRoomCode(): string | null {
    return this.currentRoomCode;
  }

  /**
   * 하위 호환성을 위한 메서드들
   */
  broadcast(eventType: string, data: any): void {
    // SYSTEM_MESSAGE는 Firestore를 통해서만 전달
    if (eventType === 'SYSTEM_MESSAGE') {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      realtimeGameSync.updateGameState({ 
        lastMessage: {
          id: messageId,
          message: data.message,
          type: data.type,
          timestamp: Date.now()
        }
      } as any);
    } else {
      // 다른 이벤트는 로컬만
      this.notifyListeners(eventType, data);
    }
    
    logger.debug('🔥 Broadcast:', eventType);
  }

  startHeartbeat(): void {
    // 5초마다 ping으로 lastUpdated만 갱신하여 방 만료 방지
    const ping = async () => {
      try { await realtimeGameSync.ping(); } catch {}
    };
    ping();
    setInterval(ping, 5000);
  }

  updateGameState(changes: Partial<GameSyncData>): void {
    // 비동기 버전으로 리다이렉트
    this.updateGameData(changes).catch(error => {
      console.error('🔥 게임 상태 업데이트 오류:', error);
    });
  }
}

// 싱글톤 인스턴스 (기존 syncManager와 호환)
export const firestoreSyncManager = new FirestoreSyncManager();
