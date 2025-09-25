import React from 'react';
import './AvatarOptionSelector.css';
import { getKoreanLabel } from '../utils/labelUtils';

interface AvatarOptionSelectorProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  isColor?: boolean;
}

const AvatarOptionSelector: React.FC<AvatarOptionSelectorProps> = ({
  label,
  options,
  value,
  onChange,
  isColor = false
}) => {
  const getColorMapping = (option: string): string => {
    const colorMap: { [key: string]: string } = {
      // 헤어 컬러
      'Auburn': '#A55728',
      'Black': '#2C1B18',
      'Blonde': '#F8E71C',
      'BlondeGolden': '#D2B356',
      'Brown': '#724133',
      'BrownDark': '#4A312C',
      'PastelPink': '#F59797',
      'Platinum': '#ECDCBF',
      'Red': '#C93305',
      'SilverGray': '#E8E1E1',
      
      // 의상 컬러
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
      'White': '#FFFFFF',
      
      // 피부색
      'Tanned': '#FD9841',
      'Yellow': '#F8D25C',
      'Pale': '#FDBCB4',
      'Light': '#EDB98A',
      'BrownSkin': '#D08B5B',
      'DarkBrown': '#AE5D29',
    };
    
    return colorMap[option] || '#000000';
  };

  const formatDisplayName = (option: string): string => {
    return getKoreanLabel(option);
  };

  return (
    <div className="option-selector">
      <label className="option-label">{label}</label>
      <div className="options-container">
        {options.map((option) => (
          <button
            key={option}
            className={`option-button ${value === option ? 'selected' : ''} ${isColor ? 'color-option' : ''}`}
            onClick={() => onChange(option)}
            style={isColor ? { backgroundColor: getColorMapping(option) } : {}}
            title={formatDisplayName(option)}
          >
            {isColor ? (
              <span className="color-preview" style={{ backgroundColor: getColorMapping(option) }} />
            ) : (
              <span className="option-text">{formatDisplayName(option)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default AvatarOptionSelector;
