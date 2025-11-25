// Server endpoint: /api/tune
// Accepts POST { resumeId, resumeData, query }
// Returns a structured JSON tune suggestion produced by Gemini (or fallback HF).
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    let GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    if (GEMINI_MODEL && GEMINI_MODEL.startsWith('models/')) GEMINI_MODEL = GEMINI_MODEL.split('/')[1];
    const USE_GEMINI = process.env.USE_GEMINI ? process.env.USE_GEMINI !== 'false' : true;

    const body = req.body || {};
    const query = String(body.query || '').trim();
    const resume = body.resumeData || body.data || {};

    // Simple per-IP rate limit to avoid spammy rapid calls (3s cooldown)
    try {
      const ip = (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
      global._tuneRate = global._tuneRate || {};
      const last = global._tuneRate[ip] || 0;
      const now = Date.now();
      if (now - last < 3000) return res.status(429).json({ error: 'Rate limit: please wait a few seconds before retrying' });
      global._tuneRate[ip] = now;
    } catch (e) { /* ignore rate-limit errors */ }

    if (!query) return res.status(400).json({ error: 'Missing query' });

    const makePlainText = (r) => {
      try {
        const pi = r.personalInfo || {};
        let out = `${pi.fullName || ''}\n${pi.email || ''} ${pi.phone || ''}\n${pi.location || ''}\n\nSUMMARY:\n${pi.summary || ''}\n\nSKILLS:\n`;
        if (Array.isArray(r.skills) && r.skills.length) out += r.skills.map(s => (typeof s === 'string' ? s : s.name)).join(', ');
        out += '\n\nEXPERIENCE:\n';
        if (Array.isArray(r.experience) && r.experience.length) {
          r.experience.forEach((e) => {
            out += `- ${e.title || ''} @ ${e.company || ''} (${e.startDate || ''} - ${e.endDate || ''})\n`;
            if (e.bullets && Array.isArray(e.bullets)) out += e.bullets.map(b => `  • ${b}`).join('\n') + '\n';
          });
        }
        return out;
      } catch (e) { return JSON.stringify(r); }
    };

    const resumeText = makePlainText(resume || {});

    // Debug logging
    const TUNE_DEBUG = process.env.TUNE_DEBUG === '1' || process.env.TUNE_DEBUG === 'true';
    try {
      const ip = (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
      console.log(`[tune] request from=${ip} query_len=${String(query||'').length} resume_len=${String(resumeText||'').length}`);
      if (TUNE_DEBUG) console.log('[tune] query preview:', query.slice(0,400));
    } catch (e) { /* ignore logging errors */ }

    const schema = {
      tunedSummary: 'string (2-4 sentences)',
      eligibility: ['string'],
      requirements: { required: ['string'], optional: ['string'] },
      suggestedSkillAdds: ['string'],
      suggestedSkillBoosts: [{ skill: 'string', boostDelta: 'number' }],
      suggestedExperienceEdits: [{ roleIndex: 'number', newBullets: ['string'] }],
      responsibilitiesMatch: [{ roleIndex: 'number', matched: 'boolean', highlights: ['string'] }],
      actions: ['string'],
      explain: 'string (short explanation)',
      overallFitScore: 'number 0-100'
    };

    const system = `You are a resume tailoring assistant. Return ONLY valid JSON that matches the schema below (no markdown, no explanation):\n${JSON.stringify(schema, null, 2)}\nGuidelines:\n- tunedSummary: 2-4 concise, achievement-focused sentences summarizing fit (do NOT include personal data).\n- eligibility: list up to 5 core eligibility bullets (must/certifications/years/etc) inferred from the job description.\n- requirements: include 'required' and 'optional' skill lists extracted from the job description.\n- suggestedSkillAdds / suggestedSkillBoosts: skills to add or boost for the resume.\n- suggestedExperienceEdits: role edits, reference roleIndex (0-based), at most 3 roles and up to 3 bullets each.\n- responsibilitiesMatch: for each edited role, indicate if responsibilities are matched and provide short highlights.\n- actions: provide up to 5 concrete, prioritized actions the user can take (short sentences).\n- overallFitScore: integer 0-100 estimating fit.\nKeep output concise and strictly valid JSON.`;

    const inputText = `${system}\n\nUser Query:\n${query}\n\nResume (plain text):\n${resumeText}\n\nResume (JSON):\n${JSON.stringify(resume, null, 2)}`;

    // Try Gemini first (support multiple candidate model names and fallbacks)
    if (USE_GEMINI && GEMINI_KEY) {
      const userModels = (process.env.GEMINI_MODEL || '').split(',').map(s => s.trim().replace(/^models\//, '')).filter(Boolean);
      const defaultModels = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash', 'text-bison-001'];
      const gemModels = [...new Set([...userModels, ...defaultModels])];
      for (const candidateModel of gemModels) {
        try {
          const gmUrl = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
          const gmBody = {
            contents: [{ parts: [{ text: inputText }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 512, responseMimeType: 'application/json' }
          };
          if (TUNE_DEBUG) console.log('[tune] calling Gemini candidate model=', candidateModel);
          const gmRes = await fetch(gmUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gmBody)
          });
          if (!gmRes) continue;
          if (TUNE_DEBUG) console.log('[tune] gmRes status=', gmRes.status, 'model=', candidateModel);
          const gmText = await gmRes.text().catch(() => null);
          let gmJson = null;
          try { gmJson = gmText ? JSON.parse(gmText) : null; } catch (e) { gmJson = null; }
          if (TUNE_DEBUG) console.log('[tune] gmText preview=', String(gmText || '').slice(0,2000));
          // If response is a JSON with candidates array, try to extract candidate text
          let gemOutput = null;
          if (gmJson && gmJson.error) {
            if (TUNE_DEBUG) console.warn('[tune] Gemini model returned error payload, skipping model', candidateModel, gmJson.error);
            // skip this model and try next
            continue;
          }
          if (gmJson && gmJson.candidates && gmJson.candidates.length) {
            try { gemOutput = gmJson.candidates[0].content.parts[0].text; } catch (e) { gemOutput = gmJson.candidates[0]; }
          } else if (gmText) {
            // try to parse gmText for a candidate block or raw JSON
            const m = gmText.match(/```(?:json)?\s*([\s\S]*?)```/i);
            gemOutput = m ? m[1].trim() : gmText;
          }
          if (gemOutput) {
            try {
              const parsed = JSON.parse(typeof gemOutput === 'string' ? gemOutput : JSON.stringify(gemOutput));
              if (TUNE_DEBUG) console.log('[tune] parsed JSON from Gemini candidate model=', candidateModel);
              // basic validation: require at least one of the expected keys
              const hasKey = parsed && (parsed.tunedSummary || parsed.suggestedSkillAdds || parsed.actions || parsed.overallFitScore || parsed.requirements || parsed.responsibilitiesMatch);
              if (!hasKey) {
                if (TUNE_DEBUG) console.warn('[tune] parsed JSON missing expected keys, returning raw for inspection', candidateModel);
                return res.status(200).json({ success: true, raw: String(gemOutput), debug: TUNE_DEBUG ? { model: candidateModel, gmText: gmText ? gmText.slice(0,2000) : null, gmJson } : undefined });
              }
              return res.status(200).json({ success: true, tune: parsed });
            } catch (e) {
              if (TUNE_DEBUG) console.warn('[tune] failed to parse candidate JSON, returning raw for inspection', e && e.message);
              return res.status(200).json({ success: true, raw: String(gemOutput), debug: TUNE_DEBUG ? { model: candidateModel, gmText: gmText ? gmText.slice(0,2000) : null, gmJson } : undefined });
            }
          }
          // if no gemOutput, keep trying next model
        } catch (e) {
          if (TUNE_DEBUG) console.warn('[tune] Gemini request failed for model, trying next', candidateModel, e && (e.message || e));
          continue;
        }
      }
      if (TUNE_DEBUG) console.warn('[tune] All Gemini model attempts failed, falling back to HF (if configured)');
    }

    // If Gemini not available or failed, return a 502 with message
    return res.status(502).json({ error: 'LLM request failed or produced no usable JSON' });
  } catch (err) {
    console.error('tune handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}
