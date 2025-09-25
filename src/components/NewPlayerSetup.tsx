/**
 * 새로운 모듈 기반 플레이어 설정 페이지
 * 실시간 동기화와 방 참여 시스템
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Player } from '../types/game';
import { useNewGameContext } from '../contexts/NewGameContext';
import Avatar from 'avataaars2';
import AvatarOptionSelector from './AvatarOptionSelector';
import ColorPicker from './ColorPicker';
import roomManager from '../services/RoomManager';
import './PlayerSetup.css';

interface PlayerData {
  nickname: string;
  roomCode: string;
}

const NewPlayerSetup: React.FC = () => {
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [avatarConfig, setAvatarConfig] = useState<any>({
    topType: 'ShortHairDreads01',
    accessoriesType: 'Blank',
    hairColor: 'BrownDark',
    facialHairType: 'Blank',
    clotheType: 'Hoodie',
    clotheColor: 'Blue03',
    eyeType: 'Happy',
    eyebrowType: 'Default',
    mouthType: 'Smile',
    skinColor: 'Light',
    backgroundColor: 'PastelBlue'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { actions } = useNewGameContext();
  const navigate = useNavigate();

  const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  useEffect(() => {
    // localStorage에서 플레이어 데이터 로드
    const saved = localStorage.getItem('playerData');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // 방 코드 즉시 재검증: 유효하지 않으면 메인으로 되돌림
        const code = String(data.roomCode || '').toUpperCase();
        const rooms = roomManager.getPublicRooms();
        const exists = rooms.some(r => r.code === code);
        if (!exists) {
          navigate('/');
          return;
        }
        setPlayerData({ nickname: String(data.nickname || ''), roomCode: code });
      } catch (e) {
        console.error('플레이어 데이터 파싱 실패:', e);
        navigate('/');
      }
    } else {
      console.error('플레이어 데이터 없음');
      navigate('/');
    }
  }, [navigate]);

  const handleAvatarChange = (category: string, value: string) => {
    setAvatarConfig((prev: any) => ({
      ...prev,
      [category]: value
    }));
  };

  const getBackgroundColor = (colorName: string): string => {
    const colorMap: { [key: string]: string } = {
      Black: '#262e33', Brown: '#8B4513', Red: '#C93305',
      Blue01: '#65C9FF', Blue02: '#5199E4', Blue03: '#25557C',
      Gray01: '#E6E6E6', Gray02: '#929598', Heather: '#3C4F5C',
      PastelBlue: '#B1E2FF', PastelGreen: '#A7FFC4', PastelOrange: '#FFDEB5',
      PastelRed: '#FFAFB9', PastelYellow: '#FFFFB1', Pink: '#FF488E', White: '#FFFFFF'
    };
    return colorMap[colorName] || '#B1E2FF';
  };

  const handleJoinGame = async () => {
    if (!playerData) {
      setError('플레이어 데이터가 없습니다.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 방 존재 여부 확인
      // 최초 코드 입력단에서 검증을 통과했으므로 여기서는 재검증으로 막지 않음.

      const newPlayer: Player = {
        id: 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        nickname: playerData.nickname,
        team: selectedTeam || undefined,
        score: 0,
        isEliminated: false,
        hasSubmitted: false,
        avatar: avatarConfig
      };

      console.log('🎮 방 참여 시작:', {
        roomCode: playerData.roomCode,
        player: newPlayer
      });

      // 방에 참여
      // 단순: 1회 시도 (로직 단순화). 실패 시 에러 노출 후 메인으로 유도
      const ok = actions.joinRoom(playerData.roomCode, newPlayer);
      if (!ok) {
        setError('존재하지 않거나 종료된 방입니다. 방 코드를 확인하세요.');
        setIsLoading(false);
        return;
      }

      // 현재 플레이어 정보 저장
      localStorage.setItem('currentPlayer', JSON.stringify(newPlayer));

      console.log('✅ 방 참여 완료');

      // 게임 화면으로 이동
      navigate('/game-player');

    } catch (error) {
      console.error('방 참여 실패:', error);
      setError('방 참여에 실패했습니다. 방 코드를 다시 확인해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  if (!playerData) {
    return (
      <div className="player-setup loading">
        <div className="loading-message">
          <h2>플레이어 데이터를 로딩 중...</h2>
          <p>잠시만 기다려주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="player-setup">
      <header className="setup-header">
        <button className="back-btn" onClick={handleBack}>
          ← 뒤로가기
        </button>
        <h1>아바타 & 팀 설정</h1>
        <div className="room-info">
          <span>닉네임: <strong>{playerData.nickname}</strong></span>
          <span>방 코드: <strong>{playerData.roomCode}</strong></span>
        </div>
      </header>

      <div className="setup-content">
        <div className="avatar-section">
          <h2>아바타 커스터마이징</h2>
          
          <div className="avatar-preview">
            <div
              className="custom-avatar-background"
              style={{ backgroundColor: getBackgroundColor(avatarConfig.backgroundColor) }}
            >
              <Avatar {...avatarConfig} />
            </div>
          </div>

          <div className="avatar-controls">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <button className="randomize-btn" onClick={() => {
                const hairOptions = [
                  'LongHairBigHair','LongHairBob','LongHairBun','LongHairCurly','LongHairCurvy','LongHairDreads','LongHairFrida',
                  'LongHairFro','LongHairFroBand','LongHairNotTooLong','LongHairShavedSides','LongHairMiaWallace','LongHairStraight',
                  'LongHairStraight2','LongHairStraightStrand','ShortHairDreads01','ShortHairDreads02','ShortHairFrizzle','ShortHairShaggyMullet',
                  'ShortHairShortCurly','ShortHairShortFlat','ShortHairShortRound','ShortHairShortWaved','ShortHairSides','ShortHairTheCaesar'
                ];
                const pick = (arr: string[]) => arr[Math.floor(Math.random()*arr.length)];
                setAvatarConfig((prev: any) => ({
                  ...prev,
                  topType: pick(hairOptions),
                  hairColor: pick(['Auburn','Black','Blonde','BlondeGolden','Brown','BrownDark','PastelPink','Platinum','Red','SilverGray']),
                  clotheType: pick(['BlazerShirt','BlazerSweater','CollarSweater','GraphicShirt','Hoodie','Overall','ShirtCrewNeck','ShirtScoopNeck','ShirtVNeck']),
                  clotheColor: pick(['Black','Blue01','Blue02','Blue03','Gray01','Gray02','Heather','PastelBlue','PastelGreen','PastelOrange','PastelRed','PastelYellow','Pink','Red','White']),
                  eyeType: pick(['Close','Cry','Default','Dizzy','EyeRoll','Happy','Hearts','Side','Squint','Surprised','Wink','WinkWacky']),
                  mouthType: pick(['Concerned','Default','Disbelief','Eating','Grimace','Sad','ScreamOpen','Serious','Smile','Tongue','Twinkle','Vomit']),
                  skinColor: pick(['Tanned','Yellow','Pale','Light','Brown','DarkBrown','Black']),
                  backgroundColor: pick(['Black','Blue01','Blue02','Blue03','Gray01','Gray02','Heather','PastelBlue','PastelGreen','PastelOrange','PastelRed','PastelYellow','Pink','White'])
                }));
              }}>🎲 랜덤 생성</button>
            </div>
            <ColorPicker
              skinColor={avatarConfig.skinColor}
              hairColor={avatarConfig.hairColor}
              clotheColor={avatarConfig.clotheColor}
              backgroundColor={avatarConfig.backgroundColor}
              onSkinColorChange={(value) => handleAvatarChange('skinColor', value)}
              onHairColorChange={(value) => handleAvatarChange('hairColor', value)}
              onClotheColorChange={(value) => handleAvatarChange('clotheColor', value)}
              onBackgroundColorChange={(value) => handleAvatarChange('backgroundColor', value)}
            />

            <AvatarOptionSelector
              label="헤어스타일"
              options={[
                'LongHairBigHair','LongHairBob','LongHairBun','LongHairCurly','LongHairCurvy','LongHairDreads','LongHairFrida',
                'LongHairFro','LongHairFroBand','LongHairNotTooLong','LongHairShavedSides','LongHairMiaWallace','LongHairStraight',
                'LongHairStraight2','LongHairStraightStrand','ShortHairDreads01','ShortHairDreads02','ShortHairFrizzle','ShortHairShaggyMullet',
                'ShortHairShortCurly','ShortHairShortFlat','ShortHairShortRound','ShortHairShortWaved','ShortHairSides','ShortHairTheCaesar'
              ]}
              value={avatarConfig.topType}
              onChange={(value) => handleAvatarChange('topType', value)}
            />

            

            <AvatarOptionSelector
              label="눈"
              options={[
                'Close','Cry','Default','Dizzy','EyeRoll','Happy','Hearts','Side','Squint','Surprised','Wink','WinkWacky'
              ]}
              value={avatarConfig.eyeType}
              onChange={(value) => handleAvatarChange('eyeType', value)}
            />

            <AvatarOptionSelector
              label="입"
              options={[
                'Concerned','Default','Disbelief','Eating','Grimace','Sad','ScreamOpen','Serious','Smile','Tongue','Twinkle','Vomit'
              ]}
              value={avatarConfig.mouthType}
              onChange={(value) => handleAvatarChange('mouthType', value)}
            />

            <AvatarOptionSelector
              label="옷"
              options={[
                'BlazerShirt','BlazerSweater','CollarSweater','GraphicShirt','Hoodie','Overall','ShirtCrewNeck','ShirtScoopNeck','ShirtVNeck'
              ]}
              value={avatarConfig.clotheType}
              onChange={(value) => handleAvatarChange('clotheType', value)}
            />

            
          </div>
        </div>

        <div className="team-section">
          <h2>팀 선택 (선택사항)</h2>
          <p className="team-description">
            팀을 선택하지 않으면 개인전으로 참여합니다.
          </p>
          
          <div className="team-grid">
            <button
              className={`team-option ${selectedTeam === '' ? 'selected' : ''}`}
              onClick={() => setSelectedTeam('')}
            >
              개인전
            </button>
            {teams.map(team => (
              <button
                key={team}
                className={`team-option ${selectedTeam === team ? 'selected' : ''}`}
                onClick={() => setSelectedTeam(team)}
              >
                {team}팀
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="error-message">
            <p>❌ {error}</p>
          </div>
        )}

        <div className="setup-actions">
          <button 
            className="btn-primary"
            onClick={handleJoinGame}
            disabled={isLoading}
          >
            {isLoading ? '참여 중...' : '게임 참여하기'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewPlayerSetup;
