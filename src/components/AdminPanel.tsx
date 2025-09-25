import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Question, GameSettings, QuestionType } from '../types/game';
import { useGameContext } from '../contexts/GameContext';
import Avatar from 'avataaars2';
import QuestionModal from './QuestionModal';
import QuestionStack from './QuestionStack';
import './AdminPanel.css';

const AdminPanel: React.FC = () => {
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const { state, dispatch } = useGameContext();
  const navigate = useNavigate();
  
  const { room, questions, gameState, currentQuestionIndex, gameSettings, players } = state;

  useEffect(() => {
    // 방이 생성되지 않았으면 메인으로 리다이렉트
    if (!room) {
      navigate('/');
    }
  }, [room, navigate]);

  const handleAddQuestion = (question: Omit<Question, 'id'>) => {
    const newQuestion: Question = {
      ...question,
      id: Date.now().toString()
    };
    dispatch({ type: 'ADD_QUESTION', payload: newQuestion });
    setShowQuestionModal(false);
  };

  const handleDeleteQuestion = (questionId: string) => {
    dispatch({ type: 'DELETE_QUESTION', payload: questionId });
  };

  const handleReorderQuestions = (reorderedQuestions: Question[]) => {
    dispatch({ type: 'REORDER_QUESTIONS', payload: reorderedQuestions });
  };

  const handleStartGame = () => {
    if (questions.length === 0) {
      alert('문제를 먼저 추가해주세요.');
      return;
    }
    dispatch({ type: 'START_GAME' });
    updateGameHostData();
  };

  const handlePauseGame = () => {
    dispatch({ type: 'PAUSE_GAME' });
    updateGameHostData();
  };

  const handleResumeGame = () => {
    dispatch({ type: 'RESUME_GAME' });
    updateGameHostData();
  };

  const handleSubmitQuestion = () => {
    dispatch({ type: 'NEXT_QUESTION' });
    updateGameHostData();
  };

  const handleRevealAnswer = () => {
    dispatch({ type: 'SHOW_ANSWER' });
    updateGameHostData();
  };

  const updateGameHostData = () => {
    // localStorage 게임 데이터 업데이트 (진행페이지 동기화용)
    setTimeout(() => {
      if (room) {
        const gameData = {
          room,
          questions,
          players,
          gameState,
          currentQuestionIndex,
          gameSettings
        };
        localStorage.setItem('gameHostData', JSON.stringify(gameData));
      }
    }, 100);
  };

  const handleShowLeaderboard = () => {
    navigate('/leaderboard');
  };

  const handleOpenGameHost = () => {
    // 현재 게임 상태를 localStorage에 저장
    if (room) {
      const gameData = {
        room,
        questions,
        players,
        gameState,
        currentQuestionIndex,
        gameSettings
      };
      localStorage.setItem('gameHostData', JSON.stringify(gameData));
    }
    
    // 새 탭에서 진행 페이지 열기
    window.open('/game-host', '_blank');
  };

  const handleBackToMain = () => {
    dispatch({ type: 'RESET_GAME' });
    navigate('/');
  };

  const handleGameSettingsChange = (setting: keyof GameSettings, value: any) => {
    dispatch({ 
      type: 'UPDATE_GAME_SETTINGS', 
      payload: { [setting]: value } 
    });
  };

  if (!room) {
    return <div className="admin-panel loading">방을 생성하는 중...</div>;
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <button className="back-btn" onClick={handleBackToMain}>
          ← 메인으로
        </button>
        <div className="room-info">
          <h1>관리 페이지</h1>
          <div className="room-details">
            <span className="subject">{room.subject}</span>
            <span className="room-code">방 코드: {room.code}</span>
          </div>
        </div>
        <button className="open-host-btn" onClick={handleOpenGameHost}>
          진행페이지 열기
        </button>
      </header>

      <div className="admin-content">
        <div className="left-panel">
          <div className="questions-section">
            <div className="questions-header">
              <h2>문제 목록</h2>
              <button 
                className="add-question-btn"
                onClick={() => setShowQuestionModal(true)}
              >
                + 문제 만들기
              </button>
            </div>
            
            <QuestionStack
              questions={questions}
              onDelete={handleDeleteQuestion}
              onReorder={handleReorderQuestions}
              currentIndex={currentQuestionIndex}
              gameState={gameState}
            />
          </div>
        </div>

        <div className="right-panel">
          <div className="settings-section">
            <h3>게임 설정</h3>
            
            <div className="setting-group">
              <label>타이머 설정 (초)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={gameSettings.timeLimit}
                onChange={(e) => handleGameSettingsChange('timeLimit', parseInt(e.target.value))}
              />
            </div>
            
            <div className="setting-group">
              <label>정답 공개 시간 (초)</label>
              <input
                type="number"
                min="1"
                max="30"
                value={gameSettings.answerRevealTime}
                onChange={(e) => handleGameSettingsChange('answerRevealTime', parseInt(e.target.value))}
              />
            </div>
            
            <div className="setting-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={gameSettings.eliminationMode}
                  onChange={(e) => handleGameSettingsChange('eliminationMode', e.target.checked)}
                />
                <span className="checkmark"></span>
                탈락 모드
              </label>
            </div>
            
            {gameSettings.eliminationMode && (
              <div className="setting-group">
                <label>탈락 조건 (틀린 횟수)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={gameSettings.eliminationThreshold}
                  onChange={(e) => handleGameSettingsChange('eliminationThreshold', parseInt(e.target.value))}
                />
              </div>
            )}
            
            <div className="setting-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={gameSettings.autoMode}
                  onChange={(e) => handleGameSettingsChange('autoMode', e.target.checked)}
                />
                <span className="checkmark"></span>
                자동 모드
              </label>
            </div>
          </div>

          <div className="control-section">
            <h3>게임 컨트롤</h3>
            
            <div className="control-buttons">
              {gameState === 'waiting' && (
                <button 
                  className="control-btn start-btn"
                  onClick={handleStartGame}
                  disabled={questions.length === 0}
                >
                  시작
                </button>
              )}
              
              {gameState === 'playing' && (
                <button 
                  className="control-btn pause-btn"
                  onClick={handlePauseGame}
                >
                  중단
                </button>
              )}
              
              {gameState === 'paused' && (
                <button 
                  className="control-btn resume-btn"
                  onClick={handleResumeGame}
                >
                  재개
                </button>
              )}
              
              <button 
                className="control-btn submit-btn"
                onClick={handleSubmitQuestion}
                disabled={gameState === 'waiting' || currentQuestionIndex >= questions.length - 1}
              >
                문제 제출
              </button>
              
              <button 
                className="control-btn reveal-btn"
                onClick={handleRevealAnswer}
                disabled={gameState === 'waiting'}
              >
                정답 공개
              </button>
              
              <button 
                className="control-btn leaderboard-btn"
                onClick={handleShowLeaderboard}
              >
                순위
              </button>
            </div>
          </div>

          <div className="game-status">
            <h3>게임 상태</h3>
            <div className="status-info">
              <div className="status-item">
                <span className="label">현재 상태:</span>
                <span className={`value ${gameState}`}>
                  {gameState === 'waiting' ? '대기중' : 
                   gameState === 'playing' ? '진행중' : 
                   gameState === 'paused' ? '일시정지' : '종료'}
                </span>
              </div>
              <div className="status-item">
                <span className="label">진행률:</span>
                <span className="value">
                  {questions.length > 0 ? `${currentQuestionIndex + 1}/${questions.length}` : '0/0'}
                </span>
              </div>
              <div className="status-item">
                <span className="label">참여자:</span>
                <span className="value">{players.length}명</span>
              </div>
            </div>
          </div>

          {/* 참여자 현황 섹션 */}
          <div className="participants-section">
            <h3>참여자 현황</h3>
            {players.length === 0 ? (
              <p className="no-participants">아직 참여자가 없습니다.</p>
            ) : (
              <div className="participants-list">
                {players.map(player => (
                  <div key={player.id} className="participant-item">
                    <div className="participant-avatar">
                      <Avatar {...player.avatar} />
                    </div>
                    <div className="participant-info">
                      <span className="participant-name">{player.nickname}</span>
                      <span className="participant-team">{player.team || '개인'} {player.team ? '팀' : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showQuestionModal && (
        <QuestionModal
          onClose={() => setShowQuestionModal(false)}
          onSubmit={handleAddQuestion}
        />
      )}
    </div>
  );
};

export default AdminPanel;
