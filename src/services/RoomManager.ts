/**
 * 방 생명주기 관리자
 * 방 생성, 삭제, 자동 정리를 담당
 */

import { Room, Player } from '../types/game';
import syncManager from './SyncManager';
// 단순화를 위해 공개방 목록 동기화는 localStorage 기반으로만 처리합니다.

export interface PublicRoom {
  id: string;
  code: string;
  subject: string;
  isPublic: boolean;
  playerCount: number;
  hostActive: boolean;
  lastHostActivity: number;
  createdAt: number;
  hostId?: string; // Optional: Firestore에서 가져올 때 포함될 수 있음
}

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private publicRooms: Map<string, PublicRoom> = new Map();
  private hostSessions: Map<string, { sessionId: string; lastActivity: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private deletionTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.loadRoomsFromStorage();
    this.startCleanupTimer();
    this.setupSyncListeners();
    
    // debug: console.debug('RoomManager init')
  }

  private loadRoomsFromStorage() {
    try {
      const savedRooms = localStorage.getItem('publicRooms');
      if (savedRooms) {
        const roomData = JSON.parse(savedRooms) as PublicRoom[];
        // 찌꺼기 정리: 마지막 활동 이후 10초 초과이면서 hostActive=false 인 방은 제거
        const now = Date.now();
        const filtered = roomData.filter(r => (now - (r.lastHostActivity || r.createdAt)) < 10000);
        filtered.forEach((room: PublicRoom) => {
          this.publicRooms.set(room.code, room);
        });
        if (filtered.length !== roomData.length) {
          this.saveRoomsToStorage();
        }
      }
    } catch (e) {
      console.error('방 데이터 로드 실패:', e);
    }
  }

  private saveRoomsToStorage() {
    try {
      const roomArray = Array.from(this.publicRooms.values());
      localStorage.setItem('publicRooms', JSON.stringify(roomArray));
      // debug: console.debug('publicRooms saved:', roomArray.length)
    } catch (e) {
      console.error('방 데이터 저장 실패:', e);
    }
  }

  private setupSyncListeners() {
    // BroadcastChannel 기반 동기화 제거로 단순화

    syncManager.addEventListener('HOST_ACTIVITY', (data: { roomCode: string; sessionId: string }) => {
      this.updateHostActivity(data.roomCode, data.sessionId);
    });

    // ROOM_CREATED/DELETED 개별 이벤트는 사용하지 않고, ROOMS_UPDATED만 사용해 단순화

    syncManager.addEventListener('ROOM_DELETED', (roomCode: string) => {
      this.publicRooms.delete(roomCode);
      this.rooms.delete(roomCode);
      this.hostSessions.delete(roomCode);
      this.saveRoomsToStorage();
    });
  }

  private startCleanupTimer() {
    // 명시적 삭제 외에는 자동 삭제하지 않음
    this.cleanupInterval = null;
  }

  private cleanupInactiveRooms() {}

  public createRoom(subject: string, isPublic: boolean, hostId: string): Room {
    const roomCode = this.generateRoomCode();
    const now = Date.now();
    
    const room: Room = {
      id: `room_${now}`,
      code: roomCode,
      subject,
      isPublic,
      hostId,
      players: [],
      questions: [],
      currentQuestionIndex: 0,
      gameState: 'waiting',
      eliminationMode: false,
      eliminationThreshold: 3,
      autoMode: true,
      answerRevealTime: 10
    };

    this.rooms.set(roomCode, room);
    // debug: console.debug('createRoom:', { roomCode, subject, isPublic })

    if (isPublic) {
      const publicRoom: PublicRoom = {
        id: room.id,
        code: roomCode,
        subject,
        isPublic: true,
        playerCount: 0,
        hostActive: true,
        lastHostActivity: now,
        createdAt: now
      };

      this.publicRooms.set(roomCode, publicRoom);
      this.hostSessions.set(roomCode, { sessionId: hostId, lastActivity: now });
      
      // 저장만 수행(표시는 참여하기 탭이 localStorage에서 직접 로드)
      this.saveRoomsToStorage();
      // 즉시 브로드캐스트하여 타 탭이 빠르게 감지
      syncManager.broadcast('GAME_DATA_UPDATE', { room, players: [], questions: room.questions, gameState: 'waiting', currentQuestionIndex: 0 });
      // debug: console.debug('public room stored:', publicRoom.code)
    }

    // debug: console.debug('room created:', roomCode)
    return room;
  }

  public deleteRoom(roomCode: string) {
    // 항상 삭제 시도하여 흔적 제거
    this.publicRooms.delete(roomCode);
    this.rooms.delete(roomCode);
    this.hostSessions.delete(roomCode);
    this.saveRoomsToStorage();
    // 목록 동기화는 localStorage 기반 주기 로드로 처리(추가 브로드캐스트 불필요)
    syncManager.broadcast('ROOM_DELETED', roomCode);
    // debug: console.debug('room deleted:', roomCode)
  }

  public updateHostActivity(roomCode: string, sessionId: string) {
    const room = this.publicRooms.get(roomCode);
    if (room) {
      room.hostActive = true;
      room.lastHostActivity = Date.now();
      
      this.hostSessions.set(roomCode, { sessionId, lastActivity: Date.now() });
      this.saveRoomsToStorage();
      // 예정된 삭제 타이머가 있으면 취소
      const t = this.deletionTimers.get(roomCode);
      if (t) {
        clearTimeout(t);
        this.deletionTimers.delete(roomCode);
      }
    }
  }

  public markHostInactive(roomCode: string) {
    // 호스트 비활성: 10초 동안 활동 없으면 방 삭제
    const room = this.publicRooms.get(roomCode);
    if (!room) return;
    room.hostActive = false;
    this.saveRoomsToStorage();
    if (this.deletionTimers.has(roomCode)) return;
    const timer = setTimeout(() => {
      const r = this.publicRooms.get(roomCode);
      if (!r) return;
      const now = Date.now();
      const inactiveForMs = now - (r.lastHostActivity || r.createdAt);
      if (!r.hostActive && inactiveForMs >= 10000) {
        this.deleteRoom(roomCode);
      }
      this.deletionTimers.delete(roomCode);
    }, 10000);
    this.deletionTimers.set(roomCode, timer);
  }

  public joinRoom(roomCode: string, player: Player): Room | null {
    let room = this.rooms.get(roomCode);
    try {
      console.info('[JOIN_TRACE] RM.enter', {
        at: new Date().toISOString(),
        roomCode,
        memoryHas: !!room,
        publicHas: this.publicRooms.has(roomCode)
      });
    } catch {}
    
    // 방이 메모리에 없으면 공개방 목록에서 찾아서 생성
    if (!room) {
      let publicRoom = this.publicRooms.get(roomCode);
      // 스토리지 최신화 후 한 번 더 탐색 (탭 간 지연 보정)
      if (!publicRoom) {
        try {
          const saved = localStorage.getItem('publicRooms');
          if (saved) {
            const list = JSON.parse(saved) as PublicRoom[];
            const now = Date.now();
            const filtered = list.filter(r => (now - (r.lastHostActivity || r.createdAt)) < 10000);
            this.publicRooms.clear();
            filtered.forEach(r => this.publicRooms.set(r.code, r));
            publicRoom = this.publicRooms.get(roomCode);
          }
        } catch {}
      }
      if (publicRoom) {
        room = {
          id: publicRoom.id,
          code: roomCode,
          subject: publicRoom.subject,
          isPublic: publicRoom.isPublic,
          hostId: publicRoom.hostId || '',
          players: [],
          questions: [],
          currentQuestionIndex: 0,
          gameState: 'waiting',
          eliminationMode: false,
          eliminationThreshold: 3,
          autoMode: true,
          answerRevealTime: 10
        };
        this.rooms.set(roomCode, room);
        try { console.info('[JOIN_TRACE] RM.stubCreated', { roomCode }); } catch {}
      }
    }

    if (!room) {
      try { console.warn('[JOIN_TRACE] RM.noRoom', { roomCode }); } catch {}
      return null;
    }

    const already = room.players.find(p => p.id === player.id);
    if (!already) {
      room.players.push(player);
      const publicRoom = this.publicRooms.get(roomCode);
      if (publicRoom) {
        publicRoom.playerCount = room.players.length;
      this.saveRoomsToStorage();
      }
      syncManager.addPlayer(player);
    }
    // 항상 최신 상태 브로드캐스트
    syncManager.updateGameData({ room, players: room.players });
    try { console.info('[JOIN_TRACE] RM.success', { roomCode, players: room.players.length }); } catch {}
    return room;
  }

  public getRoom(roomCode: string): Room | null {
    return this.rooms.get(roomCode) || null;
  }

  public getPublicRooms(): PublicRoom[] {
    // 항상 스토리지 최신화(탭 간 동기화 보정)
    try {
      const saved = localStorage.getItem('publicRooms');
      if (saved) {
        const list = JSON.parse(saved) as PublicRoom[];
        const now = Date.now();
        const filtered = list.filter(r => (now - (r.lastHostActivity || r.createdAt)) < 10000);
        this.publicRooms.clear();
        filtered.forEach(r => this.publicRooms.set(r.code, r));
      }
    } catch {}
    return Array.from(this.publicRooms.values());
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  public destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.log('🏠 RoomManager 종료됨');
  }
}

// 싱글톤 인스턴스
export const roomManager = new RoomManager();
export default roomManager;
