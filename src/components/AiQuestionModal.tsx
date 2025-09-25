import React, { useEffect, useState } from 'react';
import { generateQuestionsWithGemini, getGeminiKey, setGeminiKey, AiQuestion } from '../services/ai';

interface Props {
  onClose: () => void;
  onGenerate: (questions: AiQuestion[]) => void;
}

const AiQuestionModal: React.FC<Props> = ({ onClose, onGenerate }) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [count, setCount] = useState<number>(10);
  const [saving, setSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [savedOnce, setSavedOnce] = useState<boolean>(false);

  useEffect(() => {
    setApiKey(getGeminiKey());
  }, []);

  const handleSaveKey = async () => {
    try {
      setSaving(true);
      setGeminiKey(apiKey);
      setSavedOnce(true);
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
      const list = await generateQuestionsWithGemini(prompt.trim(), count);
      console.info('[AI_GEN_UI] ◀ 결과', { received: list.length });
      onGenerate(list);
    } catch (e: any) {
      console.warn('[AI_GEN_UI] ✖ 실패', { message: e?.message });
      setError(e?.message || 'AI 문제 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>AI 문제 추가</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Gemini API 키</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
            />
            <button onClick={handleSaveKey} disabled={saving}>
              {saving ? '저장 중...' : '키 저장'}
            </button>
            {savedOnce && <small>키가 저장되었습니다. 브라우저에서 기억합니다.</small>}
          </div>

          <div className="form-group">
            <label>프롬프트</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="예: 4학년 소수 문제 10개 내줘"
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

          {error && <div className="error-text">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? '생성 중...' : 'AI로 생성'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiQuestionModal;


