import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';

// Simple server handler to fetch a PDF from Supabase storage (service role recommended), parse text, and return it.
export default async function handler(req, res) {
  try {
    const { query } = req;
    const resumeId = query.id;
    if (!resumeId) return res.status(400).json({ error: 'Missing id query param' });

    // Create a server-side Supabase client using the service role key
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRole) return res.status(500).json({ error: 'Server missing Supabase config' });
    const supabaseClient = createClient(supabaseUrl, serviceRole);

    // Fetch resume row to read storage_path
    const { data: row, error: rowErr } = await supabaseClient.from('resumes').select('*').eq('id', resumeId).single();
    if (rowErr || !row) return res.status(404).json({ error: 'Resume not found', details: String(rowErr) });
    const payload = row.data ? row.data : row;
    const storagePath = payload.storage_path || payload.fileName ? `${resumeId}/${payload.fileName}` : null;
    if (!storagePath) return res.status(400).json({ error: 'Resume has no storage_path' });

    // ensure path is relative to bucket
    let objectPath = storagePath;
    if (objectPath.startsWith('resumes/')) objectPath = objectPath.slice('resumes/'.length);
    // Normalize common filename issues (uploads sanitize spaces -> underscores). Try sanitized variant first.
    const tryPaths = [objectPath, objectPath.replace(/\s+/g, '_')];

    // Try to create signed URL. If the object isn't found, attempt a fallback search in the bucket.
    let signed;
    let signedErr;
    try {
      // Try a few variants (original, sanitized) to match uploaded object key
      for (const p of tryPaths) {
        try {
          const signedResp = await supabaseClient.storage.from('resumes').createSignedUrl(p, 60);
          if (!signedResp.error && signedResp.data?.signedUrl) {
            signed = signedResp.data;
            break;
          }
        } catch (e) {
          signedErr = e;
        }
      }
    } catch (e) {
      signedErr = e;
    }

    // If object wasn't found or signed URL creation failed, try to search the bucket for a matching file
    if (signedErr || !signed?.signedUrl) {
      console.warn('createSignedUrl failed for path', objectPath, signedErr);
      // Attempt to list objects and find by fileName or resumeId prefix
      try {
        const fileName = payload.fileName || '';
        const listResp = await supabaseClient.storage.from('resumes').list('', { limit: 1000 });
        const files = listResp.data || [];
        // try exact resumeId/fileName
        let found = files.find(f => f.name === fileName || f.name === `${resumeId}/${fileName}` || f.name === `${resumeId}` || f.name.includes(fileName));
        // if not found by name, try by prefix folders (folder entries come as objects with name)
        if (!found) {
          // try list by prefix resumeId
          const listByPrefix = await supabaseClient.storage.from('resumes').list(resumeId, { limit: 100 });
          if (listByPrefix.data && listByPrefix.data.length) {
            found = listByPrefix.data.find(f => f.name === fileName || f.name.includes(fileName)) || listByPrefix.data[0];
          }
        }
        if (found) {
          const candidatePath = found.name.startsWith(resumeId + '/') ? `${found.name}` : `${resumeId}/${found.name}`;
          // strip any leading bucket prefix
          let candidate = candidatePath;
          if (candidate.startsWith('resumes/')) candidate = candidate.slice('resumes/'.length);
          // Try candidate and sanitized variant
          const candidateVariants = [candidate, candidate.replace(/\s+/g, '_')];
          for (const cv of candidateVariants) {
            try {
              const signedResp2 = await supabaseClient.storage.from('resumes').createSignedUrl(cv, 60);
              if (!signedResp2.error && signedResp2.data?.signedUrl) {
                signed = signedResp2.data;
                break;
              }
            } catch (errcv) {
              console.warn('Signed URL creation failed for candidate', cv, errcv);
            }
          }
        }
      } catch (listErr) {
        console.warn('Bucket list/search failed', listErr);
      }
    }

    if (!signed || !signed.signedUrl) return res.status(500).json({ error: 'Failed to create signed URL or find object in bucket', details: String(signedErr) });

    const fetchRes = await fetch(signed.signedUrl);
    if (!fetchRes.ok) return res.status(502).json({ error: 'Failed to fetch PDF', status: fetchRes.status });

    const arrayBuffer = await fetchRes.arrayBuffer();
    const parsed = await pdfParse(arrayBuffer);
    const text = (parsed && parsed.text) ? parsed.text : '';

    // basic heuristics (email/phone/skills)
    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phoneMatch = text.match(/(\+?\d[\d\-\s()]{6,}\d)/);
    const skillsMatch = text.match(/Skills[:\-\s]*([\s\S]{0,200})/i);
    let skillsText = '';
    if (skillsMatch && skillsMatch[1]) skillsText = skillsMatch[1].split(/[\n,•·]/).map(s=>s.trim()).filter(Boolean).slice(0,30).join(', ');

    return res.status(200).json({ text, email: emailMatch?.[0]||null, phone: phoneMatch?.[0]||null, skills: skillsText });
  } catch (err) {
    console.error('parseResume error', err);
    return res.status(500).json({ error: String(err) });
  }
}
