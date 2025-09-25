/**
 * 이벤트 버스 시스템
 * 컴포넌트 간 느슨한 결합을 위한 이벤트 기반 통신
 */

export type EventCallback = (data?: any) => void;

export interface GameEvent {
  type: string;
  data?: any;
  timestamp: number;
  source?: string;
}

class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private eventHistory: GameEvent[] = [];
  private maxHistorySize = 100;

  constructor() {}

  /**
   * 이벤트 리스너 등록
   */
  public on(eventType: string, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    
    this.listeners.get(eventType)!.add(callback);
    
    // debug: console.debug(`[on] ${eventType}`)
    
    // 언레지스터 함수 반환
    return () => this.off(eventType, callback);
  }

  /**
   * 이벤트 리스너 제거
   */
  public off(eventType: string, callback: EventCallback): void {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType)!.delete(callback);
      
      // 빈 Set이면 삭제
      if (this.listeners.get(eventType)!.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  /**
   * 이벤트 발생
   */
  public emit(eventType: string, data?: any, source?: string): void {
    const event: GameEvent = {
      type: eventType,
      data,
      timestamp: Date.now(),
      source
    };

    // 이벤트 히스토리에 추가
    this.addToHistory(event);

    // 리스너들에게 알림
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType)!.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`이벤트 콜백 에러 [${eventType}]:`, error);
        }
      });
    }

    // debug: console.debug(`[emit] ${eventType}`, data)
  }

  /**
   * 일회성 이벤트 리스너
   */
  public once(eventType: string, callback: EventCallback): void {
    const onceCallback = (data?: any) => {
      callback(data);
      this.off(eventType, onceCallback);
    };
    
    this.on(eventType, onceCallback);
  }

  /**
   * 여러 이벤트 타입에 대한 리스너 등록
   */
  public onMultiple(eventTypes: string[], callback: EventCallback): () => void {
    const unsubscribers = eventTypes.map(type => this.on(type, callback));
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  /**
   * 특정 조건을 만족하는 이벤트만 처리
   */
  public onCondition(eventType: string, condition: (data?: any) => boolean, callback: EventCallback): () => void {
    return this.on(eventType, (data) => {
      if (condition(data)) {
        callback(data);
      }
    });
  }

  /**
   * 이벤트 히스토리 조회
   */
  public getEventHistory(eventType?: string): GameEvent[] {
    if (eventType) {
      return this.eventHistory.filter(event => event.type === eventType);
    }
    return [...this.eventHistory];
  }

  /**
   * 마지막 이벤트 조회
   */
  public getLastEvent(eventType: string): GameEvent | null {
    const events = this.getEventHistory(eventType);
    return events.length > 0 ? events[events.length - 1] : null;
  }

  /**
   * 모든 리스너 제거
   */
  public removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * 현재 등록된 리스너 수 조회
   */
  public getListenerCount(eventType?: string): number {
    if (eventType) {
      return this.listeners.get(eventType)?.size || 0;
    }
    
    let total = 0;
    this.listeners.forEach(listeners => {
      total += listeners.size;
    });
    return total;
  }

  /**
   * 이벤트 히스토리에 추가
   */
  private addToHistory(event: GameEvent): void {
    this.eventHistory.push(event);
    
    // 히스토리 크기 제한
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * 디버그 정보 출력
   */
  public debug(): void {
    console.log('📡 EventBus 상태:');
    console.log('- 등록된 이벤트 타입:', Array.from(this.listeners.keys()));
    console.log('- 총 리스너 수:', this.getListenerCount());
    console.log('- 이벤트 히스토리 수:', this.eventHistory.length);
    
    this.listeners.forEach((listeners, eventType) => {
      console.log(`  ${eventType}: ${listeners.size}개 리스너`);
    });
  }

  /**
   * EventBus 정리
   */
  public destroy(): void {
    this.listeners.clear();
    this.eventHistory = [];
    console.log('📡 EventBus 종료됨');
  }
}

// 싱글톤 인스턴스
export const eventBus = new EventBus();
export default eventBus;
