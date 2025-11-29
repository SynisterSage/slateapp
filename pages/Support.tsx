import React, { useState } from 'react';

const FAQ = [
  {
    q: 'How do I upload a resume?',
    a: 'Go to Resumes → Upload Resume and follow the upload flow. We accept PDF and DOCX files.'
  },
  {
    q: 'How do I connect Gmail?',
    a: 'Go to Settings → Integrations and click Connect Gmail. Follow the OAuth flow to grant access.'
  },
  {
    q: 'How do I apply to a job?',
    a: 'Open Jobs, choose a job, and click Apply. You can pick a resume and send an application directly.'
  }
];

const Support: React.FC = () => {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle'|'sending'|'success'|'error'>('idle');

  const filtered = FAQ.filter(f => (f.q + f.a).toLowerCase().includes(search.toLowerCase()));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const resp = await fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const json = await resp.json();
      if (json && json.ok) {
        setStatus('success');
        setForm({ name: '', email: '', subject: '', message: '' });
      } else {
        setStatus('error');
      }
    } catch (e) {
      setStatus('error');
    }
  };

  return (
    <div className="w-full p-8 animate-fade-in pb-20">
      <div className="max-w-full mx-auto">
        <div className="flex items-center justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Support & FAQ</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Find answers to common questions or send us a message and we'll create a ticket.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <main className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 w-full">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Support & FAQ</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Find answers to common questions or send us a message and we'll create a ticket.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="mb-4">
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search FAQ..." className="w-full p-2 border rounded-lg" />
                </div>

                <div className="space-y-4">
                  {filtered.map((f, i) => (
                    <div key={i} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                      <div className="font-medium">{f.q}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">{f.a}</div>
                    </div>
                  ))}
                  {filtered.length === 0 && <div className="text-sm text-gray-500">No results. Try different keywords or contact support below.</div>}
                </div>
              </div>

              <div>
                <div>
                  <h3 className="font-semibold mb-2">Contact Support</h3>
                  <form onSubmit={submit} className="space-y-3">
                    <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Your name" className="w-full p-2 border rounded-lg" />
                    <input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="Your email" className="w-full p-2 border rounded-lg" />
                    <input required value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} placeholder="Subject" className="w-full p-2 border rounded-lg" />
                    <textarea required value={form.message} onChange={e => setForm({...form, message: e.target.value})} placeholder="Message" className="w-full p-2 border rounded-lg h-28" />
                    <div className="flex items-center gap-3">
                      <button disabled={status === 'sending'} className="px-4 py-2 bg-purple-600 text-white rounded-lg">{status === 'sending' ? 'Sending...' : 'Send Message'}</button>
                      {status === 'success' && <span className="text-sm text-green-600">Message sent — we'll reply by email.</span>}
                      {status === 'error' && <span className="text-sm text-rose-600">Failed to send — please try again later.</span>}
                    </div>
                  </form>
                </div>
              </div>
            </div>

            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              <strong>What this app does:</strong> SlateApp helps users upload and manage resumes, parse resume content, find and apply to jobs, and track applications. Support requests should include screenshots and steps to reproduce.
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Support;
