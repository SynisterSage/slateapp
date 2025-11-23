import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';

// Server handler: accepts POST with raw file body and query params: resumeId, fileName
export default async function handler(req, res) {
  try {
    // Try to load .env.local when available (dev convenience)
    try {
      // dynamic import of dotenv (may not be installed in all environments)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dot = await import('dotenv');
      dot.config && dot.config({ path: process.cwd() + '/.env.local' });
    } catch (e) {
      // ignore
    }

    let { query, method } = req;
    // If dev-server passed a raw req without `query`, parse from URL
    if (!query && req.url) {
      const u = await import('url');
      query = u.parse(req.url, true).query;
    }
    if (!method) method = (req.method || 'GET');
    if (method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const resumeId = query && query.resumeId;
    const fileName = query && query.fileName;
    const owner = query && query.owner;
    if (!resumeId || !fileName) return res.status(400).json({ error: 'Missing resumeId or fileName' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_URL_FALLBACK;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRole) {
      console.error('Missing Supabase env', { VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL, SUPABASE_URL: !!process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE: !!process.env.SUPABASE_SERVICE_ROLE });
      return res.status(500).json({ error: 'Server missing Supabase config' });
    }

    console.log('uploadResume handler starting', { resumeId, fileName, supabaseUrl: supabaseUrl ? '(set)' : '(missing)', serviceRoleSet: !!serviceRole });
    const serverClient = createClient(supabaseUrl, serviceRole);

    // Read raw request body into a buffer. Support both when dev-server passes a raw req stream
    let buffer;
    if (typeof req.body !== 'undefined' && req.body !== null) {
      // Some frameworks attach `body` directly
      buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    }

    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${resumeId}/${safeName}`;
    const bucketName = 'resumes';
    console.log('Uploading file', { bucket: bucketName, path, size: buffer ? buffer.length : 0 });

    // Upload to storage (server-side, uses service role)
    let uploadData, uploadErr;
    try {
      const resp = await serverClient.storage.from(bucketName).upload(path, buffer, { contentType: 'application/pdf', upsert: true });
      uploadData = resp.data;
      uploadErr = resp.error;
    } catch (ue) {
      uploadErr = ue;
    }
    if (uploadErr) {
      console.error('Storage upload error', uploadErr);
      return res.status(502).json({ error: 'Storage upload failed', details: (uploadErr && uploadErr.message) || String(uploadErr) });
    }
    console.log('Storage upload succeeded', { key: uploadData?.path || uploadData?.Key || uploadData });

    // Persist or upsert resume row with storage_path inside `data` (legacy shape)
    try {
      // Try to fetch existing row
      const { data: existing, error: getErr } = await serverClient.from('resumes').select('*').eq('id', resumeId).single();
      let rowObj = null;
      if (getErr || !existing) {
        rowObj = { id: resumeId, data: { id: resumeId, fileName, storage_path: `${bucketName}/${path}`, title: fileName.replace('.pdf',''), lastUpdated: new Date().toISOString() } };
        if (owner) rowObj.owner = owner;
      } else {
        const payload = existing.data ? existing.data : existing;
        const merged = { ...payload, storage_path: `${bucketName}/${path}`, fileName, lastUpdated: new Date().toISOString() };
        rowObj = { id: resumeId, data: merged };
        if (owner) rowObj.owner = owner;
      }
      const { data: upserted, error: upsertErr } = await serverClient.from('resumes').upsert(rowObj).select().single();
      if (upsertErr) {
        console.warn('Resume upsert failed', upsertErr);
      } else {
        console.log('Resume upserted', upserted && upserted.id);
      }
      // After upsert, attempt to create a signed URL and parse the PDF server-side so we have parsed fields immediately
      try {
        const signedResp = await serverClient.storage.from('resumes').createSignedUrl(path, 60);
        if (!signedResp || signedResp.error || !signedResp.data?.signedUrl) {
          console.warn('createSignedUrl failed after upload', signedResp && signedResp.error);
        } else {
          const signedUrl = signedResp.data.signedUrl;
          try {
            const fetchRes = await fetch(signedUrl);
            if (fetchRes.ok) {
              const arrayBuffer = await fetchRes.arrayBuffer();
              const parsed = await pdfParse(arrayBuffer);
              const text = parsed && parsed.text ? parsed.text : '';
              const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
              const phoneMatch = text.match(/(\+?\d[\d\-\s()]{6,}\d)/);
              const skillsMatch = text.match(/Skills[:\-\s]*([\s\S]{0,200})/i);
              let skillsText = '';
              if (skillsMatch && skillsMatch[1]) skillsText = skillsMatch[1].split(/[\n,•·]/).map(s=>s.trim()).filter(Boolean).slice(0,30).join(', ');

              // Build an auto-parsed revision and persist it into the resume row
              const parsedRevision = {
                id: `rev_parsed_${Date.now()}`,
                name: 'Auto-Parsed',
                tags: ['Auto-Parsed'],
                createdAt: new Date().toISOString(),
                contentSummary: (text || '').slice(0, 200),
                parsed: { text, email: emailMatch?.[0]||null, phone: phoneMatch?.[0]||null, skills: skillsText }
              };

              // Append revision to existing data and upsert again
              try {
                const existingRow = (upserted && upserted.data) ? upserted.data : upserted;
                const existingRevs = Array.isArray(existingRow.revisions) ? existingRow.revisions : (existingRow.revisions ? [existingRow.revisions] : []);
                const newData = { ...existingRow, revisions: [...existingRevs, parsedRevision], lastUpdated: new Date().toISOString() };
                const upsertPayload = { id: resumeId, data: newData };
                if (owner) upsertPayload.owner = owner;
                const { data: finalUpsert, error: finalUpsertErr } = await serverClient.from('resumes').upsert(upsertPayload).select().single();
                if (finalUpsertErr) {
                  console.warn('Failed to persist parsed revision', finalUpsertErr);
                  // return parsed result even if we couldn't persist the revision
                  return res.status(200).json({ success: true, path, parsed: parsedRevision.parsed });
                }
                // return parsed result and the final persisted row in response
                return res.status(200).json({ success: true, path, parsed: parsedRevision.parsed, row: finalUpsert });
              } catch (revUpsertErr) {
                console.warn('Failed to persist parsed revision', revUpsertErr);
              }
            } else {
              console.warn('Failed to fetch signed URL for parsing', fetchRes.status);
            }
          } catch (parseErr) {
            console.warn('Server-side parse failed', parseErr);
          }
        }
      } catch (signedErr) {
        console.warn('Signed URL creation attempt failed after upload', signedErr);
      }
        } catch (persistErr) {
          console.warn('Failed to persist resume row', persistErr);
        }
    
        // Fetch the persisted resume row (server-side) and return it so the frontend doesn't need to query with anon keys
        try {
          const { data: finalRow, error: finalErr } = await serverClient.from('resumes').select('*').eq('id', resumeId).single();
          if (finalErr) {
            console.warn('Failed to fetch final persisted row', finalErr);
            return res.status(200).json({ success: true, path });
          }
          return res.status(200).json({ success: true, path, row: finalRow });
        } catch (finalFetchErr) {
          console.warn('Final fetch error', finalFetchErr);
          return res.status(200).json({ success: true, path });
        }
    // If parsing branch didn't return above, return success with path
    return res.status(200).json({ success: true, path });
  } catch (err) {
    console.error('uploadResume handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}
