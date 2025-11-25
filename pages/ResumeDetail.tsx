import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Wand2, Download, RefreshCw, Sparkles, 
  PanelRightClose, PanelRightOpen, Target, PenTool, History,
  AlertCircle, CheckCircle2, Check, Plus, Trash2, GripVertical
} from 'lucide-react';
import { Resume, AnalysisIssue } from '../types';
import AppearancePanel from '../components/AppearancePanel';
import { ChevronDown } from 'lucide-react';
import AnalysisCard from '../components/AnalysisCard';
import TuneForJob from '../components/TuneForJob';
import { getResumeById, updateResume, createResumeRevision, generatePdf } from '../src/api';
import supabase from '../src/lib/supabaseClient';

interface ResumeDetailProps {
    resumeId: string;
    onBack: () => void;
}

export const ResumeDetail: React.FC<ResumeDetailProps> = ({ resumeId, onBack }) => {
    // State for the resume data being edited/viewed
    const [resumeData, setResumeData] = useState<Resume>({
        id: resumeId,
        title: 'Loading...',
        fileName: '',
        lastUpdated: '',
        personalInfo: { fullName: '', email: '', phone: '', location: '', website: '', summary: '' },
        skills: [],
        languages: [],
        interests: [],
        experience: [],
        education: [],
        revisions: [],
        analysis: { overallScore: 0, categories: {}, issues: [] }
    });

    // Fetch resume from Supabase when resumeId changes
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await getResumeById(resumeId);
                if (!mounted) return;
                console.debug('[ResumeDetail] fetched resume:', res);
                if (res) setResumeData(res as Resume);
            } catch (err) {
                console.warn('Failed to load resume', err);
            }
        })();
        return () => { mounted = false; };
    }, [resumeId]);

        // Hiration-like heuristics: lightweight client-side checks to augment AI analysis
        const computeHirationHeuristics = (data: Resume) => {
            const categories: Record<string, number> = {};
            const issues: any[] = [];

            try {
                const summary = String(data.personalInfo?.summary || '').trim();
                const summaryLen = summary.length;
                // Clarity / Summary score (0-100)
                categories.clarity = Math.min(100, Math.round((Math.min(800, summaryLen) / 800) * 100));
                if (summaryLen < 100) {
                    issues.push({ id: `hir_summary_short_${Date.now()}`, severity: 'major', title: 'Short or Missing Summary', description: 'Summary is short or missing — add 2–4 achievement-oriented sentences with metrics.', suggestion: 'Expand the summary to include achievements and quantifiable outcomes.', fixAction: { targetSection: 'summary', newContent: summary } });
                } else if (summaryLen < 220) {
                    issues.push({ id: `hir_summary_expand_${Date.now()}`, severity: 'minor', title: 'Consider Expanding Summary', description: 'Summary is brief; expanding with impact statements improves clarity.', suggestion: 'Add 1–2 short achievements with numbers (e.g., increased X by Y%).', fixAction: { targetSection: 'summary', newContent: summary } });
                }

                // Contact info
                const email = String(data.personalInfo?.email || '').trim();
                const phone = String(data.personalInfo?.phone || '').trim();
                if (!email || !/@/.test(email)) {
                    issues.push({ id: `hir_contact_email_${Date.now()}`, category: 'contact', source: 'heuristic', severity: 'major', title: 'Missing or Invalid Email', description: 'No valid email detected in contact info.', suggestion: 'Add a professional email address at top of resume.', fixAction: null });
                }
                if (!phone || phone.length < 7) {
                    issues.push({ id: `hir_contact_phone_${Date.now()}`, category: 'contact', source: 'heuristic', severity: 'minor', title: 'Missing Phone Number', description: 'Phone number not found or looks short.', suggestion: 'Add a phone number for recruiters to contact you.', fixAction: null });

                }

                // Experience & Reverse chronology
                const exp = Array.isArray(data.experience) ? data.experience : [];
                if (exp.length === 0) {
                    issues.push({ id: `hir_no_experience_${Date.now()}`, category: 'reverseChron', source: 'heuristic', severity: 'critical', title: 'No Experience Entries', description: 'No work experience found — add at least one role with 3–5 bullets showing results.', suggestion: 'Add roles with measurable outcomes and 3–5 bullets each.', fixAction: null });
                } else {
                    // Check ordering (most recent first heuristic: look at date strings)
                    try {
                        const parsedDates = exp.map((e:any, i:number) => ({ idx: i, raw: e.date || '', parsed: Date.parse((e.date || '').split('–')[0].trim() || '') || 0 }));
                        const isReverseChron = parsedDates.every((d:any, i:number, arr:any[]) => i === 0 || d.parsed <= arr[i-1].parsed);
                        if (!isReverseChron) {
                            issues.push({ id: `hir_reverse_chron_${Date.now()}`, category: 'reverseChron', source: 'heuristic', severity: 'minor', title: 'Non-reverse chronological order', description: 'Experience entries may not be ordered newest-to-oldest.', suggestion: 'Sort your roles with most recent first for clarity.', fixAction: null });
                        }
                    } catch (e) { /* ignore parse errors */ }
                    // Bullet analysis: require numbers/metrics in at least one bullet per role
                    for (const e of exp) {
                        const bullets = Array.isArray(e.bullets) ? e.bullets : [];
                        const hasMetric = bullets.some((b:string) => /\d+[%+]?|\b\d{4}\b|\b\d+\b/.test(b));
                        if (!hasMetric) {
                            const roleLabel = (e as any).title || (e as any).position || (e as any).company || 'Untitled';
                            issues.push({ id: `hir_bullets_metrics_${e.id || Math.random()}`, category: 'bullets', source: 'heuristic', severity: 'minor', title: 'Bullets Lack Metrics', description: `Role "${roleLabel}" has bullets without measurable impact. Add metrics where possible.`, suggestion: 'Convert one or more bullets to include numbers, percentages, or timeframes.', fixAction: null });
                        }
                    }
                }

                // Skills coverage
                const skills = Array.isArray(data.skills) ? data.skills.map((s:any) => String(s.name || '').toLowerCase()) : [];
                categories.skills = Math.min(100, Math.round((Math.min(20, skills.length) / 20) * 100));
                if (skills.length < 5) {
                    issues.push({ id: `hir_skills_few_${Date.now()}`, category: 'skills', source: 'heuristic', severity: 'minor', title: 'Few Skills Detected', description: 'Fewer than 5 skills found — add relevant technical and role-specific keywords.', suggestion: 'Add 5–12 core skills relevant to the target role.', fixAction: null });
                }

                // Formatting baseline
                categories.formatting = 75; // neutral baseline — server AI may override

            } catch (err) {
                console.warn('Heuristics failed', err);
            }

            return { categories, issues };
        };
      // sanitize parsed summary text so trailing sections don't leak into the "Professional Summary" block
      // reuse sanitizeSummary defined later in the render helpers section

      // sanitize parsed summary text so trailing sections don't leak into the "Professional Summary" block
      const sanitizeSummary = (s?: string | null) => {
          if (!s) return '';
          const raw = String(s || '');
          const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (!lines.length) return '';

          const headerRe = /\b(PROFESSIONAL SUMMARY|PROFESSIONAL SUMMARY:|SUMMARY|ABOUT|WORK|WORK EXPERIENCE|EXPERIENCE|CONTACT|EDUCATION|SKILLS|LANGUAGES|INTERESTS)\b/i;

          // If there's an ABOUT or SUMMARY header, return the block immediately after it until the next header
          const aboutIdx = lines.findIndex(l => /\bABOUT\b/i.test(l) || /\bPROFESSIONAL SUMMARY\b/i.test(l) || /\bSUMMARY\b/i.test(l));
          if (aboutIdx >= 0) {
              const start = aboutIdx + 1;
              let end = lines.slice(start).findIndex(l => headerRe.test(l));
              if (end === -1) end = lines.length - start;
              const block = lines.slice(start, start + end).join('\n').trim();
              if (block) return block;
          }

          // Otherwise, return the leading paragraph(s) up to the first header
          const firstHeaderIdx = lines.findIndex(l => headerRe.test(l) || (/^[A-Z0-9 \-]{4,}$/.test(l) && l === l.toUpperCase() && l.length < 60));
          if (firstHeaderIdx > 0) {
              return lines.slice(0, firstHeaderIdx).join('\n').trim();
          }

          // Fallback: return the first 3 non-empty lines joined
          return lines.slice(0, 3).join('\n').trim();
      };

      // Extract ABOUT block from a raw full-text string. Stops when encountering
      // common section starters (WORK, SKILLS, EDUCATION, etc.) or an ALL-CAPS header.
      const extractAboutFromText = (fullText?: string | null) => {
          if (!fullText) return '';
          const lines = String(fullText).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const aboutIdx = lines.findIndex(l => /\bABOUT\b/i.test(l) || /\bPROFESSIONAL SUMMARY\b/i.test(l) || /\bSUMMARY\b/i.test(l) || /\bPROFILE\b/i.test(l));
          if (aboutIdx >= 0) {
              const out: string[] = [];
              for (let i = aboutIdx + 1; i < lines.length; i++) {
                  const ln = lines[i];
                  if (!ln) continue;
                  const low = ln.toLowerCase().replace(/[\s:\-–—]+/g, ' ').trim();
                  if (/^(skills|experience|education|languages|interests|contact|work|professional|employment)$/.test(low)) break;
                  if (/^[A-Z0-9 \-]{2,}$/.test(ln) && ln === ln.toUpperCase() && ln.split(' ').length <= 6) break;
                  // exclude lines that look like experience entries (e.g., start with a dash or bullet)
                  if (/^[-•\u2022\*]\s*/.test(ln)) break;
                  out.push(ln);
              }
              const para = out.join(' ').replace(/\s+/g, ' ').trim();
              return para;
          }
          return '';
      };

      // Always prefer the ABOUT block extracted from the full text when available.
      const chooseBestSummary = (primary?: string | null, fallbackFullText?: string | null) => {
          // 1) If the full parsed text contains an ABOUT block, use it (strong preference)
          const aboutFromText = extractAboutFromText(fallbackFullText || '');
          if (aboutFromText && aboutFromText.length > 30) return aboutFromText;

          // 2) Otherwise fall back to sanitized primary or sanitized fallback
          const p = sanitizeSummary(primary || '');
          const f = sanitizeSummary(fallbackFullText || '');
          if ((p || '').length >= 80) return p;
          if ((f || '').length > (p || '').length) return f;
          return p || f || '';
      };

      // If the server persisted an auto-parsed revision but top-level personalInfo is empty,
      // merge the parsed revision into local state for immediate display (do not persist automatically).
      useEffect(() => {
          if (!resumeData) return;
          try {
              const hasPersonal = resumeData.personalInfo && (String(resumeData.personalInfo.fullName || '').trim() || String(resumeData.personalInfo.email || '').trim() || String(resumeData.personalInfo.summary || '').trim());
              if (hasPersonal) return;
              const revs = Array.isArray(resumeData.revisions) ? resumeData.revisions : [];
              // prefer the latest parsed/import revision
              const parsedRev = revs.slice().reverse().find((r: any) => (r && (r.parsed || (r.tags && (r.tags.includes('parsed') || r.tags.includes('import') || r.tags.includes('Auto-Parsed'))))));
              if (!parsedRev || !parsedRev.parsed) return;

              const parsed = parsedRev.parsed;
              // Heuristic: derive name from parsed.name, else parsed.firstName/lastName, else from email local-part
              const capitalize = (s?: string) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1).toLowerCase();
              // Do NOT auto-derive a display full name from the email local-part.
              // Only accept explicit parsed name or first/last combo (avoid showing contact handles as the user's name).
              const derivedName = parsed.name || ((parsed.firstName && parsed.lastName) ? `${parsed.firstName} ${parsed.lastName}` : null) || parsed.fullName || null;
              const rawSummary = parsed.summary || (parsed.text ? String(parsed.text) : null);
              const derivedSummary = chooseBestSummary(parsed.summary, parsed.text ? String(parsed.text) : null);
              const derivedEmail = parsed.email || null;
              const derivedPhone = parsed.phone || null;
              const derivedWebsite = parsed.website || null;
              const derivedLocation = parsed.location || null;

              setResumeData(prev => {
                  const newData: any = { ...(prev as any) };
                  newData.personalInfo = {
                      ...newData.personalInfo,
                      fullName: derivedName || newData.personalInfo.fullName,
                      email: derivedEmail || newData.personalInfo.email,
                      phone: derivedPhone || newData.personalInfo.phone,
                      website: derivedWebsite || newData.personalInfo.website,
                      location: derivedLocation || newData.personalInfo.location,
                      summary: derivedSummary || newData.personalInfo.summary,
                  };
                  // Merge parsed experience/education into preview state so UI renders them in separate sections
                  if (parsed.experience && Array.isArray(parsed.experience) && parsed.experience.length) newData.experience = normalizeParsedExperience(parsed.experience);
                  if (parsed.education && Array.isArray(parsed.education) && parsed.education.length) newData.education = parsed.education;
                  if (parsed.skills) {
                      newData.skills = Array.isArray(parsed.skills) ? parsed.skills : String(parsed.skills).split(',').map((s:string) => ({ name: s.trim(), level: 'Intermediate' }));
                  } else if (parsed.skillsText) {
                      newData.skills = String(parsed.skillsText).split(',').map((s:string) => ({ name: s.trim(), level: 'Intermediate' }));
                  }
                  // languages & interests (optional parsed arrays)
                  if (parsed.languages && Array.isArray(parsed.languages)) {
                      newData.languages = parsed.languages.slice(0, 20);
                  }
                  if (parsed.interests && Array.isArray(parsed.interests)) {
                      newData.interests = parsed.interests.slice(0, 40);
                  }
                  return newData;
              });
          } catch (err) {
              console.warn('Failed to merge parsed revision into state', err);
          }
      }, [JSON.stringify(resumeData?.revisions || [])]);
  
        // UI State
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
    // Right panel dynamic width (px)
    const [rightPanelWidth, setRightPanelWidth] = useState<number>(384);
    const resizingRef = React.useRef<{ active: boolean; startX: number; startWidth: number }>({ active: false, startX: 0, startWidth: 384 });
    const [assistantTab, setAssistantTab] = useState<'analysis' | 'editor' | 'tune' | 'appearance'>('analysis');
  const [fixingIssueId, setFixingIssueId] = useState<string | null>(null);
    const [openIssueId, setOpenIssueId] = useState<string | null>(null);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => ({
        structure: false,
        skills: false,
        contact: false,
        reverseChron: false,
        bullets: false,
        formatting: false,
    }));

    const toggleSection = (key: string) => {
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
    };
    // Suggestion modal state
    const [suggestionModalOpen, setSuggestionModalOpen] = useState(false);
    const [suggestionModalIssue, setSuggestionModalIssue] = useState<any | null>(null);
    const [suggestionModalCandidates, setSuggestionModalCandidates] = useState<string[]>([]);
    // Editable content for suggestion modal
    const [suggestionModalEditValue, setSuggestionModalEditValue] = useState<string>('');
    // Track last applied suggestion to show success / diff info
    const [suggestionApplySuccess, setSuggestionApplySuccess] = useState<{ issueId: string; title: string; targetSection?: string | null; oldValue: string; newValue: string } | null>(null);
    // Inline editing state for direct page edits
    const [inlineEdit, setInlineEdit] = useState<{ section: string; field: string; id?: string | null; index?: number | null; value: string } | null>(null);

    const cancelInlineEdit = () => setInlineEdit(null);

    const saveInlineEdit = async () => {
        if (!inlineEdit) return;
        const { section, field, id, index, value } = inlineEdit;
        try {
            // Build newData deterministically so we can persist the exact state
            let newData: any = { ...(resumeData as any) };
            if (section === 'personalInfo') {
                newData.personalInfo = { ...newData.personalInfo, [field]: value };
                setResumeData(newData);
            } else if (section === 'experience' && id) {
                newData.experience = (newData.experience || []).map((exp:any) => {
                    if (exp.id !== id) return exp;
                    if (field === 'bullet' && typeof index === 'number') {
                        const bullets = Array.isArray(exp.bullets) ? exp.bullets.slice() : [];
                        bullets[index] = value;
                        return { ...exp, bullets };
                    }
                    return { ...exp, [field]: value };
                });
                setResumeData(newData);
            }

            // Persist to server (no revision created)
            try {
                await updateResume(newData.id, { data: newData, lastUpdated: new Date().toISOString() });
            } catch (err) {
                console.warn('Failed to persist inline edit', err);
            }
        } catch (e) {
            console.error('saveInlineEdit error', e);
        } finally {
            setInlineEdit(null);
        }
    };
    // Cooldowns to avoid rapid repeated API calls / token spikes
    const [analyzeCooldown, setAnalyzeCooldown] = useState(false);
    const [suggestCooldowns, setSuggestCooldowns] = useState<Record<string, boolean>>({});
  
  // Tuning State
  const [tuneJobRole, setTuneJobRole] = useState('');
  const [tuneJobDesc, setTuneJobDesc] = useState('');
  const [tuneStep, setTuneStep] = useState<'input' | 'analyzing' | 'preview'>('input');

    // PDF / Parsing State
    const [originalPdfUrl, setOriginalPdfUrl] = useState<string | null>(null);
    const [showOriginalPdf, setShowOriginalPdf] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);
    const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [parsedPreview, setParsedPreview] = useState<{ name?: string; email?: string; phone?: string; summary?: string; skillsText?: string } | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);

    // Appearance settings (preview-only until Save Revision)
    interface AppearanceSettings {
        template: 'classic' | 'modern' | 'compact';
        color: 'purple' | 'blue' | 'green' | 'black';
        fontSize: 'small' | 'medium' | 'large';
        fontFamily: 'system' | 'serif' | 'mono';
        spacing: 'compact' | 'normal' | 'relaxed';
        columns: 1 | 2;
        showSections: {
            summary: boolean;
            experience: boolean;
            education: boolean;
            skills: boolean;
            languages: boolean;
            interests: boolean;
        };
        headerStyle: 'uppercase' | 'titlecase' | 'hide';
    }

    const defaultAppearance: AppearanceSettings = {
        template: 'classic',
        color: 'purple',
        fontSize: 'medium',
        fontFamily: 'system',
        spacing: 'normal',
        columns: 1,
        showSections: { summary: true, experience: true, education: true, skills: true, languages: true, interests: true },
        headerStyle: 'uppercase'
    };

    const [appearance, setAppearance] = useState<AppearanceSettings>(defaultAppearance);

    // Initialize appearance from resumeData (preview only)
    useEffect(() => {
        try {
            const ap = (resumeData as any).data?.appearance || (resumeData as any).appearance || null;
            if (ap) setAppearance(prev => ({ ...prev, ...(ap as Partial<AppearanceSettings>) }));
            else setAppearance(defaultAppearance);
        } catch (e) { setAppearance(defaultAppearance); }
    }, [resumeData.id, JSON.stringify((resumeData as any).data?.appearance || (resumeData as any).appearance || {})]);

    // removed stale initialResume effect

  // --- Handlers ---
    // Revision preview state
    const [previewRevision, setPreviewRevision] = useState<any | null>(null);

  const handlePrint = () => {
      window.print();
  };

  // Normalize parsed experience entries from the server or PDF parser.
  // This attempts to merge fragmented entries (where bullets or date lines
  // were split into separate parsed objects) and remove obvious noise
  // such as contact lines accidentally captured as experience items.
  const normalizeParsedExperience = (src?: any[] | null) => {
      if (!Array.isArray(src)) return [];
      const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
      const phoneRe = /(\+?\d[\d\-\s()]{6,}\d)/;
      const urlRe = /(https?:\/\/)?([\w.-]+\.[a-z]{2,})/i;
      const bulletRe = /^\s*[-–—•\u2022\*]\s*/;
      const dateLikeRe = /\b(\d{4}|\d{4}–|\d{4}\s*[-–]\s*\d{4}|present|present)\b/i;

      const out: any[] = [];
      for (let i = 0; i < src.length; i++) {
          const raw = src[i] || {};
              let title = String(raw.title || '').trim();
              let date = String(raw.date || '').trim();
              const bullets = Array.isArray(raw.bullets) ? raw.bullets.map((b:string) => String(b).trim()).filter(Boolean) : [];
              // preserve company/role if provided by server parser
              let company = raw.company ? String(raw.company).trim() : '';
              let role = raw.role ? String(raw.role).trim() : '';
              // If server didn't provide company/role, attempt a conservative split from title
              if (!company && !role && title && title.includes('/')) {
                  const parts = title.split(/\s*\/\s*/);
                  if (parts.length >= 2) {
                      // heuristic: left is company, right is role
                      company = parts[0].trim();
                      role = parts.slice(1).join(' / ').trim();
                  }
              }

          // Skip empty/garbage entries that are just contact info
          if ((!title || title.length < 2) && (!date || date.length < 2) && bullets.length === 0) continue;
          if (emailRe.test(title) || phoneRe.test(title) || urlRe.test(title)) continue;
          if (emailRe.test(date) || phoneRe.test(date) || urlRe.test(date)) { date = ''; }

          // Clean leading bullet chars from titles
          if (bulletRe.test(title)) title = title.replace(bulletRe, '').trim();

          const cur = { id: raw.id || `exp_${i}_${Math.random().toString(36).slice(2,6)}`, title, company, role, date, bullets: bullets.slice() };

          // If looks like a continuation (title starts with a bullet or lowercase conjunction)
          const isContinuation = bulletRe.test(raw.title || '') || (/^(&|and |or |\-|–|—)/i.test(raw.title || '')) || (title && title[0] === title[0].toLowerCase() && title.split(' ').length < 10 && !dateLikeRe.test(title));

          if (out.length && (isContinuation || (!cur.bullets.length && title && title.length < 120 && title.split(' ').length < 12 && !/\/[A-Z]/.test(title) && !/^[A-Z\s]+$/.test(title)))) {
              // Merge into previous entry conservatively
              const prev = out[out.length - 1];
              // If current has a date that looks like a date and prev lacks one, set it
              if (!prev.date && date && dateLikeRe.test(date)) prev.date = date;
              // If current title looks like a short descriptive line, add it as a bullet
              if (title && !prev.bullets.includes(title)) prev.bullets.push(title);
              // preserve company/role on previous if current provides them
              if (!prev.company && company) prev.company = company;
              if (!prev.role && role) prev.role = role;
              // Append any bullets
              for (const b of cur.bullets) if (b && !prev.bullets.includes(b)) prev.bullets.push(b);
              continue;
          }

          // If title seems like "LOCATION / DATE" and previous exists, merge into previous
          if (out.length && /[,\/]\s*[A-Za-z]{2,}/.test(title) && dateLikeRe.test(title)) {
              const prev = out[out.length - 1];
              if (!prev.date) prev.date = title;
              continue;
          }

          out.push(cur);
      }

      // Second pass: merge adjacent fragments where the following entry is
      // clearly a location/date line or a short continuation. This helps when
      // the server splits a role, location/date and bullets into separate items.
      const merged: any[] = [];
      for (let i = 0; i < out.length; i++) {
          const cur = { ...out[i] };
          // Skip obvious section headers captured as experience
          const tlow = String(cur.title || '').toLowerCase().trim();
          if (/^contact$/.test(tlow) || /^skills?$/.test(tlow) || /^education$/.test(tlow)) continue;

          // Look ahead to next fragment
          while (i + 1 < out.length) {
              const nxt = out[i + 1];
              if (!nxt) break;
              const nxtTitle = String(nxt.title || '').trim();
              const nxtLower = nxtTitle.toLowerCase();
              const isLocationLike = /[A-Za-z .'\-]+,\s*[A-Za-z]{2}\b/.test(nxtTitle) || /\b(jr|sr|llc)\b/i.test(nxtTitle) || /\b(remote|remote \/|remote\b)/i.test(nxtTitle);
              const isDateLike = /\b(\d{4}|\d{4}–|\d{4}\s*[-–]\s*\d{4}|present|present)\b/i.test(nxtTitle) || /\d{4}–Present/i.test(nxtTitle);
              const isShortContinuation = nxtTitle.length > 0 && nxtTitle.length < 120 && nxtTitle.split(' ').length < 12 && /^[a-z\-&\(]/.test(nxtTitle);
              const isBulletOnly = Array.isArray(nxt.bullets) && nxt.bullets.length > 0 && (!nxt.title || nxt.title.length < 5);

              if (isLocationLike || isDateLike) {
                  // merge location/date into cur.date if cur has no date
                  if (!cur.date || cur.date.length < 4) cur.date = cur.date ? cur.date + ' / ' + nxtTitle : nxtTitle;
                  // only absorb bullets if the next fragment does not look like a distinct job header
                  const nxtLooksLikeTitle = Boolean(nxt.title && (nxt.title.includes('/') || nxt.title === String(nxt.title).toUpperCase()));
                  if (!nxtLooksLikeTitle && Array.isArray(nxt.bullets) && nxt.bullets.length) cur.bullets.push(...nxt.bullets.filter(Boolean));
                  // absorb company/role if present on next fragment
                  if (!cur.company && nxt.company) cur.company = nxt.company;
                  if (!cur.role && nxt.role) cur.role = nxt.role;
                  i++; // consume next
                  continue;
              }
              if (isShortContinuation || isBulletOnly) {
                  // treat nxt title as a broken bullet or continuation — but only if
                  // the next fragment does not itself look like a standalone job header
                  const nxtLooksLikeTitle = Boolean(nxt.title && (nxt.title.includes('/') || nxt.title === String(nxt.title).toUpperCase()));
                  if (!nxtLooksLikeTitle) {
                      if (nxtTitle && !cur.bullets.includes(nxtTitle)) cur.bullets.push(nxtTitle);
                      if (Array.isArray(nxt.bullets) && nxt.bullets.length) cur.bullets.push(...nxt.bullets.filter(Boolean));
                      if (!cur.company && nxt.company) cur.company = nxt.company;
                      if (!cur.role && nxt.role) cur.role = nxt.role;
                      i++; // consume next
                      continue;
                  }
              }
              break;
          }

          // Clean/merge broken bullets inside cur.bullets: join lines where a bullet
          // looks like it was split across lines (next bullet starts lowercase or
          // previous bullet doesn't end with punctuation).
          const cleanedBullets: string[] = [];
          for (let bi = 0; bi < (cur.bullets || []).length; bi++) {
              let b = String(cur.bullets[bi] || '').trim();
              if (!b) continue;
              // If next bullet exists and starts with a lowercase or ampersand, merge
              const nextB = String((cur.bullets || [])[bi + 1] || '').trim();
              if (nextB && /^[a-z&]/.test(nextB) && !/[.!?]$/.test(b)) {
                  // merge b and nextB
                  b = (b + ' ' + nextB).replace(/\s+/g, ' ').trim();
                  bi++; // skip next bullet
              }
              // If bullet starts with a dash char, strip it
              b = b.replace(/^[-–—]\s*/, '');
              cleanedBullets.push(b);
          }
          cur.bullets = Array.from(new Set(cleanedBullets));
          merged.push(cur);
      }

      // Final pass: remove tiny stray entries
      return merged.filter(e => {
          if (!e.title && (!e.bullets || e.bullets.length === 0)) return false;
          if (String(e.title || '').length > 0 && String(e.title).trim().length < 3 && (!e.bullets || e.bullets.length === 0)) return false;
          if (emailRe.test(String(e.title || '')) || phoneRe.test(String(e.title || ''))) return false;
          return true;
      });
  };

    // 1. Handle AI Fix Application
    const handleApplyFix = async (issue: AnalysisIssue) => {
        if (!issue.fixAction) return;
        setFixingIssueId(issue.id);

        try {
            // Build deterministic newData and apply changes so we can persist the exact object
            const newData: any = { ...(resumeData as any) };
            if (issue.fixAction?.targetSection === 'experience' && issue.fixAction.targetId) {
                newData.experience = newData.experience.map((exp:any) => exp.id === issue.fixAction?.targetId ? { ...exp, bullets: issue.fixAction.newContent as string[] } : exp);
            } else if (issue.fixAction?.targetSection === 'summary') {
                newData.personalInfo = { ...newData.personalInfo, summary: issue.fixAction.newContent as string };
            }
            if (newData.analysis) {
                newData.analysis = {
                    ...newData.analysis,
                    overallScore: Math.min(100, (newData.analysis.overallScore || 0) + 5),
                    issues: (newData.analysis.issues || []).filter((i:any) => i.id !== issue.id)
                };
            }

            // Update local state and persist (no revision created)
            setResumeData(newData);
            await updateResume(newData.id, { data: newData, lastUpdated: new Date().toISOString() });
        } catch (err) {
            console.error('Failed to apply fix', err);
        } finally {
            setFixingIssueId(null);
        }
    };

  // 2. Handle Manual Edits (Deep Update)
  const handleInputChange = (section: string, field: string, value: string, id?: string) => {
    setResumeData(prev => {
        const newData = { ...prev };
        if (section === 'personalInfo') {
            newData.personalInfo = { ...newData.personalInfo, [field]: value };
        } else if (section === 'experience' && id) {
            newData.experience = newData.experience.map(exp => 
                exp.id === id ? { ...exp, [field]: value } : exp
            );
        } else if (section === 'education' && id) {
            newData.education = newData.education.map(edu => 
                edu.id === id ? { ...edu, [field]: value } : edu
            );
        }
        return newData;
    });
  };

  // Handle Bullet Points Editing
  const handleBulletChange = (expId: string, bulletsText: string) => {
      const bullets = bulletsText.split('\n').filter(line => line.trim() !== '');
      setResumeData(prev => ({
          ...prev,
          experience: prev.experience.map(exp => 
            exp.id === expId ? { ...exp, bullets } : exp
          )
      }));
  };

  // Handle Skills Editing
  const handleSkillsChange = (skillsText: string) => {
      const skillsList = skillsText.split(',').map(s => s.trim()).filter(s => s !== '');
      setResumeData(prev => ({
          ...prev,
          skills: skillsList.map(s => ({ name: s, level: 'Expert' }))
      }));
  };

  // Handle Languages Editing
  const handleLanguagesChange = (langsText: string) => {
      const parts = langsText.split(/[,\n]/).map(s => s.trim()).filter(s => s !== '');
      const profRe = /(native|fluent|advanced|intermediate|conversational|basic|proficient)/i;
      const langs = parts.map(p => {
          // parse formats like "Spanish (Fluent)", "English: Native", "ASL - Native"
          const m = String(p).match(/([^:\-–—(]+)[:\-–—\(]?\s*([^)]*)/);
          let name = p;
          let prof = undefined;
          if (m) {
              name = String(m[1]).trim();
              const maybe = String(m[2] || '').trim();
              if (maybe) {
                  const pm = maybe.match(profRe);
                  if (pm) {
                      const tok = pm[0].toLowerCase();
                      if (tok.includes('native')) prof = 'Native';
                      else if (tok.includes('fluent') || tok.includes('advanced') || tok.includes('proficient')) prof = 'Fluent';
                      else if (tok.includes('intermediate')) prof = 'Intermediate';
                      else if (tok.includes('conversational')) prof = 'Conversational';
                      else if (tok.includes('basic')) prof = 'Basic';
                  }
              }
          }
          if (/^asl$/i.test(name)) name = 'American Sign Language';
          return { name: String(name).trim(), proficiency: prof };
      });
      setResumeData(prev => ({ ...prev, languages: langs }));
  };

  // Handle Interests Editing
  const handleInterestsChange = (intsText: string) => {
      const ints = intsText.split(/[,\n]/).map(s => s.trim()).filter(s => s !== '');
      setResumeData(prev => ({ ...prev, interests: ints }));
  };

    const handleGeneratePdf = async () => {
        try {
            setIsGeneratingPdf(true);
            let json: any = await generatePdf(resumeData.id);
            const url = json && json.url ? json.url : (json && json.row && json.row.data && json.row.data.generated_pdf_path ? json.row.data.generated_pdf_path : null);
            if (url && typeof url === 'string') {
                // If the server returned a signed URL, open it; otherwise try to resolve via storage helper
                if (url.startsWith('http')) {
                    window.open(url, '_blank');
                } else {
                    const resolved = await getStoragePublicUrl(url);
                    if (resolved) window.open(resolved, '_blank');
                }
                // Update local state if server returned the updated row
                if (json.row) {
                    const rowData = json.row.data ? json.row.data : json.row;
                    setResumeData(rowData);
                }
            } else {
            // Normalize returned json and capture raw text if the model returned unstructured output
            let rawText: string | null = null;
            try {
                if (json && typeof json.raw === 'string') rawText = json.raw;
                else if (json && typeof json === 'string') rawText = json;
                else if (json && typeof json === 'object' && json.rawText) rawText = json.rawText;
                // Attempt JSON.parse on raw if it looks like JSON
                if (rawText) {
                    try { const p = JSON.parse(rawText); if (p) json = p; } catch (e) { /* rawText remains */ }
                }
            } catch (e) { /* noop */ }
                }
            } catch (err) {
                console.error('Generate PDF failed', err);
            } finally {
                setIsGeneratingPdf(false);
            }
    };

    // --- New: Analysis / Suggestion / Revision helpers ---
    const handleAnalyze = async () => {
        try {
            if (analyzeCooldown) {
                alert('Analysis is cooling down — please wait a few seconds before re-running.');
                return;
            }
            // set a short cooldown to limit token usage from repeated clicks
            setAnalyzeCooldown(true);
            setTimeout(() => setAnalyzeCooldown(false), 8000);
            // Try server-side analyze endpoint first
            const payload = { id: resumeData.id, data: resumeData };
            let json: any = null;
            let rawText: string | null = null;
            try {
                const resp = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (resp.ok) {
                    json = await resp.json();
                    if (json && typeof json.raw === 'string') rawText = json.raw;
                    else if (json && typeof json === 'string') rawText = json;
                    else if (json && typeof json === 'object' && json.rawText) rawText = json.rawText;
                }
            } catch (e) {
                // ignore - we'll fall back to client-side heuristics
            }
            // If backend returned raw text, attempt to parse it into JSON
            try {
                if (rawText) {
                    try { const p = JSON.parse(rawText); if (p) json = p; } catch (e) { /* leave as-is */ }
                } else if (json && typeof json === 'string') {
                    try { const p = JSON.parse(json); if (p) json = p; } catch (e) { /* leave as-is */ }
                }
            } catch (e) { /* noop */ }
            if (!json) {
                // Fallback heuristic analysis (mock) so UI works without backend AI
                const summaryLen = String(resumeData.personalInfo.summary || '').trim().length;
                const expCount = Array.isArray(resumeData.experience) ? resumeData.experience.length : 0;
                const skillsCount = Array.isArray(resumeData.skills) ? resumeData.skills.length : 0;
                const overall = Math.max(30, Math.min(95, Math.round((Math.min(1200, summaryLen) / 1200) * 40 + Math.min(6, expCount) * 8 + Math.min(12, skillsCount) * 3)));
                const categories: any = { clarity: Math.min(100, Math.round((summaryLen / 800) * 100)), experience: Math.min(100, expCount * 12), skills: Math.min(100, skillsCount * 10), formatting: 70 };
                const issues: any[] = [];
                if (summaryLen < 120) issues.push({ id: `issue_summary_${Date.now()}`, severity: 'major', title: 'Short Summary', description: 'Your professional summary is short; expand with achievements and impact.', suggestion: 'Add 2–3 achievement-oriented sentences quantifying impact.', fixAction: { targetSection: 'summary', newContent: (resumeData.personalInfo.summary || '') + ' Experienced professional with a track record of delivering measurable results.' } });
                if (skillsCount < 5) issues.push({ id: `issue_skills_${Date.now()}`, severity: 'minor', title: 'Few Skills Detected', description: 'We detected fewer than 5 skills — consider adding relevant hard skills and keywords.', suggestion: 'Add role-specific keywords (e.g., GraphQL, Docker, AWS).', fixAction: null });
                if (expCount === 0) issues.push({ id: `issue_experience_${Date.now()}`, severity: 'critical', title: 'No Experience Listed', description: 'No work experience entries found. Add roles with bullets that demonstrate outcomes.', suggestion: 'Add at least one role with 3–5 bullet points showing impact.', fixAction: null });
                json = { overallScore: overall, categories, issues };
            }

            // Build an analysis object for the UI
            const analysisObj: any = { overallScore: 0, categories: {}, issues: [] };
            if (json && typeof json === 'object') {
                analysisObj.overallScore = json.overallScore || json.overall || 0;
                analysisObj.categories = json.categories || json.cat || json.scores || {};
                analysisObj.issues = json.issues || json.issues || json.problems || [];
            }
            // If we have rawText (unstructured model output), attempt to extract common category scores and include rawText for inspection
            if (!analysisObj.overallScore && rawText) {
                const parsed = (function parseRaw(text: string) {
                    const out: any = { categories: {}, issues: [] };
                    // Try find lines like "Structure 25/25" or "Structure: 25/25" or "Structure — 25/25" or "Structure: 80"
                    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    for (const l of lines) {
                        const m = l.match(/(Structure|Skill Level|Skills|Contact Info|Contact|Reverse Chronology|Reverse Chron|Bullet Analysis|Bullets|Overall)[:\-–\s]*([0-9]{1,3})(?:\/?([0-9]{1,3}))?/i);
                        if (m) {
                            const key = m[1].toLowerCase();
                            const a = Number(m[2]);
                            const b = m[3] ? Number(m[3]) : null;
                            const pct = b ? Math.round((a / b) * 100) : (a <= 100 ? a : Math.min(100, a));
                            if (/structure/i.test(key)) out.categories.structure = pct;
                            else if (/skill/i.test(key) || /skills/i.test(key)) out.categories.skills = pct;
                            else if (/contact/i.test(key)) out.categories.contact = pct;
                            else if (/reverse/i.test(key)) out.categories.reverseChron = pct;
                            else if (/bullet/i.test(key) || /bullets/i.test(key)) out.categories.bullets = pct;
                            else if (/overall/i.test(key)) out.overall = pct;
                        }
                        // capture simple issue lines
                        const issueMatch = l.match(/^-\s*(CRITICAL|MAJOR|MINOR)?[:\s]*(.+)/i);
                        if (issueMatch) out.issues.push({ title: issueMatch[2].trim(), severity: (issueMatch[1] || 'minor').toLowerCase() });
                    }
                    return out;
                })(rawText);
                if (parsed && parsed.categories) {
                    analysisObj.categories = { ...analysisObj.categories, ...parsed.categories };
                }
                if (!analysisObj.overallScore && parsed && parsed.overall) analysisObj.overallScore = parsed.overall;
                if (parsed && parsed.issues && parsed.issues.length) analysisObj.issues = [...(analysisObj.issues || []), ...parsed.issues];
                analysisObj.rawOutput = rawText;
            } else if (json && typeof json === 'string') {
                analysisObj.rawOutput = json;
            }

            // Run client-side heuristics and merge with AI analysis (AI values take precedence)
            try {
                const heur = computeHirationHeuristics(resumeData as Resume);
                analysisObj.categories = { ...(heur.categories || {}), ...(analysisObj.categories || {}) };
                const existingIds = new Set((analysisObj.issues || []).map((i:any) => i.id));
                for (const hi of (heur.issues || [])) {
                    if (!existingIds.has(hi.id)) analysisObj.issues.push(hi);
                }
                analysisObj.source = 'ai+heuristics';
            } catch (e) { /* noop */ }

            // If AI didn't provide an overall score, attempt to compute one from categories
            try {
                if (!analysisObj.overallScore) {
                    const vals = Object.values(analysisObj.categories || {}).filter(v => typeof v === 'number');
                    if (vals.length) {
                        const avg = Math.round(vals.reduce((a:any,b:any)=>a+b,0) / vals.length);
                        analysisObj.overallScore = Math.min(100, Math.max(0, avg));
                    }
                }
            } catch (e) { /* noop */ }

            // Merge into resumeData.analysis
            setResumeData(prev => ({ ...(prev as any), analysis: { overallScore: analysisObj.overallScore || 0, categories: analysisObj.categories || {}, issues: analysisObj.issues || [], rawOutput: analysisObj.rawOutput || null } } as Resume));
            setAssistantTab('analysis');
        } catch (err) {
            console.error('Analysis failed', err);
            alert('Analysis failed. See console.');
        }
    };

    const handleSuggestRewrite = async (issue: any) => {
        if (suggestCooldowns[issue.id]) {
            alert('Please wait a few seconds before requesting another suggestion for this issue.');
            return;
        }
        // Try server-side suggest endpoint, else local mock
        try {
            let json: any = null;
            try {
                const resp = await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: resumeData.id, issue, data: resumeData }) });
                if (resp.ok) json = await resp.json();
            } catch (e) {}

            if (!json) {
                // simple local rewrite heuristics
                if (issue.fixAction && issue.fixAction.targetSection === 'summary') {
                    json = { suggestion: (String(resumeData.personalInfo.summary || '').slice(0, 250) + ' Proven ability to deliver on measurable outcomes.').trim() };
                } else if (issue.fixAction && issue.fixAction.targetSection === 'experience') {
                    json = { suggestion: (issue.fixAction.newContent && Array.isArray(issue.fixAction.newContent) ? issue.fixAction.newContent.join('\n') : 'Improved bullet describing impact and metrics.') };
                } else {
                    json = { suggestion: issue.suggestion || 'Suggested improvement: emphasize measurable outcomes and add relevant keywords.' };
                }
            }

            // Attach suggestion candidates into issue for quick apply/preview and open modal
            const candidates: string[] = json.candidates || (Array.isArray(json.suggestion) ? json.suggestion : (json.suggestion ? [json.suggestion] : []));
            setResumeData(prev => {
                const newData: any = { ...(prev as any) };
                newData.analysis = { ...(newData.analysis || {}), issues: (newData.analysis?.issues || []).map((i:any) => i.id === issue.id ? { ...i, suggestionCandidates: candidates } : i) };
                return newData;
            });

            // Open modal showing candidates
            setSuggestionModalIssue(issue);
            // only keep a single candidate to save tokens and UI complexity
            const first = candidates && candidates.length ? String(candidates[0]) : '';
            setSuggestionModalCandidates(first ? [first] : []);
            setSuggestionModalEditValue(first);
            setSuggestionModalOpen(true);
            // set a short cooldown for this issue to avoid repeated calls
            try {
                setSuggestCooldowns(prev => ({ ...prev, [issue.id]: true }));
                setTimeout(() => setSuggestCooldowns(prev => ({ ...prev, [issue.id]: false })), 6000);
            } catch (e) {}
        } catch (err) {
            console.error('Suggest failed', err);
            alert('Suggest failed. See console.');
        }
    };

    // Field-level suggest helper (for inline "Improve with Gemini" on summary, bullets, skills)
    const handleFieldSuggest = async (targetSection: string, targetId: string | null, currentText: string) => {
        const issue = {
            id: `issue_field_${Date.now()}`,
            severity: 'minor',
            title: `Improve ${targetSection}`,
            description: `Improve the content for ${targetSection}`,
            fixAction: { targetSection, targetId, newContent: currentText }
        };
        await handleSuggestRewrite(issue);
    };

    const applySuggestionCandidate = async (issue: any, candidate: string) => {
        try {
            // Close modal immediately for snappy UX
            setSuggestionModalOpen(false);
            // Apply locally and capture old value for feedback
            let oldValue = '';
            try {
                if (issue.fixAction && issue.fixAction.targetSection === 'summary') {
                    oldValue = String(resumeData.personalInfo.summary || '');
                    handleInputChange('personalInfo', 'summary', candidate);
                } else if (issue.fixAction && issue.fixAction.targetSection === 'experience' && issue.fixAction.targetId) {
                    const bullets = candidate.split('\n').map((l:string) => l.trim()).filter(Boolean);
                    const expBefore = (resumeData.experience || []).find((ex:any) => ex.id === issue.fixAction.targetId);
                    oldValue = expBefore ? (Array.isArray(expBefore.bullets) ? expBefore.bullets.join('\n') : String(expBefore.bullets || '')) : '';
                    setResumeData(prev => ({ ...prev, experience: prev.experience.map((exp:any) => exp.id === issue.fixAction.targetId ? { ...exp, bullets } : exp) } as Resume));
                } else if (issue.fixAction && issue.fixAction.targetSection === 'skills') {
                    const skills = candidate.split(/[,\n]/).map((s:string) => s.trim()).filter(Boolean);
                    oldValue = (resumeData.skills || []).map((s:any) => s.name).join(', ');
                    setResumeData(prev => ({ ...prev, skills: skills.map((s:string)=>({ name: s, level: 'Intermediate' })) } as Resume));
                } else if (issue.fixAction && issue.fixAction.targetSection === 'languages') {
                    const parts = candidate.split(/[,\n]/).map((s:string) => s.trim()).filter(Boolean);
                    const profRe = /(native|fluent|advanced|intermediate|conversational|basic|proficient)/i;
                    const langs = parts.map(p => {
                        const m = String(p).match(/([^:\-–—(]+)[:\-–—\(]?\s*([^)]*)/);
                        let name = p;
                        let prof = undefined;
                        if (m) {
                            name = String(m[1]).trim();
                            const maybe = String(m[2] || '').trim();
                            if (maybe) {
                                const pm = maybe.match(profRe);
                                if (pm) {
                                    const tok = pm[0].toLowerCase();
                                    if (tok.includes('native')) prof = 'Native';
                                    else if (tok.includes('fluent') || tok.includes('advanced') || tok.includes('proficient')) prof = 'Fluent';
                                    else if (tok.includes('intermediate')) prof = 'Intermediate';
                                    else if (tok.includes('conversational')) prof = 'Conversational';
                                    else if (tok.includes('basic')) prof = 'Basic';
                                }
                            }
                        }
                        if (/^asl$/i.test(name)) name = 'American Sign Language';
                        return { name: String(name).trim(), proficiency: prof };
                    });
                    oldValue = (resumeData.languages || []).map((l:any) => l && l.name ? (l.name + (l.proficiency ? ' (' + l.proficiency + ')' : '')) : String(l)).join(', ');
                    setResumeData(prev => ({ ...prev, languages: langs } as Resume));
                } else if (issue.fixAction && issue.fixAction.targetSection === 'interests') {
                    const ints = candidate.split(/[,\n]/).map((s:string) => s.trim()).filter(Boolean);
                    oldValue = (resumeData.interests || []).join(', ');
                    setResumeData(prev => ({ ...prev, interests: ints } as Resume));
                }

                // Persist updated resume (overwrite parsed data per spec)
                try {
                    const newData = { ...resumeData } as any;
                    await updateResume(resumeData.id, { data: newData, lastUpdated: new Date().toISOString() });
                    // show success banner and what changed
                    setSuggestionApplySuccess({ issueId: issue.id, title: issue.title || 'Suggestion', targetSection: issue.fixAction?.targetSection || null, oldValue, newValue: candidate });
                    setTimeout(() => setSuggestionApplySuccess(null), 4500);
                } catch (err) {
                    console.warn('Failed to persist applied suggestion', err);
                }
                // Do NOT create a revision here; revisions are only created when the user explicitly saves a revision.
            } catch (err) {
                console.error('applySuggestionCandidate inner error', err);
            }
        } catch (err) {
            console.error('applySuggestionCandidate error', err);
            alert('Failed to apply suggestion. See console.');
        }
    };

    const handleSaveRevision = async () => {
        try {
            const message = window.prompt('Revision message (short):', 'Save revision');
            if (!message) return;
            const rev = { id: `rev_${Date.now()}`, name: message, createdAt: new Date().toISOString(), tags: ['manual'], contentSummary: message, data: resumeData };
            await createResumeRevision(resumeData.id, rev);
            setResumeData(prev => ({ ...(prev as any), revisions: [...(prev.revisions || []), rev], lastUpdated: new Date().toISOString() }));
            alert('Revision saved');
        } catch (err) {
            console.error('Save revision failed', err);
            alert('Failed to save revision. See console.');
        }
    };

    const openLayoutModal = () => {
        const current = (resumeData as any).data?.pdf_layout || (resumeData as any).pdf_layout || 'classic';
        setSelectedLayout(current);
        setIsLayoutModalOpen(true);
    };

    const saveLayoutChoice = async () => {
        setIsLayoutModalOpen(false);
        try {
            const newData = { ...resumeData } as any;
            if (newData.data) newData.data = { ...newData.data, pdf_layout: selectedLayout };
            else newData.pdf_layout = selectedLayout;
            await updateResume(resumeData.id, { data: newData, lastUpdated: new Date().toISOString() });
            setResumeData(newData as Resume);
        } catch (err) {
            console.error('Failed to save layout', err);
            alert('Failed to save layout. See console for details.');
        }
    };

  // 3. Handle Tuning Flow
  const handleStartTune = () => {
    setTuneStep('analyzing');
    setTimeout(() => {
      setTuneStep('preview');
    }, 2000);
  };

    // --- PDF Helpers ---
    async function getStoragePublicUrl(path: string) {
      // If the path looks like 'bucket/obj/path', prefer that bucket first
      try {
          if (!path) return null;
          const parts = String(path).split('/');
          const firstSegment = parts.length > 1 ? parts[0] : null;
          const knownBuckets = ['resumes-generated', 'resumes', 'resume', 'resumes-private'];
          const candidateBucket = firstSegment && knownBuckets.includes(firstSegment) ? firstSegment : null;
          const tryBuckets = candidateBucket ? [candidateBucket, ...knownBuckets] : [...knownBuckets];

          for (const bucket of tryBuckets) {
              try {
                  let objectPath = String(path);
                  const bucketPrefix = `${bucket}/`;
                  if (objectPath.startsWith(bucketPrefix)) objectPath = objectPath.slice(bucketPrefix.length);

                  // Try public URL first
                  const { data } = await supabase.storage.from(bucket).getPublicUrl(objectPath as string) as any;
                  if (data?.publicUrl) return data.publicUrl;

                  // Signed URL fallback (client may not have permission); try client createSignedUrl first
                  try {
                      const { data: signed, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 60) as any;
                      if (signedErr) {
                          console.warn(`createSignedUrl failed for bucket=${bucket} path=${path}`, signedErr);
                      } else if (signed?.signedUrl) {
                          return signed.signedUrl;
                      }
                  } catch (err2) {
                      console.warn(`createSignedUrl exception for bucket=${bucket} path=${path}`, err2);
                  }

                  // If client couldn't create a signed URL (likely because it's anon), ask our dev server to produce one using service role
                  try {
                      const qs = new URLSearchParams({ path: `${bucket}/${objectPath}` });
                      const resp = await fetch(`/api/get-signed-url?${qs.toString()}`);
                      if (resp.ok) {
                          const json = await resp.json();
                          if (json && json.signedUrl) return json.signedUrl;
                      } else {
                          console.warn('get-signed-url returned', resp.status);
                      }
                  } catch (err3) {
                      console.warn('getSignedUrl dev endpoint failed', err3);
                  }
              } catch (err) {
                  // try next bucket
              }
          }
      } catch (err) {
          console.warn('getStoragePublicUrl unexpected error', err);
      }
      const msg = `No storage bucket found for path '${path}'. Ensure the object is present or update resume.storage_path.`;
      console.warn(msg);
      setParseError(msg);
      return null;
  }

  const loadOriginalPdfUrl = async (): Promise<string | null> => {
      // Resume rows may store a `storage_path` or we can construct one from `fileName`
      // Do NOT prefer generated_pdf_path for the editor iframe (we show original upload inline only)
      const explicitPath = (resumeData as any).storage_path || (resumeData as any).data && (resumeData as any).data.storage_path;
      // object paths in Supabase storage should be relative to the bucket (do NOT include the bucket name)
      const constructed = resumeData.fileName ? `${resumeData.id}/${resumeData.fileName}` : null;
      const path = explicitPath || constructed;
      if (!path) return null;
      const url = await getStoragePublicUrl(path);
      if (url) {
          console.debug('[ResumeDetail] resolved originalPdfUrl:', url);
          setOriginalPdfUrl(url);
      }
      return url || null;
  };

  useEffect(() => {
      let mounted = true;
      (async () => {
          // When a resume loads, do NOT show any PDF in the main iframe by default.
          // Instead, resolve the original upload URL for background parsing and leave the
          // interactive parsed data visible in the main canvas. Users can explicitly
          // open the Original upload or View Generated PDF via header controls.
          try {
              if (!resumeData) return;

              // Ensure we have the original upload URL available for parsing, but don't set it into the iframe.
              const explicitPath = (resumeData as any).storage_path || (resumeData as any).data && (resumeData as any).data.storage_path;
              const hasFile = Boolean(explicitPath || resumeData.fileName);
              if (!hasFile) return;

              // Resolve original upload URL for parsing only
              const origUrl = await loadOriginalPdfUrl();
              if (!mounted) return;

              // If there's no parsed/import revision yet, parse the original upload in the background
              const hasParsedRevision = Array.isArray(resumeData.revisions) && resumeData.revisions.some((r: any) => {
                  const tags = r && r.tags ? r.tags : [];
                  return String(r.id || '').startsWith('rev_parsed_') || tags.includes('parsed') || tags.includes('import');
              });
              if (!hasParsedRevision && origUrl) {
                  if (!parsedPreview) await parsePdf(origUrl);
              } else {
                  setParsedPreview(null);
              }

              // If there's no AI analysis present, run heuristics so the sidebar isn't empty
              try {
                  const hasAnalysis = resumeData.analysis && ((resumeData.analysis.overallScore || 0) > 0 || (resumeData.analysis.issues || []).length > 0 || Object.keys(resumeData.analysis.categories || {}).length > 0);
                  if (!hasAnalysis) {
                      const heur = computeHirationHeuristics(resumeData as Resume);
                      setResumeData(prev => ({ ...(prev as any), analysis: { overallScore: heur && heur.categories ? Math.round(Object.values(heur.categories).reduce((a:any,b:any)=>a+b,0) / Math.max(1, Object.values(heur.categories).length)) : 0, categories: heur.categories || {}, issues: heur.issues || [], rawOutput: null } } as Resume));
                  }
              } catch (e) { /* noop */ }
          } catch (err) {
              console.warn('Auto load failed', err);
          }
      })();
      return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeData]);

  const parsePdf = async (overrideUrl?: string | null) => {
      if (isParsing) return;
      setParseError(null);
      setIsParsing(true);
      try {
          const url = overrideUrl || originalPdfUrl || ((resumeData as any).storage_path ? await getStoragePublicUrl((resumeData as any).storage_path) : (resumeData.fileName ? await getStoragePublicUrl(`resumes/${resumeData.id}/${resumeData.fileName}`) : null));
          if (!url) throw new Error('No PDF URL available for parsing');
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`Failed to fetch PDF: ${resp.status}`);
          const arrayBuffer = await resp.arrayBuffer();

          // dynamically import pdfjs to avoid SSR issues
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf');
          // set worker src to CDN (pdfjs-dist ships worker in package, but CDN is easiest)
          // @ts-ignore
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
              // eslint-disable-next-line no-await-in-loop
              const page = await pdf.getPage(i);
              // eslint-disable-next-line no-await-in-loop
              const textContent = await page.getTextContent();
              const pageText = textContent.items.map((it: any) => (it.str ? it.str : '')).join(' ');
              fullText += `\n${pageText}`;
          }

          // Basic extraction heuristics
          const emailMatch = fullText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
          const phoneMatch = fullText.match(/(\+?\d[\d\-\s()]{6,}\d)/);
          const lines = fullText.split(/\n|\r/).map((l: string) => l.trim()).filter(Boolean);
          const nameCandidate = lines.find((l: string) => l.split(' ').length <= 5 && l.length > 3) || '';

          // Try to find a Skills section
          const skillsMatch = fullText.match(/Skills[:\-\s]*([\s\S]{0,200})/i);
          let skillsText = '';
          if (skillsMatch && skillsMatch[1]) {
              skillsText = skillsMatch[1].split(/[\n,•·]/).map((s: string) => s.trim()).filter(Boolean).slice(0, 30).join(', ');
          }

              const parsedObj = {
              name: nameCandidate,
              email: emailMatch?.[0] || '',
              phone: phoneMatch?.[0] || '',
              summary: sanitizeSummary(fullText).slice(0, 2000),
              skillsText
          };
          setParsedPreview(parsedObj);
                // Immediately reflect parsed data in the preview (in-memory only).
          setResumeData(prev => {
              const newData = { ...prev } as any;
              newData.personalInfo = {
                  ...newData.personalInfo,
                  fullName: nameCandidate || newData.personalInfo.fullName,
                  email: emailMatch?.[0] || newData.personalInfo.email,
                  phone: phoneMatch?.[0] || newData.personalInfo.phone,
                  summary: sanitizeSummary(fullText).slice(0, 2000) || newData.personalInfo.summary,
              };
              if (skillsText) {
                  newData.skills = skillsText.split(',').map((s: string) => ({ name: s.trim(), level: 'Intermediate' }));
              }
              return newData;
          });
                            // Keep parsedPreview available for user to apply manually via the Editor.
      } catch (err: any) {
          console.error('PDF parse failed', err);
          setParsedPreview(null);
          setParseError(err?.message || String(err));
      } finally {
          setIsParsing(false);
      }
  };

  async function applyParsedData(passedParsed?: { name?: string; email?: string; phone?: string; summary?: string; skillsText?: string } | null) {
      const parsed = passedParsed || parsedPreview;
      if (!parsed) return;
            // Prevent repeated auto-applies: if a parsed revision already exists, skip.
            const hasParsedRevision = Array.isArray(resumeData.revisions) && resumeData.revisions.some((r: any) => {
                const tags = r && r.tags ? r.tags : [];
                return String(r.id || '').startsWith('rev_parsed_') || tags.includes('parsed') || tags.includes('import');
            });
            if (hasParsedRevision) {
                // clear parsedPreview and bail
                setParsedPreview(null);
                return;
            }
      const newData = { ...resumeData } as Resume & any;
      newData.personalInfo = {
          ...newData.personalInfo,
          fullName: parsed.name || ((parsed.firstName && parsed.lastName) ? `${parsed.firstName} ${parsed.lastName}` : null) || newData.personalInfo.fullName,
          email: parsed.email || newData.personalInfo.email,
          phone: parsed.phone || newData.personalInfo.phone,
          summary: chooseBestSummary(parsed.summary, parsed.text ? String(parsed.text) : null) || newData.personalInfo.summary,
      };
      if (parsed.skillsText) {
          newData.skills = parsed.skillsText.split(',').map(s => ({ name: s.trim(), level: 'Intermediate' }));
      }
      if (parsed.experience && Array.isArray(parsed.experience)) {
          newData.experience = normalizeParsedExperience(parsed.experience).map((e:any) => ({ id: e.id, role: e.role || e.title || '', company: e.company || '', date: e.date || '', bullets: e.bullets || [] }));
      }
      if (parsed.languages) {
          const src = Array.isArray(parsed.languages) ? parsed.languages : String(parsed.languages).split(/[,\n]/).map((s:string)=>s.trim()).filter(Boolean);
          newData.languages = src.map((it:any) => {
              if (!it) return null;
              if (typeof it === 'string') {
                  const m = String(it).match(/([^:\-–—(]+)[:\-–—\(]?\s*([^)]*)/);
                  let name = it;
                  let prof = undefined;
                  if (m) {
                      name = String(m[1]).trim();
                      const maybe = String(m[2] || '').trim();
                      if (maybe) {
                          const pm = maybe.match(/(native|fluent|advanced|intermediate|conversational|basic|proficient)/i);
                          if (pm) {
                              const tok = pm[0].toLowerCase();
                              if (tok.includes('native')) prof = 'Native';
                              else if (tok.includes('fluent') || tok.includes('advanced') || tok.includes('proficient')) prof = 'Fluent';
                              else if (tok.includes('intermediate')) prof = 'Intermediate';
                              else if (tok.includes('conversational')) prof = 'Conversational';
                              else if (tok.includes('basic')) prof = 'Basic';
                          }
                      }
                  }
                  if (/^asl$/i.test(name)) name = 'American Sign Language';
                  return { name: String(name).trim(), proficiency: prof };
              }
              return { name: it.name || it, proficiency: it.proficiency };
          }).filter(Boolean);
      }
      if (parsed.interests) {
          newData.interests = Array.isArray(parsed.interests) ? parsed.interests : String(parsed.interests).split(/[,\n]/).map((s:string)=>s.trim()).filter(Boolean);
      }

          // Persist parsed data onto the resume row (no revision created automatically)
          try {
          (newData as any).parsedImportedAt = new Date().toISOString();
          await updateResume(newData.id, { data: newData, title: newData.title, lastUpdated: new Date().toISOString(), parsedImportedAt: (newData as any).parsedImportedAt });
                    setResumeData(newData);
                    setParsedPreview(null);
                    try {
                        // Invalidate module-level resumes cache so list views will refetch
                        try { (globalThis as any)._slate_resumes_cache = null; } catch (e) {}
                        // Broadcast an event so any open list views (cards) can refresh
                        if (typeof window !== 'undefined' && window.dispatchEvent) {
                            try {
                                window.dispatchEvent(new CustomEvent('resumes:updated', { detail: { id: newData.id, row: newData } }));
                            } catch (e) {
                                // older browsers may throw on CustomEvent construction
                                try { (window as any).dispatchEvent(new CustomEvent('resumes:updated', { detail: { id: newData.id, row: newData } })); } catch (ee) { /* swallow */ }
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to notify other views of parsed update', e);
                    }
      } catch (err) {
          console.error('Failed to persist parsed data', err);
      }
  }

    const handleApplyTune = async () => {
        setTuneStep('input');
        setAssistantTab('analysis');
        const tunedRevision = {
            id: `rev_tuned_${Date.now()}`,
            name: `Tuned: ${tuneJobRole || 'Job'}`,
            createdAt: new Date().toISOString(),
            tags: ['Tuned', 'AI'],
            contentSummary: `Tuned for ${tuneJobRole}`
        };
        try {
            await createResumeRevision(resumeData.id, tunedRevision);
            setResumeData(prev => ({ ...prev, revisions: [...(prev.revisions || []), tunedRevision], lastUpdated: new Date().toISOString() }));
        } catch (err) {
            console.error('Failed to persist tuned revision', err);
        }
    };

  // --- Render Helpers ---

  // Score Gauge Calculations
  const score = resumeData.analysis?.overallScore || 0;
  const radius = 45; // Slightly larger radius relative to viewbox
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const scoreColor = score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-amber-500' : 'text-rose-500';
  const strokeColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#f43f5e';
    

    // If previewRevision is set, derive a display data object to render instead of live resumeData
    const displayData = React.useMemo(() => {
        if (!previewRevision) return resumeData;
        const rev = previewRevision;
        if (rev.data) return rev.data;
        // if parsed-only revision, merge parsed fields onto a copy of the current resume
        const copy: any = { ...resumeData };
        if (rev.parsed) {
            const parsedFull = rev.parsed.name || ((rev.parsed.firstName && rev.parsed.lastName) ? `${rev.parsed.firstName} ${rev.parsed.lastName}` : null);
            copy.personalInfo = { ...copy.personalInfo, fullName: parsedFull || copy.personalInfo.fullName, email: rev.parsed.email || copy.personalInfo.email, phone: rev.parsed.phone || copy.personalInfo.phone, summary: chooseBestSummary(rev.parsed.summary, rev.parsed.text) || copy.personalInfo.summary };
            if (rev.parsed.skills) {
                copy.skills = Array.isArray(rev.parsed.skills) ? rev.parsed.skills : String(rev.parsed.skills).split(',').map((s:string)=>({ name: s.trim(), level: 'Intermediate' }));
            }
                if (rev.parsed.experience && Array.isArray(rev.parsed.experience)) {
                    const normalized = normalizeParsedExperience(rev.parsed.experience);
                    copy.experience = normalized.map((e:any) => {
                        const rawTitle = String(e.title || e.role || '').trim();
                        let company = String(e.company || '').trim();
                        let role = '';
                        if (rawTitle.includes('/')) {
                            const parts = rawTitle.split('/').map((p:string) => p.trim()).filter(Boolean);
                            if (parts.length >= 2) {
                                company = company || parts[0];
                                role = parts.slice(1).join(' / ');
                            } else {
                                role = rawTitle;
                            }
                        } else {
                            role = rawTitle;
                        }
                        const date = String(e.date || e.period || '').trim();
                        let bullets: string[] = [];
                        if (Array.isArray(e.bullets)) bullets = e.bullets.slice();
                        else if (typeof e.bullets === 'string') bullets = e.bullets.split('\n').map((b:string)=>b.trim()).filter(Boolean);
                        // Filter out emails/phones/urls and obvious other-job titles captured as bullets
                        bullets = bullets.filter(b => {
                            if (!b) return false;
                            if (/@/.test(b)) return false;
                            if (/\d{3}[\.\-\s]\d{3}[\.\-\s]\d{4}/.test(b)) return false;
                            if (/https?:\/\//i.test(b) || /\.[a-z]{2,}$/i.test(b)) return false;
                            // Drop bullets that look like job titles (ALL CAPS or contain '/' with uppercase tokens)
                            if (/^[A-Z0-9 \/&\-]{4,}$/.test(b) && b === b.toUpperCase()) return false;
                            if (/\/[A-Z]/.test(b)) return false;
                            if (/^contact\b/i.test(b)) return false;
                            return true;
                        });
                        // Join broken bullets where next line starts lowercase or '&'
                        const joined: string[] = [];
                        for (let bi = 0; bi < bullets.length; bi++) {
                            let cur = bullets[bi];
                            const next = bullets[bi + 1] || '';
                            if (next && /^[a-z&]/.test(next) && !/[.!?]$/.test(cur)) {
                                cur = (cur + ' ' + next).replace(/\s+/g, ' ').trim();
                                bi++; // skip next merged
                            }
                            joined.push(cur.replace(/^[-–—]\s*/, '').trim());
                        }
                        bullets = joined;
                        return { id: e.id || Math.random().toString(36).slice(2,9), role: (role || '').trim(), company: (company || '').trim(), date, bullets };
                    }).filter((ee:any) => {
                        if (!ee.role && !ee.company && (!ee.bullets || !ee.bullets.length)) return false;
                        if (/@/.test(String(ee.role)) || /@/.test(String(ee.company)) || /\d{3}[\.\-\s]\d{3}[\.\-\s]\d{4}/.test(String(ee.role)) || /\d{3}[\.\-\s]\d{3}[\.\-\s]\d{4}/.test(String(ee.company))) return false;
                        return true;
                    });
                }
                if (rev.parsed.education && Array.isArray(rev.parsed.education)) {
                    copy.education = rev.parsed.education.map((ed:any) => ({ id: ed.id || Math.random().toString(36).slice(2,9), school: ed.school || ed.institution || '', degree: ed.degree || '', date: ed.date || '' }));
                }
            if (rev.parsed.languages) {
                // normalize parsed languages to objects { name, proficiency }
                const src = Array.isArray(rev.parsed.languages) ? rev.parsed.languages : String(rev.parsed.languages).split(/[,\n]/).map((s:string)=>s.trim()).filter(Boolean);
                copy.languages = src.map((it:any) => {
                    if (!it) return null;
                    if (typeof it === 'string') {
                        // parse possible proficiency from string like "Spanish (Fluent)" or "English: Native"
                        const m = String(it).match(/([^:()\-–—]+)[:\-–—\(]?\s*([^)]*)/);
                        let name = it;
                        let prof = undefined;
                        if (m) {
                            name = String(m[1]).trim();
                            const p = String(m[2] || '').trim();
                            if (p) {
                                const lp = p.toLowerCase();
                                if (/native/.test(lp)) prof = 'Native';
                                else if (/fluent|advanced|proficient/.test(lp)) prof = 'Fluent';
                                else if (/intermediate/.test(lp)) prof = 'Intermediate';
                                else if (/conversational/.test(lp)) prof = 'Conversational';
                                else if (/basic/.test(lp)) prof = 'Basic';
                            }
                        }
                        return { name: String(name).trim(), proficiency: prof };
                    }
                    // object already
                    return { name: it.name || it, proficiency: it.proficiency };
                }).filter(Boolean);
            }
            if (rev.parsed.interests) {
                copy.interests = Array.isArray(rev.parsed.interests) ? rev.parsed.interests : String(rev.parsed.interests).split(/[,\n]/).map((s:string)=>s.trim()).filter(Boolean);
            }
        }
        return copy;
    }, [previewRevision, resumeData]);

    // Pre-format strings for suggestion helpers to avoid long inline JSX expressions
    const formattedDisplayLanguages = (displayData.languages || []).map((l:any) => l && l.name ? (l.name + (l.proficiency ? ' (' + l.proficiency + ')' : '')) : String(l)).join(', ');
    const formattedDisplayInterests = (displayData.interests || []).join(', ');

    const coreSnapshot = (obj: any) => ({
        personalInfo: obj?.personalInfo || {},
        skills: obj?.skills || [],
        experience: obj?.experience || [],
        education: obj?.education || []
    });

    const isPreviewApplied = React.useMemo(() => {
        if (!previewRevision) return false;
        try {
            const previewCore = coreSnapshot(displayData as any);
            const currentCore = coreSnapshot(resumeData as any);
            return JSON.stringify(previewCore) === JSON.stringify(currentCore);
        } catch (e) {
            return false;
        }
    }, [previewRevision, displayData, resumeData]);

    return (
    <div className="flex flex-col min-h-screen bg-slate-100 dark:bg-gray-950 animate-fade-in relative overflow-auto">
        {/* Top Navigation Bar */}
        <header className="py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-slate-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0 z-20 sticky top-0">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="p-2 text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                    <ArrowLeft size={18} />
                </button>
                <div className="flex flex-col">
                    <h1 className="text-sm font-bold text-slate-800 dark:text-white">{resumeData.title}</h1>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                        <span>v{resumeData.revisions.length}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-gray-600"></span>
                        <span>{resumeData.lastUpdated}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {/* Tune control moved to AI Analysis panel */}
                                <button onClick={handleSaveRevision} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm shadow-indigo-200 transition-colors flex items-center gap-2 active:scale-95 whitespace-nowrap">
                                    <Plus size={14} /> Save Revision
                                </button>
                <button 
                    onClick={handlePrint}
                    className="px-2 py-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                    <Download size={14} /> Print / Export
                </button>
                <button 
                    onClick={() => { setPreviewRevision(null); setShowOriginalPdf(true); if (!originalPdfUrl) loadOriginalPdfUrl(); }}
                    className="px-2 py-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                    Original
                </button>
                
                <button
                    onClick={handleGeneratePdf}
                    disabled={isGeneratingPdf}
                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-sm shadow-emerald-200 transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                    <RefreshCw size={14} /> {isGeneratingPdf ? 'Regenerating...' : 'Regenerate'}
                </button>
                
                {/* parsing is automatic on load; status shown via notification */}
                <button 
                  onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                  className={`p-2 rounded-lg transition-colors ${isRightPanelOpen ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-800'}`}
                >
                   {isRightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                </button>
            </div>
        </header>

        {isLayoutModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white dark:bg-gray-900 p-4 rounded shadow w-96">
                    <h3 className="text-lg font-bold mb-2">Change PDF Layout</h3>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2">
                            <input type="radio" name="pdf-layout" checked={selectedLayout === 'classic'} onChange={() => setSelectedLayout('classic')} />
                            <span className="ml-2">Classic</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="radio" name="pdf-layout" checked={selectedLayout === 'modern'} onChange={() => setSelectedLayout('modern')} />
                            <span className="ml-2">Modern</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="radio" name="pdf-layout" checked={selectedLayout === 'compact'} onChange={() => setSelectedLayout('compact')} />
                            <span className="ml-2">Compact</span>
                        </label>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setIsLayoutModalOpen(false)} className="px-3 py-1 bg-white border rounded">Cancel</button>
                        <button onClick={saveLayoutChoice} className="px-3 py-1 bg-emerald-600 text-white rounded">Save</button>
                    </div>
                </div>
            </div>
        )}

        {suggestionModalOpen && suggestionModalIssue && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white dark:bg-gray-900 p-4 rounded shadow w-[680px] max-w-full">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-bold mb-1">Improve: {suggestionModalIssue.title}</h3>
                                <p className="text-xs text-slate-500 dark:text-gray-400">{suggestionModalIssue.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => { setSuggestionModalOpen(false); setSuggestionModalIssue(null); }} className="text-xs px-2 py-1 bg-white border rounded">Close</button>
                            </div>
                        </div>

                        <div className="mt-4">
                        <p className="text-xs text-slate-500 mb-2">Choose a candidate rewrite below and click <strong>Apply</strong> to overwrite the parsed data.</p>
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                            {suggestionModalCandidates && suggestionModalCandidates.length > 0 ? (
                                <div className="p-3 bg-slate-50 dark:bg-gray-800 border border-slate-100 dark:border-gray-700 rounded-lg">
                                    <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">Edit candidate (you can modify before applying):</label>
                                    <textarea value={suggestionModalEditValue} onChange={(e) => setSuggestionModalEditValue(e.target.value)} rows={6} className="w-full p-2 rounded border text-sm bg-white dark:bg-gray-900 text-slate-900 dark:text-gray-200" />
                                    <div className="mt-2 flex justify-end gap-2">
                                        <button onClick={() => { setSuggestionModalOpen(false); setSuggestionModalIssue(null); }} className="text-xs px-3 py-1 bg-white border rounded">Close</button>
                                        <button onClick={() => applySuggestionCandidate(suggestionModalIssue, suggestionModalEditValue)} className="text-xs px-3 py-1 bg-emerald-600 text-white rounded">Apply</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 text-sm text-slate-500">No candidate suggestions returned.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Main Studio Area */}
        <div className="flex flex-1 overflow-auto">
            
            {/* Left: Revisions & History (Collapsed/Mini sidebar) */}
            <div className="w-64 bg-white dark:bg-gray-900 border-r border-slate-200 dark:border-gray-800 flex flex-col overflow-y-auto shrink-0 hidden lg:flex">
                <div className="p-4 border-b border-slate-100 dark:border-gray-800">
                    <h3 className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        <History size={12} /> Revision History
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {resumeData.revisions.map((rev, idx) => (
                        <div key={rev.id} className={`p-3 rounded-lg text-left transition-all border ${previewRevision && previewRevision.id === rev.id ? 'ring-2 ring-purple-300 dark:ring-purple-700' : ''} ${idx === resumeData.revisions.length - 1 ? 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-900/50 shadow-sm' : 'bg-white dark:bg-gray-900 border-transparent hover:bg-slate-50 dark:hover:bg-gray-800'}`}>
                            <div onClick={() => { setPreviewRevision(rev); setShowOriginalPdf(false); }} className="cursor-pointer">
                              <div className="flex justify-between items-start mb-2">
                                <div className="min-w-0">
                                  <span className={`text-sm font-medium ${idx === resumeData.revisions.length - 1 ? 'text-purple-700 dark:text-purple-400' : 'text-slate-700 dark:text-gray-300'}`}>{rev.name}</span>
                                  <p className="text-xs text-slate-500 dark:text-gray-500 mt-1 line-clamp-2">{rev.contentSummary}</p>
                                </div>
                                <div className="flex flex-col items-end ml-3 gap-2">
                                  {rev.score && <span className="text-[10px] font-bold bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-1.5 rounded-md text-slate-600 dark:text-gray-400">{rev.score}</span>}
                                  <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                            const ok = window.confirm('Delete this revision? This cannot be undone.');
                                            if (!ok) return;
                                            const newRevs = (resumeData.revisions || []).filter(r => r.id !== rev.id);
                                            const newData = { ...resumeData, revisions: newRevs } as any;
                                            await updateResume(resumeData.id, { data: newData, lastUpdated: new Date().toISOString() });
                                            // create an audit revision entry for deletion
                                            try {
                                                const audit = { id: `rev_delete_${Date.now()}`, name: `Deleted: ${rev.id}`, createdAt: new Date().toISOString(), tags: ['delete'], contentSummary: `Deleted revision ${rev.id}` };
                                                await createResumeRevision(resumeData.id, audit);
                                            } catch (auditErr) {
                                                console.warn('Failed to persist deletion audit revision', auditErr);
                                            }
                                            setResumeData(prev => ({ ...(prev as any), revisions: newRevs }));
                                            if (previewRevision && previewRevision.id === rev.id) setPreviewRevision(null);
                                        } catch (err) {
                                            console.error('Failed to delete revision', err);
                                            alert('Delete failed. See console for details.');
                                        }
                                    }}
                                    className="text-xs inline-flex items-center gap-2 px-2 py-1 rounded bg-white border text-rose-600 hover:bg-rose-50"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                              <div className="flex gap-1 flex-wrap mt-2">
                                {rev.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 text-slate-500 dark:text-gray-400 rounded shadow-sm">{t}</span>)}
                              </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Center: PDF Canvas / Live Preview */}
            <div className="flex-1 overflow-y-auto bg-slate-100/50 dark:bg-gray-950 p-4 md:p-8 flex justify-center relative">
                {/* If user requested the original PDF, show it in an iframe in the main area */}
                {showOriginalPdf && (
                    <div className="w-full max-w-5xl h-[90vh] bg-white shadow-xl rounded-sm overflow-hidden">
                        {originalPdfUrl ? (
                            <iframe src={originalPdfUrl} className="w-full h-full border-0" title="Original Resume PDF"></iframe>
                        ) : (
                            <div className="p-6 text-center text-slate-500">No public URL available for this file.</div>
                        )}
                    </div>
                )}

                {!showOriginalPdf && (
                    <div id="printable-resume" className="w-full max-w-[210mm] min-h-[297mm] bg-white shadow-xl rounded-sm p-[10mm] md:p-[20mm] text-slate-900 relative transition-all ease-in-out duration-300 origin-top">
                    {/* If previewRevision is set, show a banner and render the revision data instead of live data */}
                    {previewRevision && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-md shadow">
                            <div className="flex items-center gap-3">
                                <div className="text-sm font-medium">Viewing revision: <span className="font-bold">{previewRevision.name || previewRevision.id}</span></div>
                                <div className="ml-4 flex items-center gap-2">
                                    <div className="text-xs text-yellow-800 mr-3 hidden sm:block">This preview is read-only. Restoring will create a new "restore" revision and set this snapshot as current.</div>
                                    <button onClick={async () => {
                                        try {
                                            if (isPreviewApplied) { alert('This revision is already applied.'); return; }
                                            const ok = window.confirm('Restore this revision? This will create a new restore revision and set it as the current resume.');
                                            if (!ok) return;
                                            const rev = previewRevision;
                                            let newData: any = { ...resumeData };
                                            if (rev.data) newData = { ...newData, ...(rev.data || {}) };
                                            else if (rev.parsed) {
                                                newData.personalInfo = { ...newData.personalInfo, fullName: rev.parsed.name || newData.personalInfo.fullName, email: rev.parsed.email || newData.personalInfo.email, phone: rev.parsed.phone || newData.personalInfo.phone, summary: chooseBestSummary(rev.parsed.summary, rev.parsed.text) || newData.personalInfo.summary };
                                                if (rev.parsed.skills) newData.skills = Array.isArray(rev.parsed.skills) ? rev.parsed.skills : (String(rev.parsed.skills).split(',').map((s:string)=>({ name: s.trim(), level: 'Intermediate' })));
                                            }
                                            await updateResume(newData.id, { data: newData, lastUpdated: new Date().toISOString() });
                                            const newRev = { id: `rev_restore_${Date.now()}`, name: `Restored: ${rev.name || rev.id}`, createdAt: new Date().toISOString(), tags: ['restore'], contentSummary: `Restored revision ${rev.id}` };
                                            await createResumeRevision(newData.id, newRev);
                                            setResumeData(newData);
                                            setPreviewRevision(null);
                                            alert('Revision restored');
                                        } catch (err) {
                                            console.error('Failed to restore revision', err);
                                            alert('Failed to restore revision. See console.');
                                        }
                                    }} className={`px-2 py-1 rounded text-sm ${isPreviewApplied ? 'bg-slate-200 text-slate-600 cursor-not-allowed' : 'bg-emerald-600 text-white'}`} disabled={isPreviewApplied}>{isPreviewApplied ? 'Already Applied' : 'Restore Revision'}</button>
                                    <button onClick={() => setPreviewRevision(null)} className="px-2 py-1 bg-white border rounded text-sm">Close</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Header */}
                    <div className="border-b-2 border-slate-800 pb-4 mb-6">
                        {inlineEdit && inlineEdit.section === 'personalInfo' && inlineEdit.field === 'fullName' ? (
                            <div className="mb-2">
                                <input className="w-full p-2 rounded border" value={inlineEdit.value} onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })} />
                                <div className="mt-2 flex gap-2">
                                    <button onClick={saveInlineEdit} className="px-3 py-1 bg-emerald-600 text-white rounded text-sm">Save</button>
                                    <button onClick={cancelInlineEdit} className="px-3 py-1 bg-white border rounded text-sm">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <h1 onClick={() => setInlineEdit({ section: 'personalInfo', field: 'fullName', value: displayData.personalInfo.fullName || '' })} className="text-4xl font-bold uppercase tracking-tight mb-2 cursor-text">{displayData.personalInfo.fullName}</h1>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                            {inlineEdit && inlineEdit.section === 'personalInfo' && inlineEdit.field === 'email' ? (
                                <div>
                                    <input className="p-1 rounded border text-sm" value={inlineEdit.value} onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })} />
                                    <div className="inline-flex ml-2 gap-1"><button onClick={saveInlineEdit} className="px-2 py-0.5 bg-emerald-600 text-white rounded text-xs">Save</button><button onClick={cancelInlineEdit} className="px-2 py-0.5 bg-white border rounded text-xs">Cancel</button></div>
                                </div>
                            ) : (
                                <span onClick={() => setInlineEdit({ section: 'personalInfo', field: 'email', value: displayData.personalInfo.email || '' })} className="cursor-text">{displayData.personalInfo.email}</span>
                            )}

                            <span className="text-slate-300">•</span>

                            {inlineEdit && inlineEdit.section === 'personalInfo' && inlineEdit.field === 'phone' ? (
                                <div>
                                    <input className="p-1 rounded border text-sm" value={inlineEdit.value} onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })} />
                                    <div className="inline-flex ml-2 gap-1"><button onClick={saveInlineEdit} className="px-2 py-0.5 bg-emerald-600 text-white rounded text-xs">Save</button><button onClick={cancelInlineEdit} className="px-2 py-0.5 bg-white border rounded text-xs">Cancel</button></div>
                                </div>
                            ) : (
                                <span onClick={() => setInlineEdit({ section: 'personalInfo', field: 'phone', value: displayData.personalInfo.phone || '' })} className="cursor-text">{displayData.personalInfo.phone}</span>
                            )}

                            <span className="text-slate-300">•</span>

                            <span>{displayData.personalInfo.location}</span>
                            {displayData.personalInfo.website && (
                                <>
                                    <span className="text-slate-300">•</span>
                                    <span onClick={() => setInlineEdit({ section: 'personalInfo', field: 'website', value: displayData.personalInfo.website || '' })} className="text-purple-600 cursor-text">{displayData.personalInfo.website}</span>
                                </>
                            )}
                            {/* Top education removed from header — education shows in Education section below */}
                        </div>
                    </div>

                    {/* Summary */}
                    <section className="mb-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Professional Summary</h2>
                            <button title="Improve summary with Gemini" onClick={() => handleFieldSuggest('summary', null, JSON.stringify(displayData))} className="text-xs px-2 py-1 bg-white border rounded text-slate-600 hover:bg-slate-50 ml-2"><Wand2 size={14} /></button>
                        </div>
                        {displayData.personalInfo.summary ? (
                            inlineEdit && inlineEdit.section === 'personalInfo' && inlineEdit.field === 'summary' ? (
                                <div>
                                    <textarea rows={5} className="w-full p-2 rounded border" value={inlineEdit.value} onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })} />
                                    <div className="mt-2 flex gap-2">
                                        <button onClick={saveInlineEdit} className="px-3 py-1 bg-emerald-600 text-white rounded text-sm">Save</button>
                                        <button onClick={cancelInlineEdit} className="px-3 py-1 bg-white border rounded text-sm">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <p onClick={() => setInlineEdit({ section: 'personalInfo', field: 'summary', value: displayData.personalInfo.summary || '' })} className="text-sm leading-relaxed text-slate-700 whitespace-pre-line cursor-text">
                                    {displayData.personalInfo.summary}
                                </p>
                            )
                        ) : (
                            <div className="text-sm text-slate-600 py-3">No professional summary detected. Use the suggestion button to generate a summary from your resume.</div>
                        )}
                    </section>

                    {/* Experience */}
                    <section className="mb-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Experience</h2>
                            <button title="Improve experience with Gemini" onClick={() => handleFieldSuggest('experience', null, JSON.stringify(displayData))} className="text-xs px-2 py-1 bg-white border rounded text-slate-600 hover:bg-slate-50 ml-2"><Wand2 size={14} /></button>
                        </div>
                        {displayData.experience && displayData.experience.length > 0 ? (
                            <div className="space-y-6">
                                {displayData.experience.map((exp:any) => (
                                    <div key={exp.id} className="group relative rounded transition-colors -mx-3 px-3 py-3 bg-white/0 hover:bg-slate-50">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="min-w-0">
                                                <h3 className="text-base font-semibold text-slate-800 leading-tight">{exp.role || exp.title || ''}</h3>
                                                {exp.company && <div className="text-sm text-slate-600 mt-0.5">{exp.company}</div>}
                                            </div>
                                            <div className="flex-shrink-0 text-sm text-slate-600 ml-4">{exp.date}</div>
                                        </div>

                                        {exp.bullets && exp.bullets.length > 0 && (
                                            <ul className="list-disc ml-5 mt-2 space-y-1 text-sm text-slate-700">
                                                {exp.bullets.map((bullet:string, i:number) => (
                                                    <li key={i} className="relative">
                                                        {inlineEdit && inlineEdit.section === 'experience' && inlineEdit.field === 'bullet' && inlineEdit.id === exp.id && inlineEdit.index === i ? (
                                                            <div>
                                                                <textarea rows={3} className="w-full p-1 rounded border" value={inlineEdit.value} onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })} />
                                                                <div className="mt-1 flex gap-2">
                                                                    <button onClick={saveInlineEdit} className="px-2 py-1 bg-emerald-600 text-white rounded text-xs">Save</button>
                                                                    <button onClick={cancelInlineEdit} className="px-2 py-1 bg-white border rounded text-xs">Cancel</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="pr-10" onClick={() => setInlineEdit({ section: 'experience', field: 'bullet', id: exp.id, index: i, value: bullet })}>
                                                                {bullet}
                                                            </div>
                                                        )}
                                                        <div className="absolute right-0 top-0">
                                                            <button title="Improve this bullet with Gemini" onClick={() => handleFieldSuggest('experience', exp.id, bullet)} className="p-1 ml-2 bg-white border rounded text-slate-500 hover:bg-slate-50"><Wand2 size={14} /></button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                        <button 
                                            className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-white shadow-sm border border-slate-200 rounded text-slate-400 hover:text-purple-600 print:hidden"
                                            onClick={() => {
                                                setIsRightPanelOpen(true);
                                                setAssistantTab('editor');
                                            }}
                                        >
                                            <PenTool size={14}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-slate-600 py-3">No experience detected. Click the suggestion button to generate experience bullets or roles from your resume.</div>
                        )}
                    </section>
                    
                    {/* Education */}
                    <section className="mb-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Education</h2>
                            <button title="Improve education with Gemini" onClick={() => handleFieldSuggest('education', null, JSON.stringify(displayData))} className="text-xs px-2 py-1 bg-white border rounded text-slate-600 hover:bg-slate-50 ml-2"><Wand2 size={14} /></button>
                        </div>
                        {displayData.education && displayData.education.length > 0 ? (
                            <div className="space-y-3">
                                {displayData.education.map((edu) => (
                                    <div key={edu.id} className="flex justify-between items-baseline">
                                        <div>
                                            <h3 className="text-slate-800 text-base">{edu.school}</h3>
                                            <div className="text-sm text-slate-600">{edu.degree}</div>
                                        </div>
                                        <span className="text-sm text-slate-600 font-medium">{edu.date}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-slate-600 py-3">No education entries detected. Use the suggestion button to generate an education block from your resume.</div>
                        )}
                    </section>

                    {/* Skills */}
                    <section>
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Skills</h2>
                            <button title="Improve skills with Gemini" onClick={() => handleFieldSuggest('skills', null, JSON.stringify(displayData))} className="text-xs px-2 py-1 bg-white border rounded text-slate-600 hover:bg-slate-50 ml-2"><Wand2 size={14} /></button>
                        </div>
                        {displayData.skills && displayData.skills.length > 0 ? (
                            <div className="overflow-x-auto -mx-2 px-2">
                                <div className="flex flex-wrap gap-2 text-sm max-w-full">
                                    {displayData.skills.map((skill:any) => (
                                        <div key={skill.name} className="flex items-center gap-2 whitespace-normal">
                                            <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium break-words">{skill.name}</span>
                                            <button title={`Improve ${skill.name}`} onClick={() => handleFieldSuggest('skills', null, skill.name)} className="p-1 bg-white border rounded text-slate-500 hover:bg-slate-50"><Wand2 size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-slate-600 py-3">No skills detected. Use the suggestion button to extract or generate relevant skills from your resume.</div>
                        )}
                    </section>
                    {/* Languages */}
                    <section className="mt-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Languages</h2>
                            <button title="Improve languages with Gemini" onClick={() => handleFieldSuggest('languages', null, JSON.stringify(displayData))} className="text-xs px-2 py-1 bg-white border rounded text-slate-600 hover:bg-slate-50 ml-2"><Wand2 size={14} /></button>
                        </div>
                        {displayData.languages && displayData.languages.length > 0 ? (
                            <div className="overflow-x-auto -mx-2 px-2">
                                <div className="flex flex-wrap gap-2 text-sm max-w-full">
                                    {(displayData.languages || []).map((l:any) => (
                                        <div key={String(l && l.name ? l.name : l)} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium break-words">{l && l.name ? (l.name + (l.proficiency ? ' - ' + l.proficiency : '')) : String(l)}</div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-slate-600 py-3">No languages detected. Use the suggestion button to infer languages from your resume.</div>
                        )}
                    </section>

                    {/* Interests / Hobbies */}
                    <section className="mt-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Interests</h2>
                            <button title="Improve interests with Gemini" onClick={() => handleFieldSuggest('interests', null, JSON.stringify(displayData))} className="text-xs px-2 py-1 bg-white border rounded text-slate-600 hover:bg-slate-50 ml-2"><Wand2 size={14} /></button>
                        </div>
                        {displayData.interests && displayData.interests.length > 0 ? (
                            <div className="overflow-x-auto -mx-2 px-2">
                                <div className="flex flex-wrap gap-2 text-sm max-w-full">
                                    {(displayData.interests || []).map((it:any) => (
                                        <div key={String(it)} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium break-words">{it}</div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-slate-600 py-3">No interests detected. Use the suggestion button to generate interests or hobbies from your resume.</div>
                        )}
                    </section>
                </div>
                )}
            </div>

                        {/* Divider + Right: AI Assistant & Editor (resizable) */}
                        {isRightPanelOpen && (
                            <>
                                <div
                                    onMouseDown={(e) => {
                                        // start resizing
                                        resizingRef.current.active = true;
                                        resizingRef.current.startX = e.clientX;
                                        resizingRef.current.startWidth = rightPanelWidth;
                                        // attach move/up to window to capture global
                                        const onMove = (ev: MouseEvent) => {
                                            if (!resizingRef.current.active) return;
                                            const dx = resizingRef.current.startX - ev.clientX;
                                            const newWidth = Math.min(720, Math.max(280, resizingRef.current.startWidth + dx));
                                            setRightPanelWidth(newWidth);
                                        };
                                        const onUp = () => {
                                            resizingRef.current.active = false;
                                            window.removeEventListener('mousemove', onMove);
                                            window.removeEventListener('mouseup', onUp);
                                        };
                                        window.addEventListener('mousemove', onMove);
                                        window.addEventListener('mouseup', onUp);
                                    }}
                                    className="w-2 cursor-col-resize hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
                                />

                                <div style={{ width: rightPanelWidth }} className="bg-white dark:bg-gray-900 border-l border-slate-200 dark:border-gray-800 flex flex-col shrink-0 animate-in slide-in-from-right duration-300 shadow-xl z-10 backdrop-blur-xl">
                    {/* Tabs */}
                                <div className="flex border-b border-slate-200 dark:border-gray-800 overflow-x-auto">
                        <button 
                            onClick={() => setAssistantTab('analysis')}
                            className={`flex-none min-w-[140px] py-4 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${assistantTab === 'analysis' ? 'border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10' : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'}`}
                        >
                            <Sparkles size={16} /> AI Analysis
                        </button>

                        <button 
                            onClick={() => setAssistantTab('tune')}
                            className={`flex-none min-w-[140px] py-4 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${assistantTab === 'tune' ? 'border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10' : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'}`}
                        >
                            <Target size={16} /> Tune for Job
                        </button>

                        <button 
                            onClick={() => setAssistantTab('editor')}
                            className={`flex-none min-w-[140px] py-4 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${assistantTab === 'editor' ? 'border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10' : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'}`}
                        >
                            <PenTool size={16} /> Data Editor
                        </button>
                        <button 
                            onClick={() => setAssistantTab('appearance')}
                            className={`flex-none min-w-[140px] py-4 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${assistantTab === 'appearance' ? 'border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10' : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'}`}
                        >
                            <GripVertical size={16} /> Appearance
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto p-6 scroll-smooth bg-slate-50/30 dark:bg-black/20">
                        {assistantTab === 'appearance' ? (
                            <AppearancePanel appearance={appearance} onChange={(patch) => setAppearance(prev => ({ ...prev, ...(patch as any) }))} />
                        ) : assistantTab === 'analysis' ? (
                            <div className="space-y-8">
                                <div className="flex justify-end">
                                    <button onClick={handleAnalyze} disabled={analyzeCooldown} className={`text-sm px-3 py-1 ${analyzeCooldown ? 'bg-purple-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'} text-white rounded-md`}>{analyzeCooldown ? 'Analyze (cooling)' : 'Run Analysis'}</button>
                                </div>
                                {suggestionApplySuccess && (
                                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-md border border-emerald-100 dark:border-emerald-800 text-sm">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="font-semibold text-emerald-800 dark:text-emerald-300">Applied: {suggestionApplySuccess.title}</div>
                                                <div className="text-xs text-slate-600 dark:text-gray-300 mt-1">Rewrote {suggestionApplySuccess.targetSection || 'content'} — showing change below.</div>
                                                <pre className="whitespace-pre-wrap text-xs bg-white dark:bg-gray-900 p-2 rounded mt-2 border text-slate-700 dark:text-gray-200">{suggestionApplySuccess.oldValue ? `${suggestionApplySuccess.oldValue}\n→\n${suggestionApplySuccess.newValue}` : suggestionApplySuccess.newValue}</pre>
                                            </div>
                                            <button onClick={() => setSuggestionApplySuccess(null)} className="text-xs px-2 py-1 bg-white border rounded">Dismiss</button>
                                        </div>
                                    </div>
                                )}
                                {/* Score Card (Fixed SVG) */}
                                <div className="text-center relative py-4">
                                    <div className="inline-flex items-center justify-center w-32 h-32 relative">
                                        {/* SVG with ViewBox for perfect scaling */}
                                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
                                            <circle 
                                                cx="64" cy="64" r={radius} 
                                                fill="none" 
                                                stroke="currentColor"
                                                className="text-slate-200 dark:text-gray-700" 
                                                strokeWidth="8" 
                                            />
                                            {/* Progress Circle */}
                                            <circle 
                                                cx="64" cy="64" r={radius} 
                                                fill="none" 
                                                stroke={strokeColor} 
                                                strokeWidth="8" 
                                                strokeLinecap="round"
                                                className="transition-all duration-1000 ease-out"
                                                strokeDasharray={circumference}
                                                strokeDashoffset={strokeDashoffset}
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className={`text-3xl font-bold ${scoreColor}`}>{score}</span>
                                            <span className="text-[10px] text-slate-400 dark:text-gray-500 uppercase font-bold tracking-wider">Score</span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-500 dark:text-gray-400 mt-2 px-4">
                                        {score >= 80 ? "Great job! Your resume is optimizing well." : "Focus on the critical issues below to improve your score."}
                                    </p>
                                </div>

                                {/* Category Bars - horizontally scrollable for many categories */}
                                <div className="flex gap-3 overflow-x-auto pb-2 -mx-3 px-3">
                                    {Object.entries(resumeData.analysis?.categories || {}).map(([key, val]) => {
                                        const scoreVal = Number(val as any) || 0;
                                        return (
                                            <div key={key} className="min-w-[160px] flex-shrink-0 bg-white dark:bg-gray-800 p-3 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm">
                                                <div className="flex justify-between text-xs mb-2">
                                                    <span className="capitalize font-semibold text-slate-600 dark:text-gray-300">{key}</span>
                                                    <span className="font-bold text-slate-800 dark:text-white">{scoreVal}</span>
                                                </div>
                                                <div className="w-full bg-slate-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-500 ${scoreVal > 70 ? 'bg-emerald-500' : scoreVal > 50 ? 'bg-amber-500' : 'bg-red-500'}`} 
                                                        style={{ width: `${scoreVal}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Heuristic Sections (Hiration-like): Structure, Skills, Contact, Reverse Chronology, Bullets, Formatting */}
                                <div className="flex flex-col gap-4">
                                    {[
                                        { key: 'structure', title: 'Structure' },
                                        { key: 'skills', title: 'Skill Level Analysis' },
                                        { key: 'contact', title: 'Contact Info' },
                                        { key: 'reverseChron', title: 'Reverse Chronology' },
                                        { key: 'bullets', title: 'Bullet Analysis' },
                                        { key: 'formatting', title: 'Formatting' }
                                    ].map(section => {
                                        const scoreVal = Number(resumeData.analysis?.categories?.[section.key] || 0);
                                        const related = (resumeData.analysis?.issues || []).filter((i:any) => i.category === section.key || (i.source === 'heuristic' && i.category == null && String(i.id || '').includes(section.key)));
                                        const isOpen = Boolean(openSections[section.key]);
                                        return (
                                            <div key={section.key} className="w-full bg-white dark:bg-gray-800 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm">
                                                <div className="p-3 flex items-center justify-between cursor-pointer" onClick={() => toggleSection(section.key)}>
                                                    <div>
                                                        <div className="text-xs font-bold text-slate-600 dark:text-gray-300">{section.title}</div>
                                                        <div className="text-[10px] text-slate-400">{scoreVal}%</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`px-2 py-1 rounded-md text-xs font-bold ${scoreVal >= 80 ? 'bg-emerald-100 text-emerald-700' : scoreVal >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{scoreVal}</div>
                                                        <ChevronDown className={`w-4 h-4 text-slate-400 transform transition-transform ${isOpen ? 'rotate-180' : 'rotate-0'}`} />
                                                    </div>
                                                </div>

                                                {isOpen && (
                                                    <div className="p-4 text-xs text-slate-500 dark:text-gray-400 border-t border-slate-100 dark:border-gray-700">
                                                        <div className="mb-3">{section.title} heuristics and suggestions.</div>
                                                        <div className="flex flex-col gap-3">
                                                            {related.length === 0 ? (
                                                                <div className="text-sm text-slate-500">No issues detected.</div>
                                                            ) : related.map((issue:any) => (
                                                                                                                        <div key={issue.id} className="p-4 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-100 dark:border-gray-700 flex flex-col gap-3 shadow-sm">
                                                                                                                                        <div>
                                                                                                                                                <div className="text-sm font-semibold text-slate-800 dark:text-gray-100">{issue.title}</div>
                                                                                                                                                <div className="text-sm text-slate-600 dark:text-gray-400 mt-2 leading-relaxed">{issue.description}</div>
                                                                                                                                                {issue.suggestion && (
                                                                                                                                                            <div className="mt-3 bg-white dark:bg-gray-800 p-4 rounded-md border border-slate-100 dark:border-gray-700 text-sm text-slate-700 dark:text-gray-200">
                                                                                                                                                                <div className="font-semibold text-sm text-purple-600 flex items-center gap-2"><Wand2 size={12} />Suggestion</div>
                                                                                                                                                                <div className="mt-2 text-sm text-slate-600 dark:text-gray-300">{issue.suggestion}</div>
                                                                                                                                                                {/* candidates are not shown inline; use the Apply Suggestion action below next to Suggest Rewrite */}
                                                                                                                                                            </div>
                                                                                                                                                        )}
                                                                                                                                        </div>
                                                                                                                                        <div className="flex items-center gap-2">
                                                                                                                                            <button onClick={() => handleSuggestRewrite(issue)} className="text-sm px-3 py-2 bg-purple-600 text-white rounded-md shadow-sm flex items-center gap-2"><Wand2 size={14} /> Suggest Rewrite</button>
                                                                                                                                            <button onClick={() => {
                                                                                                                                                const primary = (issue.suggestionCandidates && issue.suggestionCandidates.length) ? issue.suggestionCandidates[0] : issue.suggestion;
                                                                                                                                                if (primary) {
                                                                                                                                                    if (issue.fixAction && issue.fixAction.targetSection === 'summary') {
                                                                                                                                                        handleInputChange('personalInfo', 'summary', primary);
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            }} className={`text-sm px-3 py-2 ${issue.suggestion || (issue.suggestionCandidates && issue.suggestionCandidates.length > 0) ? 'bg-emerald-600 text-white' : 'bg-emerald-200 text-white cursor-not-allowed'} rounded-md shadow-sm`}>Apply Suggestion</button>
                                                                                                                                        </div>
                                                                                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Raw AI output (if present) - collapsible */}
                                {resumeData.analysis?.rawOutput && (
                                    <div className="mt-3 p-3 bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 rounded-lg text-xs">
                                        <div className="flex justify-between items-center mb-2">
                                            <strong className="text-sm">AI Raw Output</strong>
                                            <button onClick={() => { setResumeData(prev => ({ ...(prev as any), analysis: { ...(prev.analysis || {}), rawOutput: null } } as Resume)); }} className="text-xs px-2 py-0.5 bg-white border rounded">Hide</button>
                                        </div>
                                        <pre className="whitespace-pre-wrap max-h-40 overflow-y-auto text-[12px] text-slate-700 dark:text-gray-200">{resumeData.analysis.rawOutput}</pre>
                                    </div>
                                )}

                                {/* Issues List */}
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                            <AlertCircle size={16} className="text-rose-500" /> Action Items
                                        </h3>
                                        <span className="text-xs font-medium bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-2 py-1 rounded-full text-slate-600 dark:text-gray-300">{resumeData.analysis?.issues.length} remaining</span>
                                    </div>
                                    
                                    <div className="space-y-4">
                                        {resumeData.analysis?.issues.length === 0 && (
                                            <div className="text-center p-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                                                <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
                                                <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">All clear! No critical issues found.</p>
                                            </div>
                                        )}

                                        {resumeData.analysis?.issues.map(issue => (
                                            <AnalysisCard
                                                key={issue.id}
                                                issue={issue}
                                                isOpen={openIssueId === issue.id}
                                                onToggle={() => setOpenIssueId(openIssueId === issue.id ? null : issue.id)}
                                                onSuggest={handleSuggestRewrite}
                                                onApplyFix={handleApplyFix}
                                                isApplying={fixingIssueId === issue.id}
                                                onApplyCandidate={(iss, cand) => {
                                                    if (cand) {
                                                        if (iss.fixAction && iss.fixAction.targetSection === 'summary') {
                                                            handleInputChange('personalInfo', 'summary', cand);
                                                        }
                                                    }
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : assistantTab === 'tune' ? (
                            <TuneForJob resumeData={resumeData} onChange={(items) => {
                                // Persist tunes into resume.data.tunes
                                try {
                                    const newData: any = { ...(resumeData as any) };
                                    newData.tunes = items;
                                    setResumeData(newData as any);
                                    // debounce/small cooldown to avoid rapid spamming
                                    (async () => {
                                        try {
                                            await updateResume(newData.id, { data: newData, lastUpdated: new Date().toISOString() });
                                        } catch (err) {
                                            console.warn('Failed to persist tunes', err);
                                        }
                                    })();
                                } catch (e) { console.warn('persist tunes error', e); }
                            }} onPreview={(tunedResume) => {
                                try {
                                    const tunedRev = { id: `preview-${Date.now()}`, name: 'Tune Preview', data: tunedResume, createdAt: new Date().toISOString() };
                                    setPreviewRevision(tunedRev as any);
                                } catch (e) { console.warn('preview error', e); }
                            }} />
                        ) : (
                            <div className="space-y-8 animate-in fade-in pb-8">
                                {/* Editor Form */}
                                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/30 p-3 rounded-xl flex gap-3 items-start">
                                    <PenTool className="text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" size={16} />
                                    <p className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                                        Changes made here update the preview instantly.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider border-b border-slate-200 dark:border-gray-700 pb-2">Personal Info</h3>
                                        {parsedPreview && (
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => applyParsedData()} className="text-xs px-2 py-1 bg-white border rounded text-slate-700 hover:bg-slate-50">Apply Parsed Data</button>
                                                <button onClick={() => setParsedPreview(null)} className="text-xs px-2 py-1 bg-white border rounded text-slate-500 hover:bg-slate-50">Dismiss</button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Full Name</label>
                                            <input 
                                                type="text" 
                                                value={resumeData.personalInfo.fullName}
                                                onChange={(e) => handleInputChange('personalInfo', 'fullName', e.target.value)}
                                                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm outline-none transition-all"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Email</label>
                                                <input 
                                                    type="text" 
                                                    value={resumeData.personalInfo.email}
                                                    onChange={(e) => handleInputChange('personalInfo', 'email', e.target.value)}
                                                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Phone</label>
                                                <input 
                                                    type="text" 
                                                    value={resumeData.personalInfo.phone}
                                                    onChange={(e) => handleInputChange('personalInfo', 'phone', e.target.value)}
                                                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Location</label>
                                                <input 
                                                    type="text" 
                                                    value={resumeData.personalInfo.location}
                                                    onChange={(e) => handleInputChange('personalInfo', 'location', e.target.value)}
                                                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Website</label>
                                                <input 
                                                    type="text" 
                                                    value={resumeData.personalInfo.website}
                                                    onChange={(e) => handleInputChange('personalInfo', 'website', e.target.value)}
                                                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Summary</label>
                                            <textarea 
                                                value={resumeData.personalInfo.summary}
                                                onChange={(e) => handleInputChange('personalInfo', 'summary', e.target.value)}
                                                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm outline-none transition-all min-h-[100px] resize-y"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider border-b border-slate-200 dark:border-gray-700 pb-2">Skills</h3>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Comma Separated List</label>
                                        <textarea 
                                            value={resumeData.skills.map(s => s.name).join(', ')}
                                            onChange={(e) => handleSkillsChange(e.target.value)}
                                            className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm outline-none transition-all min-h-[80px]"
                                            placeholder="React, TypeScript, Node.js..."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4 mt-4">
                                    <h3 className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider border-b border-slate-200 dark:border-gray-700 pb-2">Languages</h3>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Comma or Newline Separated</label>
                                        <textarea
                                            value={(resumeData.languages || []).map((l:any) => l && l.name ? (l.name + (l.proficiency ? ' (' + l.proficiency + ')' : '')) : String(l)).join(', ')}
                                            onChange={(e) => handleLanguagesChange(e.target.value)}
                                            className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm outline-none transition-all min-h-[60px]"
                                            placeholder="English, Spanish, American Sign Language (ASL)..."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4 mt-4">
                                    <h3 className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider border-b border-slate-200 dark:border-gray-700 pb-2">Interests</h3>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Comma or Newline Separated</label>
                                        <textarea
                                            value={(resumeData.interests || []).join(', ')}
                                            onChange={(e) => handleInterestsChange(e.target.value)}
                                            className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm outline-none transition-all min-h-[60px]"
                                            placeholder="Music creation, Analog synths, Mechanical repair..."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center border-b border-slate-200 dark:border-gray-700 pb-2">
                                        <h3 className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider">Experience</h3>
                                        <button className="text-xs text-purple-600 dark:text-purple-400 font-medium hover:underline flex items-center gap-1">
                                            <Plus size={12} /> Add Role
                                        </button>
                                    </div>
                                    <div className="space-y-6">
                                        {resumeData.experience.map((exp, idx) => (
                                            <div key={exp.id} className="p-4 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 relative group shadow-sm">
                                                <div className="absolute top-3 right-3 text-slate-300 dark:text-gray-600 font-bold text-xs flex gap-2">
                                                     #{idx + 1}
                                                </div>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Role</label>
                                                        <input 
                                                            type="text" 
                                                            value={exp.role}
                                                            onChange={(e) => handleInputChange('experience', 'role', e.target.value, exp.id)}
                                                            className="w-full p-2 rounded border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Company</label>
                                                            <input 
                                                                type="text" 
                                                                value={exp.company}
                                                                onChange={(e) => handleInputChange('experience', 'company', e.target.value, exp.id)}
                                                                className="w-full p-2 rounded border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Date</label>
                                                            <input 
                                                                type="text" 
                                                                value={exp.date}
                                                                onChange={(e) => handleInputChange('experience', 'date', e.target.value, exp.id)}
                                                                className="w-full p-2 rounded border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Bullets (One per line)</label>
                                                        <textarea 
                                                            value={exp.bullets.join('\n')}
                                                            onChange={(e) => handleBulletChange(exp.id, e.target.value)}
                                                            className="w-full p-2 rounded border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none min-h-[100px]"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center border-b border-slate-200 dark:border-gray-700 pb-2">
                                        <h3 className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider">Education</h3>
                                        <button className="text-xs text-purple-600 dark:text-purple-400 font-medium hover:underline flex items-center gap-1">
                                            <Plus size={12} /> Add Education
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        {resumeData.education.map((edu, idx) => (
                                            <div key={edu.id} className="p-4 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 relative group shadow-sm">
                                                 <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">School</label>
                                                        <input 
                                                            type="text" 
                                                            value={edu.school}
                                                            onChange={(e) => handleInputChange('education', 'school', e.target.value, edu.id)}
                                                            className="w-full p-2 rounded border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Degree</label>
                                                            <input 
                                                                type="text" 
                                                                value={edu.degree}
                                                                onChange={(e) => handleInputChange('education', 'degree', e.target.value, edu.id)}
                                                                className="w-full p-2 rounded border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 mb-1">Date</label>
                                                            <input 
                                                                type="text" 
                                                                value={edu.date}
                                                                onChange={(e) => handleInputChange('education', 'date', e.target.value, edu.id)}
                                                                className="w-full p-2 rounded border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                 </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                </>
            )}
        </div>

        
        

        {/* Parsed preview is applied automatically on load; no manual preview panel shown. */}
        {/* Parsing notification */}
        {isParsing && (
            <div className="fixed left-6 bottom-6 z-60 w-80 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl shadow-lg p-3 flex items-center gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-purple-50 dark:bg-purple-900/20 rounded-full">
                    <RefreshCw className="text-purple-600 animate-spin" size={18} />
                </div>
                <div className="flex-1">
                    <div className="text-sm font-bold">Parsing resume</div>
                    <div className="text-xs text-slate-500">We are extracting text and suggestions from the PDF.</div>
                </div>
                <div>
                    <button onClick={() => setIsParsing(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                </div>
            </div>
        )}
        {parseError && (
            <div className="fixed right-6 top-6 z-70 w-96 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 rounded-xl shadow-lg p-3 flex items-start gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-rose-100 dark:bg-rose-900/30 rounded-full">
                    <svg className="w-5 h-5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 9v4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="16" r="1"/></svg>
                </div>
                <div className="flex-1">
                    <div className="text-sm font-bold text-rose-700">Parsing failed</div>
                    <div className="text-xs text-rose-600 mt-1">{parseError}</div>
                    <div className="mt-2 flex gap-2 justify-end">
                        <button onClick={() => { setParseError(null); setShowOriginalPdf(true); }} className="text-xs px-3 py-1 rounded bg-white">View Original</button>
                        <button onClick={() => setParseError(null)} className="text-xs px-3 py-1 rounded bg-rose-600 text-white">Dismiss</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );   
};