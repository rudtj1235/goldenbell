import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../contexts/GameContext';
import './MainPage.css';

interface PublicRoom {
  id: string;
  code: string;
  subject: string;
  isPublic: boolean;
  playerCount: number;
}

const MainPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [subject, setSubject] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  
  const { state, dispatch } = useGameContext();
  const navigate = useNavigate();

  useEffect(() => {
    // 로컬스토리지에서 공개방 목록 로드
    const loadPublicRooms = () => {
      const savedRooms = localStorage.getItem('publicRooms');
      console.log('🔍 localStorage에서 공개방 로드:', savedRooms);
      if (savedRooms) {
        const rooms = JSON.parse(savedRooms);
        console.log('📋 로드된 공개방 목록:', rooms);
        setPublicRooms(rooms);
      } else {
        console.log('❌ localStorage에 공개방 데이터 없음');
      }
    };
    loadPublicRooms();
    
    // 페이지 포커스될 때마다 공개방 목록 새로고침
    const handleFocus = () => {
      console.log('🔄 페이지 포커스 - 공개방 목록 새로고침');
      loadPublicRooms();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleCreateRoom = () => {
    if (subject.trim().length === 0 || subject.length > 10) {
      alert('주제는 1-10자 이내로 입력해주세요.');
      return;
    }
    
    console.log('🚀 방 생성 시작 - 주제:', subject.trim(), '공개방:', isPublic);
    
    // 방 생성
    dispatch({
      type: 'CREATE_ROOM',
      payload: {
        subject: subject.trim(),
        isPublic,
        hostId: 'host_' + Date.now() // 임시 호스트 ID
      }
    });

    // 공개방 목록 새로고침 (GameContext에서 이미 저장됨)
    if (isPublic) {
      console.log('🔄 공개방 생성 완료, 목록 새로고침 중...');
      setTimeout(() => {
        const savedRooms = localStorage.getItem('publicRooms');
        console.log('🔍 새로고침 시 localStorage 확인:', savedRooms);
        if (savedRooms) {
          const rooms = JSON.parse(savedRooms);
          console.log('📋 새로고침된 공개방 목록:', rooms);
          setPublicRooms(rooms);
        }
      }, 50);
    }
    
    navigate('/admin');
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
    
    // 플레이어 데이터를 로컬스토리지에 임시 저장 (아바타 설정 후 방 참여)
    const playerData = {
      nickname: nickname.trim(),
      roomCode: roomCode.trim().toUpperCase()
    };
    
    localStorage.setItem('playerData', JSON.stringify(playerData));
    navigate('/player-setup');
  };

  const handlePublicRoomClick = (room: PublicRoom) => {
    setRoomCode(room.code);
  };

  return (
    <div className="main-page">
      <header className="main-header">
        <h1>🏆 골든벨 게임</h1>
        <p>실시간 퀴즈 게임으로 지식을 겨뤄보세요!</p>
      </header>

      <div className="tab-container">
        <div className="tab-buttons">
          <button 
            className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            방 만들기
          </button>
          <button 
            className={`tab-button ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => setActiveTab('join')}
          >
            참여하기
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'create' && (
            <div className="create-room-section">
              <h2>새 골든벨 방 만들기</h2>
              <div className="form-group">
                <label htmlFor="subject">주제 (10자 이내)</label>
                <input
                  type="text"
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={10}
                  placeholder="예: 수학 기초, 영어 단어"
                />
                <small>{subject.length}/10</small>
              </div>
              
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                  />
                  <span className="checkmark"></span>
                  공개방으로 만들기
                </label>
              </div>
              
              <button 
                className="create-room-btn"
                onClick={handleCreateRoom}
                disabled={subject.trim().length === 0}
              >
                골든벨 방 만들기
              </button>
            </div>
          )}

          {activeTab === 'join' && (
            <div className="join-room-section">
              <h2>골든벨 방 참여하기</h2>
              <div className="form-group">
                <label htmlFor="nickname">닉네임</label>
                <input
                  type="text"
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="게임에서 사용할 이름"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="roomCode">방 코드</label>
                <input
                  type="text"
                  id="roomCode"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="4자리 코드 입력"
                  maxLength={4}
                />
              </div>
              
              <button 
                className="join-room-btn"
                onClick={handleJoinRoom}
                disabled={nickname.trim().length === 0 || roomCode.trim().length === 0}
              >
                참여하기
              </button>
              
              <div className="public-rooms">
                <h3>공개방 목록</h3>
                {(() => {
                  console.log('🎯 현재 publicRooms 상태:', publicRooms);
                  return null;
                })()}
                {publicRooms.length === 0 ? (
                  <p className="no-rooms">현재 공개된 방이 없습니다.</p>
                ) : (
                  <div className="rooms-list">
                    {publicRooms.map(room => (
                      <div 
                        key={room.id} 
                        className="room-item"
                        onClick={() => handlePublicRoomClick(room)}
                      >
                        <div className="room-info">
                          <span className="room-subject">{room.subject}</span>
                          <span className="room-code">코드: {room.code}</span>
                        </div>
                        <div className="room-stats">
                          <span className="player-count">{room.playerCount}명 참여</span>
                          <span className="room-type">공개</span>
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

export default MainPage;
