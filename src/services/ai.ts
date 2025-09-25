export type AiQuestion = {
  id?: string;
  type: 'ox' | 'multiple' | 'short';
  question: string;
  options?: string[];
  correctAnswer: string | number;
  score?: number;
};

const KEY_STORAGE = 'gemini_api_key';

export const setGeminiKey = (k: string) => {
  localStorage.setItem(KEY_STORAGE, (k || '').trim());
};

export const getGeminiKey = (): string => {
  return localStorage.getItem(KEY_STORAGE) || '';
};

export async function generateQuestionsWithGemini(prompt: string, count = 10): Promise<AiQuestion[]> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error('Gemini API 키가 없습니다.');

  const model = 'gemini-1.5-flash';

  // 2022 교육과정 준수 + 모호어(소수) 해석 규칙 + 개수 강제
  const sys = `역할: 당신은 대한민국 "2022 개정 교육과정" 기반의 학습용 문제 제작자입니다.
규칙:
- 반드시 "2022 개정 교육과정"의 성취기준/학년 적합성을 준수해 출제하세요.
- 사용자의 요청(학년/주제/형식/개수)을 해석해 적절한 난이도와 표현으로 한국어 문제를 만듭니다.
- "소수"가 초등 맥락이면 기본적으로 "소수(Decimal, 소수점)"로 해석하세요. "소수(Prime)"가 필요하면 요청에 '소수(소수: prime)'처럼 분명히 명시되어야 합니다.
- 출력은 아래 JSON 배열만 허용(설명/코드블록/추가 문장 금지).
- 각 항목은 { "type":"ox|multiple|short", "question":"...", "options":[...], "correctAnswer":"...|index", "score":10 } 형태.
  * multiple은 options 필수, correctAnswer는 0부터 시작하는 정답 index
  * ox는 options 없이 correctAnswer는 "O" 또는 "X"
  * short는 correctAnswer는 문자열 정답
- 문자열 내 개행/따옴표는 이스케이프 처리
- 반드시 length=${count} 정확히 맞추세요.`;

  const user = `사용자 요청: ${prompt}\n원하는 개수: ${count}\n출력 형식: 위 JSON 배열만 반환`;

  const responseSchema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING' },
        type: { type: 'STRING' },
        question: { type: 'STRING' },
        options: { type: 'ARRAY', items: { type: 'STRING' } },
        correctAnswer: { type: 'STRING' },
        score: { type: 'NUMBER' }
      },
      required: ['type', 'question', 'correctAnswer']
    }
  } as any;

  const body = {
    contents: [
      { role: 'user', parts: [{ text: sys }] },
      { role: 'user', parts: [{ text: user }] }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema
    }
  } as any;

  console.info('[AI_GEN] ▶ 요청 시작', { model, count, prompt });

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}` , {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn('[AI_GEN] ✖ 응답 실패', { status: res.status, statusText: res.statusText });
    throw new Error('Gemini 호출 실패');
  }
  const data = await res.json();

  let text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  console.info('[AI_GEN] ◀ 원문 수신', { length: text.length, preview: text.slice(0, 300) });
  // code fence 제거
  if (text.startsWith('```')) {
    const first = text.indexOf('\n');
    const lastFence = text.lastIndexOf('```');
    if (first !== -1 && lastFence !== -1) text = text.slice(first + 1, lastFence);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn('[AI_GEN] ⚠ JSON 파싱 재시도(부분 추출)');
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('AI 응답 파싱 실패');
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  }
  const arr: any[] = Array.isArray(parsed) ? parsed : [parsed];
  console.info('[AI_GEN] ✅ 파싱 완료', { returned: arr.length });
  const isValidItem = (q: any) => q && ['ox','multiple','short'].includes(q.type) && typeof q.question === 'string' && (q.type !== 'multiple' || Array.isArray(q.options));
  let items = arr.filter(isValidItem);
  console.info('[AI_GEN] 🔎 유효 항목 필터링', { valid: items.length, requested: count });
  if (items.length > count) items = items.slice(0, count);
  if (items.length < count) {
    console.warn('[AI_GEN] ✖ 개수 부족', { valid: items.length, requested: count });
    throw new Error(`AI가 ${items.length}개만 반환했습니다. 프롬프트를 조금 더 구체적으로 입력하거나 다시 시도하세요.`);
  }

  return items.map((q, i) => ({
    id: q.id || `ai_${Date.now()}_${i}`,
    type: q.type,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    score: typeof q.score === 'number' ? q.score : 10,
  }));
}


