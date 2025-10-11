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
  const [dragState, setDragState] = useState<{
    draggedIndex: number | null;
    dragOverIndex: number | null;
    dragOverPosition: 'before' | 'after' | null;
  }>({
    draggedIndex: null,
    dragOverIndex: null,
    dragOverPosition: null
  });

  const resetDragState = () => {
    setDragState({
      draggedIndex: null,
      dragOverIndex: null,
      dragOverPosition: null
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    const status = getQuestionStatus(index);
    if (status === 'completed') {
      e.preventDefault();
      return;
    }
    
    setDragState(prev => ({ ...prev, draggedIndex: index }));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Firefox 호환성
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    
    if (dragState.draggedIndex === null) return;
    
    const status = getQuestionStatus(index);
    if (status === 'completed') return;
    
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const position: 'before' | 'after' = offsetY < rect.height / 2 ? 'before' : 'after';
    
    setDragState(prev => ({
      ...prev,
      dragOverIndex: index,
      dragOverPosition: position
    }));
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 자식 요소로 이동하는 경우는 무시
    const currentTarget = e.currentTarget as HTMLElement;
    const relatedTarget = e.relatedTarget as HTMLElement;
    
    if (relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
    
    setDragState(prev => ({
      ...prev,
      dragOverIndex: null,
      dragOverPosition: null
    }));
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    const { draggedIndex, dragOverPosition } = dragState;
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      resetDragState();
      return;
    }

    const dragStatus = getQuestionStatus(draggedIndex);
    const dropStatus = getQuestionStatus(dropIndex);
    
    // 완료된 문제는 이동 불가
    if (dragStatus === 'completed' || dropStatus === 'completed') {
      resetDragState();
      return;
    }
    
    // 새로운 배열 생성
    const newQuestions = [...questions];
    const draggedQuestion = newQuestions[draggedIndex];
    
    // 드래그된 아이템 제거
    newQuestions.splice(draggedIndex, 1);
    
    // 삽입할 인덱스 계산
    let insertIndex = dropIndex;
    
    // 드래그된 아이템이 원래 위치보다 앞에 있었으면 인덱스 조정
    if (draggedIndex < dropIndex) {
      insertIndex = dropIndex - 1;
    }
    
    // before/after 위치에 따른 조정
    if (dragOverPosition === 'after') {
      insertIndex += 1;
    }
    
    // 배열 범위 내로 제한
    insertIndex = Math.max(0, Math.min(insertIndex, newQuestions.length));
    
    // 새 위치에 삽입
    newQuestions.splice(insertIndex, 0, draggedQuestion);
    
    // 상태 업데이트
    onReorder(newQuestions);
    resetDragState();
  };

  const handleDragEnd = () => {
    resetDragState();
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
            const isDragging = dragState.draggedIndex === index;
            const isDragOver = dragState.dragOverIndex === index;
            
            return (
              <div
                key={question.id}
                data-question-id={question.id}
                className={`question-card ${status} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${isDragOver && dragState.dragOverPosition==='before' ? 'insertion-before' : ''} ${isDragOver && dragState.dragOverPosition==='after' ? 'insertion-after' : ''}`}
                draggable={(gameState === 'waiting' || gameState === 'finished') && status !== 'completed'}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                <div className="question-header">
                  <div className="question-number">문제 {index + 1}</div>
                  <div className={`badge badge--neutral ${question.type}`}>
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
