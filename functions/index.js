const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const fetch = require('cross-fetch');
const admin = require('firebase-admin');
try { admin.app(); } catch { admin.initializeApp(); }

// 초간단 프록시: 단일 엔드포인트 + 단일 모델
exports.aiProxy = onRequest({ region: 'us-central1', cors: true, invoker: 'public' }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 간단 라우팅: /api/ai/key 로 저장
  const isKeyPath = (req.path || '').toLowerCase().endsWith('/key');

  try {
    // ID 토큰 검증
    const authz = String(req.headers['authorization'] || '');
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    // 키 저장 처리
    if (isKeyPath) {
      const { apiKey } = req.body || {};
      if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
      await admin.firestore().doc(`users/${uid}/secrets/gemini`).set({ apiKey }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    const { prompt, count, forceModel } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    // 서버에서 키 로드
    const snap = await admin.firestore().doc(`users/${uid}/secrets/gemini`).get();
    const apiKey = snap.exists ? String(snap.get('apiKey') || '') : '';
    if (!apiKey) return res.status(400).json({ error: 'No API key stored' });

    const safeCount = Math.max(1, Math.min(50, Number(count) || 10));
    // 1) v1 ListModels로 가용 모델 조회 → generateContent 지원 모델만 선별
    const listUrl = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`;
    const prefer = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash',
      'gemini-1.5-pro-latest',
      'gemini-1.5-pro'
    ];
    let available = [];
    try {
      const lr = await fetch(listUrl);
      if (lr.ok) {
        const j = await lr.json();
        const models = Array.isArray(j.models) ? j.models : [];
        available = models
          .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => m?.name?.split('/').pop())
          .filter(Boolean);
      }
    } catch {}
    let pick = prefer.find(m => available.includes(m)) || prefer.find(m => m) || 'gemini-1.5-flash';
    if (forceModel && available.includes(forceModel)) pick = forceModel;

    const instruction = `다음 주제로 고품질 퀴즈 문제 ${safeCount}개를 생성하세요.

**문제 제작 방법**:
1. 웹에서 해당 주제의 기존 문제, 교육 자료, 기출문제를 검색하여 참고하세요
2. 검증된 문제 스타일을 바탕으로 고품질 문제를 만드세요
3. JSON 배열로 정확히 ${safeCount}개를 출력하세요

**핵심 원칙**:
- 정답이 유일하고 명확한 문제만
- 교육적 가치가 있는 문제
- 주제에 직접 관련된 내용만

**문제 유형 분배 가이드:**
- OX 문제: 전체의 30-40% (사실 확인, 개념 이해)
- 객관식 문제: 전체의 40-50% (계산, 선택, 비교)
- 단답형 문제: 전체의 20-30% (유일한 답만 가능한 문제)
- 각 유형을 골고루 섞어서 ${safeCount}개 생성

**단답형 문제 특별 주의사항 (매우 중요! 반드시 준수!):**

**절대 금지 표현들 (이런 표현이 들어간 단답형 문제는 절대 만들지 말 것!):**
- "~보다 큰", "~보다 작은", "~사이의", "~중 하나", "~부터 ~까지"
- "예를 들어", "하나만", "가운데", "사이에", "중에서"  
- "어떻게", "무엇을", "어떤", "어느", "몇 개의"
- "약수 중", "배수 중", "소수 중", "짝수를", "홀수를"
- "과일을", "동물을", "색깔을", "종류 중"

**단답형 문제 생성 전 필수 자문:**
1. "이 문제의 답이 정말 하나뿐인가?"
2. "다른 답도 가능하지 않은가?"
3. "범위나 선택의 여지가 있지 않은가?"
4. "명확하고 구체적인 하나의 답만 존재하는가?"

**단답형 허용 문제 유형만:**
- 고유명사: "한국의 수도는?" → "서울"
- 구체적 수치: "정사각형의 내각은 몇 도?" → "90"
- 명확한 계산: "2의 4제곱은?" → "16"  
- 유일한 개념: "지구에서 가장 큰 대륙은?" → "아시아"

**단답형 문제 생성 후 검증:**
- 답이 정말 하나뿐인지 재확인
- 다른 가능한 답이 없는지 재확인
- 모호하거나 주관적이지 않은지 재확인

**문제 유형별 세부 지침:**

1. **OX 문제 (type: "ox")**:
   - 객관적 사실만 출제 (역사적 사실, 과학적 법칙, 수학 공식 등)
   - 주관적 판단이나 의견이 개입될 여지 없는 내용
   - correctAnswer는 반드시 "O" 또는 "X"
   - 예: "지구는 태양 주위를 돈다", "2 + 2 = 4이다"

2. **객관식 문제 (type: "multiple") - 반드시 정답 1개 필수**:
   - 계산 문제, 암기 문제, 개념 문제 등 명확한 정답이 있는 내용
   - 4개의 선택지는 서로 명확히 구별되어야 함
   - **필수**: 4개 선택지 중 정답이 정확히 1개 있어야 함
   - **필수**: correctAnswer는 반드시 정답 선택지의 인덱스 (0, 1, 2, 3 중 하나)
   - 정답 외 3개는 명백히 틀린 답이어야 함
   - **검증**: 생성 후 options[correctAnswer]가 실제 정답인지 확인 필수
   - 예: "15 × 3 = ?" → options: ["43", "45", "47", "49"], correctAnswer: 1 (45가 정답)

3. **단답형 문제 (type: "short") - 유일하고 명확한 정답만**:
   - **절대 금지**: "~보다 큰", "~사이의", "~중 하나", "예를 들어" 등
   - **절대 금지**: 분수 답안 (예: "1/2", "2/3", "1/4" 등)
   - **절대 금지**: 수학 기호 (√, ∞, π, ±, ≤, ≥, ∑, ∫ 등)
   - **절대 금지**: 특수 문자 (°, ℃, ℉, ², ³, ₁, ₂ 등)
   - **절대 금지**: 그리스 문자 (α, β, γ, θ, λ, μ, σ 등)
   - **절대 금지**: 화학식 (H₂O, CO₂, NaCl 등)
   - **절대 금지**: 복잡한 수식 결과
   - **절대 금지**: 다양한 표현이 가능한 답안 (행동, 방법, 상태 등)
   - **절대 금지**: 동사형 답안 ("끈다", "한다", "간다" 등)
   - **절대 금지**: 명령형 답안 ("끄기", "하기", "가기" 등)
   - **절대 금지**: 문장형 답안 ("불을 끈다", "물을 마신다" 등)
   - **절대 금지**: 추상적이거나 주관적 답안
   - **허용 답안만**: 
     * 정수 (1, 2, 100, -5)
     * 소수 (3.14, 2.5, 0.75)
     * 고유명사 (서울, 한국, 태평양, 세종대왕)
     * 구체적 명사 (물, 불, 책, 연필)
     * 과학적 용어 (산소, 질소, 중력)
     * 수학적 용어 (원, 삼각형, 직각)
   - **정답 유일성 원칙**: 정답이 하나로만 표현되는 문제만 출제
   - **키보드 입력 원칙**: 일반 키보드로 쉽게 입력 가능한 답안
   - correctAnswer는 정확한 문자열 (띄어쓰기 주의)
   - 예: "한국의 수도는?" → "서울", "2의 3제곱은?" → "8", "H₂O의 한글명은?" → "물"

**수학 문제 특별 지침:**
- **난이도 적절성**: 너무 쉬운 문제(1+1) 지양, 적절한 사고력 요구
- **계산 복잡성**: 단순 암산보다는 논리적 사고가 필요한 문제 선호
- **응용 문제**: 공식 적용, 문제 해결 과정이 포함된 문제 권장
- **실생활 연계**: 가능하면 실제 상황과 연결된 수학 문제

**분수 표기 및 문제 유형 제한 (중요!):**
- **분수 표기**: 모든 분수는 "분자/분모" 형태로만 표기 (예: "2/5", "13/27")
- **분수 문제 유형 제한**: 분수가 포함된 문제는 반드시 OX 또는 객관식으로만 출제
- **단답형 완전 금지**: 분수 답안이 필요한 단답형 문제는 절대 출제 금지
- **단답형 완전 금지**: 분수 계산 결과를 묻는 단답형 문제 절대 금지
- **단답형 완전 금지**: "1/2 + 1/4 = ?", "3/4를 소수로?" 등 모든 분수 관련 단답형 금지
- **단답형 허용**: 정수, 소수, 단어만 (예: "8", "3.14", "서울", "빨강")
- 분수 문제 예시: "2/5 + 1/5 = ?" → 객관식 ["1/5", "2/5", "3/5", "4/5"]
- 분수 문제 예시: "1/2은 0.5와 같다" → OX 문제

**학년별 수학 난이도 가이드:**
- 초등 저학년: 두 자리 수 연산, 간단한 도형, 시간/길이 측정
- 초등 고학년: 분수/소수 연산, 넓이/부피, 비율과 백분율
- 중학교: 방정식, 함수, 기하학적 증명, 확률과 통계
- 고등학교: 미적분, 삼각함수, 수열, 복합 함수

**품질 기준:**
- 문제를 읽고 즉시 이해할 수 있어야 함
- 정답에 대해 논란의 여지가 없어야 함
- 교육적 가치가 있어야 함 (단순 암기보다는 이해와 적용)
- 연령대에 적합한 어휘와 개념 사용

**객관식 문제 필수 검증 사항 (반드시 준수!):**
- options 배열이 정확히 4개 요소를 가져야 함 (절대 3개나 5개 안됨!)
- correctAnswer가 0, 1, 2, 3 중 하나여야 함 (문자열 아닌 숫자!)
- options[correctAnswer]가 실제 정답이어야 함 (반드시 검증!)
- 나머지 3개 선택지는 명백히 틀린 답이어야 함
- 모든 선택지가 서로 다르고 구별 가능해야 함 (중복 절대 금지!)
- 빈 선택지나 공백만 있는 선택지 절대 금지!

**생성 후 자체 검증 필수:**
1. 각 객관식 문제마다 options.length === 4 인지 확인
2. correctAnswer가 0~3 범위의 숫자인지 확인  
3. options[correctAnswer]가 실제 정답인지 확인
4. 모든 선택지가 서로 다른지 확인
5. 검증 실패 시 해당 문제를 다시 생성

**좋은 문제 예시 (단답형은 유일한 정답만):**
- OX: "1/2 + 1/4 = 3/4이다." (correctAnswer: "O")
- 객관식: "2/5 + 1/5 = ?" options: ["1/5", "2/5", "3/5", "4/5"] (correctAnswer: 2)
- 단답형: "12의 최대공약수는?" (correctAnswer: "12") ✅ 유일한 답
- 단답형: "원주율을 소수점 둘째 자리까지 나타내면?" (correctAnswer: "3.14") ✅ 유일한 답
- 단답형: "한국의 수도는?" (correctAnswer: "서울") ✅ 유일한 답
- 단답형: "정사각형의 내각의 크기는 몇 도인가?" (correctAnswer: "90") ✅ 유일한 답
- 단답형: "지구에서 가장 큰 대륙은?" (correctAnswer: "아시아") ✅ 유일한 답
- 단답형: "2의 4제곱은?" (correctAnswer: "16") ✅ 유일한 답
- 단답형: "물의 끓는점은 몇 도인가?" (correctAnswer: "100") ✅ 유일한 답
- 단답형: "1년은 몇 개월인가?" (correctAnswer: "12") ✅ 유일한 답

**절대 금지 문제 (특히 단답형 - 여러 답 가능):**
- 단답형: "1.0보다 크고 1.2보다 작은 소수를 하나 적으시오" ❌ (1.1, 1.01, 1.11, 1.001 등 무수히 많음)
- 단답형: "10의 약수 중 하나는?" ❌ (1, 2, 5, 10 등 여러 답)
- 단답형: "1부터 10까지의 수 중 하나는?" ❌ (1~10 모두 가능)
- 단답형: "짝수를 하나 적으시오" ❌ (2, 4, 6, 8... 무수히 많음)
- 단답형: "빨간색 과일을 하나 적으시오" ❌ (사과, 딸기, 토마토 등 여러 답)
- 단답형: "삼각형의 종류 중 하나는?" ❌ (정삼각형, 이등변삼각형, 직각삼각형 등)
- 단답형: "1/2 + 1/4 = ?" ❌ (분수 답안 "3/4" 금지)
- 단답형: "2/3 × 3/4 = ?" ❌ (분수 답안 "1/2" 금지)  
- 단답형: "√16 = ?" ❌ (수학기호 "4" 대신 "16의 제곱근은?" → "4")
- 단답형: "π의 값은?" ❌ (그리스문자 "3.14159..." 대신 "원주율 근사값은?" → "3.14")
- 단답형: "물의 화학식은?" ❌ (화학식 "H₂O" 대신 "물의 화학명은?" → "물")
- 단답형: "30°는 몇 라디안?" ❌ (특수문자 금지)
- 단답형: "α + β = ?" ❌ (그리스문자 금지)
- 단답형: "2³ = ?" ❌ (위첨자 "8" 대신 "2의 3제곱은?" → "8")
- 단답형: "CO₂의 분자량은?" ❌ (화학식 금지)
- 단답형: "에너지 절약을 위해 전등은 어떻게 해야 할까?" ❌ ("끄기", "끈다", "불을 끈다" 등 다양한 표현)
- 단답형: "감기에 걸렸을 때 무엇을 해야 할까?" ❌ ("쉰다", "병원에 간다", "약을 먹는다" 등 다양한 표현)
- 단답형: "쓰레기는 어떻게 처리해야 할까?" ❌ ("버린다", "분리수거", "쓰레기통에 버린다" 등 다양한 표현)
- 단답형: "건강을 위해 무엇을 해야 할까?" ❌ ("운동", "운동한다", "규칙적인 운동" 등 다양한 표현)
- 단답형: "예쁜 도형은?" ❌ (주관적)
- 모든 유형: "대략 몇 개인가?" ❌ (모호함)

**분수 문제는 반드시 OX나 객관식으로:**
- 올바른 예: "1/2 + 1/4 = ?" → 객관식 ["1/4", "1/2", "3/4", "1"]
- 올바른 예: "1/2는 0.5와 같다" → OX 문제

**최종 검증 체크리스트 (생성 완료 후 반드시 확인!):**
1. 총 ${safeCount}개의 문제가 생성되었는가?
2. 각 객관식 문제의 options가 정확히 4개인가?
3. 각 객관식 문제의 correctAnswer가 0~3 숫자인가?
4. 각 단답형 문제가 정말 유일한 답을 가지는가?
5. 금지된 표현("중 하나", "보다 큰" 등)이 단답형에 없는가?
6. 모든 문제가 명확하고 교육적 가치가 있는가?

**검증 실패 시 해당 문제를 즉시 수정하거나 다시 생성할 것!**`;
    const body = {
      contents: [
        { role: 'user', parts: [{ text: instruction }] },
        { role: 'user', parts: [{ text: String(prompt) }] }
      ],
      tools: [{ googleSearch: {} }], // 웹 검색 활성화
      generationConfig: { responseMimeType: 'application/json' }
    };

    let last = null;
    // 2) v1 우선, 실패 시 v1beta로 폴백
    const bases = ['https://generativelanguage.googleapis.com/v1/models','https://generativelanguage.googleapis.com/v1beta/models'];
    for (const base of bases) {
      for (const model of [pick, ...prefer.filter(m => m !== pick)]) {
        const url = `${base}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const txt = await r.text();
        if (r.ok) return res.status(200).send(txt);
        last = { status: r.status, model, base, body: txt.slice(0, 2000) };
        // 404/400은 다음 모델/엔드포인트로 곧바로 폴백
        if (r.status !== 404 && r.status !== 400) break;
      }
      if (last && last.status !== 404 && last.status !== 400) break;
    }
    return res.status(502).json({ error: 'upstream', detail: last });
  } catch (e) {
    return res.status(500).json({ error: 'proxy', message: String(e && e.message || e) });
  }
});

// 스케줄러: 비활성/만료된 방 정리 (백업용 - 하루 1회)
exports.cleanupExpiredRooms = onSchedule({ schedule: 'every day 03:00', region: 'us-central1' }, async (event) => {
  const db = admin.firestore();
  const now = Date.now();
  const THRESHOLD_MS = 1000 * 60 * 60 * 24; // 24시간 비활성 시 만료

  const snap = await db.collection('game_rooms')
    .where('updatedAt', '<', admin.firestore.Timestamp.fromMillis(now - THRESHOLD_MS))
    .get();

  const batch = db.batch();
  let count = 0;
  snap.forEach(doc => {
    batch.delete(doc.ref);
    count++;
  });
  if (count > 0) await batch.commit();
  console.log(`[cleanup] deleted rooms: ${count}`);
});
