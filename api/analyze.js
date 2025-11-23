// Server endpoint: /api/analyze
// Accepts POST { id, data } where data is the resume JSON (personalInfo, skills, experience, education)
// Calls OpenAI Chat Completions to produce a structured analysis JSON.
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (!OPENAI_KEY) return res.status(500).json({ error: 'OpenAI API key not configured on server (OPENAI_API_KEY).' });

    const body = req.body || {};
    const data = body.data || body.resume || {};

    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

    // Build instruction prompting a strict JSON output
    const system = `You are an expert resume reviewer. Analyze the provided resume JSON and produce a JSON object only (no surrounding text) with the following schema:\n{\n  "overallScore": number, // 0-100\n  "categories": { "clarity": number, "experience": number, "skills": number, "formatting": number },\n  "issues": [ { "id": string, "severity": "critical"|"major"|"minor", "title": string, "description": string, "suggestion": string, "fixAction": { "targetSection": string, "targetId"?: string, "newContent": string } | null } ]\n}\n\nBe conservative in the number of issues (0-8). Provide concise suggestions and include fixAction when you can propose a direct replacement (e.g., summary rewrite or bullets array). Always return valid JSON.`;

    const userMessage = `Here is the resume JSON to analyze:\n${JSON.stringify(data, null, 2)}`;

    const payload = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2,
      max_tokens: 600
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      // Forward OpenAI status and details to caller for better diagnostics
      return res.status(resp.status || 502).json({ error: 'OpenAI request failed', status: resp.status, details: txt });
    }

    const json = await resp.json();
    const content = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) ? json.choices[0].message.content : null;
    if (!content) return res.status(502).json({ error: 'OpenAI returned empty response' });

    // Try to parse JSON out of the assistant content
    let parsed;
    try {
      // Some models may wrap code fences; extract first JSON block.
      const m = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = m ? m[1].trim() : content.trim();
      parsed = JSON.parse(candidate);
    } catch (err) {
      // fallback: attempt to find first { ... } substring
      try {
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          const sub = content.slice(firstBrace, lastBrace + 1);
          parsed = JSON.parse(sub);
        }
      } catch (err2) {
        // give up
      }
    }

    if (!parsed) return res.status(502).json({ error: 'Failed to parse JSON from OpenAI response', raw: content });

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('analyze handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}
