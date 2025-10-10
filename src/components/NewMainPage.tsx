/**
 * 새로운 모듈 기반 메인 페이지
 * RoomManager와 SyncManager를 활용한 실시간 동기화
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNewGameContext } from '../contexts/NewGameContext';
import roomManager, { PublicRoom } from '../services/RoomManager';
import { db } from '../config/firebase';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import eventBus from '../services/EventBus';
// FirestoreTest 제거
import './MainPage.css';
import { useAuth } from '../contexts/AuthContext';

const NewMainPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [subject, setSubject] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { actions } = useNewGameContext();
  const { user, loading, signInWithGoogle, signOutApp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Firestore 모든 방 실시간 구독
    const roomsRef = collection(db, 'game_rooms');
    const off = onSnapshot(roomsRef, (snap) => {
      const rooms: PublicRoom[] = snap.docs.map((d) => {
        const data: any = d.data();
        const r = data.room || {};
        return {
          id: r.id || d.id,
          code: d.id,
          subject: r.subject || '주제',
          isPublic: r.isPublic === true,
          playerCount: (data.players && typeof data.players === 'object') ? Object.keys(data.players).length : 0,
          hostActive: true,
          lastHostActivity: data.updatedAt?.toMillis?.() || Date.now(),
          createdAt: data.createdAt?.toMillis?.() || Date.now()
        } as PublicRoom;
      });
      setPublicRooms(rooms);
    });

    const unsubscribers = [
      eventBus.on('ROOMS_UPDATED', handleRoomsUpdated),
      eventBus.on('ROOM_CREATED', handleRoomCreated),
      eventBus.on('ROOM_DELETED', handleRoomDeleted)
    ];

    return () => {
      off();
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  const loadPublicRooms = () => {};

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
      
      await actions.createRoom(subject.trim(), isPublic);
      
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

  // 닉네임 검증 함수
  const validateNickname = (name: string): { isValid: boolean; message?: string } => {
    if (!name.trim()) {
      return { isValid: false, message: '닉네임을 입력해주세요.' };
    }
    
    // 한글과 영어/숫자/기타 문자 분리
    const koreanChars = name.match(/[가-힣]/g) || [];
    const otherChars = name.match(/[^가-힣]/g) || [];
    
    // 한글 4글자, 영어/숫자 8글자 제한
    if (koreanChars.length > 4) {
      return { isValid: false, message: '한글은 4글자까지 입력 가능합니다.' };
    }
    
    if (otherChars.length > 8) {
      return { isValid: false, message: '영어/숫자는 8글자까지 입력 가능합니다.' };
    }
    
    return { isValid: true };
  };

  const handleJoinRoom = () => {
    const nicknameValidation = validateNickname(nickname);
    if (!nicknameValidation.isValid) {
      alert(nicknameValidation.message);
      return;
    }

    if (roomCode.trim().length === 0) {
      alert('방 코드를 입력해주세요.');
      return;
    }
    const code = roomCode.trim().toUpperCase();
    // Firestore에서 코드 유효성 검증
    // roomCode는 game_rooms의 문서 ID로 사용됨
    (async () => {
      try {
        const roomRef = doc(db, 'game_rooms', code);
        const snap = await getDoc(roomRef);
        if (!snap.exists()) {
          alert('존재하지 않거나 종료된 방입니다. 방 코드를 확인하세요.');
          return;
        }
        const data: any = snap.data();
        if (!(data?.room?.isPublic)) {
          // 비공개 방이라도 코드가 있다면 입장 허용. 필요 시 막을 수 있음
        }
        // 플레이어 데이터를 localStorage에 저장하고 설정 페이지로 이동
        const playerData = {
          nickname: nickname.trim(),
          roomCode: code
        };
        localStorage.setItem('playerData', JSON.stringify(playerData));
        navigate('/player-setup');
      } catch (e) {
        console.error(e);
        alert('방 검증 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    })();
  };

  const handlePublicRoomClick = (room: PublicRoom) => {
    setRoomCode(room.code);
    setActiveTab('join');
  };

  // 참여하기 탭 클릭 시 즉시 로드되도록 탭 버튼 핸들러를 래핑
  const selectTab = (tab: 'create' | 'join') => {
    setActiveTab(tab);
    if (tab === 'join') {
      // Firestore 실시간 리스트가 이미 반영되므로 추가 작업 없음
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
        <h1>🏆골든벨 AI</h1>
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {user && !user.isAnonymous ? (
            <>
              <span style={{ fontSize: 18, fontWeight: 700 }}>안녕하세요, {user.displayName || user.email}님</span>
              <button className="btn btn--light" onClick={signOutApp} disabled={loading}>로그아웃</button>
            </>
          ) : (
            <button className="btn btn--light" onClick={signInWithGoogle} disabled={loading}>Google 로그인</button>
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
        </div>

        <div className="tab-content">
          {activeTab === 'create' && (
            <div className="create-room-section">
              <h2>새 골든벨 방 만들기</h2>
              
              <div style={{ height: '168px' }}>
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
                  <p className="form-help" style={{ color: '#111', marginTop: '4px', marginBottom: '0' }}>
                    공개방은 다른 사용자들이 참여할 수 있습니다.
                  </p>
                </div>
              </div>
              
              <button 
                className="btn btn--y-sunset"
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
              
              <div style={{ height: '168px' }}>
              <div className="form-group">
                <label htmlFor="nickname">닉네임</label>
                <input
                  id="nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => {
                    const value = e.target.value;
                    // 실시간 글자 수 제한
                    const koreanChars = value.match(/[가-힣]/g) || [];
                    const otherChars = value.match(/[^가-힣]/g) || [];
                    
                    if (koreanChars.length <= 4 && otherChars.length <= 8) {
                      setNickname(value);
                    }
                  }}
                  placeholder="영어 8글자, 한글 4글자 이내"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="roomCode">방 코드</label>
                <input
                  id="roomCode"
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="4자리 방 코드 입력"
                  maxLength={4}
                />
              </div>
              </div>
              
              <button 
                className="btn btn--y-sunset"
                onClick={handleJoinRoom}
                disabled={!validateNickname(nickname).isValid || roomCode.trim().length === 0}
              >
                참여하기
              </button>
              
              <div className="public-rooms" style={{ marginTop: '30px' }}>
                <h3>
                  방 목록 
                  <span className="room-count">({publicRooms.length}개)</span>
                </h3>
                
                {publicRooms.length === 0 ? (
                  <div className="no-rooms">
                    <p>현재 활성화된 방이 없습니다.</p>
                    <small>새로운 방을 만들어보세요!</small>
                  </div>
                ) : (
                  <div className="rooms-list">
                    {publicRooms.map(room => (
                      <div 
                        key={room.code} 
                        className={`room-item ${getActivityStatus(room)}`}
                        onClick={() => room.isPublic ? handlePublicRoomClick(room) : null}
                        style={{ cursor: room.isPublic ? 'pointer' : 'default', opacity: room.isPublic ? 1 : 0.7 }}
                      >
                        <div className="room-info">
                          <span className="room-subject">{room.subject}</span>
                          <span className="room-code">
                            코드: {room.isPublic ? room.code : '****'}
                            {!room.isPublic && ' 🔒'}
                          </span>
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

        </div>
      </div>
    </div>
  );
};

export default NewMainPage;
