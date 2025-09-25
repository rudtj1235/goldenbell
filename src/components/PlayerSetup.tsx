import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from 'avataaars2';
import { AvatarOptions, defaultAvatarOptions, avatarOptions } from '../types/avatar';
import { useGameContext } from '../contexts/GameContext';
import { Player } from '../types/game';
import AvatarOptionSelector from './AvatarOptionSelector';
import ColorPicker from './ColorPicker';
import './PlayerSetup.css';

const PlayerSetup: React.FC = () => {
  const [avatarConfig, setAvatarConfig] = useState<AvatarOptions>(defaultAvatarOptions);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [showTeamSelection, setShowTeamSelection] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { dispatch } = useGameContext();

  const teams = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)); // A-Z

  const updateAvatarOption = (key: keyof AvatarOptions, value: any) => {
    setAvatarConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const randomizeAvatar = () => {
    setIsRandomizing(true);
    
    const randomConfig: AvatarOptions = {};
    
    Object.keys(avatarOptions).forEach(key => {
      const optionKey = key as keyof typeof avatarOptions;
      const options = avatarOptions[optionKey];
      const randomIndex = Math.floor(Math.random() * options.length);
      randomConfig[optionKey] = options[randomIndex] as any;
    });
    
    setAvatarConfig(randomConfig);
    
    setTimeout(() => setIsRandomizing(false), 500);
  };

  const getBackgroundColor = (colorName: string): string => {
    const colorMap: { [key: string]: string } = {
      'Black': '#262e33',
      'Blue01': '#65C9FF',
      'Blue02': '#5199E4',
      'Blue03': '#25557C',
      'Gray01': '#E6E6E6',
      'Gray02': '#929598',
      'Heather': '#3C4F5C',
      'PastelBlue': '#B1E2FF',
      'PastelGreen': '#A7FFC4',
      'PastelOrange': '#FFDEB5',
      'PastelRed': '#FFAFB9',
      'PastelYellow': '#FFFFB1',
      'Pink': '#FF488E',
      'Red': '#C93305',
      'White': '#FFFFFF'
    };
    return colorMap[colorName] || '#B1E2FF';
  };

  const handleTeamSelect = (team: string) => {
    setSelectedTeam(selectedTeam === team ? '' : team);
  };

  const handleConfirm = () => {
    const playerData = JSON.parse(localStorage.getItem('playerData') || '{}');
    
    if (!playerData.nickname || !playerData.roomCode) {
      alert('잘못된 접근입니다. 메인 페이지에서 다시 시작해주세요.');
      navigate('/');
      return;
    }
    
    const newPlayer: Player = {
      id: 'player_' + Date.now(),
      nickname: playerData.nickname,
      team: selectedTeam || undefined,
      score: 0,
      isEliminated: false,
      hasSubmitted: false,
      avatar: avatarConfig
    };
    
    // 방 코드 검증 (실제로는 서버에서 검증해야 함)
    const isValidRoom = true; // 임시로 항상 true
    
    if (!isValidRoom) {
      alert('존재하지 않는 방 코드입니다. 다시 확인해주세요.');
      return;
    }
    
    console.log('🎮 방 참여 시작:', {
      roomCode: playerData.roomCode,
      player: newPlayer
    });

    // 방에 참여
    dispatch({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: playerData.roomCode,
        player: newPlayer
      }
    });

    console.log('✅ JOIN_ROOM 액션 디스패치 완료');
    
    // 현재 플레이어 정보 저장
    localStorage.setItem('currentPlayer', JSON.stringify(newPlayer));
    
    // 게임 화면으로 이동
    navigate('/game-player');
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="player-setup">
      <header className="setup-header">
        <button className="back-btn" onClick={handleBack}>
          ← 돌아가기
        </button>
        <h1>아바타 꾸미기 & 팀 선택</h1>
        <p>게임에서 사용할 아바타를 꾸미고 팀을 선택하세요</p>
      </header>

      <div className="setup-content">
        <div className="avatar-section">
          <h2>🎭 아바타 꾸미기</h2>
          <div className="avatar-preview">
            <div 
              ref={avatarRef}
              className={`avatar-container ${isRandomizing ? 'randomizing' : ''}`}
            >
              <div 
                className="custom-avatar-background"
                style={{ backgroundColor: getBackgroundColor(avatarConfig.backgroundColor || 'PastelBlue') }}
              >
                <Avatar
                  style={{ width: '200px', height: '200px' }}
                  avatarStyle="Transparent"
                  topType={avatarConfig.topType || 'ShortHairShortFlat'}
                  accessoriesType={avatarConfig.accessoriesType || 'Blank'}
                  hairColor={avatarConfig.hairColor || 'BrownDark'}
                  facialHairType="Blank"
                  facialHairColor="BrownDark"
                  clotheType="ShirtCrewNeck"
                  clotheColor={avatarConfig.clotheColor || 'Blue01'}
                  eyeType={avatarConfig.eyeType || 'Happy'}
                  eyebrowType={avatarConfig.eyebrowType || 'Default'}
                  mouthType={avatarConfig.mouthType || 'Smile'}
                  skinColor={avatarConfig.skinColor || 'Light'}
                />
              </div>
            </div>
            
            <button 
              className="randomize-btn" 
              onClick={randomizeAvatar}
              disabled={isRandomizing}
            >
              {isRandomizing ? '변경 중...' : '🎲 랜덤 생성'}
            </button>
          </div>

          <div className="customization-options">
            <ColorPicker
              skinColor={avatarConfig.skinColor!}
              hairColor={avatarConfig.hairColor!}
              clotheColor={avatarConfig.clotheColor!}
              backgroundColor={avatarConfig.backgroundColor!}
              onSkinColorChange={(value) => updateAvatarOption('skinColor', value)}
              onHairColorChange={(value) => updateAvatarOption('hairColor', value)}
              onClotheColorChange={(value) => updateAvatarOption('clotheColor', value)}
              onBackgroundColorChange={(value) => updateAvatarOption('backgroundColor', value)}
            />
            
            <div className="features-section">
              <div className="options-grid">
                <AvatarOptionSelector
                  label="헤어 스타일"
                  options={avatarOptions.topType}
                  value={avatarConfig.topType!}
                  onChange={(value) => updateAvatarOption('topType', value)}
                />
                
                <AvatarOptionSelector
                  label="눈"
                  options={avatarOptions.eyeType}
                  value={avatarConfig.eyeType!}
                  onChange={(value) => updateAvatarOption('eyeType', value)}
                />
                
                <AvatarOptionSelector
                  label="눈썹"
                  options={avatarOptions.eyebrowType}
                  value={avatarConfig.eyebrowType!}
                  onChange={(value) => updateAvatarOption('eyebrowType', value)}
                />
                
                <AvatarOptionSelector
                  label="입"
                  options={avatarOptions.mouthType}
                  value={avatarConfig.mouthType!}
                  onChange={(value) => updateAvatarOption('mouthType', value)}
                />
                
                <AvatarOptionSelector
                  label="액세서리"
                  options={avatarOptions.accessoriesType}
                  value={avatarConfig.accessoriesType!}
                  onChange={(value) => updateAvatarOption('accessoriesType', value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="team-section">
          <h2>👥 팀 선택</h2>
          <p className="team-description">
            팀을 선택하면 팀원들과 함께 점수를 경쟁할 수 있습니다.<br/>
            개인으로 참여하려면 팀을 선택하지 마세요.
          </p>
          
          <div className="team-selection">
            <button
              className="team-select-btn"
              onClick={() => setShowTeamSelection(!showTeamSelection)}
            >
              {selectedTeam ? `${selectedTeam}팀 선택됨` : '팀 선택하기'}
            </button>
            
            {showTeamSelection && (
              <div className="team-grid">
                {teams.map(team => (
                  <button
                    key={team}
                    className={`team-btn ${selectedTeam === team ? 'selected' : ''}`}
                    onClick={() => handleTeamSelect(team)}
                  >
                    {team}
                  </button>
                ))}
              </div>
            )}
            
            {selectedTeam && (
              <div className="selected-team-info">
                <span className="team-badge">{selectedTeam}팀</span>
                <button 
                  className="clear-team-btn"
                  onClick={() => setSelectedTeam('')}
                >
                  팀 선택 해제
                </button>
              </div>
            )}
            
            {!selectedTeam && (
              <div className="individual-mode">
                <span className="individual-badge">개인 참여</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="setup-actions">
        <button className="confirm-btn" onClick={handleConfirm}>
          확인
        </button>
      </div>
    </div>
  );
};

export default PlayerSetup;
