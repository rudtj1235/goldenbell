import React, { useState, useRef } from 'react';
import Avatar from 'avataaars2';
import { AvatarOptions, defaultAvatarOptions, avatarOptions } from '../types/avatar';
import AvatarOptionSelector from './AvatarOptionSelector';
import ColorPicker from './ColorPicker';
import './AvatarCustomizer.css';

const AvatarCustomizer: React.FC = () => {
  const [avatarConfig, setAvatarConfig] = useState<AvatarOptions>(defaultAvatarOptions);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

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

  const saveAvatarAsSVG = () => {
    if (avatarRef.current) {
      const svgElement = avatarRef.current.querySelector('svg');
      if (svgElement) {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
        const svgUrl = URL.createObjectURL(svgBlob);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = svgUrl;
        downloadLink.download = 'my_avatar.svg';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(svgUrl);
      }
    }
  };

  const enterGameRoom = () => {
    // 실제 게임 룸 입장 로직은 여기에 구현
    const avatarData = JSON.stringify(avatarConfig);
    localStorage.setItem('userAvatar', avatarData);
    alert('아바타가 저장되었습니다! 게임 룸으로 이동합니다.');
    // 여기서 실제로는 게임 룸으로 라우팅하거나 API 호출을 할 수 있습니다.
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


  return (
    <div className="avatar-customizer">
      <div className="avatar-preview-section">
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
          
          <div className="action-buttons">
            <button 
              className="randomize-btn" 
              onClick={randomizeAvatar}
              disabled={isRandomizing}
            >
              {isRandomizing ? '변경 중...' : '🎲 랜덤 생성'}
            </button>
            <button className="save-btn" onClick={saveAvatarAsSVG}>
              💾 SVG 저장
            </button>
            <button className="enter-game-btn" onClick={enterGameRoom}>
              🎮 게임 룸 입장
            </button>
          </div>
        </div>
      </div>

      <div className="customization-section">
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
          <h2>🎭 특징 선택</h2>
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
  );
};

export default AvatarCustomizer;
