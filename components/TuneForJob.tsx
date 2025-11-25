import React, { useState } from 'react';
import { ChevronDown, Trash2, Edit2, Copy, Search, Loader2 } from 'lucide-react';
import { Resume } from '../types';

export type TuneItem = {
  id: string;
  title: string;
  keywords: string[];
  exclude: string[];
  priority: 'High' | 'Medium' | 'Low';
  boost: number; // 0-100
  notes?: string;
  due?: string | null;
  open?: boolean;
};

interface Props {
  resumeData?: Resume;
  initial?: TuneItem[];
  onChange?: (items: TuneItem[]) => void; // optional hook for persistence
  onPreview?: (tunedResume: any) => void;
}

const defaultItems = (): TuneItem[] => [];

const priorityColor = (p: TuneItem['priority']) => p === 'High' ? 'bg-rose-100 text-rose-700' : p === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700';

// Small collapsible section used inside the tuned result
const Section: React.FC<{ title: string; openByDefault?: boolean; children?: React.ReactNode }> = ({ title, openByDefault = false, children }) => {
  const [open, setOpen] = useState<boolean>(!!openByDefault);
  return (
    <div className="border-t border-slate-100 dark:border-gray-700 pt-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left py-2 focus:outline-none">
        <div className="text-sm font-semibold text-slate-700 dark:text-gray-200">{title}</div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transform transition-transform ${open ? 'rotate-180' : 'rotate-0'}`} />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
};

const TuneForJob: React.FC<Props> = ({ resumeData, initial, onChange, onPreview }) => {
  const initialItems = Array.isArray((resumeData as any)?.tunes) ? (resumeData as any).tunes : initial || defaultItems();
  const [items, setItems] = useState<TuneItem[]>(initialItems as TuneItem[]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // addItem removed per new UX (use Analyze -> Save Tune)

  const toggleOpen = (id: string) => {
    const out = items.map(i => i.id === id ? { ...i, open: !i.open } : i);
    setItems(out);
    onChange?.(out);
  };

  const updateItem = (id: string, patch: Partial<TuneItem>) => {
    const out = items.map(i => i.id === id ? { ...i, ...patch } : i);
    setItems(out);
    onChange?.(out);
  };

  const removeItem = (id: string) => {
    const out = items.filter(i => i.id !== id);
    setItems(out);
    onChange?.(out);
  };

  const duplicateItem = (id: string) => {
    const src = items.find(i => i.id === id);
    if (!src) return;
    const copy: TuneItem = { ...src, id: `t_${Date.now()}`, title: src.title + ' (copy)', open: true };
    const out = [copy, ...items];
    setItems(out);
    onChange?.(out);
  };

  // quick suggestions based on resume skills
  const quickSuggestions = React.useMemo(() => {
    try {
      const skills = Array.isArray(resumeData?.skills) ? resumeData!.skills.map((s:any) => (typeof s === 'string' ? s : s.name)).filter(Boolean) : [];
      const suggestions: string[] = [];
      if (skills.length) {
        suggestions.push(`${skills.slice(0,3).join(' ')} engineer`);
        suggestions.push(`Senior ${skills[0]} role`);
        suggestions.push(`${skills.slice(0,2).join(', ')} specialist`);
      }
      return suggestions.slice(0,5);
    } catch (e) { return []; }
  }, [resumeData]);

  const runTune = async (q?: string) => {
    const payloadQuery = (q || query || '').trim();
    if (!payloadQuery) return setError('Please enter a job title or paste a job description.');
    // enforce per-query attempts (3 tries)
    const attempts = attemptsMap[payloadQuery] || 0;
    if (attempts >= 3) {
      return setError('Max attempts reached for this query. Change the description to reset attempts.');
    }
    setAttemptsMap(prev => ({ ...prev, [payloadQuery]: attempts + 1 }));
    setError(null);
    setLoading(true);
    setResult(null);
    // helper: extract a balanced JSON object from a string (first object found)
    const extractFirstJsonObject = (s: string) => {
      if (!s) return null;
      const start = s.indexOf('{');
      if (start === -1) return null;
      let depth = 0;
      for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth === 0) {
          return s.slice(start, i + 1);
        }
      }
      return null;
    };

    try {
      const resp = await fetch('/api/tune', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: payloadQuery, resumeData }) });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json && json.error ? String(json.error) : `Server error ${resp.status}`);
      } else if (json.success && json.tune) {
        setResult(json.tune);
      } else if (json.raw || json.text) {
        // try to parse any returned raw/text JSON from the server (some LLMs return a JSON string inside a text field)
        const rawStr = typeof json.raw === 'string' ? json.raw : (typeof json.text === 'string' ? json.text : JSON.stringify(json.raw || json.text || ''));
        // first try a direct parse
        try {
          const parsed = JSON.parse(rawStr);
          setResult(parsed);
        } catch (e) {
          // attempt to extract the first balanced JSON object from the string
          const candidate = extractFirstJsonObject(rawStr);
          if (candidate) {
            try {
              const parsed2 = JSON.parse(candidate);
              setResult(parsed2);
            } catch (e2) {
              setResult({ raw: rawStr });
            }
          } else {
            setResult({ raw: rawStr });
          }
        }
      } else {
        setError('No tune returned');
      }
    } catch (e:any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const [attemptsMap, setAttemptsMap] = React.useState<Record<string, number>>({});

  const buildPreviewFromResult = (res: any) => {
    try {
      const tuned = JSON.parse(JSON.stringify(resumeData || {}));
      if (res.tunedSummary) {
        tuned.personalInfo = { ...(tuned.personalInfo || {}), summary: res.tunedSummary };
      }
      if (Array.isArray(res.suggestedExperienceEdits)) {
        tuned.experience = Array.isArray(tuned.experience) ? tuned.experience.map((exp:any, idx:number) => {
          const edit = res.suggestedExperienceEdits.find((e:any) => Number(e.roleIndex) === idx);
          if (edit && Array.isArray(edit.newBullets)) {
            return { ...exp, bullets: edit.newBullets };
          }
          return exp;
        }) : tuned.experience;
      }
      if (Array.isArray(res.suggestedSkillAdds)) {
        const existing = Array.isArray(tuned.skills) ? tuned.skills.map((s:any) => (typeof s === 'string' ? s : s.name)) : [];
        const toAdd = res.suggestedSkillAdds.filter((s:any) => !existing.includes(s));
        tuned.skills = [...(tuned.skills || []), ...toAdd.map((s:any) => (typeof s === 'string' ? { name: s } : s))];
      }
      return tuned;
    } catch (e) { return null; }
  };

  // derive actions: prefer explicit `result.actions`, otherwise split `explain` into sentences
  const deriveActions = (res: any) => {
    if (!res) return [];
    if (Array.isArray(res.actions) && res.actions.length) return res.actions;
    if (res.explain && String(res.explain).trim()) {
      const s = String(res.explain).replace(/\s+/g, ' ').trim();
      const sentences = s.split(/(?<=[.!?])\s+/).map((x:any) => x.trim()).filter(Boolean);
      if (sentences.length) return sentences.slice(0, 3);
    }
    return [
      'Emphasize relevant technical skills near the top of your resume.',
      'Quantify your impact with metrics (e.g., % improvement, user counts).',
      'Add role-specific tools and testing experience to experience bullets.'
    ];
  };

  const responsibilitiesToShow = React.useMemo(() => {
    if (!result) return [];
    if (Array.isArray(result.responsibilitiesMatch) && result.responsibilitiesMatch.length) return result.responsibilitiesMatch;
    if (Array.isArray(result.suggestedExperienceEdits) && result.suggestedExperienceEdits.length) {
      return result.suggestedExperienceEdits.map((ed:any) => ({ roleIndex: ed.roleIndex, matched: true, highlights: ed.newBullets || [] }));
    }
    return [];
  }, [result]);

  // example tuned result for local testing without calling the API
  const exampleResult = {
    tunedSummary: 'Product-focused frontend engineer with 6+ years building scalable React applications.',
    suggestedSkillAdds: ['React', 'TypeScript', 'Tailwind', 'Jest', 'Accessibility'],
    suggestedSkillBoosts: [{ skill: 'React', boostDelta: 20 }, { skill: 'TypeScript', boostDelta: 15 }],
    suggestedExperienceEdits: [
      { roleIndex: 0, newBullets: ['Led migration to React + TypeScript reducing runtime errors by 40%.', 'Optimized bundle size and improved TTFB by 30%.'] }
    ],
    explain: 'Highlight component performance wins and testing practice; include accessibility and testing frameworks explicitly.',
    actions: [
      'Create a concise summary that highlights React + TypeScript experience.',
      'Add 2–3 quantified achievements for your most recent role.',
      'Include testing frameworks (Jest) and accessibility (ARIA) under skills and bullets.'
    ],
    overallFitScore: 78
  };

  const setExample = () => {
    setQuery('Senior React Engineer - performance & TypeScript');
    setResult(exampleResult as any);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">Tune for Job</h3>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">Attempts left: {Math.max(0, 3 - (attemptsMap[query] || 0))}</div>
          <button onClick={setExample} className="text-xs px-2 py-1 bg-white border rounded text-slate-700 hover:bg-slate-50">Example</button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input placeholder="Paste job title or description — Gemini will tailor your resume" value={query} onChange={e => setQuery(e.target.value)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-900 text-sm pr-28" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {loading ? <Loader2 className="animate-spin text-slate-400" size={16} /> : <Search size={16} className="text-slate-400" />}
            </div>
          </div>
          <button onClick={() => runTune()} disabled={loading} className={`text-sm px-3 py-1 ${loading ? 'bg-purple-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'} text-white rounded-md`}>Analyze</button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="font-semibold">Suggestions:</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {quickSuggestions.map(s => (
              <button key={s} onClick={() => { setQuery(s); runTune(s); }} className="whitespace-nowrap text-xs px-2 py-0.5 bg-slate-100 dark:bg-gray-800 rounded">{s}</button>
            ))}
          </div>
        </div>

        {error && <div className="text-sm text-rose-700">{error}</div>}

        {/* Tuned result with structured sections */}
        {result && (
          <div className="bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 rounded-xl shadow-sm p-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold">Preview: {query}</div>
                {typeof result.overallFitScore === 'number' && <div className="text-xs text-slate-500 mt-1">Overall fit: <span className="font-bold">{result.overallFitScore}</span></div>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const tuned = buildPreviewFromResult(result);
                  if (onPreview && tuned) {
                    onPreview(tuned);
                  }
                }} className="text-sm px-3 py-1 bg-purple-600 text-white rounded-md">Preview</button>
              </div>
            </div>

            <div className="mt-3 text-sm text-slate-600 dark:text-gray-300 space-y-3">
              {/* raw debug view when parsing failed */}
              {typeof result.raw === 'string' && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 p-2 rounded text-xs">
                  <div className="font-medium">Raw response (could not parse as JSON)</div>
                  <pre className="whitespace-pre-wrap break-words mt-2 text-xs">{String(result.raw).slice(0, 4000)}</pre>
                </div>
              )}
              {/* collapsible sections */}
              <Section title="Eligibility Match" openByDefault={false}>
                <div className="text-xs text-slate-500">High-level eligibility for the given role (core qualifications).</div>
                <div className="mt-2">
                  {typeof result.overallFitScore === 'number' ? (
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-semibold text-slate-800 dark:text-gray-100">{result.overallFitScore}%</div>
                      <div className="text-xs text-slate-500">Estimated fit based on parsed resume vs role description.</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">No eligibility summary provided by the analysis.</div>
                  )}
                  {Array.isArray(result.eligibility) && result.eligibility.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-slate-700 dark:text-gray-200">
                      {result.eligibility.map((e:any, i:number) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              </Section>

              <Section title="Requirements Match" openByDefault={false}>
                <div className="text-xs text-slate-500">Critical skills and requirements found vs missing.</div>
                <div className="mt-2">
                  {/* compute skill match */}
                  {(() => {
                    const resumeSkills = Array.isArray(resumeData?.skills) ? resumeData!.skills.map((s:any) => (typeof s === 'string' ? s : s.name)).filter(Boolean) : [];
                    const suggestedRequired = Array.isArray(result?.requirements?.required) ? result.requirements.required : (Array.isArray(result.suggestedSkillAdds) ? result.suggestedSkillAdds : []);
                    const suggestedOptional = Array.isArray(result?.requirements?.optional) ? result.requirements.optional : [];
                    const foundRequired = suggestedRequired.filter((s:any) => resumeSkills.map((r:any)=>r.toLowerCase()).includes(String(s).toLowerCase()));
                    const missingRequired = suggestedRequired.filter((s:any) => !resumeSkills.map((r:any)=>r.toLowerCase()).includes(String(s).toLowerCase()));
                    const foundOptional = suggestedOptional.filter((s:any) => resumeSkills.map((r:any)=>r.toLowerCase()).includes(String(s).toLowerCase()));
                    return (
                      <div className="space-y-3">
                        <div className="text-xs font-medium">{foundRequired.length} Critical Skills found</div>
                        <div className="flex flex-wrap gap-2">
                          {foundRequired.map((s:any) => <div key={s} className="text-xs px-2 py-1 bg-emerald-100 text-emerald-800 rounded">{s}</div>)}
                        </div>

                        <div className="text-xs font-medium mt-2">{missingRequired.length} Critical Skills missing</div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {missingRequired.map((s:any) => <div key={s} className="text-xs px-2 py-1 bg-rose-50 text-rose-700 rounded">{s}</div>)}
                        </div>

                        {suggestedOptional.length > 0 && (
                          <div>
                            <div className="text-xs font-medium mt-2">Good to have</div>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {suggestedOptional.map((s:any) => <div key={s} className="text-xs px-2 py-1 bg-slate-100 text-slate-800 rounded">{s}</div>)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </Section>

              <Section title="Responsibilities Match" openByDefault={false}>
                <div className="text-xs text-slate-500">How your past roles map to the job responsibilities.</div>
                <div className="mt-2 space-y-2">
                  {responsibilitiesToShow.length > 0 ? (
                    responsibilitiesToShow.map((rm:any, idx:number) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-gray-900 rounded">
                        <div className="flex items-start gap-3">
                          <div className={rm.matched ? 'text-emerald-600' : 'text-rose-600'}>{rm.matched ? '✔' : '✖'}</div>
                          <div>
                            <div className="text-xs text-slate-600">Role index: <span className="font-medium">{rm.roleIndex}</span></div>
                            {Array.isArray(rm.highlights) && rm.highlights.length > 0 && (
                              <ul className="mt-2 list-disc pl-5 text-slate-700 dark:text-gray-200">
                                {rm.highlights.map((b:string, i:number) => <li key={i}>{b}</li>)}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500">No direct responsibilities matched. Consider adding examples of relevant work.</div>
                  )}
                </div>
              </Section>

              <Section title="Actions" openByDefault={false}>
                <div className="text-xs text-slate-500">Concrete, prioritized actions to improve alignment (top 3).</div>
                <div className="mt-2 space-y-2">
                  {deriveActions(result).map((a:any, i:number) => {
                    const txt = String(a);
                    const parts = txt.split(/[:\-–—]\s+/);
                    const title = parts.length > 1 ? parts[0] : txt.split(' ').slice(0,6).join(' ');
                    const desc = parts.length > 1 ? parts.slice(1).join(': ') : txt;
                    return (
                      <div key={i} className="p-3 bg-white dark:bg-gray-900 rounded border border-slate-100 dark:border-gray-700">
                        <div className="flex items-start gap-3">
                          <div className="text-amber-500 text-lg">⚡</div>
                          <div>
                            <div className="text-sm font-semibold text-slate-800 dark:text-gray-100">{title}</div>
                            <div className="text-xs text-slate-500 mt-1">{desc}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            </div>
          </div>
        )}

        {items.length === 0 && !result && (
          <div className="p-4 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-100 dark:border-gray-700 text-sm text-slate-600">No tunes yet — click Add to create one.</div>
        )}

        {items.map(item => (
          <div key={item.id} className="bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 rounded-xl shadow-sm">
            <button onClick={() => toggleOpen(item.id)} className="w-full text-left p-3 flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-xl">
              <div className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${item.priority === 'High' ? 'bg-rose-500' : item.priority === 'Medium' ? 'bg-amber-500' : 'bg-slate-500'}`} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-200 truncate">{item.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-gray-400 truncate mt-1">{item.keywords.join(', ') || <span className="text-slate-400">No keywords</span>}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className={`text-xs px-2 py-1 rounded-full ${priorityColor(item.priority)} border border-slate-100 dark:border-gray-700`}>{item.priority}</div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transform transition-transform ${item.open ? 'rotate-180' : 'rotate-0'}`} />
                  </div>
                </div>
              </div>
            </button>

            <div className={`overflow-hidden transition-[height,opacity] ${item.open ? 'p-3' : 'max-h-0 p-0'}`} aria-hidden={!item.open}>
              {item.open && (
                <div className="text-sm text-slate-600 dark:text-gray-300 space-y-3">
                  <div>
                    <label className="text-xs text-slate-500">Job Title</label>
                    <input value={item.title} onChange={e => updateItem(item.id, { title: e.target.value })} className="mt-1 w-full p-2 border rounded-md bg-white dark:bg-gray-900 text-sm" />
                  </div>

                  <div>
                    <label className="text-xs text-slate-500">Keywords (comma separated)</label>
                    <input value={item.keywords.join(', ')} onChange={e => updateItem(item.id, { keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="mt-1 w-full p-2 border rounded-md bg-white dark:bg-gray-900 text-sm" />
                  </div>

                  <div>
                    <label className="text-xs text-slate-500">Exclude Terms</label>
                    <input value={item.exclude.join(', ')} onChange={e => updateItem(item.id, { exclude: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="mt-1 w-full p-2 border rounded-md bg-white dark:bg-gray-900 text-sm" />
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-slate-500">Priority</label>
                      <select value={item.priority} onChange={e => updateItem(item.id, { priority: e.target.value as any })} className="mt-1 w-full p-2 border rounded-md bg-white dark:bg-gray-900 text-sm">
                        <option>High</option>
                        <option>Medium</option>
                        <option>Low</option>
                      </select>
                    </div>

                    <div className="w-40">
                      <label className="text-xs text-slate-500">Boost</label>
                      <input type="range" min={0} max={100} value={item.boost} onChange={e => updateItem(item.id, { boost: Number(e.target.value) })} className="mt-2 w-full" />
                      <div className="text-xs text-slate-400 text-right">{item.boost}</div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-500">Notes</label>
                    <input value={item.notes || ''} onChange={e => updateItem(item.id, { notes: e.target.value })} className="mt-1 w-full p-2 border rounded-md bg-white dark:bg-gray-900 text-sm" />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => duplicateItem(item.id)} className="text-sm px-3 py-1 bg-white border rounded-md"> <Copy size={14} /> Duplicate</button>
                      <button onClick={() => removeItem(item.id)} className="text-sm px-3 py-1 bg-rose-50 text-rose-700 border rounded-md"> <Trash2 size={14} /> Delete</button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={() => updateItem(item.id, { open: false })} className="text-sm px-3 py-1 bg-white border rounded-md">Close</button>
                      <button onClick={() => {/* placeholder apply action - wiring for backend later */}} className="text-sm px-3 py-1 bg-purple-600 text-white rounded-md">Apply</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TuneForJob;
