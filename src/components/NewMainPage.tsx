/**
 * 새로운 모듈 기반 메인 페이지
 * RoomManager와 SyncManager를 활용한 실시간 동기화
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNewGameContext } from '../contexts/NewGameContext';
import roomManager, { PublicRoom } from '../services/RoomManager';
import eventBus from '../services/EventBus';
import FirestoreTest from './FirestoreTest';
import './MainPage.css';
import { useAuth } from '../contexts/AuthContext';

const NewMainPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'join' | 'test'>('create');
  const [subject, setSubject] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { actions } = useNewGameContext();
  const { user, loading, signInWithGoogle, signOutApp } = useAuth();
  
  // 디버깅용 로그
  console.log('[MAIN_PAGE] User state:', { user, loading, userEmail: user?.email });
  const navigate = useNavigate();

  useEffect(() => {
    // 초기 공개방 목록 로드
    loadPublicRooms();

    // 이벤트 리스너 등록
    // 주의: RoomManager → BroadcastChannel → (각 탭의) RoomManager → EventBus 순으로 흐릅니다.
    // 혹시 EventBus 수신이 누락되어도 SyncManager 직접 수신으로 보강합니다.
    const unsubscribers = [
      eventBus.on('ROOMS_UPDATED', handleRoomsUpdated),
      eventBus.on('ROOM_CREATED', handleRoomCreated),
      eventBus.on('ROOM_DELETED', handleRoomDeleted)
    ];


    // 주기적으로 공개방 목록 새로고침
    const refreshInterval = setInterval(loadPublicRooms, 1000);

    return () => {
      unsubscribers.forEach(unsub => unsub());
      clearInterval(refreshInterval);
    };
  }, []);

  const loadPublicRooms = () => {
    // 단순: localStorage에 저장된 공개방을 직접 읽어 표시 (중간 이벤트 의존 제거)
    try {
      const raw = localStorage.getItem('publicRooms');
      const rooms: PublicRoom[] = raw ? JSON.parse(raw) : [];
      setPublicRooms(rooms);
    } catch {
      setPublicRooms([]);
    }
  };

  const handleRoomsUpdated = (rooms: PublicRoom[]) => {
    // 유지보수성: 이벤트 수신 시에도 저장소를 신뢰. 여기서는 저장소에서 재로딩.
    loadPublicRooms();
  };

  const handleRoomCreated = (room: PublicRoom) => {
    // 저장소 기준으로 재로딩하여 표시 데이터와 저장 데이터의 불일치 제거
    loadPublicRooms();
  };

  const handleRoomDeleted = (roomCode: string) => {
    loadPublicRooms();
  };

  const handleCreateRoom = async () => {
    // 로그인 체크 (더 엄격하게)
    console.log('[CREATE_ROOM] User check:', { user, userEmail: user?.email, isLoggedIn: !!user });
    if (!user || !user.email) {
      alert('방을 만들려면 Google 로그인이 필요합니다.');
      return;
    }

    if (subject.trim().length === 0 || subject.length > 10) {
      alert('주제는 1-10자 이내로 입력해주세요.');
      return;
    }

    setIsLoading(true);
    
    try {
      console.log('🚀 방 생성 시작 - 주제:', subject.trim(), '공개방:', isPublic, '사용자:', user.displayName);
      
      actions.createRoom(subject.trim(), isPublic);
      
      // 잠시 대기 후 관리페이지로 이동
      setTimeout(() => {
        navigate('/admin');
      }, 100);
      
    } catch (error) {
      console.error('방 생성 실패:', error);
      alert('방 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = () => {
    if (nickname.trim().length === 0) {
      alert('닉네임을 입력해주세요.');
      return;
    }

    if (roomCode.trim().length === 0) {
      alert('방 코드를 입력해주세요.');
      return;
    }
    const code = roomCode.trim().toUpperCase();
    // 입장 전 코드 유효성(공개방 목록 기준) 검증: 유효하지 않으면 아바타 페이지로 이동 금지
    try {
      const rooms = roomManager.getPublicRooms();
      const exists = rooms.some(r => r.code === code);
      if (!exists) {
        alert('존재하지 않거나 종료된 방입니다. 방 코드를 확인하세요.');
        return;
      }
    } catch {}

    // 플레이어 데이터를 localStorage에 저장하고 설정 페이지로 이동
    const playerData = {
      nickname: nickname.trim(),
      roomCode: code
    };

    localStorage.setItem('playerData', JSON.stringify(playerData));
    navigate('/player-setup');
  };

  const handlePublicRoomClick = (room: PublicRoom) => {
    setRoomCode(room.code);
    setActiveTab('join');
  };

  // 참여하기 탭 클릭 시 즉시 로드되도록 탭 버튼 핸들러를 래핑
  const selectTab = (tab: 'create' | 'join' | 'test') => {
    setActiveTab(tab);
    if (tab === 'join') {
      // 저장소에서 읽은 값과 RoomManager 메모리 값을 함께 로그로 남겨 원인 파악
      try {
        const raw = localStorage.getItem('publicRooms');
        const fromStorage: PublicRoom[] = raw ? JSON.parse(raw) : [];
        const fromManager = roomManager.getPublicRooms();
        console.log('[JoinTab] Reload rooms', {
          storageCount: fromStorage.length,
          storageCodes: fromStorage.map(r => r.code),
          managerCount: fromManager.length,
          managerCodes: fromManager.map(r => r.code)
        });
      } catch (e) {
        console.warn('[JoinTab] Failed to parse storage rooms', e);
      }
      loadPublicRooms();
    }
  };

  const formatTimeAgo = (timestamp?: number): string => {
    const now = Date.now();
    const base = timestamp || now;
    const diff = now - base;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  };

  const getActivityStatus = (room: PublicRoom): string => {
    const now = Date.now();
    const timeSinceActivity = now - room.lastHostActivity;
    
    if (room.hostActive && timeSinceActivity < 30000) return 'active'; // 30초 이내
    if (timeSinceActivity < 60000) return 'recent'; // 1분 이내
    return 'inactive';
  };

  return (
    <div className="main-page">
      <header className="main-header">
        <h1>🏆 골든벨 게임</h1>
        <p>실시간 퀴즈 게임으로 지식을 겨뤄보세요!</p>
        <div className="status-info">
          <span>🌐 실시간 동기화</span>
          <span>📱 크로스 브라우저 지원</span>
          <span>⚡ 자동 방 정리</span>
        </div>
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {user ? (
            <>
              <span style={{ fontSize: 14 }}>안녕하세요, {user.displayName || user.email}님</span>
              <button className="btn-primary" onClick={signOutApp} disabled={loading}>로그아웃</button>
            </>
          ) : (
            <button className="btn-primary" onClick={signInWithGoogle} disabled={loading}>Google 로그인</button>
          )}
        </div>
      </header>

      <div className="tab-container">
        <div className="tab-buttons">
          <button 
            className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => selectTab('create')}
          >
            방 만들기
          </button>
          <button 
            className={`tab-button ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => selectTab('join')}
          >
            참여하기
          </button>
          <button 
            className={`tab-button ${activeTab === 'test' ? 'active' : ''}`}
            onClick={() => setActiveTab('test')}
          >
            🔥 Firestore 테스트
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'create' && (
            <div className="create-room-section">
              <h2>새 골든벨 방 만들기</h2>
              <div className="form-group">
                <label htmlFor="subject">주제 (10자 이내)</label>
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="예: 한국사, 영어, 수학..."
                  maxLength={10}
                  disabled={isLoading || !user}
                />
                <span className="char-count">{subject.length}/10</span>
                {!user && (
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '8px', 
                    backgroundColor: '#fff3cd', 
                    border: '1px solid #ffeaa7', 
                    borderRadius: '4px', 
                    fontSize: '14px',
                    color: '#856404'
                  }}>
                    💡 방을 만들려면 먼저 Google 로그인을 해주세요.
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    disabled={isLoading || !user}
                  />
                  <span className="checkmark"></span>
                  공개방으로 만들기
                </label>
                <p className="form-help">
                  공개방은 다른 사용자들이 참여할 수 있습니다. 
                  {isPublic && <strong> 관리자가 없으면 10초 후 자동 삭제됩니다.</strong>}
                </p>
              </div>
              
              <button 
                className="btn-primary"
                onClick={handleCreateRoom}
                disabled={subject.trim().length === 0 || isLoading || !user || !user?.email}
              >
                {!user || !user?.email ? 'Google 로그인 필요' : (isLoading ? '방 생성 중...' : '방 만들기')}
              </button>
            </div>
          )}

          {activeTab === 'join' && (
            <div className="join-room-section">
              <h2>골든벨 방 참여하기</h2>
              
              <div className="form-group">
                <label htmlFor="nickname">닉네임</label>
                <input
                  id="nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="게임에서 사용할 닉네임"
                  maxLength={15}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="roomCode">방 코드</label>
                <input
                  id="roomCode"
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="6자리 방 코드 입력"
                  maxLength={6}
                />
              </div>
              
              <button 
                className="btn-primary"
                onClick={handleJoinRoom}
                disabled={nickname.trim().length === 0 || roomCode.trim().length === 0}
              >
                참여하기
              </button>
              
              <div className="public-rooms">
                <h3>
                  공개방 목록 
                  <span className="room-count">({publicRooms.length}개)</span>
                </h3>
                
                {publicRooms.length === 0 ? (
                  <div className="no-rooms">
                    <p>현재 공개된 방이 없습니다.</p>
                    <small>새로운 공개방을 만들어보세요!</small>
                  </div>
                ) : (
                  <div className="rooms-list">
                    {publicRooms.map(room => (
                      <div 
                        key={room.code} 
                        className={`room-item ${getActivityStatus(room)}`}
                        onClick={() => handlePublicRoomClick(room)}
                      >
                        <div className="room-info">
                          <span className="room-subject">{room.subject}</span>
                          <span className="room-code">코드: {room.code}</span>
                        </div>
                        <div className="room-stats">
                          <span className="player-count">👥 {room.playerCount}명</span>
                          <span className="room-activity">
                            {getActivityStatus(room) === 'active' && '🟢 활성'}
                            {getActivityStatus(room) === 'recent' && '🟡 최근'}
                            {getActivityStatus(room) === 'inactive' && '🔴 비활성'}
                          </span>
                          <span className="room-time">{formatTimeAgo(room.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className="test-section">
              <FirestoreTest />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewMainPage;
