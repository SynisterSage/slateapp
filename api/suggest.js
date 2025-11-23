// Server endpoint: /api/suggest
// Accepts POST { id, issue, data, style }
// Uses Hugging Face Router inference to generate 1-3 suggestion candidates (rewrites) for a specific issue/section.
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const HF_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
    const HF_MODEL = process.env.HUGGINGFACE_MODEL || process.env.HF_MODEL || 'google/flan-t5-base';
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    // Default to models/gemini-2.5-flash-lite; env may override. We will strip
    // any leading `models/` when constructing the request path.
    let GEMINI_MODEL = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash-lite';
    const USE_GEMINI = process.env.USE_GEMINI ? process.env.USE_GEMINI !== 'false' : true;
    if (!HF_KEY && !GEMINI_KEY) return res.status(500).json({ error: 'No model API key configured on server (HUGGINGFACE_API_KEY or GEMINI_API_KEY).' });

    const body = req.body || {};
    const issue = body.issue || {};
    const data = body.data || {};
    const style = body.style || 'concise';

    // Compose a specific prompt depending on the targetSection
    const instruction = `You are an expert resume editor. Produce 1-3 concise, professional rewrite candidates for the issue described. Return JSON only with the form: { "candidates": ["...","..."], "rationale": "short explanation" }.`;
    let userContent = `Issue: ${JSON.stringify(issue, null, 2)}\n\nResume core: ${JSON.stringify({ personalInfo: data.personalInfo || {}, experience: data.experience || [], skills: data.skills || [] }, null, 2)}\n\nStyle: ${style}`;

    if (issue && issue.fixAction && issue.fixAction.newContent) {
      userContent = `The target section is ${issue.fixAction.targetSection}. Improve the following content: \n${issue.fixAction.newContent}\n\n${userContent}`;
    }

    // Keep outputs concise for suggestion candidates
    const hfBody = { inputs: `${instruction}\n\n${userContent}`, parameters: { max_new_tokens: 180, temperature: 0.35 } };

    // If GEMINI API key is present and enabled, try Gemini first (quick generate). Falls back to HF on error.
    if (USE_GEMINI && GEMINI_KEY) {
      // Support multiple candidate model names (comma-separated in env) and fallback to known good models.
      const userModels = (process.env.GEMINI_MODEL || '').split(',').map(s => s.trim().replace(/^models\//, ''));
      const defaultModels = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash'];
      const gemModels = [...new Set([...userModels, ...defaultModels])].filter(Boolean);
      for (const candidateModel of gemModels) {
        console.log('Attempting Gemini suggest generate', { model: candidateModel });
        try {
          const gmUrl = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
          const gmBody = {
            contents: [{ parts: [{ text: `${instruction}\n\n${userContent}` }] }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 180,
              responseMimeType: 'application/json',
            }
          };
          const gmRes = await fetch(gmUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gmBody),
          });
          if (gmRes && gmRes.ok) {
            console.log('Gemini suggest responded OK', { model: candidateModel });
            const gmJson = await gmRes.json().catch(() => null);
            let gemText = null;
            if (gmJson && gmJson.candidates && gmJson.candidates.length > 0) {
              gemText = gmJson.candidates[0].content.parts[0].text;
            }
            if (gemText) {
              console.log('Gemini suggest produced output (length):', (typeof gemText === 'string' ? gemText.length : JSON.stringify(gemText).length));
              try {
                const m = (typeof gemText === 'string' ? gemText : JSON.stringify(gemText)).match(/```(?:json)?\s*([\s\S]*?)```/i);
                const candidate = m ? m[1].trim() : (typeof gemText === 'string' ? gemText.trim() : JSON.stringify(gemText));
                const parsed = JSON.parse(candidate);
                return res.status(200).json(parsed);
              } catch (e) {
                return res.status(200).json({ candidates: [ (typeof gemText === 'string' ? gemText.trim() : JSON.stringify(gemText)) ], rationale: '' });
              }
            }
          } else {
            const text = await gmRes.text().catch(() => '');
            const statusText = gmRes.statusText || '';
            const ct = gmRes.headers && gmRes.headers.get ? gmRes.headers.get('content-type') : undefined;
            console.warn('Gemini non-OK response for suggest', { model: candidateModel, status: gmRes.status, statusText, contentType: ct, body: text });
          }
        } catch (e) {
          console.error('Gemini suggest request failed for model, trying next if any:', candidateModel, e);
        }
      }
    }

    console.log('Falling back to Hugging Face suggest', { hfModel: HF_MODEL, haveHFKey: !!HF_KEY });

    // Use the Hugging Face Router endpoints (recommended replacement for api-inference)
    const hfEndpoints = [
      `https://router.huggingface.co/api/models/${encodeURIComponent(HF_MODEL)}`,
      `https://router.huggingface.co/models/${encodeURIComponent(HF_MODEL)}`
    ];

    let lastErrText = '';
    let resp = null;
    for (const url of hfEndpoints) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${HF_KEY}` },
          body: JSON.stringify(hfBody)
        });
        if (r.ok) { resp = r; break; }
        lastErrText = await r.text().catch(() => '');
      } catch (e) {
        lastErrText = String(e);
      }
    }
    if (!resp) {
      console.error('Hugging Face suggest requests failed:', lastErrText);
      return res.status(502).json({ error: 'Hugging Face requests failed', details: lastErrText });
    }

    const json = await resp.json();
    let content = null;
    if (Array.isArray(json) && json[0]) {
      content = json[0].generated_text || json[0].content || json[0].output;
    } else if (json && (json.generated_text || json.content || json.output)) {
      content = json.generated_text || json.content || json.output;
    } else if (typeof json === 'string') {
      content = json;
    }

    if (!content) return res.status(502).json({ error: 'Hugging Face returned empty response', raw: json });

    // Try to parse JSON out of the model content; fallback to wrapping raw content as single candidate
    let parsed;
    try {
      const m = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = m ? m[1].trim() : content.trim();
      parsed = JSON.parse(candidate);
    } catch (err) {
      // fallback: return the whole content as a single candidate
      parsed = { candidates: [content.trim()], rationale: '' };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('suggest handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}
