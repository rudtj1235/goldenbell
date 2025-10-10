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

**필수 수정 지침** (각 문제마다 모든 항목 검토):
1. **주제 적합성 검증**
   - 주제("${originalPrompt}")에 직접 관련된 문제인가?
   - 아니라면 → 주제에 맞는 문제로 수정
   
2. **난이도 검증**
   - 너무 쉽거나 어려운가?
   - 그렇다면 → 적절한 난이도로 조정
   
3. **정답 명확성 검증**
   - 정답이 정확히 1개만 존재하는가?
   - 여러 답이 가능하다면 → 답이 1개로 명확한 문제로 교체
   
4. **답안 뻔함 방지**
   - OX/객관식에서 답이 너무 뻔한가?
   - 그렇다면 → 문장이나 선택지를 조정하여 고민하게 만들기
   
5. **상식 검증** (최종 단계)
   - 사람의 관점에서 상식적이고 납득 가능한 문제와 답안인가?
   - 아니라면 → 완전히 새로운 문제로 교체

**중요**: 형식만 맞추지 말고, 위 5가지 기준을 모두 통과한 고품질 문제만 출력하세요.

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
  
  // 1단계: 문제 생성 (교육 현장 스타일 + 주제 중심)
  const generationPrompt = `주제: ${prompt}

위 주제로 **교육 현장에서 실제 사용될 법한** 고품질 퀴즈 문제 ${count}개를 생성하세요.

**문제 제작 프로세스**:
1. 해당 주제의 **대표적인 교육 자료나 교과서**를 떠올리세요
2. 그곳에 나올 법한 **검증된 스타일의 문제**를 참고하세요
3. 주제 특성에 **자연스러운 유형**만 선택하세요 (억지로 섞지 말 것)

**핵심 원칙**:
- 주제에 **직접 관련된** 내용만
- 정답은 **명확히 1개**만 존재
- 답이 **너무 뻔하지 않게** (적절한 난이도)
- **교육적 가치**가 있는 문제

**유형별 가이드**:
- OX: 주제 핵심 개념의 참/거짓 (교과서 O/X 문제 스타일)
- 객관식: 선택지가 자연스러운 경우 (기출문제 스타일)
- 단답형: 답이 숫자/단어 1개로 명확한 경우 (단답형 시험 스타일)

**JSON 형식** (엄격히 준수):
- OX: { "type":"ox", "question":"...", "correctAnswer":"O 또는 X", "score":10 }
- 객관식: { "type":"multiple", "question":"...", "options":["1","2","3","4"], "correctAnswer":0~3 숫자, "score":10 }
- 단답형: { "type":"short", "question":"...", "correctAnswer":"답 문자열", "score":10 }

**절대 금지**:
- OX/단답형에 options 포함
- 주제 무관 문제
- 답 여러 개 가능한 문제
- 넌센스/말장난 (교육 목적이 아닌 경우)

JSON 배열만: [{ ... }, ...]
정확히 ${count}개.`;

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


