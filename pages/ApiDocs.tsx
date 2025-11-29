import React from 'react';

const ApiDocs: React.FC = () => {
  return (
    <div className="w-full p-8 animate-fade-in pb-20">
      <div className="max-w-full mx-auto">
        <div className="flex items-center justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">API & Integrations — Legal Summary</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Descriptions of what our APIs do and how we handle user data.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1 space-y-3">
            <div className="p-4 rounded-2xl border-l-4 border-purple-600/30 dark:border-purple-400/20 bg-white dark:bg-gray-800">
              <h4 className="text-sm font-semibold mb-2 text-purple-700 dark:text-purple-300">Contents</h4>
              <nav className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
                <a href="#overview">Overview</a>
                <a href="#data-use">How We Use Data</a>
                <a href="#gmail">Gmail Integration</a>
                <a href="#job-providers">Job Provider Proxy</a>
                <a href="#security-retention">Security & Retention</a>
                <a href="#rights-contact">User Rights & Contact</a>
              </nav>
            </div>
          </aside>

          <main className="lg:col-span-3 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700">
            <section id="overview" className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Overview</h2>
              <p className="text-sm text-gray-700 dark:text-gray-300">This page summarizes, in plain language, the behaviors of SlateApp's server-side APIs that integrate with third-party services (for example, Gmail and external job providers). It focuses on legal and privacy-relevant information for users and publishers; it is not a developer reference.</p>
            </section>

            <section id="data-use" className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">How We Use Your Data</h3>
              <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-2">
                <li>We use data you provide (resumes, job listings you save, and any content you create) to deliver the SlateApp features you interact with.</li>
                <li>When you connect a third-party account (for example, Gmail), we only access data necessary to provide the requested feature (sending applications, syncing messages). We summarize and store metadata needed for application tracking and notifications.</li>
                <li>We do not sell personal data to third parties. Data shared with third parties is done only to fulfill the service (for example, sending an email via Gmail) or where you explicitly request a third-party integration.</li>
              </ul>
            </section>

            <section id="gmail" className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Gmail Integration — What You Should Know</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">When you connect your Gmail account to SlateApp, you grant permission for the application to perform specific actions on your behalf. Key points:</p>
              <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-2">
                <li>Purpose: We use your Gmail connection to send application emails on your behalf (with your chosen resume attached) and to optionally sync messages that match job application activity so we can automatically create or update application records in your account.</li>
                <li>Consent: Connecting Gmail is an explicit action you take. You can revoke access at any time via your Google account settings or by removing the linked account within SlateApp's settings.</li>
                <li>Scope: We request only the minimum permissions required for the features you enable (sending messages and reading messages related to applications). We do not read unrelated mailbox content beyond what is necessary to provide the application-tracking features.</li>
                <li>Storage: We store limited message metadata (for example: sender, recipient, subject, snippet, timestamps) and any messages you explicitly allow us to persist. Message bodies are only stored when required for application tracking; we aim to store minimal content and never more than necessary.</li>
                <li>Sending on your behalf: When SlateApp sends an application email, it uses your connected Gmail account so the message originates from your address. We do not keep your Gmail credentials; the connection is performed through standard OAuth consent and tokens are handled securely on our servers.</li>
                <li>Revocation & deletion: If you disconnect Gmail, we stop attempting new syncs and sending from that account. You can request deletion of any synced message data via the contact details below.</li>
              </ul>
            </section>

            <section id="job-providers" className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Job Provider Proxy — What We Do</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">SlateApp aggregates job listings from a variety of public job providers to help you search and apply. Important legal points:</p>
              <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-2">
                <li>We fetch public job listings for search and discovery; we store only the information necessary to show and track a saved or applied job (title, company, URL, and basic metadata).</li>
                <li>We may forward application actions (for example, posting an application or following an external apply link) to the provider as part of the apply flow. Where the provider requires additional data, we will request your explicit confirmation before sending it.</li>
                <li>When a provider requires you to apply on an external site, SlateApp may store the apply URL and any confirmation information you choose to paste into the app for your records.</li>
              </ul>
            </section>

            <section id="security-retention" className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Security & Data Retention</h3>
              <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-2">
                <li>We protect stored data using standard security practices. Access to account-linked services is limited to the minimum required subsystems and is logged for operational purposes.</li>
                <li>We retain application-tracking records and associated minimal message metadata for as long as you keep your account or until you request deletion. If you request account deletion, we will remove personal data in accordance with our data deletion procedures.</li>
                <li>Backups and operational logs may exist for a limited period for recovery and compliance; these are deleted per our retention schedule.</li>
              </ul>
            </section>

            <section id="rights-contact" className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">User Rights & Contact</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">If you have questions about data we hold, want to request deletion, or need to revoke integrations, please contact our support team and include your account email so we can assist:</p>
              <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-2">
                <li>Email: <span className="font-medium">support@slateapp.example</span></li>
                <li>What we can do: provide a copy of personal data we hold, delete or export your data, disconnect integrations on request.</li>
                <li>Legal requests: for official legal requests, provide a clear point of contact and the account details to expedite processing.</li>
              </ul>
            </section>

            <div className="text-xs text-gray-500 dark:text-gray-400 mt-4">Last updated Nov 28, 2025</div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default ApiDocs;
