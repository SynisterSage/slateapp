import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';

// Lightweight heuristics-based extractor for parsed resume text
function extractSectionsFromText(rawText) {
  const text = String(rawText || '');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const out = {
    text,
    name: null,
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    location: null,
    social: [],
    skillsText: '',
    languages: [],
    interests: [],
    experience: [],
    education: []
  };

  // Simple regexes
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phoneRe = /(\+?\d[\d\-\s()]{6,}\d)/;
  const socialRe = /(linkedin\.com|github\.com|behance\.net|dribbble\.com|portfolio|twitter\.com|instagram\.com)/i;
  const dateRe = /(\b\d{4}\b)|([A-Za-z]{3,}\s+\d{4})|(\d{1,2}\/\d{4})|([A-Za-z]{3,}\s*[-–]\s*[A-Za-z]{3,})/;

  // find email / phone / social first
  for (const l of lines) {
    if (!out.email) {
      const m = l.match(emailRe);
      if (m) out.email = m[0];
    }
    if (!out.phone) {
      const m = l.match(phoneRe);
      if (m) out.phone = m[0];
    }
    if (socialRe.test(l)) {
      out.social.push(l);
    }
  }

  // heuristics for name: look in the top lines for a title-case line with 2-3 words
  const nameCandidates = [];
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const l = lines[i];
    if (!l) continue;
    if (emailRe.test(l) || phoneRe.test(l)) continue;
    const lower = l.toLowerCase();
    if (/(summary|about|profile|skills|experience|education|contact|linkedin|github|resume)/.test(lower)) continue;
    const words = l.split(/\s+/).filter(Boolean);
    // prefer 2-3 word lines where most words start with uppercase
    const capWords = words.filter(w => /^[A-ZÅÄÖÉÈÍÓÚ]/.test(w));
    if (words.length >= 2 && words.length <= 4 && capWords.length >= Math.max(1, Math.floor(words.length * 0.6))) {
      nameCandidates.push(l);
    }
  }
  if (nameCandidates.length) {
    out.name = nameCandidates[0];
    const parts = out.name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      out.firstName = parts[0];
      out.lastName = parts.slice(-1).join(' ');
    }
  } else {
    // fallback: try to use email local-part (john.doe -> John Doe)
    if (out.email) {
      const local = String(out.email).split('@')[0];
      const tokens = local.split(/[._\-]/).filter(Boolean);
      if (tokens.length >= 2) {
        out.firstName = tokens[0].replace(/\d+/g, '');
        out.lastName = tokens.slice(1).join(' ').replace(/\d+/g, '');
        out.name = `${capitalize(out.firstName)} ${capitalize(out.lastName)}`.trim();
      }
    }
  }

  function capitalize(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1).toLowerCase(); }

  // Section headers detection
  const headerKeywords = {
    skills: ['skills', 'technical skills', 'skillset'],
    experience: ['experience', 'work experience', 'professional experience', 'employment'],
    education: ['education', 'academic background', 'qualifications'],
    languages: ['languages', 'language'],
    interests: ['interests', 'hobbies', 'interests & hobbies'],
    about: ['about', 'profile', 'summary', 'professional summary'],
    contact: ['contact', 'contact information']
  };

  const headerIndex = {}; // header -> index
  lines.forEach((l, idx) => {
    const lower = l.toLowerCase();
    for (const [key, keys] of Object.entries(headerKeywords)) {
      for (const k of keys) {
        if (lower === k || lower.startsWith(k + ':') || lower.includes('\t' + k) || lower.startsWith(k + ' -') || lower.startsWith(k + ' —')) {
          if (headerIndex[key] == null) headerIndex[key] = idx;
        }
      }
    }
    // also detect 'skills' line even if it's short
    if (lower === 'skills' || lower === 'skills:') if (headerIndex.skills == null) headerIndex.skills = idx;
  });

  // Extract Skills: if skills header found, collect following lines until next header
  const nextHeaderPos = (start) => {
    const headerPositions = Object.values(headerIndex).filter(i => typeof i === 'number');
    const greater = headerPositions.filter(p => p > start);
    return greater.length ? Math.min(...greater) : lines.length;
  };

  if (typeof headerIndex.skills === 'number') {
    const start = headerIndex.skills + 1;
    const end = nextHeaderPos(headerIndex.skills);
    const seg = lines.slice(start, end).join('\n');
    out.skillsText = seg.replace(/•|\u2022/g, ',').split(/[\n,]/).map(s => s.trim()).filter(Boolean).join(', ');
  } else {
    // fallback: scan for a short contiguous run of tokens that look like skills (short tokens, comma separated)
    const candidates = [];
    for (const l of lines) {
      if (l.length > 200) continue;
      const tokens = l.split(/[,•\u2022]/).map(s=>s.trim()).filter(Boolean);
      if (tokens.length >= 3 && tokens.every(t => t.split(/\s+/).length <= 4)) {
        candidates.push(...tokens);
        break;
      }
    }
    if (candidates.length) out.skillsText = Array.from(new Set(candidates)).join(', ');
  }

  // Languages extraction: prefer header, else scan for short comma-separated language lists
  // Language synonyms/lexicon (expand as requested)
  const knownLangs = ['english','spanish','español','french','français','german','deutsch','portuguese','português','mandarin','chinese','cantonese','arabic','日本語','japanese','korean','italian','russian','hindi','bengali','urdu','turkish','dutch','swedish','norwegian','danish','polish','thai','vietnamese','indonesian','filipino','filipino','hebrew','greek','farsi','persian','latin','latin-american spanish','asl','american sign language','sign language'];
  const profRe = /(native|fluent|advanced|intermediate|conversational|basic|proficient|native speaker|bilingual)/i;
  const splitSep = /[:\-–—\(\)]/;
  const parsedLangs = [];
  if (typeof headerIndex.languages === 'number') {
    const start = headerIndex.languages + 1;
    const end = nextHeaderPos(headerIndex.languages);
    const seg = lines.slice(start, end).join('\n');
    const parts = seg.replace(/•|\u2022/g, ',').split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 20);
    for (const p of parts) {
      if (!p) continue;
      // try to split name and proficiency
      const profMatch = p.match(profRe);
      let proficiency = profMatch ? (String(profMatch[0]).toLowerCase() === 'native' ? 'Native' : capitalize(profMatch[0])) : undefined;
      // If proficiency not in parentheses, try split by separators
      let name = p.replace(/\(.*\)/, '').split(splitSep)[0].trim();
      name = name.replace(/\.+$/, '').trim();
      if (/^asl$/i.test(name)) name = 'American Sign Language';
      if (name) parsedLangs.push({ name: capitalize(name), proficiency });
    }
  } else {
    // fallback: scan top lines for known languages + optional proficiency
    for (const l of lines.slice(0, 120)) {
      const lower = l.toLowerCase();
      // look for explicit prof tokens and known languages
      for (const kl of knownLangs) {
        if (lower.includes(kl)) {
          // extract the fragment that contains the language and optional prof
          const m = new RegExp(`([^.\n,]{0,60}${kl}[^,\n]{0,40})`, 'i');
          const mm = l.match(m);
          const frag = mm ? mm[0] : l;
          const profM = frag.match(profRe);
          const proficiency = profM ? (String(profM[0]).toLowerCase() === 'native' ? 'Native' : capitalize(profM[0])) : undefined;
          let name = frag.split(splitSep)[0].replace(/[^A-Za-z \-]/g, '').trim();
          if (/^asl$/i.test(name)) name = 'American Sign Language';
          parsedLangs.push({ name: capitalize(name || kl), proficiency });
        }
      }
      if (parsedLangs.length) break;
    }
  }
  // normalize unique
  out.languages = Array.from(new Map(parsedLangs.map(p => [p.name.toLowerCase(), p])).values()).slice(0, 20);

  // Interests extraction: prefer header, else look for hobbies-like short lists
  if (typeof headerIndex.interests === 'number') {
    const start = headerIndex.interests + 1;
    const end = nextHeaderPos(headerIndex.interests);
    const seg = lines.slice(start, end).join('\n');
    const ints = seg.replace(/•|\u2022/g, ',').split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 20);
    out.interests = ints;
  } else {
    // fallback: look for a short run of comma-separated interest tokens
    for (const l of lines.slice(-60)) {
      if (l.length > 200) continue;
      const tokens = l.split(/[,•\u2022]/).map(s=>s.trim()).filter(Boolean);
      if (tokens.length >= 3 && tokens.length <= 20 && tokens.every(t => t.split(/\s+/).length <= 4)) {
        out.interests = tokens;
        break;
      }
    }
  }

  // Experience extraction: look for lines with date patterns and group around them
  const expBlocks = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (dateRe.test(l)) {
      // collect title/company above (one or two lines) and bullets below
      const titleLine = lines[i-1] || '';
      const companyLine = lines[i-2] || '';
      // bullets: subsequent lines that start with bullet char or are short
      const bullets = [];
      for (let j = i+1; j < Math.min(lines.length, i+8); j++) {
        const nl = lines[j];
        if (/^\u2022|^\*|^-\s/.test(nl) || nl.startsWith('•') || nl.startsWith('-')) {
          bullets.push(nl.replace(/^[-•\u2022\*]\s*/, ''));
        } else if (nl.split(' ').length < 12 && !dateRe.test(nl) && nl === nl.toUpperCase()) {
          bullets.push(nl);
        } else if (nl.length < 80 && nl.indexOf('.') === -1) {
          // likely a short bullet
          bullets.push(nl);
        } else {
          break;
        }
      }
      expBlocks.push({ title: titleLine || companyLine || '', date: l, bullets });
    }
  }
  out.experience = expBlocks;

  // Education: prefer header-based extraction (lines after "Education" header). Fallback to keyword scan.
  if (typeof headerIndex.education === 'number') {
    const start = headerIndex.education + 1;
    const end = nextHeaderPos(headerIndex.education);
    const chunk = lines.slice(start, end);
    // split into blocks by blank lines or by bullets
    const blocks = [];
    let cur = [];
    for (const l of chunk) {
      if (/^\s*$/.test(l)) {
        if (cur.length) { blocks.push(cur.join(' ')); cur = []; }
      } else if (/^•|^\*|^-\s/.test(l)) {
        if (cur.length) { blocks.push(cur.join(' ')); cur = [l.replace(/^[-•\u2022\*]\s*/, '')]; }
        else cur.push(l.replace(/^[-•\u2022\*]\s*/, ''));
      } else {
        // if this looks like start of a new school line (contains comma or degree keywords), treat as new
        if (cur.length && /,|university|college|bachelor|master|degree/i.test(l)) { blocks.push(cur.join(' ')); cur = [l]; }
        else cur.push(l);
      }
    }
    if (cur.length) blocks.push(cur.join(' '));
    // normalize to objects if possible
    out.education = blocks.filter(Boolean).map(b => {
      // attempt to split degree / school / date heuristics
      const dateMatch = b.match(/(\b\d{4}\b)/);
      const date = dateMatch ? dateMatch[0] : '';
      // try to detect degree tokens
      const degMatch = b.match(/(Bachelor[^,\n]*|Master[^,\n]*|B\.?A\.?|B\.?S\.?|M\.?S\.?|MBA|PhD|Doctor)/i);
      const degree = degMatch ? degMatch[0] : '';
      // remaining as school name
      let school = b.replace(date, '').replace(degree, '').trim().replace(/[,\-–]+\s*$/, '').trim();
      if (!school && degree) school = degree;
      return { id: `edu_${Math.random().toString(36).slice(2,9)}`, school: school.trim(), degree: degree.trim(), date: date };
    });
  } else {
    const eduKeywords = /(university|college|bachelor|master|bs\.|ba\.|b\.a\.|m\.s\.|m\.a\.|degree|mba|phd)/i;
    const fallback = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (eduKeywords.test(l) && l.length < 200) {
        const block = [l];
        if (lines[i+1] && lines[i+1].length < 100) block.push(lines[i+1]);
        fallback.push(block.join(' '));
      }
    }
    out.education = fallback.map(b => ({ id: `edu_${Math.random().toString(36).slice(2,9)}`, school: b, degree: '', date: '' }));
  }

  // Location: try to find a line with comma-separated city/state or a line near contact info
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!out.location && /,[\sA-Za-z]{2,}/.test(l) && l.split(' ').length < 8 && !emailRe.test(l)) {
      out.location = l;
    }
    if (!out.location && i < 6 && l.split(',').length >= 2 && !emailRe.test(l) && !phoneRe.test(l)) {
      out.location = l;
    }
  }

  // If phone/email missing, try last resort scans
  if (!out.email) {
    for (const l of lines) {
      const m = l.match(emailRe);
      if (m) { out.email = m[0]; break; }
    }
  }
  if (!out.phone) {
    for (const l of lines) {
      const m = l.match(phoneRe);
      if (m) { out.phone = m[0]; break; }
    }
  }

  // Ensure skills don't accidentally include long about paragraphs
  if (out.skillsText && out.skillsText.length > 1000) {
    out.skillsText = out.skillsText.split(',').slice(0, 40).join(', ');
  }

  return out;
}

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
              // Run heuristics to extract richer fields
              const parsedSections = extractSectionsFromText(text || '');
              console.debug('[uploadResume] parsedSections:', parsedSections);

              const parsedRevision = {
                id: `rev_parsed_${Date.now()}`,
                name: 'Auto-Parsed',
                tags: ['Auto-Parsed'],
                createdAt: new Date().toISOString(),
                contentSummary: (text || '').slice(0, 200),
                parsed: {
                  text,
                  name: parsedSections.name || null,
                  firstName: parsedSections.firstName || null,
                  lastName: parsedSections.lastName || null,
                  email: parsedSections.email || (emailMatch && emailMatch[0]) || null,
                  phone: parsedSections.phone || (phoneMatch && phoneMatch[0]) || null,
                  location: parsedSections.location || null,
                  social: parsedSections.social || [],
                  skills: parsedSections.skillsText || skillsText || '',
                  languages: parsedSections.languages || [],
                  interests: parsedSections.interests || [],
                  experience: parsedSections.experience || [],
                  education: parsedSections.education || []
                }
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
