import { Link } from 'react-router-dom';

const BRAND = 'Ortega Cleaners';
const SUPPORT_EMAIL = 'info@ortegadrycleaners.com';
const SUPPORT_PHONE = '+1 904 666 0809';
const SUPPORT_ADDRESS = '5330 Ortega Blvd, Jacksonville, FL 32210, United States';
const LAST_UPDATED = 'June 2026';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="font-semibold text-slate-800 text-sm">{BRAND}</span>
          <Link
            to="/terms"
            className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
          >
            ← Terms &amp; Conditions
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-10">
        {/* Back button */}
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-8">
          {/* Title block */}
          <div className="pb-6 border-b border-slate-100">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-2">
              Twilio · CTIA · A2P 10DLC Compliant
            </p>
            <h1 className="text-2xl font-bold text-slate-900">{BRAND} — Messaging Privacy Policy</h1>
            <p className="mt-2 text-xs text-slate-400">Last updated: {LAST_UPDATED}</p>
          </div>

          {/* Section 1 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">1. Scope</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              This Privacy Policy applies specifically to the {BRAND} SMS and WhatsApp laundry order
              notification program. It governs how we collect, use, and protect the personal information
              provided in the context of this messaging service.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">2. Information We Collect</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              To operate the notification system, we collect only the minimum necessary information,
              entered directly by the customer in the registration form:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600 ml-2">
              <li className="flex gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>
                  <strong className="text-slate-700">Full name</strong> — used solely to identify the
                  order owner internally.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>
                  <strong className="text-slate-700">Mobile phone number</strong> — used solely to deliver
                  SMS order status notifications.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>
                  <strong className="text-slate-700">Explicit consent record</strong> — a timestamped log
                  of the customer's opt-in checkbox submission, retained as proof of consent.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>
                  <strong className="text-slate-700">Order status data</strong> — the internal lifecycle
                  states of your laundry order (e.g., Received, In Process, Ready for Pickup, Delivered).
                </span>
              </li>
            </ul>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              We do <strong>not</strong> collect email addresses, payment details, or any other personal
              information through this messaging program.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">3. How We Use Your Information</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              The information collected is used for one purpose only: to send you transactional status
              notifications about your laundry order via SMS or WhatsApp.
            </p>
            <p className="mt-2 text-sm text-slate-600 font-medium">
              Your phone number will <span className="underline">never</span> be used for:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600 ml-2">
              <li className="flex gap-2"><span className="text-red-400">✕</span> Marketing or promotional campaigns</li>
              <li className="flex gap-2"><span className="text-red-400">✕</span> Third-party advertising</li>
              <li className="flex gap-2"><span className="text-red-400">✕</span> Remarketing or profiling</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">4. Data Isolation &amp; Private Tracking Links</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              For each order, our system generates a unique private tracking URL that functions as a
              single-use access token. This ensures that only the recipient of the original message can
              view their order status. There is no public directory of orders, and one customer's
              information is inaccessible to any other user.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">5. No Third-Party Sharing</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              We will not sell, rent, lease, or share your mobile phone number or order information with
              any third party for marketing or promotional purposes.
            </p>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Your information may be processed by the following infrastructure providers solely to
              transmit notifications:
            </p>

            {/* Processors table */}
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Provider</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-3 text-slate-700 font-medium">Twilio Inc.</td>
                    <td className="px-4 py-3 text-slate-600">SMS / WhatsApp message delivery</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-slate-700 font-medium">Hostinger</td>
                    <td className="px-4 py-3 text-slate-600">Application and database hosting</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              These providers act as data processors under strict confidentiality obligations and are not
              permitted to use your data for any purpose beyond message transmission.
            </p>

            {/* CTIA compliance note */}
            <div className="mt-4 flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠️</span>
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>CTIA Compliance Note:</strong> Mobile information will not be shared with third
                parties/affiliates for marketing/promotional purposes. All other categories exclude text
                messaging originator opt-in data and consent.
              </p>
            </div>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">6. Data Retention</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your phone number and associated order data are retained only for the duration required to
              fulfill and close your laundry order. Once an order is completed and the retention period
              expires, your contact information is purged from the notification system.
            </p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              You may request early deletion by contacting us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">7. Consent &amp; Opt-Out</h2>

            <p className="text-sm font-medium text-slate-700 mb-1">How consent is obtained</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Customers provide explicit consent by checking a mandatory, unchecked-by-default checkbox
              in the Customer Registration Form before any message is sent. The form label reads:
            </p>
            <blockquote className="mt-3 border-l-4 border-blue-400 pl-4 py-2 bg-blue-50 rounded-r-lg">
              <p className="text-sm text-blue-800 italic">
                "I agree and authorize the registration of my data and consent to receive SMS notifications
                about my laundry order status."
              </p>
            </blockquote>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Providing your phone number and checking this box is voluntary. It is never required to place
              a laundry order — it is offered as an optional convenience for real-time order tracking. The
              form cannot be submitted without actively checking this box.
            </p>

            <p className="mt-4 text-sm font-medium text-slate-700 mb-1">How to withdraw consent</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              You may stop all notifications at any time by replying{' '}
              <strong className="text-slate-800">STOP</strong> to any message, or by contacting us
              directly. Upon opt-out, your number will be immediately added to our suppression list and no
              further messages will be sent.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">8. Contact</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              For questions about this Privacy Policy or to request data deletion:
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600 ml-2">
              <li>
                Email:{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li>Phone: {SUPPORT_PHONE}</li>
              <li>Address: {SUPPORT_ADDRESS}</li>
            </ul>
          </section>

          {/* Footer divider */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-slate-400">{BRAND} · Messaging Privacy Policy · {LAST_UPDATED}</p>
            <Link to="/terms" className="text-xs text-blue-600 hover:underline">
              ← Terms &amp; Conditions
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}
