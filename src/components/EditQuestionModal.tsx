import React, { useState, useEffect } from 'react';
import { Question, QuestionType } from '../types/game';
import './QuestionModal.css'; // 기존 QuestionModal 스타일 재사용

interface EditQuestionModalProps {
  question: Question;
  onClose: () => void;
  onSubmit: (updatedQuestion: Question) => void;
}

interface MultipleChoiceOption {
  text: string;
  isCorrect: boolean;
}

const EditQuestionModal: React.FC<EditQuestionModalProps> = ({ question, onClose, onSubmit }) => {
  const [activeTab, setActiveTab] = useState<QuestionType>(question.type);
  const [questionText, setQuestionText] = useState(question.question);
  const [score, setScore] = useState(question.score);
  
  // OX 문제용
  const [oxAnswer, setOxAnswer] = useState<'O' | 'X'>(
    question.type === 'ox' ? (question.correctAnswer as 'O' | 'X') : 'O'
  );
  
  // 객관식 문제용
  const [multipleOptions, setMultipleOptions] = useState<MultipleChoiceOption[]>(() => {
    if (question.type === 'multiple' && question.options) {
      return question.options.map((text, index) => ({
        text,
        isCorrect: index === question.correctAnswer
      }));
    }
    return [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false }
    ];
  });
  
  // 주관식 문제용
  const [shortAnswer, setShortAnswer] = useState(
    question.type === 'short' ? String(question.correctAnswer) : ''
  );

  // 문제 타입이 변경되면 기본값으로 리셋
  useEffect(() => {
    if (activeTab !== question.type) {
      // 타입이 변경되었을 때만 기본값으로 리셋
      if (activeTab === 'ox') {
        setOxAnswer('O');
      } else if (activeTab === 'multiple') {
        setMultipleOptions([
          { text: '', isCorrect: false },
          { text: '', isCorrect: false }
        ]);
      } else if (activeTab === 'short') {
        setShortAnswer('');
      }
    }
  }, [activeTab, question.type]);

  const handleAddOption = () => {
    setMultipleOptions(prev => [...prev, { text: '', isCorrect: false }]);
  };

  const handleRemoveOption = (index: number) => {
    if (multipleOptions.length > 2) {
      setMultipleOptions(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleOptionTextChange = (index: number, text: string) => {
    setMultipleOptions(prev => prev.map((option, i) => 
      i === index ? { ...option, text } : option
    ));
  };

  const handleOptionCorrectChange = (index: number) => {
    setMultipleOptions(prev => prev.map((option, i) => ({
      ...option,
      isCorrect: i === index
    })));
  };

  const validateForm = (): boolean => {
    if (!questionText.trim()) {
      alert('문제를 입력해주세요.');
      return false;
    }

    if (activeTab === 'multiple') {
      const hasCorrectAnswer = multipleOptions.some(option => option.isCorrect);
      const hasEmptyOption = multipleOptions.some(option => !option.text.trim());
      
      if (hasEmptyOption) {
        alert('모든 보기를 입력해주세요.');
        return false;
      }
      
      if (!hasCorrectAnswer) {
        alert('정답을 선택해주세요.');
        return false;
      }
    }

    if (activeTab === 'short' && !shortAnswer.trim()) {
      alert('정답을 입력해주세요.');
      return false;
    }

    return true;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    let correctAnswer: string | number;
    let options: string[] | undefined;

    switch (activeTab) {
      case 'ox':
        correctAnswer = oxAnswer;
        options = ['O', 'X'];
        break;
      case 'multiple':
        correctAnswer = multipleOptions.findIndex(option => option.isCorrect);
        options = multipleOptions.map(option => option.text);
        break;
      case 'short':
        correctAnswer = shortAnswer.trim();
        break;
    }

    const updatedQuestion: Question = {
      ...question, // 기존 question의 id와 기타 속성 유지
      type: activeTab,
      question: questionText.trim(),
      score,
      timeLimit: question.timeLimit, // 기존 timeLimit 유지
      options,
      correctAnswer
    };

    onSubmit(updatedQuestion);
  };

  return (
    <div className="question-modal-overlay" onClick={onClose}>
      <div className="question-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>문제 수정하기</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          <div className="question-type-tabs">
            <button 
              className={`type-tab ${activeTab === 'ox' ? 'active' : ''}`}
              onClick={() => setActiveTab('ox')}
            >
              OX
            </button>
            <button 
              className={`type-tab ${activeTab === 'multiple' ? 'active' : ''}`}
              onClick={() => setActiveTab('multiple')}
            >
              객관식
            </button>
            <button 
              className={`type-tab ${activeTab === 'short' ? 'active' : ''}`}
              onClick={() => setActiveTab('short')}
            >
              단답형
            </button>
          </div>

          <div className="question-form">
            <div className="form-group">
              <label>문제</label>
              <textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="문제를 입력하세요"
                rows={4}
              />
            </div>

            <div className="form-group">
              <label>점수</label>
              <input
                type="number"
                min="1"
                max="100"
                value={score}
                onChange={(e) => setScore(parseInt(e.target.value))}
              />
            </div>

            {activeTab === 'ox' && (
              <div className="ox-section">
                <label>정답</label>
                <div className="ox-options">
                  <label className="ox-option">
                    <input
                      type="radio"
                      name="ox-answer"
                      value="O"
                      checked={oxAnswer === 'O'}
                      onChange={() => setOxAnswer('O')}
                    />
                    <span className="ox-text">O (참)</span>
                  </label>
                  <label className="ox-option">
                    <input
                      type="radio"
                      name="ox-answer"
                      value="X"
                      checked={oxAnswer === 'X'}
                      onChange={() => setOxAnswer('X')}
                    />
                    <span className="ox-text">X (거짓)</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'multiple' && (
              <div className="multiple-section">
                <div className="section-header">
                  <label>보기</label>
                  <button 
                    className="add-option-btn"
                    onClick={handleAddOption}
                    disabled={multipleOptions.length >= 5}
                  >
                    + 보기 추가
                  </button>
                </div>
                <div className="options-list">
                  {multipleOptions.map((option, index) => (
                    <div key={index} className="option-item">
                      <div className="option-number">{index + 1}</div>
                      <input
                        type="text"
                        value={option.text}
                        onChange={(e) => handleOptionTextChange(index, e.target.value)}
                        placeholder={`보기 ${index + 1}`}
                      />
                      <label className="correct-checkbox">
                        <input
                          type="radio"
                          name="correct-answer"
                          checked={option.isCorrect}
                          onChange={() => handleOptionCorrectChange(index)}
                        />
                        <span>정답</span>
                      </label>
                      {multipleOptions.length > 2 && (
                        <button 
                          className="remove-option-btn"
                          onClick={() => handleRemoveOption(index)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'short' && (
              <div className="short-section">
                <div className="form-group">
                  <label>정답</label>
                  <input
                    type="text"
                    value={shortAnswer}
                    onChange={(e) => setShortAnswer(e.target.value)}
                    placeholder="정답을 입력하세요"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            취소
          </button>
          <button className="submit-btn" onClick={handleSubmit}>
            수정하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditQuestionModal;
