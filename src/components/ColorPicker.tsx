import React, { useState } from 'react';
import { getKoreanLabel } from '../utils/labelUtils';
import './ColorPicker.css';

// 공통 색상 팔레트 정의 - 의상과 배경용
export const COMMON_COLORS = [
  'Black', 'Brown', 'Red', 'Blue01', 'Blue02', 'Blue03',
  'Gray01', 'Gray02', 'Heather', 'PastelBlue', 'PastelGreen',
  'PastelOrange', 'PastelRed', 'PastelYellow', 'Pink', 'White'
];

// 피부색 전용 색상
export const SKIN_COLORS = [
  'Tanned', 'Yellow', 'Pale', 'Light', 'Brown', 'DarkBrown', 'Black'
];

// 헤어색 전용 색상
export const HAIR_COLORS = [
  'Auburn', 'Black', 'Blonde', 'BlondeGolden', 'Brown', 'BrownDark', 
  'PastelPink', 'Platinum', 'Red', 'SilverGray'
];

interface ColorPickerProps {
  skinColor: string;
  hairColor: string;
  clotheColor: string;
  backgroundColor: string;
  onSkinColorChange: (value: string) => void;
  onHairColorChange: (value: string) => void;
  onClotheColorChange: (value: string) => void;
  onBackgroundColorChange: (value: string) => void;
}

type ColorTab = 'skin' | 'hair' | 'clothe' | 'background';

const ColorPicker: React.FC<ColorPickerProps> = ({
  skinColor,
  hairColor,
  clotheColor,
  backgroundColor,
  onSkinColorChange,
  onHairColorChange,
  onClotheColorChange,
  onBackgroundColorChange,
}) => {
  const [activeTab, setActiveTab] = useState<ColorTab>('skin');

  // 색상값을 실제 색상으로 변환하는 함수
  const getActualColor = (colorName: string, type: ColorTab): string => {
    const colorMaps = {
      skin: {
        'Tanned': '#FD9841',
        'Yellow': '#F8D25C',
        'Pale': '#FDBCB4',
        'Light': '#EDB98A',
        'Brown': '#D08B5B',
        'DarkBrown': '#AE5D29',
        'Black': '#614335'
      },
      hair: {
        'Auburn': '#A55728',
        'Black': '#2C1B18',
        'Blonde': '#F8E71C',
        'BlondeGolden': '#D2B356',
        'Brown': '#724133',
        'BrownDark': '#4A312C',
        'PastelPink': '#F59797',
        'Platinum': '#ECDCBF',
        'Red': '#C93305',
        'SilverGray': '#E8E1E1'
      },
      clothe: {
        'Black': '#262e33',
        'Brown': '#8B4513',
        'Red': '#C93305',
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
        'White': '#FFFFFF'
      },
      background: {
        'Black': '#262e33',
        'Brown': '#8B4513',
        'Red': '#C93305',
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
        'White': '#FFFFFF'
      }
    };

    return (colorMaps[type] as any)[colorName] || '#ccc';
  };

  const getCurrentColors = (): string[] => {
    switch (activeTab) {
      case 'skin':
        return SKIN_COLORS;
      case 'hair':
        return HAIR_COLORS;
      case 'clothe':
        return COMMON_COLORS;
      case 'background':
        return COMMON_COLORS;
      default:
        return [];
    }
  };

  const getCurrentValue = (): string => {
    switch (activeTab) {
      case 'skin':
        return skinColor;
      case 'hair':
        return hairColor;
      case 'clothe':
        return clotheColor;
      case 'background':
        return backgroundColor;
      default:
        return '';
    }
  };

  const handleColorChange = (color: string) => {
    switch (activeTab) {
      case 'skin':
        onSkinColorChange(color);
        break;
      case 'hair':
        onHairColorChange(color);
        break;
      case 'clothe':
        onClotheColorChange(color);
        break;
      case 'background':
        onBackgroundColorChange(color);
        break;
    }
  };

  const getTabLabel = (tab: ColorTab): string => {
    const labels = {
      skin: '피부색',
      hair: '헤어 컬러',
      clothe: '의상 컬러',
      background: '배경색'
    };
    return labels[tab];
  };

  return (
    <div className="color-picker">
      <h3 className="color-picker-title">🎨 색상 선택</h3>
      
      <div className="color-tabs">
        {(['skin', 'hair', 'clothe', 'background'] as ColorTab[]).map((tab) => (
          <button
            key={tab}
            className={`color-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {getTabLabel(tab)}
          </button>
        ))}
      </div>

      <div className="color-palette">
        <div className="current-color-info">
          <span className="current-color-label">
            현재 {getTabLabel(activeTab)}: {getKoreanLabel(getCurrentValue())}
          </span>
        </div>
        
        <div className="color-grid">
          {getCurrentColors().map((color) => (
            <button
              key={color}
              className={`color-swatch ${getCurrentValue() === color ? 'selected' : ''}`}
              style={{ backgroundColor: getActualColor(color, activeTab) }}
              onClick={() => handleColorChange(color)}
              title={getKoreanLabel(color)}
              aria-label={getKoreanLabel(color)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;
