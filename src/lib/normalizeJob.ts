import { Job } from '../../types';

function asArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return v.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  return [String(v)];
}

export default function normalizeJob(raw: any): Job {
  const id = raw.id || raw.job_id || raw.slug || raw.url || (raw.title ? `${raw.title}-${Math.random().toString(36).slice(2,8)}` : `job-${Date.now()}`);
  const title = raw.title || raw.name || raw.position || raw.role || 'Untitled Role';
  const company = raw.company?.name || raw.company || raw.employer || raw.organisation || raw.organization || 'Unknown Company';
  const location = (() => {
    if (raw.location) {
      if (typeof raw.location === 'string') return raw.location;
      if (raw.location.display_name) return raw.location.display_name;
      if (Array.isArray(raw.location)) return raw.location.join(', ');
      if (Array.isArray(raw.location?.area)) return raw.location.area.slice(-2).join(', ');
      return String(raw.location);
    }
    if (raw.locations) return Array.isArray(raw.locations) ? raw.locations.map((l: any)=> l.name || l).join(', ') : raw.locations;
    if (raw.city && raw.country) return `${raw.city}, ${raw.country}`;
    return raw.area || raw.region || 'Remote';
  })();
  const matchScore = Number(raw.matchScore ?? raw.match_score ?? raw.score ?? 0) || 0;
  // Prefer explicit numeric salary ranges when available (Adzuna returns salary_min/salary_max)
  let salary: any = raw.salary || raw.salary_range || raw.remuneration || raw.package || undefined;
  try {
    const smin = raw.salary_min ?? raw.salaryMin ?? raw.min_salary;
    const smax = raw.salary_max ?? raw.salaryMax ?? raw.max_salary;
    if ((smin || smax) && !salary) {
      if (smin && smax) salary = `${Number(smin).toLocaleString(undefined, { maximumFractionDigits: 0 })} - ${Number(smax).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
      else salary = `${Number(smin || smax).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
  } catch (e) {}
  const postedAt = raw.postedAt || raw.date_posted || raw.created_at || raw.created || raw.posted || raw.publication_date || '';
  const description = raw.description || raw.contents || raw.summary || raw.snippet || '';
  const status = raw.status || (raw.applied ? 'Applied' : undefined);
  const tags = new Set<string>();
  asArray(raw.tags).forEach(t => tags.add(t));
  asArray(raw.skills || raw.keywords || raw.categories || raw.categories?.names).forEach(t => tags.add(t));
  // Try to parse tags from description if none present (take first few tokens matching capitalized words)
  if (tags.size === 0 && description) {
    const rawMatches = (description.match(/\b[A-Z][a-z0-9+.#-]{1,30}\b/g) || []) as string[];
    const found = Array.from(new Set(rawMatches.slice(0, 6)));
    found.forEach(f => tags.add(String(f)));
  }

  // Parse HTML description heuristically to extract responsibilities, requirements, benefits, and cleaned text.
  function stripTags(html: string) {
    return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '');
  }

  function extractSectionsFromHtml(html: string) {
    const result: any = { responsibilities: [], requirements: [], benefits: [], cleanDescription: '', employmentType: undefined, seniority: undefined, skills: [] };
    if (!html) return result;

    try {
      // Prefer browser DOM parsing when available
      if (typeof window !== 'undefined' && (window as any).DOMParser) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(html), 'text/html');
        // Gather clean description paragraphs
        const paras = Array.from(doc.querySelectorAll('p'))
          .map(p => p.textContent && p.textContent.trim())
          .filter(Boolean) as string[];
        result.cleanDescription = paras.join('\n\n') || stripTags(String(html)).trim();

        const headingKeywords = (nodeText: string) => (/(responsibilit|dutie|requirement|qualification|skill|required|you will|responsibilities|requirements|qualifications|responsibilities:)/i.test(nodeText));
        const reqKeywords = (nodeText: string) => (/(requirement|qualification|skill|required|you have|qualifications)/i.test(nodeText));
        const respKeywords = (nodeText: string) => (/(responsibilit|dutie|you will|responsibilities|duties)/i.test(nodeText));
        const benefitKeywords = (nodeText: string) => (/(benefit|perk|what we offer|we offer)/i.test(nodeText));

        // Helper to find lists following headings
        const findListAfter = (el: Element | null) => {
          if (!el) return [];
          let next = el.nextElementSibling;
          while (next) {
            if (next.tagName.toLowerCase() === 'ul' || next.tagName.toLowerCase() === 'ol') {
              return Array.from(next.querySelectorAll('li')).map(li => (li.textContent || '').trim()).filter(Boolean);
            }
            if (next.tagName.toLowerCase().startsWith('h')) break; // stop if next heading
            next = next.nextElementSibling;
          }
          return [];
        };

        // Scan headings
        const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b'));
        for (const h of headings) {
          const txt = (h.textContent || '').trim();
          if (!txt) continue;
          if (respKeywords(txt)) {
            const items = findListAfter(h);
            if (items.length) result.responsibilities.push(...items);
          }
          if (reqKeywords(txt)) {
            const items = findListAfter(h);
            if (items.length) result.requirements.push(...items);
          }
          if (benefitKeywords(txt)) {
            const items = findListAfter(h);
            if (items.length) result.benefits.push(...items);
          }
        }

        // As fallback, take the first UL/OL for responsibilities and second for requirements
        const lists = Array.from(doc.querySelectorAll('ul, ol'));
        if (result.responsibilities.length === 0 && lists[0]) {
          result.responsibilities = Array.from(lists[0].querySelectorAll('li')).map(li => (li.textContent||'').trim()).filter(Boolean);
        }
        if (result.requirements.length === 0 && lists[1]) {
          result.requirements = Array.from(lists[1].querySelectorAll('li')).map(li => (li.textContent||'').trim()).filter(Boolean);
        }

        // Extract employment type and seniority heuristically
        const txtAll = doc.body.textContent || '';
        const typeMatch = txtAll.match(/(full[- ]time|part[- ]time|contract|freelance|internship|temporary)/i);
        if (typeMatch) result.employmentType = typeMatch[0];
        const seniorMatch = txtAll.match(/\b(senior|lead|junior|mid[- ]level|principal|manager|director|architect)\b/i);
        if (seniorMatch) result.seniority = seniorMatch[0];

        // Extract candidate skills from lists + tags
        const candidateSkills = new Set<string>();
        result.responsibilities.concat(result.requirements || []).forEach(item => {
          (item.match(/\b[A-Z][a-z0-9+.#-]{2,30}\b/g) || []).forEach(s => candidateSkills.add(s));
        });
        // include existing tags
        Array.from(tags).forEach(t => candidateSkills.add(t));
        result.skills = Array.from(candidateSkills).slice(0, 20);

        return result;
      }
    } catch (e) {
      // ignore and fallback to regex
    }

    // Node / fallback: simple regex-based extraction
    try {
      const text = stripTags(String(html));
      result.cleanDescription = text.trim();

      // find heading + following <li>
      const headingListRe = /<(h[1-6]|strong|b)[^>]*>\s*([^<]{3,200}?)\s*<\/(?:h[1-6]|strong|b)>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/gi;
      let m;
      while ((m = headingListRe.exec(String(html))) !== null) {
        const heading = m[2] || '';
        const inner = m[3] || '';
        const rawMatchItems = (inner.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []) as string[];
        const items = rawMatchItems.map(s => String(s).replace(/<li[^>]*>|<\/li>/gi, '').replace(/<[^>]+>/g, '').trim()).filter(Boolean);
        if (/(responsibilit|dutie|you will|responsibilities)/i.test(heading) && items.length) result.responsibilities.push(...items);
        if (/(requirement|qualification|skill|required|qualifications)/i.test(heading) && items.length) result.requirements.push(...items);
        if (/(benefit|perk|what we offer)/i.test(heading) && items.length) result.benefits.push(...items);
      }

      // Fallback: first list -> responsibilities, second -> requirements
      const allLists = (String(html).match(/<ul[^>]*>[\s\S]*?<\/ul>/gi) || []) as string[];
      if (result.responsibilities.length === 0 && allLists[0]) {
        const raw0 = (allLists[0].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []) as string[];
        result.responsibilities = raw0.map(s => String(s).replace(/<li[^>]*>|<\/li>/gi, '').replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      }
      if (result.requirements.length === 0 && allLists[1]) {
        const raw1 = (allLists[1].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []) as string[];
        result.requirements = raw1.map(s => String(s).replace(/<li[^>]*>|<\/li>/gi, '').replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      }

      // heuristics
      const typeMatch2 = String(html).match(/(full[- ]time|part[- ]time|contract|freelance|internship|temporary)/i);
      if (typeMatch2) result.employmentType = typeMatch2[0];
      const seniorMatch2 = String(html).match(/\b(senior|lead|junior|mid[- ]level|principal|manager|director|architect)\b/i);
      if (seniorMatch2) result.seniority = seniorMatch2[0];

      // skills from list items and tags
      const skillItems = [] as string[];
      (result.responsibilities || []).forEach(r => (r.match(/\b[A-Z][a-z0-9+.#-]{2,30}\b/g) || []).forEach(s => skillItems.push(s)));
      Array.from(tags).forEach(t => skillItems.push(t));
      result.skills = Array.from(new Set(skillItems)).slice(0, 20);

      return result;
    } catch (e) {
      return result;
    }
  }

  const parsed = extractSectionsFromHtml(description);

  const sourceUrl = raw.url || raw.refs?.landing_page || raw.refs?.api || raw.sourceUrl || raw.source || raw.source_url || undefined;

  return {
    id: String(id),
    title: String(title),
    company: String(company),
    location: String(location),
    matchScore,
    salary: salary ? String(salary) : undefined,
    postedAt: String(postedAt),
    description: String(description),
    status: status as any,
    tags: Array.from(tags),
    responsibilities: parsed.responsibilities,
    requirements: parsed.requirements,
    benefits: parsed.benefits,
    cleanDescription: parsed.cleanDescription,
    employmentType: parsed.employmentType,
    seniority: parsed.seniority,
    skills: parsed.skills,
    sourceUrl: sourceUrl as any,
  } as Job;
}
