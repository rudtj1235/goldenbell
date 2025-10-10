import React from 'react';

// 유니코드 분수 매핑
const unicodeFractions: { [key: string]: string } = {
  '1/2': '½',
  '1/3': '⅓',
  '2/3': '⅔',
  '1/4': '¼',
  '3/4': '¾',
  '1/5': '⅕',
  '2/5': '⅖',
  '3/5': '⅗',
  '4/5': '⅘',
  '1/6': '⅙',
  '5/6': '⅚',
  '1/8': '⅛',
  '3/8': '⅜',
  '5/8': '⅝',
  '7/8': '⅞',
};

// 분수를 CSS로 렌더링하는 컴포넌트
export const FractionDisplay: React.FC<{ numerator: string; denominator: string }> = ({ numerator, denominator }) => (
  <span className="fraction-display" style={{
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontSize: '0.9em',
    verticalAlign: 'middle',
    margin: '0 2px'
  }}>
    <span style={{ 
      borderBottom: '1px solid currentColor', 
      paddingBottom: '1px',
      lineHeight: '1',
      fontSize: '0.8em'
    }}>
      {numerator}
    </span>
    <span style={{ 
      lineHeight: '1',
      fontSize: '0.8em',
      paddingTop: '1px'
    }}>
      {denominator}
    </span>
  </span>
);

// 모든 분수를 CSS 가로선으로 렌더링하는 함수
export const renderSimpleFractions = (text: string): React.ReactNode => {
  if (!text) return text;

  // HTML sup/sub 태그가 있는 분수를 먼저 처리
  let processedText = text;
  const supSubPattern = /<sup>(\d+)<\/sup>\/<sub>(\d+)<\/sub>/g;
  let parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = supSubPattern.exec(processedText)) !== null) {
    // 매치 이전 텍스트 추가
    if (match.index > lastIndex) {
      parts.push(processedText.slice(lastIndex, match.index));
    }
    
    // 분수 컴포넌트 추가
    parts.push(
      <FractionDisplay 
        key={`sup-${match.index}`} 
        numerator={match[1]} 
        denominator={match[2]} 
      />
    );
    
    lastIndex = match.index + match[0].length;
  }

  // 남은 텍스트 추가
  if (lastIndex < processedText.length) {
    parts.push(processedText.slice(lastIndex));
  }

  // sup/sub 패턴이 있었다면 해당 결과를 사용
  if (parts.length > 1) {
    processedText = parts.map(part => typeof part === 'string' ? part : '').join('');
    // 이미 처리된 부분을 제외하고 다시 처리
  }

  // 간단한 분수 (a/b 형태)를 모두 CSS로 렌더링
  const fractionPattern = /\b(\d+)\/(\d+)\b/g;
  const finalParts: React.ReactNode[] = [];
  lastIndex = 0;

  // 전체 텍스트에서 분수 패턴 찾기
  const fullText = typeof processedText === 'string' ? processedText : text;
  
  while ((match = fractionPattern.exec(fullText)) !== null) {
    // 매치 이전 텍스트 추가
    if (match.index > lastIndex) {
      finalParts.push(fullText.slice(lastIndex, match.index));
    }
    
    // 분수 컴포넌트 추가
    finalParts.push(
      <FractionDisplay 
        key={`frac-${match.index}`} 
        numerator={match[1]} 
        denominator={match[2]} 
      />
    );
    
    lastIndex = match.index + match[0].length;
  }

  // 남은 텍스트 추가
  if (lastIndex < fullText.length) {
    finalParts.push(fullText.slice(lastIndex));
  }

  return finalParts.length > 1 ? <>{finalParts}</> : text;
};
