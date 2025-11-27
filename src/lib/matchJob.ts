import { Job } from '../../types';

function wordsFromText(s?: string) {
  if (!s) return [] as string[];
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 2);
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

// resume: can be any shape; we attempt to extract skills and experience text
export function computeMatchScore(job: Job, resume?: any, prefs?: { jobTitle?: string; location?: string }) {
  const jobText = [job.title || '', job.cleanDescription || job.description || '', (job.skills || []).join(' ')].join(' ');
  const jobWords = uniq(wordsFromText(jobText));

  let skillsScore = 0;
  const resumeSkills: string[] = [];
  try {
    if (resume) {
      if (Array.isArray(resume.skills)) {
        resume.skills.forEach((s: any) => {
          if (!s) return;
          if (typeof s === 'string') resumeSkills.push(s.toLowerCase());
          else if (s.name) resumeSkills.push(String(s.name).toLowerCase());
          else if (typeof s === 'object' && s.title) resumeSkills.push(String(s.title).toLowerCase());
        });
      }
      // also pull from experience bullets/titles
      if (Array.isArray(resume.experience)) {
        resume.experience.forEach((e: any) => {
          if (e.role) resumeSkills.push(String(e.role).toLowerCase());
          if (e.title) resumeSkills.push(String(e.title).toLowerCase());
          if (Array.isArray(e.bullets)) e.bullets.forEach((b: any) => resumeSkills.push(String(b).toLowerCase()));
        });
      }
    }
  } catch (e) {
    // ignore
  }

  const cleanResumeSkills = uniq(resumeSkills.map(s => s.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).map(w => w.trim()).filter(Boolean).join(' '))).filter(Boolean);

  if (cleanResumeSkills.length > 0) {
    let matches = 0;
    cleanResumeSkills.forEach(rs => {
      const kws = wordsFromText(rs);
      // if any keyword from this skill appears in jobWords, count it
      if (kws.some(k => jobWords.includes(k))) matches += 1;
      else if (jobText.toLowerCase().includes(rs)) matches += 1;
    });
    skillsScore = matches / cleanResumeSkills.length; // 0..1
  } else {
    skillsScore = 0;
  }

  // Title match: compare prefs.jobTitle to job.title
  let titleScore = 0;
  try {
    const target = (prefs && prefs.jobTitle) || '';
    if (target) {
      const targetWords = uniq(wordsFromText(target));
      if (targetWords.length > 0) {
        const matched = targetWords.filter(w => jobWords.includes(w)).length;
        titleScore = matched / targetWords.length;
      }
    }
  } catch (e) { titleScore = 0; }

  // Location match: exact substring or remote match
  let locationScore = 0;
  try {
    const prefLoc = (prefs && prefs.location) || '';
    if (prefLoc) {
      const pl = prefLoc.toLowerCase();
      const jl = (job.location || '').toLowerCase();
      if (pl.includes('remote') && jl.includes('remote')) locationScore = 1;
      else if (pl && jl && jl.includes(pl)) locationScore = 1;
      else if (pl && jl && pl.includes(jl)) locationScore = 1;
      else locationScore = 0;
    }
  } catch (e) { locationScore = 0; }

  // Weights: if resume available, emphasize skills more; otherwise emphasize title
  const hasResume = resume && ((resume.skills && resume.skills.length) || (resume.experience && resume.experience.length));
  const weights = hasResume ? { skills: 0.6, title: 0.3, location: 0.1 } : { skills: 0, title: 0.7, location: 0.3 };

  const score = (skillsScore * weights.skills) + (titleScore * weights.title) + (locationScore * weights.location);
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

export default computeMatchScore;
