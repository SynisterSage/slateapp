import React from 'react';
import { Sparkles, Circle, ArrowRight, Mail } from 'lucide-react';

const releases = [
  {
    version: '1.21',
    date: '2025-11-28',
    headline: 'Improved job matching + privacy controls',
    highlights: [
      'Smarter match scoring using combined resume and ATS signals',
      'Privacy settings: opt-out for telemetry and export your data',
      'Minor UI polish across Jobs and Dashboard'
    ],
    notes: [
      'If you rely on Gmail sync, we added safer token handling and offline retries.',
      'Admins can now disable analytics collection for their workspace.'
    ]
  },
  {
    version: '1.20',
    date: '2025-11-14',
    headline: 'Resume parsing improvements and faster search',
    highlights: [
      'Major parser accuracy improvements for PDF/DOCX resumes',
      'Faster job search results with improved provider caching',
      'New Guides section with step-by-step how-tos (coming soon)'
    ],
    notes: [
      'Parsing now extracts more structured experience bullets for better AI analysis.',
      'Search uses cached provider responses to reduce latency during bursts.'
    ]
  },
  {
    version: '1.19',
    date: '2025-10-05',
    headline: 'AI tuning & apply flow reliability',
    highlights: [
      'Tuning interface improvements to get better tailored resume suggestions',
      'Resolved several Apply flow edge-cases when attachments failed',
      'General bug fixes and stability improvements'
    ],
    notes: [
      'If you saw intermittent failures while applying, please re-upload your resume and retry.',
      'We recommend enabling automatic resume revisions to keep profiles fresh.'
    ]
  }
];

const ReleaseCard: React.FC<{ r: any; idx: number }> = ({ r, idx }) => (
  <article className={`p-6 rounded-2xl border ${idx === 0 ? 'border-purple-300 dark:border-purple-700 bg-gradient-to-br from-purple-50 to-white dark:from-gray-800 dark:to-gray-900' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'} shadow-sm`}>
    <header className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-md">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Version {r.version}</h3>
            <div className="text-xs text-gray-500 dark:text-gray-400">{r.date} · {r.headline}</div>
          </div>
        </div>
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400 text-right">
        <div className="font-mono text-xs text-gray-400">Release</div>
        <div className="mt-1 text-xs">{r.version}</div>
      </div>
    </header>

    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Highlights</h4>
        <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
          {r.highlights.map((h: string, i: number) => <li key={i}>{h}</li>)}
        </ul>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Notes</h4>
        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          {r.notes.map((n: string, i: number) => <li key={i}>• {n}</li>)}
        </ul>
      </div>
    </div>

    <div className="mt-4 flex items-center justify-end gap-3">
      <button className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
        <ArrowRight size={14} /> Read details
      </button>
    </div>
  </article>
);

const WhatsNew: React.FC = () => {
  return (
    <div className="w-full p-8 animate-fade-in pb-20">
      <div className="max-w-full mx-auto">
        <div className="flex items-center justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">What's New</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Release notes, changelogs, and recent announcements for SlateApp.</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/20 flex items-center gap-2"><Mail size={16} /> Subscribe</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {releases.map((r, i) => (
              <ReleaseCard key={r.version} r={r} idx={i} />
            ))}
          </div>

          <aside className="space-y-6">
            <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h4 className="text-sm font-semibold mb-2">Upgrade Notes</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">We recommend backing up custom templates and ensuring API clients are using the latest endpoint versions before upgrading.</p>
            </div>

            <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h4 className="text-sm font-semibold mb-2">Security</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">Security fixes are applied to all releases — review changelogs for details.</p>
            </div>

            <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h4 className="text-sm font-semibold mb-2">Past Releases</h4>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <li>1.18 — Sep 10, 2025</li>
                <li>1.17 — Aug 12, 2025</li>
                <li>1.16 — Jul 01, 2025</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default WhatsNew;
