/**
 * 독립적인 동기화 매니저 (Firestore 기반으로 업그레이드)
 * 다중 사용자 실시간 동기화를 담당
 * 
 * @deprecated 이 클래스는 RealtimeGameSync로 대체됩니다.
 * 하위 호환성을 위해 유지되지만 내부적으로 Firestore를 사용합니다.
 */

import { Room, Player, Question, GameState, GameSettings } from '../types/game';
import { realtimeGameSync } from './RealtimeGameSync';

export interface SyncEvent {
  type: string;
  payload: any;
  timestamp: number;
  source: string;
}

export interface GameSyncData {
  room: Room | null;
  players: Player[];
  questions: Question[];
  gameState: GameState;
  currentQuestionIndex: number;
  gameSettings: GameSettings;
  hasStarted: boolean;
  phaseStartedAt: number | null; // ms since epoch
  phaseDuration: number | null; // seconds (total for this phase)
  paused: boolean;
  lastGradedQuestionId: string | null;
  activeQuestionId: string | null;
  lastUpdated: number;
}

class SyncManager {
  private channel: BroadcastChannel;
  private sessionId: string;
  private listeners: Map<string, Set<Function>> = new Map();
  private gameData: GameSyncData;

  constructor() {
    this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    this.channel = new BroadcastChannel('golden_bell_sync');
    this.gameData = this.getInitialGameData();
    
    this.setupChannelListener();
    this.startHeartbeat();
    
    console.log('🔄 SyncManager 초기화됨 - SessionID:', this.sessionId);
  }

  private getInitialGameData(): GameSyncData {
    const saved = localStorage.getItem('gameData');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 방어 로직: 저장된 데이터가 이전 세션의 종료 상태거나 방 정보가 없으면 초기 상태로 정규화
        if (!parsed || !parsed.room) {
          return {
            room: null,
            players: [],
            questions: [],
            gameState: 'waiting',
            currentQuestionIndex: 0,
            gameSettings: {
              timeLimit: 5,
              answerRevealTime: 5,
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
        // 질문이 없거나 인덱스가 범위를 벗어나면 항상 대기 상태로 초기화
        if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
          parsed.questions = [];
          parsed.gameState = 'waiting';
          parsed.currentQuestionIndex = 0;
        } else if (
          typeof parsed.currentQuestionIndex !== 'number' ||
          parsed.currentQuestionIndex < 0 ||
          parsed.currentQuestionIndex >= parsed.questions.length
        ) {
          parsed.currentQuestionIndex = 0;
          if (parsed.gameState === 'finished') parsed.gameState = 'waiting';
        }
        // 누락 필드 기본값 보강
        if (!parsed.gameSettings) {
          parsed.gameSettings = {
            timeLimit: 5,
            answerRevealTime: 5,
            eliminationMode: false,
            eliminationThreshold: 3,
            autoMode: true
          };
        }
        if (typeof parsed.hasStarted !== 'boolean') {
          parsed.hasStarted = false;
        }
        if (typeof parsed.phaseStartedAt !== 'number') parsed.phaseStartedAt = null;
        if (typeof parsed.phaseDuration !== 'number') parsed.phaseDuration = null;
        if (typeof parsed.paused !== 'boolean') parsed.paused = false;
        if (typeof parsed.lastGradedQuestionId !== 'string') parsed.lastGradedQuestionId = null;
        if (typeof parsed.activeQuestionId !== 'string') parsed.activeQuestionId = null;
        return parsed;
      } catch (e) {
        console.warn('저장된 게임 데이터 파싱 실패:', e);
      }
    }
    
    return {
      room: null,
      players: [],
      questions: [],
      gameState: 'waiting',
      currentQuestionIndex: 0,
      gameSettings: {
        timeLimit: 5,
        answerRevealTime: 5,
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

  private setupChannelListener() {
    this.channel.addEventListener('message', (event) => {
      const syncEvent: SyncEvent = event.data;
      
      // 자신이 보낸 이벤트는 무시
      if (syncEvent.source === this.sessionId) return;
      
      // console.debug('sync:', syncEvent.type, syncEvent.payload);
      
      this.handleSyncEvent(syncEvent);
    });
  }

  private handleSyncEvent(event: SyncEvent) {
    switch (event.type) {
      case 'GAME_DATA_UPDATE':
        this.updateGameData(event.payload, false);
        break;
      case 'ADJUST_TIME':
        this.notifyListeners('ADJUST_TIME', event.payload);
        break;
      case 'FINALIZE_ANSWERS':
        this.notifyListeners('FINALIZE_ANSWERS', event.payload);
        break;
      case 'ROOM_DELETED': {
        const deletedCode = event.payload as string;
        if (this.gameData.room && this.gameData.room.code === deletedCode) {
          // 현재 방이 삭제되면 게임 데이터 초기화
          this.gameData = this.getInitialGameData();
          this.saveGameData();
          this.notifyListeners('GAME_DATA_UPDATE', this.gameData);
      // log: 방 삭제 초기화 (디버그 모드에서만)
        }
        break;
      }
      case 'PLAYER_JOIN':
        this.handlePlayerJoin(event.payload);
        break;
      case 'PLAYER_LEAVE':
        this.handlePlayerLeave(event.payload);
        break;
      case 'GAME_STATE_CHANGE':
        this.handleGameStateChange(event.payload);
        break;
      case 'HEARTBEAT':
        this.handleHeartbeat(event.payload);
        break;
    }
    
    this.notifyListeners(event.type, event.payload);
  }

  private handlePlayerJoin(player: Player) {
    if (!this.gameData.players.find(p => p.id === player.id)) {
      this.gameData.players.push(player);
      this.gameData.lastUpdated = Date.now();
      this.saveGameData();
      
      // log: 플레이어 참여 (디버그 모드에서만)
    }
  }

  private handlePlayerLeave(playerId: string) {
    this.gameData.players = this.gameData.players.filter(p => p.id !== playerId);
    this.gameData.lastUpdated = Date.now();
    this.saveGameData();
    
    // log: 플레이어 퇴장 (디버그 모드에서만)
  }

  private handleGameStateChange(newState: Partial<GameSyncData>) {
    Object.assign(this.gameData, newState);
    this.gameData.lastUpdated = Date.now();
    this.saveGameData();
    
    // log: 게임 상태 변경 (디버그 모드에서만)
  }

  private handleHeartbeat(data: { sessionId: string; timestamp: number }) {
    // 하트비트 처리 (필요시 구현)
  }

  private startHeartbeat() {
    // 불필요한 하트비트 제거로 트래픽 감소
  }

  public broadcast(type: string, payload: any) {
    const event: SyncEvent = {
      type,
      payload,
      timestamp: Date.now(),
      source: this.sessionId
    };
    
    this.channel.postMessage(event);
    // console.debug('broadcast:', type, payload);
  }

  public updateGameData(newData: Partial<GameSyncData>, broadcast = true) {
    Object.assign(this.gameData, newData);
    this.gameData.lastUpdated = Date.now();
    this.saveGameData();
    
    if (broadcast) {
      this.broadcast('GAME_DATA_UPDATE', newData);
    }
    
    this.notifyListeners('GAME_DATA_UPDATE', this.gameData);
  }

  public getGameData(): GameSyncData {
    return { ...this.gameData };
  }

  public addPlayer(player: Player) {
    if (!this.gameData.players.find(p => p.id === player.id)) {
      this.gameData.players.push(player);
      this.gameData.lastUpdated = Date.now();
      this.saveGameData();
      
      this.broadcast('PLAYER_JOIN', player);
      this.notifyListeners('PLAYER_JOIN', player);
    }
  }

  public removePlayer(playerId: string) {
    this.gameData.players = this.gameData.players.filter(p => p.id !== playerId);
    this.gameData.lastUpdated = Date.now();
    this.saveGameData();
    
    this.broadcast('PLAYER_LEAVE', playerId);
    this.notifyListeners('PLAYER_LEAVE', playerId);
  }

  public updateGameState(changes: Partial<GameSyncData>) {
    Object.assign(this.gameData, changes);
    this.gameData.lastUpdated = Date.now();
    this.saveGameData();
    
    this.broadcast('GAME_STATE_CHANGE', changes);
    this.notifyListeners('GAME_STATE_CHANGE', this.gameData);
  }

  private saveGameData() {
    try {
      localStorage.setItem('gameData', JSON.stringify(this.gameData));
    } catch (e) {
      console.error('게임 데이터 저장 실패:', e);
    }
  }

  public addEventListener(eventType: string, callback: Function) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
  }

  public removeEventListener(eventType: string, callback: Function) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType)!.delete(callback);
    }
  }

  private notifyListeners(eventType: string, data: any) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType)!.forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error('리스너 콜백 에러:', e);
        }
      });
    }
  }

  public destroy() {
    this.channel.close();
    this.listeners.clear();
    // log: SyncManager 종료 (디버그 모드에서만)
  }
}

// 싱글톤 인스턴스
export const syncManager = new SyncManager();
export default syncManager;
