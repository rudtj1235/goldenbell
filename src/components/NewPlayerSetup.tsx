/**
 * 새로운 모듈 기반 플레이어 설정 페이지
 * 실시간 동기화와 방 참여 시스템
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Player } from '../types/game';
import { useNewGameContext } from '../contexts/NewGameContext';
import { useAuth } from '../contexts/AuthContext';
import AvatarDisplay from './AvatarDisplay';
import AvatarOptionSelector from './AvatarOptionSelector';
import ColorPicker from './ColorPicker';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
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
  const [showCustomize, setShowCustomize] = useState(false);

  const { actions } = useNewGameContext();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  useEffect(() => {
    // localStorage에서 플레이어 데이터 로드
    const saved = localStorage.getItem('playerData');
    if (saved) {
      (async () => {
        try {
          const data = JSON.parse(saved);
          // 방 코드 즉시 재검증: Firestore에서 확인
          const code = String(data.roomCode || '').toUpperCase();
          const ref = doc(db, 'game_rooms', code);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            navigate('/');
            return;
          }
          setPlayerData({ nickname: String(data.nickname || ''), roomCode: code });
        } catch (e) {
          console.error('플레이어 데이터 파싱/검증 실패:', e);
          navigate('/');
        }
      })();
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


  const handleJoinGame = async () => {
    if (!playerData) {
      setError('플레이어 데이터가 없습니다.');
      return;
    }

    // 익명 로그인이 아직 준비되지 않은 경우 대기
    if (loading || !user) {
      setError('연결을 준비하고 있습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 방 존재 여부 확인
      // 최초 코드 입력단에서 검증을 통과했으므로 여기서는 재검증으로 막지 않음.

      const basePlayer: Player = {
        id: 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        nickname: playerData.nickname,
        score: 0,
        isEliminated: false,
        hasSubmitted: false,
        avatar: avatarConfig
      } as any;
      if (selectedTeam) (basePlayer as any).team = selectedTeam;
      const newPlayer = basePlayer;

      console.log('🎮 방 참여 시작:', {
        roomCode: playerData.roomCode,
        player: newPlayer
      });

      // 방에 참여 (Firestore 동기화)
      const ok = await actions.joinRoom(playerData.roomCode, newPlayer);
      if (!ok) {
        setError('존재하지 않거나 종료된 방입니다. 방 코드를 확인하세요.');
        setIsLoading(false);
        return;
      }

      // 현재 플레이어 정보 저장 + roomCode 바인딩
      localStorage.setItem('currentPlayer', JSON.stringify(newPlayer));
      try { localStorage.setItem('currentRoomCode', playerData.roomCode); } catch {}

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
        <button className="exit-button" onClick={handleBack}>
          나가기
        </button>
        <h1>아바타 & 팀 설정</h1>
        <div className="room-info">
          <span>닉네임: <strong>{playerData.nickname}</strong></span>
          <span>방 코드: <strong>{playerData.roomCode}</strong></span>
        </div>
      </header>

      <div className="setup-content">
        <div className="content-card">
          <h2 className="card-title">아바타 커스터마이징</h2>
          <div className="avatar-preview">
            <AvatarDisplay avatar={avatarConfig} size={200} />
          </div>

          <div className="avatar-controls">
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
              <button className={showCustomize ? 'btn btn--light' : 'btn btn--y-sunset'} onClick={() => {
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
                // 활성 상태 전환: 랜덤 생성 활성, 직접 설정 비활성
                setShowCustomize(false);
              }}>랜덤 생성</button>
              <button className={showCustomize ? 'btn btn--y-sunset' : 'btn btn--light'} onClick={() => setShowCustomize(true)}>
                직접 설정
              </button>
            </div>
            {showCustomize && (
              <>
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
              </>
            )}
          </div>
        </div>

        <div className="content-card">
          <h2 className="card-title">팀 선택 (선택사항)</h2>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '20px' }}>
            팀을 선택하지 않으면 개인전으로 참여합니다.
          </p>
          
          <div className="team-card-group">
            <div className="team-card single">
              <button
                className={`team-select-button individual ${selectedTeam === '' ? 'selected' : ''}`}
                onClick={() => setSelectedTeam('')}
              >
                개인전
              </button>
            </div>
            
            <div className="team-card grid">
              <button
                className={`team-select-button team red ${selectedTeam === 'A' ? 'selected' : ''}`}
                onClick={() => setSelectedTeam('A')}
              >
                A팀
              </button>
              <button
                className={`team-select-button team orange ${selectedTeam === 'B' ? 'selected' : ''}`}
                onClick={() => setSelectedTeam('B')}
              >
                B팀
              </button>
              <button
                className={`team-select-button team yellow ${selectedTeam === 'C' ? 'selected' : ''}`}
                onClick={() => setSelectedTeam('C')}
              >
                C팀
              </button>
              <button
                className={`team-select-button team green ${selectedTeam === 'D' ? 'selected' : ''}`}
                onClick={() => setSelectedTeam('D')}
              >
                D팀
              </button>
            </div>
            
            <div className="team-card grid">
              <button
                className={`team-select-button team blue ${selectedTeam === 'E' ? 'selected' : ''}`}
                onClick={() => setSelectedTeam('E')}
              >
                E팀
              </button>
              <button
                className={`team-select-button team indigo ${selectedTeam === 'F' ? 'selected' : ''}`}
                onClick={() => setSelectedTeam('F')}
              >
                F팀
              </button>
              <button
                className={`team-select-button team purple ${selectedTeam === 'G' ? 'selected' : ''}`}
                onClick={() => setSelectedTeam('G')}
              >
                G팀
              </button>
              <button
                className={`team-select-button team gray ${selectedTeam === 'H' ? 'selected' : ''}`}
                onClick={() => setSelectedTeam('H')}
              >
                H팀
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <p>❌ {error}</p>
          </div>
        )}

        <div className="bottom-actions">
          <button 
            className="join-button"
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
