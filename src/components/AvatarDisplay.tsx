import React from 'react';
import Avatar from 'avataaars2';

export interface AvatarDisplayProps {
  avatar?: any;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const AvatarDisplay: React.FC<AvatarDisplayProps> = ({ avatar, size = 50, className = '', style = {} }) => {
  if (!avatar) {
    return (
      <div 
        className={`avatar-display ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor: '#f0f0f0',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...style
        }}
      >
        <span style={{ fontSize: size * 0.3 }}>?</span>
      </div>
    );
  }

  const getBackgroundColor = (colorName: string): string => {
    const colorMap: { [key: string]: string } = {
      'Black': '#262E33',
      'Blue01': '#65C5DB',
      'Blue02': '#5199E4', 
      'Blue03': '#25557C',
      'Gray01': '#E6E6FA',
      'Gray02': '#C0C0C0',
      'Heather': '#3C4F5C',
      'PastelBlue': '#B1E2FF',
      'PastelGreen': '#B5EAD6',
      'PastelOrange': '#FFD5A3',
      'PastelRed': '#FFAAA5',
      'PastelYellow': '#FFF3A0',
      'Pink': '#FF6B6B',
      'Red': '#E74C3C',
      'White': '#FFFFFF'
    };
    return colorMap[colorName] || '#B1E2FF';
  };

  return (
    <div 
      className={`avatar-display ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        backgroundColor: getBackgroundColor(avatar.backgroundColor || 'PastelBlue'),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
    >
      <Avatar
        style={{ width: size * 0.85, height: size * 0.85 }}
        avatarStyle="Transparent"
        topType={avatar.topType || 'ShortHairShortFlat'}
        accessoriesType={avatar.accessoriesType || 'Blank'}
        hairColor={avatar.hairColor || 'BrownDark'}
        facialHairType="Blank"
        facialHairColor="BrownDark"
        clotheType={avatar.clotheType || 'ShirtCrewNeck'}
        clotheColor={avatar.clotheColor || 'Blue01'}
        eyeType={avatar.eyeType || 'Happy'}
        eyebrowType={avatar.eyebrowType || 'Default'}
        mouthType={avatar.mouthType || 'Smile'}
        skinColor={avatar.skinColor || 'Light'}
      />
    </div>
  );
};

export default AvatarDisplay;
