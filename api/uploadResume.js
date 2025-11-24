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
    website: null,
    skillsText: '',
    languages: [],
    interests: [],
    experience: [],
    education: []
  };

  // Simple regexes
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  // Accept dotted, dashed, spaced, parenthesized formats and optional extension (x or ext)
  const phoneRe = /(\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?/i;
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

  // Improved name extraction: check contact block, top-of-doc, tail-of-doc, and linkedin/website tokens
  out.name = out.name || null;
  out.firstName = out.firstName || null;
  out.lastName = out.lastName || null;
  out.nameConfidence = 0;

  function setName(fullName, confidence) {
    if (!fullName) return;
    const raw = String(fullName).trim();
    // reject obvious date/location lines
    if (dateRe.test(raw)) return;
    if (/\b\d{4}\b/.test(raw)) return;
    if (/\/[\dA-Za-z]/.test(raw)) return;
    if (/,[ \t]*[A-Za-z]{2}\b/.test(raw)) return;
    const parts = raw.split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    out.name = parts.join(' ');
    out.firstName = parts[0] || '';
    out.lastName = parts.slice(1).join(' ') || '';
    out.nameConfidence = Math.max(out.nameConfidence || 0, confidence || 0.5);
  }

  // 1) Contact block proximity (if contact header exists)
  try {
    if (typeof headerIndex !== 'undefined' && typeof headerIndex.contact === 'number') {
      for (let i = headerIndex.contact + 1; i <= Math.min(lines.length - 1, headerIndex.contact + 6); i++) {
        const l = lines[i];
        if (!l) continue;
        if (emailRe.test(l) || phoneRe.test(l) || socialRe.test(l)) continue;
        if (/^[A-Za-z .'-]{2,40}$/.test(l) && l.split(/\s+/).length <= 4) { setName(l, 0.9); break; }
      }
    }
  } catch (e) { }

  // 2) Top-of-doc scan (expand to top 20 lines)
    if (!out.name) {
    const topCandidates = [];
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const l = lines[i];
      if (!l) continue;
      if (emailRe.test(l) || phoneRe.test(l) || socialRe.test(l)) continue;
      if (isLikelyHeader(l)) continue;
      const low = l.toLowerCase();
      if (/(summary|about|profile|skills|experience|education|contact)/.test(low)) continue;
      // reject lines that look like dates/locations
      if (dateRe.test(l) || /,[ \t]*[A-Za-z]{2}\b/.test(l) || /\//.test(l)) continue;
      const words = l.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 4 && /^[A-ZÅÄÖÉÈÍÓÚ]/.test(words[0])) topCandidates.push(l);
    }
    if (topCandidates.length) setName(topCandidates[0], 0.8);
  }

  // 3) Tail-of-doc scan: look for two short uppercase lines or a single title-case name near the end
  if (!out.name) {
    const tail = lines.slice(Math.max(0, lines.length - 40));
    for (let i = 0; i < tail.length; i++) {
      const l = tail[i];
      if (!l) continue;
      const words = l.split(/\s+/).filter(Boolean);
      // pair of uppercase lines (e.g., 'LEX' on one line and 'FERGUSON' next)
      if (i + 1 < tail.length) {
        const l2 = tail[i + 1];
        if (l2 && /^[A-Z]{2,}$/.test(l.trim()) && /^[A-Z]{2,}$/.test(l2.trim()) && l.trim().length <= 20 && l2.trim().length <= 20) {
          setName((l.trim() + ' ' + l2.trim()), 0.85); break;
        }
      }
      // single title-case short line
      if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/.test(l.trim()) && l.trim().length <= 40) { setName(l.trim(), 0.75); break; }
    }
  }

  // 4) LinkedIn/website fallback parse
  if (!out.name && Array.isArray(out.social) && out.social.length) {
    for (const s of out.social) {
      try {
        const m = String(s).match(/linkedin\.com\/(in|pub)\/(.+)$/i);
        if (m && m[2]) {
          const tokens = m[2].replace(/\/+$/,'').split(/[\-_.]/).filter(Boolean).map(t => capitalize(t));
          if (tokens.length >= 2) { setName(tokens.join(' '), 0.7); break; }
        }
      } catch(e){}
    }
  }

  // 5) Fallback: synthesize from derived name tokens (email local-part already used earlier in deriveNameTokens fallback)
  try {
    const nameTokens = Array.from(deriveNameTokens(lines, out.email || null));
    if (!out.name && nameTokens.length >= 2) {
      setName((nameTokens[0] + ' ' + nameTokens[1]), 0.4);
    }
  } catch (e) { }

  // Filter interests from accidental name tokens
  try {
    const nameTokens = deriveNameTokens(lines, out.email || null);
    if (out.firstName) nameTokens.add(String(out.firstName).toLowerCase());
    if (out.lastName) nameTokens.add(String(out.lastName).toLowerCase());
    out.interests = (out.interests || []).filter(it => {
      if (!it) return false;
      const t = String(it).toLowerCase().trim();
      if (t.length <= 1) return false;
      if (nameTokens.has(t) || nameTokens.has(t.split(' ')[0])) return false;
      return true;
    }).slice(0,40);
  } catch (e) { /* ignore */ }

  // ABOUT / Professional Summary extraction: prefer header, else heuristics
  try {
    // Prefer using headerIndex.about when available (accurate), otherwise
    // fall back to scanning for ABOUT-like headers and collecting following
    // lines until the next likely section header. This handles cases where
    // headerIndex may not have been populated yet.
    if (typeof headerIndex !== 'undefined' && typeof headerIndex.about === 'number') {
      const start = headerIndex.about + 1;
      const end = nextHeaderPos(headerIndex.about);
      const segLines = lines.slice(start, end).filter(l => !isLikelyHeader(l));
      // Join into a single paragraph
      const para = segLines.join(' ').replace(/\s+/g, ' ').trim();
      if (para) out.summary = para;
    } else {
      // Scan for ABOUT-like headers in the document and collect the block
      const aboutKeys = ['about', 'profile', 'summary', 'professional summary', 'about:','professional summary:'];
      const aboutIdx = lines.findIndex(l => {
        if (!l) return false;
        const low = l.toLowerCase().replace(/[\s:\-–—]+/g, ' ').trim();
        return aboutKeys.some(k => low === k || low.startsWith(k + ' ') || low.includes(' ' + k + ' '));
      });
      if (aboutIdx !== -1) {
        const segLines = [];
        for (let i = aboutIdx + 1; i < lines.length; i++) {
          const ln = lines[i];
          if (!ln) continue;
          const low = ln.toLowerCase().replace(/[\s:\-–—]+/g, ' ').trim();
          // Stop on clear section starters
          if (/^(skills|experience|education|languages|interests|contact|work|professional|employment)$/.test(low)) break;
          // Stop if line looks like an ALL-CAPS short header
          if (/^[A-Z0-9 \-\&]+$/.test(ln) && ln.split(' ').length <= 4 && /[A-Z]{2,}/.test(ln)) break;
          segLines.push(ln);
        }
        const para = segLines.join(' ').replace(/\s+/g, ' ').trim();
        if (para) out.summary = para;
      } else {
        // fallback: take the first short paragraph before the first header that isn't a header itself
        const firstNonHeader = lines.slice(0, 40).find(l => l && !isLikelyHeader(l) && l.split(' ').length > 5 && l.length > 30);
        if (firstNonHeader) out.summary = firstNonHeader.replace(/\s+/g, ' ').trim();
      }
    }
  } catch (e) { /* ignore */ }

  function capitalize(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1).toLowerCase(); }

  // helper: determine if a line is likely a section header
  function isLikelyHeader(line) {
    if (!line) return false;
    const lower = String(line).toLowerCase().replace(/[\s:\-–—]+/g, ' ').trim();
    const headerWords = ['summary','about','profile','skills','experience','education','contact','linkedin','github','resume','work','professional','employment','languages','interests'];
    for (const hw of headerWords) if (lower === hw || lower.startsWith(hw + ' ') || lower.includes(' ' + hw + ' ')) return true;
    // if the line is fully uppercase and short, it's often a header
    if (/^[A-Z0-9 \-\&]+$/.test(line) && line.split(' ').length <= 4 && /[A-Z]{2,}/.test(line)) return true;
    return false;
  }

  // helper: derive probable name tokens from top-of-doc or email local-part
  function deriveNameTokens(linesArr, email) {
    const tokens = new Set();
    // try top non-header title-case line
    for (let i = 0; i < Math.min(8, linesArr.length); i++) {
      const l = linesArr[i];
      if (!l) continue;
      if (isLikelyHeader(l)) continue;
      const words = l.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 4) {
        for (const w of words) {
          if (/^[A-Za-z'-]{2,}$/.test(w)) tokens.add(w.toLowerCase());
        }
        break;
      }
    }
    // fallback: from email local-part
    if (tokens.size === 0 && email) {
      const local = String(email).split('@')[0];
      local.split(/[._\-]/).forEach(t => { if (t && t.length > 1) tokens.add(t.toLowerCase()); });
    }
    // Also scan tail of document for single-token uppercase name lines (e.g., 'LEX', 'FERGUSON')
    if (tokens.size === 0) {
      for (let i = Math.max(0, linesArr.length - 40); i < linesArr.length; i++) {
        const l = linesArr[i];
        if (!l) continue;
        const w = l.trim();
        if (/^[A-Z]{2,}$/.test(w) || (/^[A-Z][a-z]+$/.test(w) && w.length <= 12 && w.split(' ').length === 1)) {
          tokens.add(w.toLowerCase());
        }
      }
    }
    return tokens;
  }

  // Section headers detection
  const headerKeywords = {
    skills: ['skills', 'technical skills', 'skillset'],
    experience: ['experience', 'work experience', 'work expierence', 'professional experience', 'employment'],
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
    // Prefer explicit headerIndex positions, but also scan forward for any line that looks like a header (robust to typos)
    const headerPositions = Object.values(headerIndex).filter(i => typeof i === 'number');
    const greater = headerPositions.filter(p => p > start);
    if (greater.length) return Math.min(...greater);
    for (let i = start + 1; i < lines.length; i++) {
      if (isLikelyHeader(lines[i])) return i;
    }
    return lines.length;
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
  // Filter out accidental name tokens (e.g., when the candidate's name appears in languages block)
  try {
    // derive probable name tokens from parsed name/email/top lines
    const derivedNameTokens = deriveNameTokens(lines, out.email || null);
    if (out.firstName) derivedNameTokens.add(String(out.firstName).toLowerCase());
    if (out.lastName) derivedNameTokens.add(String(out.lastName).toLowerCase());
    out.languages = out.languages.filter(l => {
      if (!l || !l.name) return false;
      const n = String(l.name).toLowerCase().trim();
      if (n.length <= 1) return false;
      // allow ASL / American Sign Language as special case
      if (/^asl$/.test(n) || n.includes('sign language')) return true;
      // drop if matches derived name tokens (single token or first token)
      if (derivedNameTokens.has(n) || derivedNameTokens.has(n.split(' ')[0])) return false;
      // Also drop tokens that are clearly prof tokens captured as names (e.g., 'basic proficiency')
      if (/^(basic|proficient|fluent|native|intermediate|conversational)/i.test(n)) return false;
      return true;
    }).slice(0,20);
  } catch (e) {
    // ignore
  }

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

  // Experience extraction: scan the experience region (if present) or whole doc
  // and build blocks by detecting company/role lines, location/date lines,
  // and bullets. This is more robust to parsers that split these across
  // multiple lines.
  const expBlocks = [];
  const expStart = (typeof headerIndex.experience === 'number') ? headerIndex.experience + 1 : 0;
  const expEnd = (typeof headerIndex.experience === 'number') ? nextHeaderPos(headerIndex.experience) : lines.length;

  const roleKeywords = /(intern|manager|founder|director|editor|designer|developer|assistant|engineer|coordinator|teacher|instructor|consultant|lead|manager|president|owner)/i;

  // Split combined title strings like "COMPANY / Role" into company and role
  function splitTitleToCompanyRole(title) {
    if (!title) return { company: '', role: '' };
    let t = String(title).trim();
    // Normalize separators
    const sepMatch = t.match(/\s*[\/|\-|—|–|@]\s*/);
    // prefer explicit slash or pipe separators
    let left = t;
    let right = '';
    if (t.includes('/') || t.includes('|')) {
      const parts = t.split(/\s*[\/|]\s*/);
      left = parts[0] || '';
      right = parts.slice(1).join(' / ') || '';
    } else if (sepMatch) {
      const parts = t.split(/\s*[\-|—|–|@]\s*/);
      left = parts[0] || '';
      right = parts.slice(1).join(' - ') || '';
    } else {
      // try 'Role at Company' patterns
      const atMatch = t.match(/(.+)\s+at\s+(.+)/i);
      if (atMatch) { left = atMatch[2]; right = atMatch[1]; }
    }

    left = left.trim(); right = right.trim();

    // Heuristics: decide which side is company vs role
    const companyTokens = /(inc\b|llc\b|corp\b|company\b|co\b|university\b|college\b|school\b|hotel\b|center\b|studio\b)/i;
    const leftIsCompany = companyTokens.test(left) || /^[A-Z0-9\s\.\-]{2,}$/.test(left) && left === left.toUpperCase();
    const rightIsRole = roleKeywords.test(right) || roleKeywords.test(left) && !leftIsCompany;

    let company = '';
    let role = '';
    if (left && right) {
      if (leftIsCompany && !rightIsRole) { company = left; role = right; }
      else if (rightIsRole && !leftIsCompany) { company = left; role = right; }
      else {
        // default: left is company, right is role
        company = left; role = right;
      }
    } else if (left && !right) {
      // if only one side, try to detect by keywords
      if (companyTokens.test(left)) { company = left; }
      else if (roleKeywords.test(left)) { role = left; }
      else {
        // default assume company
        company = left;
      }
    }
    return { company: company.trim(), role: role.trim() };
  }

  for (let i = expStart; i < expEnd; i++) {
    const l = lines[i];
    if (!l) continue;
    // skip headers accidentally inside the region
    if (isLikelyHeader(l)) continue;

    // Identify a candidate title line: contains a slash (Company / Role) or is ALL CAPS multi-word
    const isSlashTitle = l.includes('/') && l.split('/').length >= 2;
    const words = l.split(/\s+/).filter(Boolean);
    const isAllCapsTitle = l === l.toUpperCase() && words.length >= 2 && words.length <= 6;
    // require roleKeywords to be accompanied by a nearby date/location or other strong signal
    const nextLine = (lines[i+1] || '');
    const hasDateNext = dateRe.test(nextLine) || /,\s*[A-Za-z]{2}\b/.test(nextLine) || /\bPresent\b/i.test(nextLine);
    const isRoleLike = roleKeywords.test(l) && (hasDateNext || isAllCapsTitle || isSlashTitle);

    // Avoid treating long sentences or paragraph-like lines as titles (e.g., ABOUT full paragraph)
    const isTooLongForTitle = words.length > 14 || /[.!?]$/.test(l);

    if ((isSlashTitle || isAllCapsTitle || isRoleLike) && !isTooLongForTitle) {
      // Try to find a date/location line in the following 1-3 lines
      let dateLine = '';
      let titleLine = l;
      let j = i + 1;
      while (j < Math.min(expEnd, i + 4)) {
        const cand = lines[j];
        if (!cand) { j++; continue; }
        if (isLikelyHeader(cand)) break;
        if (dateRe.test(cand) || /,\s*[A-Za-z]{2}\b/.test(cand) || /\bPresent\b/i.test(cand)) { dateLine = cand; j++; break; }
        // sometimes the title is split across two lines (company on prev line, role next)
        if (!titleLine.includes('/') && cand.includes('/') && cand.split('/').length >= 2) {
          titleLine = titleLine + ' ' + cand;
          j++; continue;
        }
        // if next line looks like a short location-only line, consider it date/location
        if (cand.length < 60 && /[A-Za-z]+\s*,\s*[A-Za-z]{2}\b/.test(cand)) { dateLine = cand; j++; break; }
        break;
      }

      // Collect bullets from j forward until we hit next title-like line or header
      const bullets = [];
      for (let k = j; k < Math.min(expEnd, i + 40); k++) {
        const nl = lines[k];
        if (!nl) continue;
        if (isLikelyHeader(nl)) break;
        // stop if next title encountered
        const nxtWords = nl.split(/\s+/).filter(Boolean);
        const nxtIsSlash = nl.includes('/') && nl.split('/').length >= 2;
        const nxtIsAllCaps = nl === nl.toUpperCase() && nxtWords.length >= 2 && nxtWords.length <= 6;
        if (nxtIsSlash || nxtIsAllCaps || roleKeywords.test(nl)) break;

        if (/^[-•\u2022\*]\s*/.test(nl) || /^[-–—]\s*/.test(nl)) {
          bullets.push(nl.replace(/^[-•\u2022\*\-–—]\s*/, '').trim());
          continue;
        }
        // if line starts with a dash-like en-dash used as bullet in PDFs
        if (/^–\s*/.test(nl)) { bullets.push(nl.replace(/^–\s*/, '').trim()); continue; }
        // if short or looks like a bullet continuation
        if (nl.length < 160 && !dateRe.test(nl)) { bullets.push(nl.trim()); continue; }
        break;
      }

      // split title into company / role when possible
      const split = splitTitleToCompanyRole(titleLine);
      expBlocks.push({ title: titleLine.trim(), company: split.company, role: split.role, date: dateLine.trim(), bullets });
      // skip ahead past consumed lines
      i = j + Math.max(0, bullets.length - 1);
    }
  }
  // Filter out obviously wrong captures: emails, phone lines, social links, GPA, and short skill-only lines
  out.experience = expBlocks.filter(b => {
    const t = String(b.title || '').trim();
    if (!t) return false;
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t)) return false;
    if (/(https?:\/\/|linkedin\.com|behance\.net|dribbble\.com)/i.test(t)) return false;
    if (/\b\d\.\d\s*GPA\b/i.test(t) || /\bGPA\b/i.test(t)) return false;
    // drop single-sentence short skill headers captured as titles (e.g., 'HTML/CSS')
    // fix: escape/move hyphen in character class to avoid "Range out of order" regex error
    if (t.length <= 20 && t.split(/[,\/&\s]+/).length <= 3 && /^[A-Za-z0-9\/&-]+$/.test(t) && !/\s/.test(t)) return false;
    return true;
  });

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
    // Accept lines like "City, ST" or "City, ST ZIP" where ST is 2-letter state abbreviation
    if (!out.location && /[A-Za-z .'\-]+,\s*[A-Za-z]{2}\b/.test(l) && l.split(' ').length < 8 && !emailRe.test(l)) {
      out.location = l;
    }
    // If there's a contact header, prefer lines within that small block (contact block proximity)
    if (!out.location && typeof headerIndex.contact === 'number') {
      const cstart = Math.max(0, headerIndex.contact - 1);
      const cand = lines.slice(cstart, Math.min(lines.length, headerIndex.contact + 6)).find(x => /,\s*[A-Za-z]{2}\b/.test(x));
      if (cand) out.location = cand;
    }
  }

  // Website / portfolio detection: generic domain match and a whitelist of portfolio TLDs
  try {
    const domainRe = /(?:https?:\/\/)?([\w.-]+\.[a-z]{2,})(?:[\/:?\s]|$)/i;
    const portfolioTlds = ['art','design','studio','dev','site','io','co','me'];
    const emailProviders = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','protonmail.com','aol.com','msn.com','yandex.com']);
    for (const l of lines) {
      const m = l.match(domainRe);
      if (m) {
        const host = (m[1] || '').replace(/[\.,]+$/, '');
        if (emailProviders.has(host.toLowerCase())) continue;
        // if this line looks like a social link, record it as social but don't treat as website
        if (socialRe.test(l)) { out.social.push(l.trim()); continue; }
        const tld = host.split('.').slice(-1)[0].toLowerCase();
        // prefer portfolio TLDs
        if (portfolioTlds.includes(tld)) {
          out.website = host;
          out.social.push(l.trim());
          break;
        }
        // otherwise accept .com / .net / .io as fallback if no website yet (but avoid social domains)
        if (!out.website && /\.(com|net|io|org|co)$/.test(host)) {
          out.website = host;
          out.social.push(l.trim());
          break;
        }
      }
    }
    // dedupe social entries
    try { out.social = Array.from(new Set(out.social.map(s => String(s).trim()))); } catch(e){}
  } catch (e) { /* ignore */ }

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
              // Ensure we have a full ABOUT/summary captured: if the extractor
              // didn't populate `summary`, try a quick fallback scan of the raw
              // parsed text here so the persisted parsed revision contains the
              // ABOUT block for frontend display.
              function extractAboutFromRaw(t) {
                if (!t) return null;
                const lns = String(t).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
                const aboutKeys = ['about', 'profile', 'summary', 'professional summary'];
                const idx = lns.findIndex(l => {
                  const low = l.toLowerCase().replace(/[\s:\-–—]+/g, ' ').trim();
                  return aboutKeys.some(k => low === k || low.startsWith(k + ' ') || low.includes(' ' + k + ' '));
                });
                if (idx === -1) return null;
                const outLines = [];
                for (let i = idx + 1; i < lns.length; i++) {
                  const ln = lns[i];
                  if (!ln) continue;
                  const low = ln.toLowerCase().replace(/[\s:\-–—]+/g, ' ').trim();
                  if (/^(skills|experience|education|languages|interests|contact|work|professional|employment)$/.test(low)) break;
                  if (/^[A-Z0-9 \-\&]+$/.test(ln) && ln.split(' ').length <= 4 && /[A-Z]{2,}/.test(ln)) break;
                  outLines.push(ln);
                }
                const para = outLines.join(' ').replace(/\s+/g, ' ').trim();
                return para || null;
              }

              const parsedSectionsFallback = { ...parsedSections };
              if (!parsedSectionsFallback.summary && parsedSectionsFallback.text) {
                const aboutFromText = extractAboutFromRaw(parsedSectionsFallback.text);
                if (aboutFromText) parsedSectionsFallback.summary = aboutFromText;
              }
              console.debug('[uploadResume] parsedSections:', parsedSectionsFallback);

              const parsedRevision = {
                id: `rev_parsed_${Date.now()}`,
                name: 'Auto-Parsed',
                tags: ['Auto-Parsed'],
                createdAt: new Date().toISOString(),
                contentSummary: (text || '').slice(0, 200),
                  parsed: {
                  text,
                  name: parsedSectionsFallback.name || null,
                  firstName: parsedSectionsFallback.firstName || null,
                  lastName: parsedSectionsFallback.lastName || null,
                  email: parsedSectionsFallback.email || (emailMatch && emailMatch[0]) || null,
                  phone: parsedSectionsFallback.phone || (phoneMatch && phoneMatch[0]) || null,
                  location: parsedSectionsFallback.location || null,
                  website: parsedSectionsFallback.website || null,
                  summary: parsedSectionsFallback.summary || null,
                  social: parsedSectionsFallback.social || [],
                  skills: parsedSectionsFallback.skillsText || skillsText || '',
                  languages: parsedSectionsFallback.languages || [],
                  interests: parsedSectionsFallback.interests || [],
                  experience: parsedSectionsFallback.experience || [],
                  education: parsedSectionsFallback.education || []
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
