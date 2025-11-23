// Server endpoint: /api/analyze
// Accepts POST { id, data } where data is the resume JSON (personalInfo, skills, experience, education)
// Uses Hugging Face Router inference to produce a structured analysis JSON.
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const HF_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
    const HF_MODEL = process.env.HUGGINGFACE_MODEL || process.env.HF_MODEL || 'google/flan-t5-base';
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    let GEMINI_MODEL = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash-lite';
    // Normalize GEMINI_MODEL to remove the models/ prefix if the user provided it
    if (GEMINI_MODEL && GEMINI_MODEL.startsWith('models/')) GEMINI_MODEL = GEMINI_MODEL.split('/')[1];
    const USE_GEMINI = process.env.USE_GEMINI ? process.env.USE_GEMINI !== 'false' : true;

    const body = req.body || {};
    const data = body.data || body.resume || {};
    // Build instruction prompting a strict JSON output and include a plain-text
    // rendering of the resume so instruction-tuned models can "read" bullets
    // and summary more reliably.
    const schema = {
      overallScore: 'number 0-100',
      categories: { clarity: 'number', experience: 'number', skills: 'number', formatting: 'number' },
      issues: [ { id: 'string', severity: 'critical|major|minor', title: 'string', description: 'string', suggestion: 'string', fixAction: 'object|null' } ]
    };
    const system = `You are an expert resume reviewer. Return ONLY a single valid JSON object matching the schema below (no explanations, no markdown):\n${JSON.stringify(schema, null, 2)}\n\nRules:\n- Provide at most 8 issues.\n- For each issue include a concise suggestion and, when possible, a machine-actionable fixAction with targetSection and newContent (raw string or array for bullets).\n- overallScore should be 0-100.\n`;
    // Build a plain-text rendition of the resume to make it easier for models
    // to reason about natural-language content (summary, bullets, skills)
    const makePlainText = (r) => {
      try {
        const pi = r.personalInfo || {};
        let out = `${pi.fullName || ''}\n${pi.email || ''} ${pi.phone || ''}\n${pi.location || ''}\n\nSUMMARY:\n${pi.summary || ''}\n\nSKILLS:\n`;
        if (Array.isArray(r.skills) && r.skills.length) {
          out += r.skills.map(s => (typeof s === 'string' ? s : s.name)).join(', ');
        }
        out += '\n\nEXPERIENCE:\n';
        if (Array.isArray(r.experience) && r.experience.length) {
          r.experience.forEach((e) => {
            out += `- ${e.title || ''} @ ${e.company || ''} (${e.startDate || ''} - ${e.endDate || ''})\n`;
            if (e.bullets && Array.isArray(e.bullets)) out += e.bullets.map(b => `  • ${b}`).join('\n') + '\n';
          });
        }
        out += '\nEDUCATION:\n';
        if (Array.isArray(r.education) && r.education.length) {
          r.education.forEach((ed) => {
            out += `- ${ed.institution || ''} — ${ed.degree || ''} (${ed.startDate || ''}-${ed.endDate || ''})\n`;
          });
        }
        return out;
      } catch (e) { return JSON.stringify(r); }
    };
    const resumeText = makePlainText(data || {});
    const inputText = `${system}\n\nResume (plain text):\n${resumeText}\n\nResume (JSON):\n${JSON.stringify(data, null, 2)}`;
    // Reduce token usage to avoid hitting provider limits; keep temperature low for deterministic JSON
    const hfBody = { inputs: inputText, parameters: { max_new_tokens: 256, temperature: 0.15 } };
    // If GEMINI API key is provided and toggle enabled, try Google Generative AI (Gemini) first.
    if (USE_GEMINI && GEMINI_KEY) {
        // Support multiple candidate model names (comma-separated in env) and fallback to known good models.
        const userModels = (process.env.GEMINI_MODEL || '').split(',').map(s => s.trim().replace(/^models\//, ''));
        const defaultModels = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash'];
        const gemModels = [...new Set([...userModels, ...defaultModels])].filter(Boolean);
      for (const candidateModel of gemModels) { 
        console.log('Attempting Gemini generate', { model: candidateModel });
        try {
          const gmUrl = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
          const gmBody = {
            contents: [{ parts: [{ text: inputText }] }],
            generationConfig: {
              temperature: 0.15,
              maxOutputTokens: 256,
              responseMimeType: 'application/json',
            }
          };
          const gmRes = await fetch(gmUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gmBody),
          });
          if (gmRes && gmRes.ok) {
            console.log('Gemini responded OK for analyze', { model: candidateModel });
            const gmJson = await gmRes.json().catch(() => null);
            let gemOutput = null;
            if (gmJson && gmJson.candidates && gmJson.candidates.length > 0) {
              gemOutput = gmJson.candidates[0].content.parts[0].text;
            }
            if (gemOutput) { 
              console.log('Gemini produced output (length):', (typeof gemOutput === 'string' ? gemOutput.length : JSON.stringify(gemOutput).length));
              const parsed = (function tryParse(text) {
                try { return JSON.parse(text); } catch (e) { return null; }
              })(typeof gemOutput === 'string' ? gemOutput : JSON.stringify(gemOutput));
              if (parsed) return res.status(200).json(parsed);
              return res.status(200).json({ raw: typeof gemOutput === 'string' ? gemOutput : JSON.stringify(gemOutput) });
            }
          } else {
            const text = await gmRes.text().catch(() => '');
            // include statusText and a couple of response headers to help debugging
            const statusText = gmRes.statusText || '';
            const ct = gmRes.headers && gmRes.headers.get ? gmRes.headers.get('content-type') : undefined;
            console.warn('Gemini non-OK response for analyze', { model: candidateModel, status: gmRes.status, statusText, contentType: ct, body: text });
          }
        } catch (e) {
          console.error('Gemini request failed for model, trying next if any:', candidateModel, e);
        }
      }
    }

    // If we reach here, either Gemini was not used or did not return usable output.
    console.log('Falling back to Hugging Face router', { hfModel: HF_MODEL, haveHFKey: !!HF_KEY });

    // Use the Hugging Face Router endpoints (recommended replacement for api-inference)
    // Percent-encode the model id when building the URL to handle special chars
    const hfEndpoints = [
      `https://router.huggingface.co/api/models/${encodeURIComponent(HF_MODEL)}`,
      `https://router.huggingface.co/models/${encodeURIComponent(HF_MODEL)}`
    ];

    let resp = null;
    let lastErr = '';
    for (const url of hfEndpoints) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${HF_KEY}` },
          body: JSON.stringify(hfBody)
        });
        if (r.ok) { resp = r; break; }
        lastErr = await r.text().catch(() => '');
      } catch (e) {
        lastErr = String(e);
      }
    }
    if (!resp) {
      console.error('Hugging Face requests failed:', lastErr);
      return res.status(502).json({ error: 'Hugging Face requests failed', details: lastErr });
    }

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return res.status(resp.status || 502).json({ error: 'Hugging Face request failed', status: resp.status, details: txt });
    }

    const json = await resp.json();
    let content = null;
    if (Array.isArray(json) && json[0] && typeof json[0].generated_text === 'string') content = json[0].generated_text;
    else if (json && typeof json.generated_text === 'string') content = json.generated_text;
    else if (json && Array.isArray(json.outputs) && json.outputs[0] && typeof json.outputs[0].generated_text === 'string') content = json.outputs[0].generated_text;
    else if (json && typeof json.output === 'string') content = json.output;
    else if (typeof json === 'string') content = json;

    if (!content) return res.status(502).json({ error: 'Hugging Face returned no text', raw: json });

    const tryParse = (text) => {
      try {
        const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = m ? m[1].trim() : text.trim();
        return JSON.parse(candidate);
      } catch (e) {
        try {
          const first = text.indexOf('{');
          const last = text.lastIndexOf('}');
          if (first !== -1 && last !== -1) return JSON.parse(text.slice(first, last + 1));
        } catch (e2) { return null; }
      }
      return null;
    };

    let parsed = tryParse(content);
    if (!parsed && Array.isArray(json)) {
      const joined = json.map((i) => (i.generated_text || i.content || JSON.stringify(i))).join('\n');
      parsed = tryParse(joined);
    }

    if (!parsed) return res.status(502).json({ error: 'Failed to parse JSON from Hugging Face response', raw: content });

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('analyze handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}
