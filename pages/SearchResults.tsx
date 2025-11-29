import React, { useEffect, useState } from 'react';
import { fetchResults } from '../src/lib/search';
import MarkdownRenderer from '../components/MarkdownRenderer';

const SearchResults: React.FC = () => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any>({ docs: [], guides: [], resumes: [], applications: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || '');
    const qparam = params.get('q') || '';
    setQ(qparam);
  }, []);

  // Listen for programmatic searches dispatched from TopNav so results update
  useEffect(() => {
    const onAppSearch = (e: any) => {
      try {
        const v = e && e.detail && e.detail.q ? e.detail.q : '';
        setQ(v);
      } catch (err) {}
    };
    window.addEventListener('app:search', onAppSearch as EventListener);
    return () => window.removeEventListener('app:search', onAppSearch as EventListener);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!q) return;
    setLoading(true);
    fetchResults(q).then(r => { if (!mounted) return; setResults(r); setLoading(false); });
    return () => { mounted = false; };
  }, [q]);

  return (
    <div className="w-full p-8 animate-fade-in pb-20">
      <div className="max-w-full mx-auto">
        <div className="flex items-center justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Search Results</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Results for "{q}"</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <main className="lg:col-span-3 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700">
            {loading && <div className="py-8 text-center text-gray-500">Searching...</div>}

            {!loading && (
              <div className="space-y-6">
                <section>
                  <h3 className="text-lg font-semibold mb-3">Docs</h3>
                  <ul className="space-y-2">
                    {results.docs.map((d: any) => (
                      <li key={d.slug} className="text-sm text-gray-700 dark:text-gray-300">
                        {d.title} — <button onClick={() => { try { window.history.pushState({},'', `/docs/${d.slug}`); } catch(e){}; window.dispatchEvent(new CustomEvent('app:openDoc', { detail: { slug: d.slug } })); window.dispatchEvent(new CustomEvent('app:navigate', { detail: { view: 'DOCS' } })); }} className="text-purple-600">Open</button>
                      </li>
                    ))}
                    {results.docs.length === 0 && <li className="text-sm text-gray-500">No matching docs.</li>}
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold mb-3">Guides</h3>
                  <ul className="space-y-2">
                    {results.guides.map((g: any) => (
                      <li key={g.id} className="text-sm text-gray-700 dark:text-gray-300">
                        {g.title} — <button onClick={() => { try { window.history.pushState({},'', `/guides?open=${g.id}`); } catch(e){}; window.dispatchEvent(new CustomEvent('app:openGuide', { detail: { id: g.id } })); window.dispatchEvent(new CustomEvent('app:navigate', { detail: { view: 'GUIDES' } })); }} className="text-purple-600">Open</button>
                      </li>
                    ))}
                    {results.guides.length === 0 && <li className="text-sm text-gray-500">No matching guides.</li>}
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold mb-3">Resumes</h3>
                  <ul className="space-y-2">
                    {results.resumes.map((r: any) => (
                      <li key={r.id} className="text-sm text-gray-700 dark:text-gray-300">
                        {r.title || r.fileName || r.personalInfo?.fullName} — <button onClick={() => { try { window.history.pushState({},'', `/resumes/detail?id=${r.id}`); } catch(e){}; window.dispatchEvent(new CustomEvent('app:openResume', { detail: { id: r.id } })); window.dispatchEvent(new CustomEvent('app:navigate', { detail: { view: 'RESUME_DETAIL' } })); }} className="text-purple-600">Open</button>
                      </li>
                    ))}
                    {results.resumes.length === 0 && <li className="text-sm text-gray-500">No matching resumes.</li>}
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold mb-3">Applications</h3>
                  <ul className="space-y-2">
                    {results.applications.map((a: any) => (
                      <li key={a.id} className="text-sm text-gray-700 dark:text-gray-300">
                        {(a.data && a.data.job && a.data.job.title) || a.status || a.id} — <button onClick={() => { try { window.history.pushState({},'', `/applications?open=${a.id}`); } catch(e){}; window.dispatchEvent(new CustomEvent('app:openApplication', { detail: { id: a.id } })); window.dispatchEvent(new CustomEvent('app:navigate', { detail: { view: 'APPLICATIONS' } })); }} className="text-purple-600">Open</button>
                      </li>
                    ))}
                    {results.applications.length === 0 && <li className="text-sm text-gray-500">No matching applications.</li>}
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold mb-3">Jobs</h3>
                  <ul className="space-y-2">
                    {results.jobs && results.jobs.map((j: any) => (
                      <li key={j.id} className="text-sm text-gray-700 dark:text-gray-300">
                        {j.title} <span className="text-sm text-gray-500">{j.company ? `— ${j.company}` : ''}</span> — <button onClick={() => { try { window.history.pushState({},'', `/jobs?openJob=${j.id}`); } catch(e){}; window.dispatchEvent(new CustomEvent('app:navigate', { detail: { view: 'JOBS' } })); }} className="text-purple-600">Open</button>
                      </li>
                    ))}
                    {(!results.jobs || results.jobs.length === 0) && <li className="text-sm text-gray-500">No matching jobs.</li>}
                  </ul>
                </section>
              </div>
            )}
          </main>

          <aside className="lg:col-span-1">
            <div className="p-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h4 className="text-sm font-semibold mb-2">Search Tips</h4>
              <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc pl-4">
                <li>Try keywords like a job title, company name, or resume owner.</li>
                <li>Search guide titles for quick how-tos.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default SearchResults;
