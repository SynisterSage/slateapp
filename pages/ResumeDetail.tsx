import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Wand2, Download, RefreshCw, Sparkles, 
  PanelRightClose, PanelRightOpen, Target, PenTool, History,
  AlertCircle, CheckCircle2, Check, Plus, Trash2, GripVertical
} from 'lucide-react';
import { Resume, AnalysisIssue } from '../types';
import { getResumeById, updateResume, createResumeRevision } from '../src/api';
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
                if (res) setResumeData(res as Resume);
            } catch (err) {
                console.warn('Failed to load resume', err);
            }
        })();
        return () => { mounted = false; };
    }, [resumeId]);
  
  // UI State
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [assistantTab, setAssistantTab] = useState<'analysis' | 'editor'>('analysis');
  const [showTuneModal, setShowTuneModal] = useState(false);
  const [fixingIssueId, setFixingIssueId] = useState<string | null>(null);
  
  // Tuning State
  const [tuneJobRole, setTuneJobRole] = useState('');
  const [tuneJobDesc, setTuneJobDesc] = useState('');
  const [tuneStep, setTuneStep] = useState<'input' | 'analyzing' | 'preview'>('input');

    // PDF / Parsing State
    const [originalPdfUrl, setOriginalPdfUrl] = useState<string | null>(null);
    const [showOriginalPdf, setShowOriginalPdf] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
        const [parsedPreview, setParsedPreview] = useState<{ name?: string; email?: string; phone?: string; summary?: string; skillsText?: string } | null>(null);
        const [parseError, setParseError] = useState<string | null>(null);

    // removed stale initialResume effect

  // --- Handlers ---

  const handlePrint = () => {
      window.print();
  };

    // 1. Handle AI Fix Application
    const handleApplyFix = async (issue: AnalysisIssue) => {
        if (!issue.fixAction) return;
        setFixingIssueId(issue.id);

        try {
            // Apply locally for immediate feedback
            setResumeData(prev => {
                const newData = { ...prev };
                if (issue.fixAction?.targetSection === 'experience' && issue.fixAction.targetId) {
                    newData.experience = newData.experience.map(exp => exp.id === issue.fixAction?.targetId ? { ...exp, bullets: issue.fixAction.newContent as string[] } : exp);
                } else if (issue.fixAction?.targetSection === 'summary') {
                    newData.personalInfo = { ...newData.personalInfo, summary: issue.fixAction.newContent as string };
                }
                if (newData.analysis) {
                    newData.analysis = {
                        ...newData.analysis,
                        overallScore: Math.min(100, (newData.analysis.overallScore || 0) + 5),
                        issues: (newData.analysis.issues || []).filter(i => i.id !== issue.id)
                    };
                }
                return newData;
            });

            // Persist change and create a revision record
            const rev = {
                id: `rev_fix_${Date.now()}`,
                name: `Fix: ${issue.id}`,
                createdAt: new Date().toISOString(),
                tags: ['AI Fix'],
                contentSummary: issue.suggestion || issue.title,
            };

            await updateResume(resumeData.id, { data: { ...resumeData, lastUpdated: new Date().toISOString() } });
            await createResumeRevision(resumeData.id, rev);
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
          skills: skillsList.map(s => ({ name: s, level: 'Expert' })) // Default to Expert for simple edit
      }));
  };

    // Save current resume to Supabase
    const handleSave = async () => {
        try {
            await updateResume(resumeData.id, { data: resumeData, title: resumeData.title, lastUpdated: new Date().toISOString() });
            console.log('Resume saved');
        } catch (err) {
            console.error('Save failed', err);
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
  const getStoragePublicUrl = async (path: string) => {
      // Try a few common bucket names and fall back to a signed URL if public URL isn't available.
      const buckets = ['resumes', 'resume', 'resumes-private'];
      for (const bucket of buckets) {
          try {
              // If the stored `path` contains the bucket name (e.g. "resumes/ ...") strip it
              let objectPath = path as string;
              const bucketPrefix = `${bucket}/`;
              if (objectPath.startsWith(bucketPrefix)) objectPath = objectPath.slice(bucketPrefix.length);

              // Try public URL first
              const { data } = await supabase.storage.from(bucket).getPublicUrl(objectPath as string) as any;
              // @ts-ignore
              if (data?.publicUrl) return data.publicUrl;

              // If public url not available, try a short-lived signed URL
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
          } catch (err) {
              console.warn(`getStoragePublicUrl exception for bucket=${bucket} path=${path}`, err);
              // continue to next bucket
          }
      }

      // Nothing worked — surface helpful guidance for debugging
      const msg = `No storage bucket found for path '${path}'. Ensure the 'resumes' bucket exists in Supabase storage and that the object is present or update resume.storage_path.`;
      console.warn(msg);
      setParseError(msg);
      return null;
  };

  const loadOriginalPdfUrl = async (): Promise<string | null> => {
      // Resume rows may store a `storage_path` or we can construct one from `fileName`
      const explicitPath = (resumeData as any).storage_path;
      // object paths in Supabase storage should be relative to the bucket (do NOT include the bucket name)
      const constructed = resumeData.fileName ? `${resumeData.id}/${resumeData.fileName}` : null;
      const path = explicitPath || constructed;
      if (!path) return null;
      const url = await getStoragePublicUrl(path);
      if (url) setOriginalPdfUrl(url);
      return url || null;
  };

  useEffect(() => {
      let mounted = true;
      (async () => {
          // When a resume loads, if it has a file we should try to resolve the public URL and begin parsing automatically
          try {
              if (!resumeData) return;
              const hasFile = Boolean((resumeData as any).storage_path || resumeData.fileName);
              if (!hasFile) return;
              const url = await loadOriginalPdfUrl();
              if (!mounted) return;
              if (url) {
                  // show original PDF automatically when opening the studio
                  setShowOriginalPdf(true);
                  // start parsing immediately
                  if (!parsedPreview) await parsePdf(url);
              }
          } catch (err) {
              console.warn('Auto parse failed', err);
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

          setParsedPreview({
              name: nameCandidate,
              email: emailMatch?.[0] || '',
              phone: phoneMatch?.[0] || '',
              summary: fullText.slice(0, 1000),
              skillsText
          });
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
      } catch (err: any) {
          console.error('PDF parse failed', err);
          setParsedPreview(null);
          setParseError(err?.message || String(err));
      } finally {
          setIsParsing(false);
      }
  };

  const applyParsedData = async () => {
      if (!parsedPreview) return;
      const newData = { ...resumeData } as Resume & any;
      newData.personalInfo = {
          ...newData.personalInfo,
          fullName: parsedPreview.name || newData.personalInfo.fullName,
          email: parsedPreview.email || newData.personalInfo.email,
          phone: parsedPreview.phone || newData.personalInfo.phone,
          summary: parsedPreview.summary ? (parsedPreview.summary.slice(0, 1000)) : newData.personalInfo.summary,
      };
      if (parsedPreview.skillsText) {
          newData.skills = parsedPreview.skillsText.split(',').map(s => ({ name: s.trim(), level: 'Intermediate' }));
      }

      // Persist and create a revision
      try {
          await updateResume(newData.id, { data: newData, title: newData.title, lastUpdated: new Date().toISOString() });
          const rev = {
              id: `rev_parsed_${Date.now()}`,
              name: 'Parsed Import',
              createdAt: new Date().toISOString(),
              tags: ['import', 'parsed'],
              contentSummary: 'Initial parsed import from PDF'
          };
          await createResumeRevision(newData.id, rev);
          setResumeData(newData);
          setParsedPreview(null);
      } catch (err) {
          console.error('Failed to persist parsed data', err);
      }
  };

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


  return (
    <div className="flex flex-col h-full bg-slate-100 dark:bg-gray-950 animate-fade-in relative overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-14 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-slate-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0 z-20 sticky top-0">
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

            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setShowTuneModal(true)}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg shadow-sm shadow-purple-200 dark:shadow-none transition-colors flex items-center gap-2 active:scale-95"
                >
                    <Wand2 size={14} /> Tune for Job
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-sm shadow-emerald-200 transition-colors flex items-center gap-2 active:scale-95"
                >
                  <CheckCircle2 size={14} /> Save
                </button>
                <button 
                    onClick={handlePrint}
                    className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                    <Download size={14} /> Export PDF
                </button>
                <button
                    onClick={() => { setShowOriginalPdf(true); if (!originalPdfUrl) loadOriginalPdfUrl(); }}
                    className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                    Original
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
                        <div key={rev.id} className={`p-3 rounded-lg cursor-pointer text-left transition-all border ${idx === resumeData.revisions.length - 1 ? 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-900/50 shadow-sm' : 'bg-white dark:bg-gray-900 border-transparent hover:bg-slate-50 dark:hover:bg-gray-800'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <span className={`text-sm font-medium ${idx === resumeData.revisions.length - 1 ? 'text-purple-700 dark:text-purple-400' : 'text-slate-700 dark:text-gray-300'}`}>{rev.name}</span>
                                {rev.score && <span className="text-[10px] font-bold bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-1.5 rounded-md text-slate-600 dark:text-gray-400">{rev.score}</span>}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-gray-500 line-clamp-1 mb-2">{rev.contentSummary}</p>
                            <div className="flex gap-1 flex-wrap">
                                {rev.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 text-slate-500 dark:text-gray-400 rounded shadow-sm">{t}</span>)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Center: PDF Canvas / Live Preview */}
            <div className="flex-1 overflow-y-auto bg-slate-100/50 dark:bg-gray-950 p-4 md:p-8 flex justify-center relative">
                {/* A4 Paper Simulation - Renders from State */}
                {/* ID 'printable-resume' targeted by @media print */}
                <div id="printable-resume" className="w-full max-w-[210mm] min-h-[297mm] bg-white shadow-xl rounded-sm p-[10mm] md:p-[20mm] text-slate-900 relative transition-all ease-in-out duration-300 origin-top">
                    {/* Header */}
                    <div className="border-b-2 border-slate-800 pb-4 mb-6">
                        <h1 className="text-4xl font-bold uppercase tracking-tight mb-2">{resumeData.personalInfo.fullName}</h1>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                            <span>{resumeData.personalInfo.email}</span>
                            <span className="text-slate-300">•</span>
                            <span>{resumeData.personalInfo.phone}</span>
                            <span className="text-slate-300">•</span>
                            <span>{resumeData.personalInfo.location}</span>
                            {resumeData.personalInfo.website && (
                                <>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-purple-600">{resumeData.personalInfo.website}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Summary */}
                    {resumeData.personalInfo.summary && (
                        <section className="mb-6">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Professional Summary</h2>
                            <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                                {resumeData.personalInfo.summary}
                            </p>
                        </section>
                    )}

                    {/* Experience */}
                    {resumeData.experience.length > 0 && (
                        <section className="mb-6">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Experience</h2>
                            <div className="space-y-5">
                                {resumeData.experience.map((exp) => (
                                    <div key={exp.id} className="group relative rounded hover:bg-purple-50/30 transition-colors -mx-3 px-3 py-2">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <h3 className="font-bold text-slate-800 text-base">{exp.role}</h3>
                                            <span className="text-sm text-slate-600 font-medium">{exp.date}</span>
                                        </div>
                                        <div className="text-sm text-slate-600 italic mb-2 font-medium">{exp.company}</div>
                                        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1.5 marker:text-slate-400">
                                            {exp.bullets.map((bullet, i) => (
                                                <li key={i} className="pl-1">{bullet}</li>
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
                    {resumeData.education.length > 0 && (
                         <section className="mb-6">
                            <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Education</h2>
                            <div className="space-y-3">
                                {resumeData.education.map((edu) => (
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
                    {resumeData.skills.length > 0 && (
                        <section>
                             <h2 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-3 tracking-wider text-slate-800">Skills</h2>
                             <div className="flex flex-wrap gap-2 text-sm">
                                {resumeData.skills.map(skill => (
                                    <span key={skill.name} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                                        {skill.name}
                                    </span>
                                ))}
                             </div>
                        </section>
                    )}
                </div>
            </div>

            {/* Right: AI Assistant & Editor */}
            {isRightPanelOpen && (
                <div className="w-96 bg-white dark:bg-gray-900 border-l border-slate-200 dark:border-gray-800 flex flex-col shrink-0 animate-in slide-in-from-right duration-300 shadow-xl z-10 backdrop-blur-xl">
                    {/* Tabs */}
                    <div className="flex border-b border-slate-200 dark:border-gray-800">
                        <button 
                            onClick={() => setAssistantTab('analysis')}
                            className={`flex-1 py-4 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${assistantTab === 'analysis' ? 'border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10' : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'}`}
                        >
                            <Sparkles size={16} /> AI Analysis
                        </button>
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

                                {/* Category Bars */}
                                <div className="grid grid-cols-2 gap-3">
                                    {Object.entries(resumeData.analysis?.categories || {}).map(([key, val]) => {
                                        const scoreVal = Number(val as any) || 0;
                                        return (
                                            <div key={key} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm">
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
                                    <h3 className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider border-b border-slate-200 dark:border-gray-700 pb-2">Personal Info</h3>
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
        {/* Original PDF Modal */}
        {showOriginalPdf && (
            <div className="fixed inset-0 z-60 p-6 flex items-stretch justify-center bg-black/60">
                <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-5xl h-[80vh] overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-slate-100 dark:border-gray-800 flex justify-between items-center">
                        <div className="text-sm font-bold">Original PDF</div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowOriginalPdf(false)} className="px-3 py-1 rounded bg-slate-100 dark:bg-gray-800">Close</button>
                        </div>
                    </div>
                    <div className="flex-1 bg-gray-100">
                        {originalPdfUrl ? (
                            <iframe src={originalPdfUrl} className="w-full h-full border-0" title="Original Resume PDF"></iframe>
                        ) : (
                            <div className="p-6 text-center text-slate-500">No public URL available for this file.</div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Parsed Preview Floating Panel */}
        {parsedPreview && (
            <div className="fixed right-6 bottom-6 z-50 w-96 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl shadow-xl p-4">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <div className="text-sm font-bold">Parsed Preview</div>
                        <div className="text-xs text-slate-500">Preview of fields extracted from PDF</div>
                    </div>
                    <button onClick={() => setParsedPreview(null)} className="text-sm text-slate-400">✕</button>
                </div>
                <div className="text-sm text-slate-700 dark:text-gray-300 space-y-2 mb-3 max-h-44 overflow-y-auto">
                    <div><strong>Name:</strong> {parsedPreview.name}</div>
                    <div><strong>Email:</strong> {parsedPreview.email}</div>
                    <div><strong>Phone:</strong> {parsedPreview.phone}</div>
                    <div><strong>Skills:</strong> {parsedPreview.skillsText}</div>
                    <div className="mt-2"><strong>Summary (excerpt):</strong><div className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{parsedPreview.summary?.slice(0,500)}</div></div>
                </div>
                <div className="flex gap-2 justify-end">
                    <button onClick={() => setParsedPreview(null)} className="px-3 py-2 rounded bg-slate-100 dark:bg-gray-800">Close</button>
                    <button onClick={applyParsedData} className="px-3 py-2 rounded bg-emerald-600 text-white">Apply Parsed Data</button>
                </div>
            </div>
        )}
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