/**
 * Firestore 기반 실시간 게임 동기화 서비스
 * 30명 이상의 다중 사용자 환경을 위한 확장 가능한 아키텍처
 */

import { 
  doc, 
  collection, 
  onSnapshot, 
  updateDoc, 
  setDoc, 
  deleteDoc,
  getDoc,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Room, Player, Question, GameState, GameSettings } from '../types/game';
import logger from '../utils/logger';

export interface RealtimeGameData {
  room: Room | null;
  players: { [playerId: string]: Player }; // 객체로 변경하여 O(1) 접근
  questions: Question[];
  gameState: GameState;
  currentQuestionIndex: number;
  gameSettings: GameSettings;
  hasStarted: boolean;
  phaseStartedAt: number | null;
  phaseDuration: number | null;
  paused: boolean;
  lastUpdated: number;
  version: number; // 동시성 제어를 위한 버전
}

export interface GameUpdate {
  type: 'PLAYER_JOIN' | 'PLAYER_LEAVE' | 'PLAYER_UPDATE' | 'GAME_STATE' | 'QUESTION_UPDATE';
  playerId?: string;
  data?: any;
  timestamp: number;
  version: number;
}

class RealtimeGameSync {
  private roomId: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private localVersion: number = 0;
  private updateQueue: GameUpdate[] = [];
  private isProcessingQueue = false;

  /**
   * 방에 연결하고 실시간 동기화 시작
   */
  async connectToRoom(roomCode: string): Promise<void> {
    if (this.roomId === roomCode && this.unsubscribe) {
      return; // 이미 연결됨
    }

    // 기존 연결 해제
    this.disconnect();

    this.roomId = roomCode;
    const roomRef = doc(db, 'game_rooms', roomCode);

    // 실시간 리스너 설정
    this.unsubscribe = onSnapshot(roomRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data() as RealtimeGameData;
        this.handleRealtimeUpdate(data);
      } else {
        this.notifyListeners('ROOM_NOT_FOUND', null);
      }
    }, (error) => {
      console.error('🔥 Firestore 실시간 동기화 오류:', error);
      this.notifyListeners('SYNC_ERROR', error);
    });

    logger.debug('🔥 Firestore 실시간 동기화 시작:', roomCode);
  }

  /**
   * 방 생성 (호스트용)
   */
  async createRoom(roomData: Partial<RealtimeGameData>): Promise<void> {
    if (!this.roomId) throw new Error('Room ID가 설정되지 않음');

    const initialData: RealtimeGameData = {
      room: roomData.room || null,
      players: {},
      questions: roomData.questions || [],
      gameState: 'waiting',
      currentQuestionIndex: 0,
      gameSettings: roomData.gameSettings || {
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
      lastUpdated: Date.now(),
      version: 1
    };

    const roomRef = doc(db, 'game_rooms', this.roomId);
    await setDoc(roomRef, {
      ...initialData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    logger.debug('🔥 Firestore 방 생성 완료:', this.roomId);
  }

  /**
   * 플레이어 참여 (원자적 연산)
   */
  async joinPlayer(player: Player): Promise<void> {
    if (!this.roomId) throw new Error('Room ID가 설정되지 않음');

    const roomRef = doc(db, 'game_rooms', this.roomId);
    
    await runTransaction(db, async (transaction) => {
      const roomDoc = await transaction.get(roomRef);
      
      if (!roomDoc.exists()) {
        throw new Error('방을 찾을 수 없습니다');
      }

      const data = roomDoc.data() as RealtimeGameData;
      
      // 중복 참여 방지
      if (data.players[player.id]) {
        return; // 이미 참여함
      }

      // 플레이어 추가 (undefined 값 제거)
      const cleanPlayer = Object.fromEntries(
        Object.entries(player).filter(([_, v]) => v !== undefined)
      );
      
      transaction.update(roomRef, {
        [`players.${player.id}`]: cleanPlayer,
        lastUpdated: Date.now(),
        version: increment(1),
        updatedAt: serverTimestamp()
      });
    });

    logger.debug('🔥 플레이어 참여 완료:', player.nickname);
  }

  /**
   * 플레이어 나가기 (원자적 연산)
   */
  async leavePlayer(playerId: string): Promise<void> {
    if (!this.roomId) throw new Error('Room ID가 설정되지 않음');

    const roomRef = doc(db, 'game_rooms', this.roomId);
    
    await runTransaction(db, async (transaction) => {
      const roomDoc = await transaction.get(roomRef);
      
      if (!roomDoc.exists()) {
        return; // 방이 없으면 무시
      }

      const data = roomDoc.data() as RealtimeGameData;
      
      if (!data.players[playerId]) {
        return; // 플레이어가 없으면 무시
      }

      // 플레이어 제거
      const updatedPlayers = { ...data.players };
      delete updatedPlayers[playerId];

      transaction.update(roomRef, {
        players: updatedPlayers,
        lastUpdated: Date.now(),
        version: increment(1),
        updatedAt: serverTimestamp()
      });
    });

    logger.debug('🔥 플레이어 나가기 완료:', playerId);
  }

  /**
   * 플레이어 상태 업데이트 (점수, 답안 등)
   */
  async updatePlayer(playerId: string, updates: Partial<Player>): Promise<void> {
    if (!this.roomId) throw new Error('Room ID가 설정되지 않음');

    const roomRef = doc(db, 'game_rooms', this.roomId);
    const updateData: any = {};
    
    // 각 필드를 개별적으로 업데이트 (undefined/null 값 제외)
    Object.keys(updates).forEach(key => {
      const value = updates[key as keyof Player];
      if (value !== undefined && value !== null) {
        updateData[`players.${playerId}.${key}`] = value;
      }
    });

    updateData.lastUpdated = Date.now();
    updateData.version = increment(1);
    updateData.updatedAt = serverTimestamp();

    await updateDoc(roomRef, updateData);
    logger.debug('🔥 플레이어 업데이트 완료:', playerId, updates);
  }

  /**
   * 게임 상태 업데이트 (원자적 연산, 재시도 로직 포함)
   */
  async updateGameState(updates: Partial<RealtimeGameData>, retryCount = 0): Promise<void> {
    if (!this.roomId) throw new Error('Room ID가 설정되지 않음');

    const roomRef = doc(db, 'game_rooms', this.roomId);
    
    try {
      await runTransaction(db, async (transaction) => {
        const roomDoc = await transaction.get(roomRef);
        
        if (!roomDoc.exists()) {
          throw new Error('방을 찾을 수 없습니다');
        }

        const currentData = roomDoc.data() as RealtimeGameData;
        
        // 버전 충돌 검사 (낙관적 잠금)
        if (updates.version && updates.version <= currentData.version) {
          console.warn('🔥 버전 충돌 감지, 업데이트 무시:', updates.version, '<=', currentData.version);
          return;
        }

        // undefined 값 제거
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([_, v]) => v !== undefined)
        );
        
        const updateData = {
          ...cleanUpdates,
          lastUpdated: Date.now(),
          version: increment(1),
          updatedAt: serverTimestamp()
        };

        transaction.update(roomRef, updateData);
      });

      logger.debug('🔥 게임 상태 업데이트 완료:', updates);
    } catch (error: any) {
      // 버전 충돌(failed-precondition) 또는 동시성 에러 시 재시도
      if ((error.code === 'failed-precondition' || error.code === 'aborted') && retryCount < 3) {
        console.warn(`🔥 업데이트 충돌, 재시도 중... (${retryCount + 1}/3)`);
        // 지수 백오프: 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retryCount)));
        return this.updateGameState(updates, retryCount + 1);
      }
      // 재시도 실패 또는 다른 에러는 무시 (onSnapshot이 최신 상태를 가져옴)
      console.error('🔥 게임 상태 업데이트 실패 (무시됨):', error.code || error.message);
    }
  }

  /**
   * 호스트 활동 핑 (버전 증가 없이 갱신 시간만 갱신)
   */
  async ping(): Promise<void> {
    if (!this.roomId) throw new Error('Room ID가 설정되지 않음');
    const roomRef = doc(db, 'game_rooms', this.roomId);
    await updateDoc(roomRef, {
      lastUpdated: Date.now(),
      updatedAt: serverTimestamp()
    } as any);
  }

  /**
   * 배치 업데이트 (여러 플레이어 동시 업데이트)
   */
  async batchUpdatePlayers(playerUpdates: { [playerId: string]: Partial<Player> }): Promise<void> {
    if (!this.roomId) throw new Error('Room ID가 설정되지 않음');

    const batch = writeBatch(db);
    const roomRef = doc(db, 'game_rooms', this.roomId);

    const updateData: any = {
      lastUpdated: Date.now(),
      version: increment(1),
      updatedAt: serverTimestamp()
    };

    // 각 플레이어 업데이트를 배치에 추가 (undefined 값 제외)
    Object.entries(playerUpdates).forEach(([playerId, updates]) => {
      Object.keys(updates).forEach(key => {
        const value = updates[key as keyof Player];
        if (value !== undefined) {
          updateData[`players.${playerId}.${key}`] = value;
        }
      });
    });

    batch.update(roomRef, updateData);
    await batch.commit();

    logger.debug('🔥 배치 플레이어 업데이트 완료:', Object.keys(playerUpdates));
  }

  /**
   * 실시간 업데이트 처리
   */
  private handleRealtimeUpdate(data: RealtimeGameData): void {
    // 버전 체크로 중복 처리 방지
    if (data.version <= this.localVersion) {
      return;
    }

    this.localVersion = data.version;
    
    // 데이터를 그대로 전달 (FirestoreSyncManager에서 배열 변환 처리)
    this.notifyListeners('GAME_DATA_UPDATE', data);
    
    const playersCount = data.players ? Object.keys(data.players).length : 0;
    logger.debug('🔥 실시간 업데이트 처리:', data.version, '플레이어 수:', playersCount);
  }

  /**
   * 방 삭제
   */
  async deleteRoom(): Promise<void> {
    if (!this.roomId) return;

    const roomRef = doc(db, 'game_rooms', this.roomId);
    await deleteDoc(roomRef);
    
    this.disconnect();
    logger.debug('🔥 방 삭제 완료:', this.roomId);
  }

  /**
   * 연결 해제
   */
  disconnect(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.roomId = null;
    this.localVersion = 0;
    logger.debug('🔥 Firestore 연결 해제');
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
   * 현재 방 상태 가져오기 (일회성)
   */
  async getCurrentRoomData(): Promise<RealtimeGameData | null> {
    if (!this.roomId) return null;

    const roomRef = doc(db, 'game_rooms', this.roomId);
    const docSnapshot = await getDoc(roomRef);
    
    if (docSnapshot.exists()) {
      return docSnapshot.data() as RealtimeGameData;
    }
    
    return null;
  }

  /**
   * 연결 상태 확인
   */
  isConnected(): boolean {
    return this.unsubscribe !== null && this.roomId !== null;
  }

  /**
   * 현재 방 ID 가져오기
   */
  getCurrentRoomId(): string | null {
    return this.roomId;
  }
}

// 싱글톤 인스턴스
export const realtimeGameSync = new RealtimeGameSync();
