import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Wand2, Download, RefreshCw, Sparkles, 
  PanelRightClose, PanelRightOpen, Target, PenTool, History,
  AlertCircle, CheckCircle2, Check, Plus, Trash2, GripVertical
} from 'lucide-react';
import { Resume, AnalysisIssue } from '../types';
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
              // Heuristic: derive name from parsed.name, else first non-empty line of parsed.text
              const firstLine = (rawText?: string) => {
                  if (!rawText) return null;
                  const lines = String(rawText).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                  return lines.length ? lines[0] : null;
              };

              const derivedName = parsed.name || parsed.fullName || firstLine(parsed.text) || null;
              const derivedSummary = parsed.summary || (parsed.text ? String(parsed.text).slice(0, 1000) : null);
              const derivedEmail = parsed.email || null;
              const derivedPhone = parsed.phone || null;

              setResumeData(prev => {
                  const newData: any = { ...(prev as any) };
                  newData.personalInfo = {
                      ...newData.personalInfo,
                      fullName: derivedName || newData.personalInfo.fullName,
                      email: derivedEmail || newData.personalInfo.email,
                      phone: derivedPhone || newData.personalInfo.phone,
                      summary: derivedSummary || newData.personalInfo.summary,
                  };
                  if (parsed.skills) {
                      newData.skills = Array.isArray(parsed.skills) ? parsed.skills : String(parsed.skills).split(',').map((s:string) => ({ name: s.trim(), level: 'Intermediate' }));
                  } else if (parsed.skillsText) {
                      newData.skills = String(parsed.skillsText).split(',').map((s:string) => ({ name: s.trim(), level: 'Intermediate' }));
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
  const [assistantTab, setAssistantTab] = useState<'analysis' | 'editor'>('analysis');
  const [showTuneModal, setShowTuneModal] = useState(false);
  const [fixingIssueId, setFixingIssueId] = useState<string | null>(null);
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

    // removed stale initialResume effect

  // --- Handlers ---
    // Revision preview state
    const [previewRevision, setPreviewRevision] = useState<any | null>(null);

  const handlePrint = () => {
      window.print();
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
              summary: fullText.slice(0, 1000),
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
                  summary: fullText.slice(0, 1000) || newData.personalInfo.summary,
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
          fullName: parsed.name || newData.personalInfo.fullName,
          email: parsed.email || newData.personalInfo.email,
          phone: parsed.phone || newData.personalInfo.phone,
          summary: parsed.summary ? (parsed.summary.slice(0, 1000)) : newData.personalInfo.summary,
      };
      if (parsed.skillsText) {
          newData.skills = parsed.skillsText.split(',').map(s => ({ name: s.trim(), level: 'Intermediate' }));
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
        setShowTuneModal(false);
        setTuneStep('input');
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
            copy.personalInfo = { ...copy.personalInfo, fullName: rev.parsed.name || copy.personalInfo.fullName, email: rev.parsed.email || copy.personalInfo.email, phone: rev.parsed.phone || copy.personalInfo.phone, summary: rev.parsed.summary || copy.personalInfo.summary };
            if (rev.parsed.skills) {
                copy.skills = Array.isArray(rev.parsed.skills) ? rev.parsed.skills : String(rev.parsed.skills).split(',').map((s:string)=>({ name: s.trim(), level: 'Intermediate' }));
            }
        }
        return copy;
    }, [previewRevision, resumeData]);

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
    <div className="flex flex-col h-full bg-slate-100 dark:bg-gray-950 animate-fade-in relative overflow-hidden">
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
                <button
                    onClick={openLayoutModal}
                    className="px-2 py-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                    <PenTool size={14} /> Layout
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
        <div className="flex flex-1 overflow-hidden">
            
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
                                                newData.personalInfo = { ...newData.personalInfo, fullName: rev.parsed.name || newData.personalInfo.fullName, email: rev.parsed.email || newData.personalInfo.email, phone: rev.parsed.phone || newData.personalInfo.phone, summary: rev.parsed.summary || newData.personalInfo.summary };
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
                        </div>
                    </div>

                    {/* Summary */}
                    {displayData.personalInfo.summary && (
                        <section className="mb-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Professional Summary</h2>
                                <button title="Improve summary with Gemini" onClick={() => handleFieldSuggest('summary', null, displayData.personalInfo.summary || '')} className="text-xs px-2 py-1 bg-white border rounded text-slate-600 hover:bg-slate-50 ml-2"><Wand2 size={14} /></button>
                            </div>
                            {inlineEdit && inlineEdit.section === 'personalInfo' && inlineEdit.field === 'summary' ? (
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
                            )}
                        </section>
                    )}

                    {/* Experience */}
                    {displayData.experience.length > 0 && (
                        <section className="mb-6">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Experience</h2>
                            <div className="space-y-5">
                                {displayData.experience.map((exp) => (
                                    <div key={exp.id} className="group relative rounded hover:bg-purple-50/30 transition-colors -mx-3 px-3 py-2">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <h3 className="font-bold text-slate-800 text-base">{exp.role}</h3>
                                            <span className="text-sm text-slate-600 font-medium">{exp.date}</span>
                                        </div>
                                        <div className="text-sm text-slate-600 italic mb-2 font-medium">{exp.company}</div>
                                        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1.5 marker:text-slate-400">
                                            {exp.bullets.map((bullet, i) => (
                                                            <li key={i} className="pl-1 flex items-start justify-between gap-2">
                                                                <div className="flex-1">
                                                                {inlineEdit && inlineEdit.section === 'experience' && inlineEdit.field === 'bullet' && inlineEdit.id === exp.id && inlineEdit.index === i ? (
                                                        <div>
                                                            <textarea rows={3} className="w-full p-1 rounded border" value={inlineEdit.value} onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })} />
                                                            <div className="mt-1 flex gap-2">
                                                                <button onClick={saveInlineEdit} className="px-2 py-1 bg-emerald-600 text-white rounded text-xs">Save</button>
                                                                <button onClick={cancelInlineEdit} className="px-2 py-1 bg-white border rounded text-xs">Cancel</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                                    <div onClick={() => setInlineEdit({ section: 'experience', field: 'bullet', id: exp.id, index: i, value: bullet })} className="cursor-text">{bullet}</div>
                                                                )}
                                                                </div>
                                                                <div className="flex-shrink-0">
                                                                    <button title="Improve this bullet with Gemini" onClick={() => handleFieldSuggest('experience', exp.id, bullet)} className="p-1 ml-2 bg-white border rounded text-slate-500 hover:bg-slate-50"><Wand2 size={14} /></button>
                                                                </div>
                                                            </li>
                                            ))}
                                        </ul>
                                        {/* Edit Hover Indicator - Hidden in Print */}
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
                        </section>
                    )}
                    
                    {/* Education */}
                    {displayData.education.length > 0 && (
                         <section className="mb-6">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Education</h2>
                            <div className="space-y-3">
                                {displayData.education.map((edu) => (
                                    <div key={edu.id} className="flex justify-between items-baseline">
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-base">{edu.school}</h3>
                                            <div className="text-sm text-slate-600">{edu.degree}</div>
                                        </div>
                                        <span className="text-sm text-slate-600 font-medium">{edu.date}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Skills */}
                    {displayData.skills.length > 0 && (
                        <section>
                             <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Skills</h2>
                                <button title="Improve skills with Gemini" onClick={() => handleFieldSuggest('skills', null, (displayData.skills || []).map((s:any)=>s.name).join(', '))} className="text-xs px-2 py-1 bg-white border rounded text-slate-600 hover:bg-slate-50 ml-2"><Wand2 size={14} /></button>
                             </div>
                             <div className="flex flex-wrap gap-2 text-sm">
                                {displayData.skills.map(skill => (
                                    <div key={skill.name} className="flex items-center gap-2">
                                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">{skill.name}</span>
                                        <button title={`Improve ${skill.name}`} onClick={() => handleFieldSuggest('skills', null, skill.name)} className="p-1 bg-white border rounded text-slate-500 hover:bg-slate-50"><Wand2 size={12} /></button>
                                    </div>
                                ))}
                             </div>
                        </section>
                    )}
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
                    <div className="flex border-b border-slate-200 dark:border-gray-800">
                        <div className="flex-1 flex items-center justify-center gap-2">
                            <button 
                                onClick={() => setAssistantTab('analysis')}
                                className={`py-4 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${assistantTab === 'analysis' ? 'border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10' : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'}`}
                            >
                                <Sparkles size={16} /> AI Analysis
                            </button>
                            <button onClick={() => setShowTuneModal(true)} title="Tune resume" className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800">
                                <PenTool size={14} />
                            </button>
                        </div>
                        <button 
                            onClick={() => setAssistantTab('editor')}
                            className={`flex-1 py-4 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${assistantTab === 'editor' ? 'border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10' : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'}`}
                        >
                            <PenTool size={16} /> Data Editor
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto p-6 scroll-smooth bg-slate-50/30 dark:bg-black/20">
                        {assistantTab === 'analysis' ? (
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
                                        return (
                                            <div key={section.key} className="w-full bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div>
                                                        <div className="text-xs font-bold text-slate-600 dark:text-gray-300">{section.title}</div>
                                                        <div className="text-[10px] text-slate-400">{scoreVal}%</div>
                                                    </div>
                                                    <div className={`px-2 py-1 rounded-md text-xs font-bold ${scoreVal >= 80 ? 'bg-emerald-100 text-emerald-700' : scoreVal >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{scoreVal}</div>
                                                </div>
                                                <div className="text-xs text-slate-500 dark:text-gray-400 mb-3">{section.title} heuristics and suggestions.</div>
                                                <div className="flex flex-col gap-3">
                                                    {related.length === 0 ? (
                                                        <div className="text-sm text-slate-500">No issues detected.</div>
                                                    ) : related.map((issue:any) => (
                                                        <div key={issue.id} className="p-3 bg-slate-50 dark:bg-gray-900 rounded border border-slate-100 dark:border-gray-700 flex flex-col gap-2">
                                                            <div>
                                                                <div className="text-sm font-semibold text-slate-800 dark:text-gray-100">{issue.title}</div>
                                                                <div className="text-xs text-slate-500 dark:text-gray-400">{issue.description}</div>
                                                                {issue.suggestion && <div className="mt-2 text-xs text-slate-600 dark:text-gray-300">Suggestion: {issue.suggestion}</div>}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {issue.fixAction ? (
                                                                    <button onClick={() => handleApplyFix(issue)} className="text-xs px-2 py-1 bg-purple-600 text-white rounded">Apply Fix</button>
                                                                ) : (
                                                                    <button onClick={() => handleSuggestRewrite(issue)} className="text-xs px-2 py-1 bg-white border rounded">Suggest Rewrite</button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
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
                                            <div key={issue.id} className="p-4 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all group">
                                                <div className="flex gap-3 items-start">
                                                    <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${issue.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                                                    <div className="flex-1">
                                                        <h4 className="text-sm font-bold text-slate-800 dark:text-gray-200">{issue.title}</h4>
                                                        <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 leading-relaxed">{issue.description}</p>
                                                        
                                                        {issue.suggestion && (
                                                            <div className="mt-3 bg-slate-50 dark:bg-gray-700/50 p-2.5 rounded-lg text-xs border border-slate-100 dark:border-gray-700 text-slate-600 dark:text-gray-300">
                                                                <span className="font-semibold text-purple-600 dark:text-purple-400 block mb-1 flex items-center gap-1">
                                                                    <Wand2 size={10} /> Suggestion:
                                                                </span>
                                                                {issue.suggestion}
                                                                <div className="mt-2 flex gap-2">
                                                                    <button onClick={() => handleSuggestRewrite(issue)} className="text-xs px-2 py-1 bg-white border rounded">Suggest Rewrite</button>
                                                                    {issue.suggestionCandidates && issue.suggestionCandidates.length > 0 && (
                                                                        <button onClick={() => {
                                                                            // apply the first candidate immediately for convenience
                                                                            const cand = issue.suggestionCandidates[0];
                                                                            if (issue.fixAction && issue.fixAction.targetSection === 'summary') {
                                                                                handleInputChange('personalInfo', 'summary', cand);
                                                                            }
                                                                        }} className="text-xs px-2 py-1 bg-emerald-600 text-white rounded">Apply Suggestion</button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {issue.fixAction && (
                                                            <button 
                                                                onClick={() => handleApplyFix(issue)}
                                                                disabled={fixingIssueId === issue.id}
                                                                className="mt-3 w-full py-2 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm shadow-purple-200 dark:shadow-none flex items-center justify-center gap-2 disabled:opacity-70"
                                                            >
                                                                {fixingIssueId === issue.id ? (
                                                                    <RefreshCw size={12} className="animate-spin" />
                                                                ) : (
                                                                    <Sparkles size={12} />
                                                                )}
                                                                {fixingIssueId === issue.id ? 'Applying AI Fix...' : 'Apply Fix'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
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

        {/* Tune Modal - Robust Multi-step */}
        {showTuneModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in scale-95 duration-200 border border-slate-200 dark:border-gray-700">
                    {/* Modal Header */}
                    <div className="p-6 border-b border-slate-100 dark:border-gray-700 flex justify-between items-center bg-slate-50/80 dark:bg-gray-800/80 backdrop-blur-sm">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Target className="text-purple-600 dark:text-purple-400" size={22} /> Tune for Job
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">Tailor your resume content to match a specific job description.</p>
                        </div>
                        <button onClick={() => setShowTuneModal(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 transition-colors">×</button>
                    </div>

                    {/* Modal Content */}
                    <div className="p-6 flex-1 overflow-y-auto min-h-[300px]">
                        {tuneStep === 'input' && (
                            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">Target Job Title</label>
                                    <input 
                                        type="text" 
                                        value={tuneJobRole}
                                        onChange={(e) => setTuneJobRole(e.target.value)}
                                        className="w-full p-3 rounded-xl border border-slate-200 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none shadow-sm bg-white dark:bg-gray-900 text-slate-900 dark:text-white"
                                        placeholder="e.g. Senior Full Stack Engineer"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">Job Description (JD)</label>
                                    <textarea 
                                        value={tuneJobDesc}
                                        onChange={(e) => setTuneJobDesc(e.target.value)}
                                        className="w-full h-48 rounded-xl border border-slate-200 dark:border-gray-700 p-4 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none shadow-sm font-mono bg-white dark:bg-gray-900 text-slate-900 dark:text-white"
                                        placeholder="Paste the full job description here..."
                                    ></textarea>
                                </div>
                            </div>
                        )}

                        {tuneStep === 'analyzing' && (
                            <div className="flex flex-col items-center justify-center h-64 animate-in fade-in duration-500 text-center">
                                <div className="relative mb-6">
                                    <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center animate-pulse">
                                        <RefreshCw className="text-purple-600 dark:text-purple-400 animate-spin" size={32} />
                                    </div>
                                </div>
                                <h4 className="text-xl font-bold text-slate-800 dark:text-white">Analyzing Fit...</h4>
                                <p className="text-slate-500 dark:text-gray-400 mt-2 max-w-xs mx-auto">Our AI is comparing your current skills and experience against the job requirements.</p>
                            </div>
                        )}

                        {tuneStep === 'preview' && (
                            <div className="animate-in slide-in-from-right duration-300 space-y-6">
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-5 flex gap-4 items-start">
                                    <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                                        <Check size={18} strokeWidth={3} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-emerald-900 dark:text-emerald-300 text-lg">Optimization Complete</h4>
                                        <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">We identified 5 key terms to emphasize and rewrote 2 experience bullets to better match the JD.</p>
                                    </div>
                                </div>
                                
                                <div>
                                    <h5 className="font-bold text-slate-700 dark:text-gray-300 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <Sparkles size={12} /> Proposed Changes
                                    </h5>
                                    <div className="space-y-3">
                                        <div className="p-4 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
                                            <div className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase mb-2">Keywords to Add</div>
                                            <div className="flex flex-wrap gap-2">
                                                {['GraphQL', 'AWS Lambda', 'System Design', 'CI/CD'].map(k => (
                                                    <span key={k} className="px-2.5 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md text-xs font-bold border border-purple-100 dark:border-purple-900/50">+ {k}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="p-4 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
                                            <div className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase mb-2">Experience Bullet Rewrite</div>
                                            <div className="flex flex-col gap-2 text-sm">
                                                <div className="flex gap-2 items-start opacity-60">
                                                    <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold px-1 rounded mt-0.5">OLD</span>
                                                    <span className="line-through decoration-slate-400 text-slate-500 dark:text-gray-500">Managed servers for the team</span>
                                                </div>
                                                <div className="flex gap-2 items-start">
                                                    <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-1 rounded mt-0.5">NEW</span>
                                                    <span className="text-slate-800 dark:text-gray-200 font-medium">Orchestrated scalable AWS infrastructure using Lambda and EC2</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Modal Actions */}
                    <div className="p-5 bg-slate-50 dark:bg-gray-800 border-t border-slate-100 dark:border-gray-700 flex justify-end gap-3">
                        {tuneStep !== 'analyzing' && (
                             <button onClick={() => setShowTuneModal(false)} className="px-5 py-2.5 text-slate-600 dark:text-gray-300 font-medium hover:bg-slate-200 dark:hover:bg-gray-700 rounded-xl transition-colors">Cancel</button>
                        )}
                        
                        {tuneStep === 'input' && (
                            <button onClick={handleStartTune} disabled={!tuneJobDesc} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md shadow-purple-200 dark:shadow-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95">
                                <Target size={18} /> Analyze Fit
                            </button>
                        )}
                         {tuneStep === 'preview' && (
                            <button onClick={handleApplyTune} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-200 dark:shadow-none flex items-center gap-2 transition-all active:scale-95">
                                <Sparkles size={18} /> Generate Tuned Resume
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )}
        

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