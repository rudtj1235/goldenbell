import React, { useState } from 'react';
import { Question, GameState } from '../types/game';
import './QuestionStack.css';

interface QuestionStackProps {
  questions: Question[];
  onDelete: (questionId: string) => void;
  onEdit?: (question: Question) => void;
  onReorder: (reorderedQuestions: Question[]) => void;
  currentIndex: number;
  gameState: GameState;
  hasStarted?: boolean;
}

const QuestionStack: React.FC<QuestionStackProps> = ({
  questions,
  onDelete,
  onEdit,
  onReorder,
  currentIndex,
  gameState,
  hasStarted
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    // 완료된 문제는 이동 불가
    const status = getQuestionStatus(index);
    if (status === 'completed') return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const status = getQuestionStatus(index);
    if (status === 'completed') return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const pos: 'before' | 'after' = offsetY < rect.height / 2 ? 'before' : 'after';
    setDragOverIndex(index);
    setDragOverPosition(pos);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
    setDragOverPosition(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDragOverPosition(null);
      return;
    }

    const newQuestions = [...questions];
    const draggedQuestion = newQuestions[draggedIndex];
    const dropStatus = getQuestionStatus(dropIndex);
    const dragStatus = getQuestionStatus(draggedIndex);
    // 완료된 위치로의 이동 금지, 완료된 아이템 이동 금지
    if (dropStatus === 'completed' || dragStatus === 'completed') {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    
    // 드래그된 아이템 제거
    newQuestions.splice(draggedIndex, 1);
    
    // 새 위치에 삽입
    let insertIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
    // 리스트 끝으로 이동 허용 (맨 아래도 드랍 허용)
    if (dropIndex >= newQuestions.length) {
      insertIndex = newQuestions.length;
    }
    // 위/아래 위치 보정
    if (dragOverPosition === 'after') {
      insertIndex = draggedIndex < dropIndex ? dropIndex : dropIndex + 1;
      if (insertIndex > newQuestions.length) insertIndex = newQuestions.length;
    } else if (dragOverPosition === 'before') {
      insertIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
      if (insertIndex < 0) insertIndex = 0;
    }
    newQuestions.splice(insertIndex, 0, draggedQuestion);
    
    onReorder(newQuestions);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDragOverPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const getQuestionTypeText = (type: string): string => {
    switch (type) {
      case 'ox': return 'OX';
      case 'multiple': return '객관식';
      case 'short': return '주관식';
      default: return '문제';
    }
  };

  const getQuestionStatus = (index: number): 'upcoming' | 'current' | 'completed' => {
    if (gameState === 'waiting' || gameState === 'finished') {
      // 게임 시작 전에는 모두 upcoming
      if (!hasStarted) return 'upcoming';
      // 게임 진행 중 waiting/finished 상태에서는 현재 문제까지 완료
      return index <= currentIndex ? 'completed' : 'upcoming';
    }
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'upcoming';
  };

  const truncateText = (text: string, maxLength: number = 50): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="question-stack">
      {questions.length === 0 ? (
        <div className="empty-stack">
          <div className="empty-message">
            <span className="empty-icon">📝</span>
            <p>문제가 없습니다</p>
            <p className="empty-sub">문제를 추가해보세요</p>
          </div>
        </div>
      ) : (
        <div className="questions-list">
          {questions.map((question, index) => {
            const status = getQuestionStatus(index);
            const isDragging = draggedIndex === index;
            const isDragOver = dragOverIndex === index;
            
            return (
              <div
                key={question.id}
                data-question-id={question.id}
                className={`question-card ${status} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${isDragOver && dragOverPosition==='before' ? 'insertion-before' : ''} ${isDragOver && dragOverPosition==='after' ? 'insertion-after' : ''}`}
                draggable={gameState === 'waiting' && status !== 'completed'}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                <div className="question-header">
                  <div className="question-number">문제 {index + 1}</div>
                  <div className="badge badge--neutral">
                    {question.type === 'ox' ? 'OX' : question.type === 'multiple' ? '객관식' : '단답형'}
                  </div>
                  <div className="badge badge--warn">{question.score}점</div>
                </div>
                
                <div className="question-content">
                  <p className="question-text">
                    {truncateText(question.question)}
                  </p>
                  
                  {question.type === 'ox' && (
                    <div className="question-answer-preview">
                      정답: {question.correctAnswer}
                    </div>
                  )}
                  
                  {question.type === 'multiple' && question.options && (
                    <div className="question-answer-preview">
                      정답: {question.options[question.correctAnswer as number]}
                    </div>
                  )}
                  
                  {question.type === 'short' && (
                    <div className="question-answer-preview">
                      정답: {question.correctAnswer}
                    </div>
                  )}
                </div>
                
                <div className="question-footer">
                  {/* 현재 진행 중인 문제가 아니면 수정/삭제 버튼 표시 */}
                  {status !== 'current' && (
                    <div className="question-actions">
                      {status !== 'completed' && onEdit && (
                        <button
                          className="edit-question-btn"
                          onClick={() => onEdit(question)}
                          title="문제 수정"
                        >
                          수정
                        </button>
                      )}
                      <button
                        className="delete-question-btn"
                        onClick={() => {
                          if (status !== 'completed') {
                            // 미완료 문제는 실제 삭제
                            onDelete(question.id);
                          } else {
                            // 완료된 문제는 화면에서만 숨기기
                            const questionCard = document.querySelector(`[data-question-id="${question.id}"]`) as HTMLElement;
                            if (questionCard) {
                              questionCard.style.display = 'none';
                            }
                          }
                        }}
                        title="문제 삭제"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
                
                {status === 'current' && (
                  <div className="current-indicator">
                    <span>진행 중</span>
                  </div>
                )}
                
                {status === 'completed' && (
                  <div className="completed-indicator">
                    <span>완료</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {questions.length > 0 && gameState === 'waiting' && (
        <div className="stack-help">
          <p>문제를 드래그하여 순서를 변경할 수 있습니다</p>
        </div>
      )}
    </div>
  );
};

export default QuestionStack;
