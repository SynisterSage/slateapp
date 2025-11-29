import React from 'react';

const Legal: React.FC = () => {
  const lastUpdated = 'November 28, 2025';

  return (
    <div className="w-full p-8 animate-fade-in pb-20">
      <div className="max-w-full mx-auto">
        <div className="flex items-center justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Legal & Privacy</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Last updated: {lastUpdated}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1 space-y-3">
            <div className="p-4 rounded-2xl border-l-4 border-purple-600/30 dark:border-purple-400/20 bg-white dark:bg-gray-800">
              <h4 className="text-sm font-semibold mb-2 text-purple-700 dark:text-purple-300">Legal</h4>
              <nav className="flex flex-col gap-2 text-sm">
                <a href="#terms" className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Terms of Service</a>
                <a href="#privacy" className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Privacy Policy</a>
                <a href="#contact" className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Contact</a>
              </nav>
            </div>
          </aside>

          <main className="lg:col-span-3 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <nav>
                  <ul className="flex gap-4 flex-wrap text-sm">
                    <li><a href="#terms" className="text-purple-600 hover:underline">Terms of Service</a></li>
                    <li><a href="#privacy" className="text-purple-600 hover:underline">Privacy Policy</a></li>
                    <li><a href="#contact" className="text-purple-600 hover:underline">Contact</a></li>
                  </ul>
                </nav>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Updated {lastUpdated}</div>
            </div>

            <section id="terms" className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">Terms of Service</h2>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                Welcome to SlateApp. These Terms of Service ("Terms") govern your access to and use of the SlateApp web
                application (the "Service"). By accessing or using the Service, you agree to be bound by these Terms.
              </p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">1. Using the Service</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">You may use the Service in compliance with applicable laws. You are responsible for any activity performed through your account.</p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">2. Accounts</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">You must provide accurate information and keep your credentials secure. We may suspend or terminate accounts that violate these Terms.</p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">3. Acceptable Use</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">Do not use the Service to transmit illegal content, spam, or otherwise harmful material. You must not attempt to compromise the Service or other users.</p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">4. Intellectual Property</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">SlateApp and its original content, features, and functionality are and will remain the exclusive property of SlateApp and its licensors.</p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">5. Disclaimer & Liability</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">The Service is provided "as is" without warranties of any kind. To the maximum extent permitted by law, SlateApp disclaims liability for indirect, incidental, or consequential damages.</p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">6. Changes</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">We may change these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
            </section>

            <section id="privacy" className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">Privacy Policy</h2>

              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">This Privacy Policy explains how SlateApp collects, uses, and shares information about you when you use our Service.</p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">1. Information We Collect</h3>
              <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 mb-3">
                <li>Account information (email, name).</li>
                <li>Uploaded resumes and files you submit to the Service.</li>
                <li>Usage data such as pages visited, features used, and error logs.</li>
                <li>Optional integration tokens (e.g., Gmail) when you connect third-party services.</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">2. How We Use Information</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">We use the information to provide, maintain, and improve the Service, communicate with you, and comply with legal obligations. Examples:</p>
              <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 mb-3">
                <li>Processing and storing resumes to provide matching and analysis features.</li>
                <li>Sending transactional emails and notifications about your account.</li>
                <li>Aggregating usage metrics to improve the product.</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">3. Cookies & Tracking</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">We use cookies and similar technologies to operate the Service, remember preferences, and analyze usage. You can control cookies via your browser settings.</p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">4. Third-Party Services</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">We may use third-party providers (hosting, analytics, email) who process data on our behalf. Integrations you enable (for example, Gmail) require explicit consent and are governed by separate OAuth permissions.</p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">5. Data Retention & Deletion</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">We retain personal data as long as necessary to provide the Service and fulfill legal obligations. You can request deletion of your account and data by contacting us (see below).</p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">6. Security</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">We take reasonable measures to protect data, including encryption in transit and at rest where applicable. No online service is completely secure; we cannot guarantee absolute security.</p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">7. Your Rights</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">Depending on your jurisdiction, you may have rights to access, correct, or delete your data. To exercise these rights, contact us as described below.</p>
            </section>

            <section id="contact" className="mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">Contact</h2>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">For questions about these Terms or the Privacy Policy, please contact:</p>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <p>Email: <a href="mailto:privacy@slateapp.example" className="text-purple-600 hover:underline">privacy@slateapp.example</a></p>
              </div>
            </section>

            <footer className="text-xs text-gray-400">This page is provided as a starting point. For production use, consult a lawyer to ensure compliance with applicable laws.</footer>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Legal;
