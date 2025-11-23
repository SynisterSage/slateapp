// Server endpoint: /api/suggest
// Accepts POST { id, issue, data, style }
// Calls OpenAI to generate 1-3 suggestion candidates (rewrites) for a specific issue/section.
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (!OPENAI_KEY) return res.status(500).json({ error: 'OpenAI API key not configured on server (OPENAI_API_KEY).' });

    const body = req.body || {};
    const issue = body.issue || {};
    const data = body.data || {};
    const style = body.style || 'concise';

    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

    // Compose a specific prompt depending on the targetSection
    let instruction = `You are an expert resume editor. Produce 1-3 concise, professional rewrite candidates for the issue described. Return JSON only with the form: { "candidates": ["...","..."], "rationale": "short explanation" }.`;
    let userContent = `Issue: ${JSON.stringify(issue, null, 2)}\n\nResume core: ${JSON.stringify({ personalInfo: data.personalInfo || {}, experience: data.experience || [], skills: data.skills || [] }, null, 2)}\n\nStyle: ${style}`;

    // If the issue includes fixAction with newContent, ask to improve that content
    if (issue && issue.fixAction && issue.fixAction.newContent) {
      userContent = `The target section is ${issue.fixAction.targetSection}. Improve the following content: \n${issue.fixAction.newContent}\n\n${userContent}`;
    }

    const payload = {
      model,
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: userContent }
      ],
      temperature: 0.4,
      max_tokens: 500
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return res.status(resp.status || 502).json({ error: 'OpenAI request failed', status: resp.status, details: txt });
    }

    const json = await resp.json();
    const content = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) ? json.choices[0].message.content : null;
    if (!content) return res.status(502).json({ error: 'OpenAI returned empty response' });

    // Try to parse JSON out of the assistant content
    let parsed;
    try {
      const m = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = m ? m[1].trim() : content.trim();
      parsed = JSON.parse(candidate);
    } catch (err) {
      // fallback: try wrapping content into a single candidate
      parsed = { candidates: [content.trim()], rationale: '' };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('suggest handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}
