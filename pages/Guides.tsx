import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import MarkdownRenderer from '../components/MarkdownRenderer';

const guides = [
  {
    id: 'resume-writing',
    title: 'Resume Writing Best Practices',
    summary: 'How to write concise bullets, structure your experience, and highlight measurable impact so your resume stands out.',
    tags: ['resume', 'writing'],
    updated: 'Nov 28, 2025'
  },
  {
    id: 'job-search',
    title: 'Effective Job Search Workflow',
    summary: 'A practical workflow for searching, tracking, and applying to jobs using SlateApp to stay organized.',
    tags: ['search', 'workflow'],
    updated: 'Nov 20, 2025'
  },
  {
    id: 'interview-prep',
    title: 'Interview Preparation Checklist',
    summary: 'A checklist for technical and behavioral interviews including example questions and practice tips.',
    tags: ['interview'],
    updated: 'Oct 10, 2025'
  },
  {
    id: 'networking',
    title: 'Networking & Outreach Templates',
    summary: 'Template messages and best practices for reaching out to recruiters and hiring managers.',
    tags: ['networking', 'templates'],
    updated: 'Aug 5, 2025'
  }
];

const Guides: React.FC = () => {
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  const selected = guides.find(g => g.id === openGuide) || null;
  const [mdContent, setMdContent] = useState<string>('');
  const [mdLoading, setMdLoading] = useState(false);

  const closeModal = () => setOpenGuide(null);

  const openModal = (id: string) => setOpenGuide(id);

  useEffect(() => {
    let mounted = true;
    if (!selected) {
      setMdContent('');
      return;
    }
    const slug = selected.id;
    const path = `/src/content/docs/guides/${slug}.md`;
    setMdLoading(true);
    fetch(path).then(async (r) => {
      if (!mounted) return;
      if (!r.ok) {
        setMdContent(`# ${selected.title}\n\nContent not found.`);
        setMdLoading(false);
        return;
      }
      const txt = await r.text();
      setMdContent(txt || `# ${selected.title}\n\nNo content.`);
      setMdLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setMdContent(`# ${selected.title}\n\nFailed to load content.`);
      setMdLoading(false);
    });
    return () => { mounted = false; };
  }, [selected]);

  // Listen for programmatic open requests (from TopNav / SearchResults)
  useEffect(() => {
    const onOpen = (e: any) => {
      try {
        const id = e && e.detail && e.detail.id;
        if (!id) return;
        setOpenGuide(id);
      } catch (err) {}
    };
    window.addEventListener('app:openGuide', onOpen as EventListener);
    return () => window.removeEventListener('app:openGuide', onOpen as EventListener);
  }, []);

  return (
    <div className="w-full p-8 animate-fade-in pb-20">
      <div className="max-w-full mx-auto">
        <div className="flex items-center justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Guides & How-tos</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Clear, practical guides to get the most out of SlateApp.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <main className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 w-full">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Select a guide to learn more</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Practical, focused guides to help you get forward quickly.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {guides.map(g => (
                <article
                  id={g.id}
                  key={g.id}
                  onClick={() => openModal(g.id)}
                  className="relative p-5 rounded-lg border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow bg-white dark:bg-gray-900 cursor-pointer"
                >
                  {/* Absolute pill so it never wraps and doesn't push content */}
                  <div className="absolute top-4 right-4">
                    <span className="inline-block text-xs px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 whitespace-nowrap">{g.updated}</span>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{g.title}</h3>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{g.summary}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-8 prose prose-sm max-w-none text-gray-700 dark:text-gray-300">
              <h3 className="text-lg font-semibold">Getting the most from these guides</h3>
              <ul className="list-disc list-inside">
                <li>Start with the resume writing guide if you haven’t updated your resume in the last 6 months.</li>
                <li>Use the job search workflow to track applications and follow-ups.</li>
                <li>Copy outreach templates into your mail client and personalize them before sending.</li>
              </ul>
            </div>
          </main>
        </div>
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 sm:mx-auto p-0 animate-in scale-95 duration-200 border border-slate-200 dark:border-gray-700 relative max-h-[85vh] overflow-hidden">
              <button onClick={closeModal} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <X size={18} />
              </button>
              <div className="p-6 overflow-auto max-h-[78vh]">
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selected.title}</h2>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selected.updated}</div>
                </div>

                <div className="text-sm text-gray-700 dark:text-gray-300 space-y-4">
                  {mdLoading ? (
                    <div className="py-8 text-center text-gray-500">Loading...</div>
                  ) : (
                    <MarkdownRenderer source={mdContent} />
                  )}

                  <div className="mt-4 text-right">
                    <button onClick={closeModal} className="px-4 py-2 rounded-full bg-purple-600 text-white hover:bg-purple-700">Close</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Guides;
