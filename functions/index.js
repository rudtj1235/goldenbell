const functions = require('firebase-functions');
const fetch = require('cross-fetch');

exports.aiProxy = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const { apiKey, prompt, count } = req.body || {};
    if (!apiKey) return res.status(400).json({ error: 'API key required' });
    const modelCandidates = [
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash-002',
      'gemini-1.5-flash',
    ];
    const body = req.body.body || {};
    const endpoints = [
      m => `https://generativelanguage.googleapis.com/v1/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
      m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
      m => `https://generativelanguage.googleapis.com/v1beta2/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
    ];
    let lastErr = null;
    for (const m of modelCandidates) {
      for (const u of endpoints) {
        const url = u(m);
        try {
          const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const txt = await r.text();
          if (r.ok) return res.status(200).send(txt);
          lastErr = { status: r.status, body: txt.slice(0, 500) };
        } catch (e) {
          lastErr = { message: String(e && e.message || e) };
        }
      }
    }
    return res.status(502).json({ error: 'Upstream failed', detail: lastErr });
  } catch (e) {
    return res.status(500).json({ error: 'Proxy error', message: String(e?.message || e) });
  }
});


