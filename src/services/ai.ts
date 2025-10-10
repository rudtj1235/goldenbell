export type AiQuestion = {
  id?: string;
  type: 'ox' | 'multiple' | 'short';
  question: string;
  options?: string[];
  correctAnswer: string | number;
  score?: number;
};

// 로컬 저장 제거: 키는 서버(계정 비밀)로 저장/관리
export const setGeminiKey = async (_k: string) => {};
export const getGeminiKey = (): string => '';

const API_BASE = ((): string => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return (process.env.REACT_APP_FUNCTION_BASE || '').trim();
  }
  return '/api/ai';
})();

// 단일 AI 호출 함수 (내부용)
async function callGeminiOnce(prompt: string, count: number, opts?: { forceModel?: string; idToken?: string }): Promise<AiQuestion[]> {
  const url = API_BASE || '/api/ai';
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts?.idToken ? { Authorization: `Bearer ${opts.idToken}` } : {}),
    },
    body: JSON.stringify({ prompt, count, forceModel: opts?.forceModel })
  });
  
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.warn('[AI_GEN] ✖ 프록시 실패', { status: res.status, body: t.slice(0, 300) });
    throw new Error('Gemini 호출 실패');
  }
  
  const data = await res.json();
  let text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  if (text.startsWith('```')) {
    const first = text.indexOf('\n');
    const lastFence = text.lastIndexOf('```');
    if (first !== -1 && lastFence !== -1) text = text.slice(first + 1, lastFence);
  }
  
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const s = text.indexOf('[');
    const e = text.lastIndexOf(']');
    if (s === -1 || e === -1) throw new Error('AI 응답 파싱 실패');
    parsed = JSON.parse(text.slice(s, e + 1));
  }
  
  const arr: any[] = Array.isArray(parsed) ? parsed : [parsed];
  let items = arr.filter((q) => q && ['ox','multiple','short'].includes(q.type) && typeof q.question === 'string');
  
  return items.map((q, i) => {
    const base: AiQuestion = {
      id: q.id || `ai_${Date.now()}_${i}`,
      type: q.type,
      question: q.question,
      correctAnswer: q.correctAnswer,
      score: typeof q.score === 'number' ? q.score : 10
    };
    
    // options가 유효한 경우에만 포함
    if (Array.isArray(q.options) && q.options.length > 0) {
      base.options = q.options;
    }
    
    return base;
  });
}

// AI 검증 함수 (2단계)
async function validateQuestions(questions: AiQuestion[], originalPrompt: string, opts?: { idToken?: string }): Promise<AiQuestion[]> {
  console.info('[AI_VALIDATE] 🔍 검증 시작', { count: questions.length });
  
  const validationPrompt = `아래는 "${originalPrompt}" 주제로 생성된 ${questions.length}개의 문제입니다. 각 문제를 철저히 검증하고 형식에 맞게 수정하세요.

생성된 문제:
${JSON.stringify(questions, null, 2)}

**필수 검증 항목**:
1. **OX 문제** (type: "ox"):
   - correctAnswer는 정확히 "O" 또는 "X"만 가능
   - options 필드는 절대 포함하지 말 것
   
2. **객관식 문제** (type: "multiple"):
   - options는 정확히 4개의 선택지 (배열)
   - correctAnswer는 0~3 사이의 **숫자** (인덱스)
   - 정답이 명확히 1개만 존재해야 함
   
3. **단답형 문제** (type: "short"):
   - 정답이 정확히 1개뿐인 문제만 가능 (고유명사, 숫자, 단어)
   - options 필드는 절대 포함하지 말 것
   - correctAnswer는 **문자열**
   - "~중 하나", "~보다 큰" 같은 애매한 표현 금지

**수정 지침**:
- 부적절한 문제 → 주제에 맞는 새 문제로 **교체**
- 단답형이 애매하면 → 객관식으로 **변환**
- 정답이 여러 개 가능하면 → 정답 1개로 **수정**
- 너무 쉬운/어려운 문제 → 난이도 **조정**

**출력 형식**: JSON 배열만. 각 항목:
- OX: { "type":"ox", "question":"...", "correctAnswer":"O 또는 X", "score":10 }
- 객관식: { "type":"multiple", "question":"...", "options":["1","2","3","4"], "correctAnswer":0~3, "score":10 }
- 단답형: { "type":"short", "question":"...", "correctAnswer":"답", "score":10 }

반드시 ${questions.length}개를 출력하세요.`;

  try {
    const validated = await callGeminiOnce(validationPrompt, questions.length, opts);
    console.info('[AI_VALIDATE] ✅ 검증 완료', { original: questions.length, validated: validated.length });
    
    // 검증 실패 시 원본 반환하지 말고 에러 발생
    if (validated.length === 0) {
      throw new Error('검증된 문제가 없습니다');
    }
    
    return validated;
  } catch (e) {
    console.error('[AI_VALIDATE] ❌ 검증 실패', e);
    // 검증 실패 시 원본도 반환하지 않음 (품질 보장)
    throw new Error('AI 검증에 실패했습니다. 다시 시도해주세요.');
  }
}

// 메인 AI 문제 생성 함수 (2단계: 생성 → 검증)
export async function generateQuestionsWithGemini(prompt: string, count = 10, opts?: { forceModel?: string; idToken?: string }): Promise<AiQuestion[]> {
  console.info('[AI_GEN] 🎯 1단계: 문제 생성', { count, prompt: prompt.slice(0, 50) + '...' });
  
  // 1단계: 문제 생성 (명확한 프롬프트)
  const generationPrompt = `주제: ${prompt}

위 주제에 맞는 퀴즈 문제 ${count}개를 생성하세요. 주제의 특성과 난이도를 고려하여 다양한 유형으로 만드세요.

**문제 유형**:
1. **OX 문제** (type: "ox"): 참/거짓 판단
   - 예: { "type":"ox", "question":"태양은 서쪽에서 뜬다.", "correctAnswer":"X", "score":10 }
   
2. **객관식** (type: "multiple"): 4개 선택지 중 1개 정답
   - 예: { "type":"multiple", "question":"대한민국의 수도는?", "options":["서울","부산","대구","인천"], "correctAnswer":0, "score":10 }
   
3. **단답형** (type: "short"): 짧은 답 (숫자, 단어, 고유명사만)
   - 예: { "type":"short", "question":"3 × 7 = ?", "correctAnswer":"21", "score":10 }

**중요 규칙**:
- OX/단답형은 options 필드 **절대 금지**
- 객관식 correctAnswer는 반드시 **숫자** (0~3)
- 단답형은 정답이 **명확히 1개**만 존재하는 문제 (애매한 표현 금지)
- 주제에 벗어나지 말 것

JSON 배열만 출력: [{ "type":"...", "question":"...", "correctAnswer":"...", "score":10 }, ...]
정확히 ${count}개 생성하세요.`;

  let generated: AiQuestion[] = [];
  
  try {
    generated = await callGeminiOnce(generationPrompt, count, opts);
    console.info('[AI_GEN] ✅ 1단계 완료', { generated: generated.length });
  } catch (error) {
    console.error('[AI_GEN] ❌ 생성 실패', error);
    throw new Error('AI 문제 생성에 실패했습니다.');
  }
  
  if (generated.length === 0) {
    throw new Error('AI가 문제를 생성하지 못했습니다.');
  }
  
  // 2단계: AI 자체 검증 (원본 프롬프트 전달)
  console.info('[AI_GEN] 🎯 2단계: 문제 검증', { count: generated.length });
  const validated = await validateQuestions(generated, prompt, opts);
  
  console.info('[AI_GEN] 🎉 최종 완료', { 
    generated: generated.length,
    validated: validated.length,
    requested: count
  });
  
  return validated.slice(0, count); // 요청한 개수만 반환
}


