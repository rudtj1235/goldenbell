import React, { useEffect, useState } from 'react';
import { generateQuestionsWithGemini, setGeminiKey, AiQuestion } from '../services/ai';
import { useAuth } from '../contexts/AuthContext';
import './QuestionModal.css';

interface Props {
  onClose: () => void;
  onGenerate: (questions: AiQuestion[]) => void;
}

const AiQuestionModal: React.FC<Props> = ({ onClose, onGenerate }) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [count, setCount] = useState<number>(5);
  const [saving, setSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [savedOnce, setSavedOnce] = useState<boolean>(false);
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const { user } = useAuth();

  useEffect(() => {}, []);

  const handleSaveKey = async () => {
    try {
      setSaving(true);
      if (!user) throw new Error('로그인이 필요합니다.');
      const idToken = await user.getIdToken();
      const API_BASE = window.location.hostname === 'localhost' ? (process.env.REACT_APP_FUNCTION_BASE || '') : '/api/ai';
      const res = await fetch(`${API_BASE}/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ apiKey: apiKey.trim() })
      });
      if (!res.ok) throw new Error('API 키 저장 실패');
      setSavedOnce(true);
      setShowKeyInput(false);
    } catch (e: any) {
      setError(e?.message || 'API 키 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setError('');
    if (!prompt.trim()) {
      setError('프롬프트를 입력해주세요.');
      return;
    }
    try {
      setLoading(true);
      console.info('[AI_GEN_UI] ▶ 요청', { count, prompt });
      const idToken = user ? await user.getIdToken() : undefined;
      const list = await generateQuestionsWithGemini(prompt.trim(), count, { idToken });
      console.info('[AI_GEN_UI] ◀ 결과', { received: list.length, requested: count });
      
      // 부분 성공 시에도 성공으로 처리하고 메시지 표시
      if (list.length < count) {
        setError(`${list.length}개 문항이 생성되었습니다. (요청: ${count}개)`);
        // 3초 후 자동으로 에러 메시지 제거하고 모달 닫기
        setTimeout(() => {
          setError('');
          onGenerate(list);
        }, 3000);
      } else {
        onGenerate(list);
      }
    } catch (e: any) {
      console.warn('[AI_GEN_UI] ✖ 실패', { message: e?.message });
      setError(e?.message || 'AI 문제 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="question-modal-overlay" onClick={onClose}>
      <div className="question-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>AI 문제 추가</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          <div className="question-form">
            <div className="form-group">
              <label>Gemini API 키</label>
              {!showKeyInput && (
                <div>
                  <button onClick={() => setShowKeyInput(true)} className="btn-primary">API 키 입력/변경</button>
                  <button onClick={() => window.open('https://aistudio.google.com/apikey?hl=ko','_blank')} className="btn-secondary" style={{ marginLeft: 8 }}>GEMINI API키 가져오기</button>
                  {savedOnce && <small style={{ display: 'block' }}>키가 계정 비밀로 저장되었습니다.</small>}
                </div>
              )}
              {showKeyInput && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIza..."
                  />
                  <button onClick={handleSaveKey} disabled={saving} style={{ marginLeft: 8 }}>
                    {saving ? '저장 중...' : '저장'}
                  </button>
                  <button onClick={() => setShowKeyInput(false)} style={{ marginLeft: 8 }}>취소</button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>프롬프트</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder={`좋은 프롬프트 예시:
• "초등학교 4학년 수학 덧셈 문제"
• "한국사 조선시대 인물 문제"  
• "과학 물의 상태변화 문제"`}
              />
            </div>

            <div className="form-group">
              <label>생성 개수</label>
              <input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              />
            </div>

            {error && <div className="error-message">{error}</div>}
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            취소
          </button>
          <button className="submit-btn" onClick={handleGenerate} disabled={loading}>
            {loading ? '생성 중...' : '생성하기'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiQuestionModal;


