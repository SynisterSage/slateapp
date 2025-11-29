import React, { useState, useEffect } from 'react';
import MarkdownRenderer from '../components/MarkdownRenderer';

const docsIndex = [
  { slug: 'getting-started', title: 'Getting Started' },
  { slug: 'onboarding', title: 'Onboarding & First Steps' },
  { slug: 'uploading-resumes', title: 'Uploading Resumes' },
  { slug: 'resumes', title: 'Resumes: Editor & Revisions' },
  { slug: 'jobs', title: 'Jobs: Search & Apply' },
  { slug: 'applications', title: 'Applications & Tracking' },
  { slug: 'settings', title: 'Settings & Integrations' },
  { slug: 'integrations-gmail', title: 'Gmail Sync (Integrations)' },
  { slug: 'api-overview', title: 'API Overview' },
  { slug: 'guides-howtos', title: 'Guides & How-tos' },
  { slug: 'troubleshooting', title: 'Troubleshooting & FAQ' }
];

const loadDoc = async (slug: string) => {
  try {
    const resp = await fetch(`/src/content/docs/${slug}.md`);
    if (!resp.ok) return `# ${slug}\n\nContent not found.`;
    return await resp.text();
  } catch (e) {
    return `# ${slug}\n\nFailed to load doc.`;
  }
};

const Docs: React.FC = () => {
  const [current, setCurrent] = useState(docsIndex[0].slug);
  const [content, setContent] = useState('');

  useEffect(() => {
    (async () => {
      const md = await loadDoc(current);
      setContent(md || '');
    })();
  }, [current]);

  // Listen for programmatic open requests for docs
  useEffect(() => {
    const onOpen = (e: any) => {
      try {
        const slug = e && e.detail && e.detail.slug;
        if (!slug) return;
        setCurrent(slug);
      } catch (err) {}
    };
    window.addEventListener('app:openDoc', onOpen as EventListener);
    return () => window.removeEventListener('app:openDoc', onOpen as EventListener);
  }, []);

  return (
    <div className="w-full p-8 animate-fade-in pb-20">
      <div className="max-w-full mx-auto">
        <div className="flex items-center justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Documentation</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Deep dives, tutorials, and reference for every area of SlateApp.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1 space-y-3">
            <div className="p-4 rounded-2xl border-l-4 border-purple-600/30 dark:border-purple-400/20 bg-white dark:bg-gray-800">
              <h4 className="text-sm font-semibold mb-2 text-purple-700 dark:text-purple-300">Docs</h4>
              <nav className="flex flex-col gap-2">
                {docsIndex.map(d => (
                  <button key={d.slug} onClick={() => setCurrent(d.slug)} className={`text-left p-2 rounded-lg w-full flex items-center gap-2 ${current === d.slug ? 'bg-purple-50 dark:bg-gray-900 text-purple-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <span className="w-2 h-2 rounded-full bg-purple-500/80" />
                    <span>{d.title}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <main className="lg:col-span-3 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{docsIndex.find(d => d.slug === current)?.title || 'Documentation'}</h2>
              <div className="text-sm text-gray-500 dark:text-gray-400">Updated Nov 28, 2025</div>
            </div>
            <MarkdownRenderer source={content} />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Docs;
