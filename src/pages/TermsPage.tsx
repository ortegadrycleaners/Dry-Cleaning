import { Link } from 'react-router-dom';

const BRAND = 'Ortega Dry Cleaners';
const SUPPORT_EMAIL = 'info@ortegadrycleaners.com';
const SUPPORT_PHONE = '+1 904 666 0809';
const MAX_MESSAGES = 4;
const LAST_UPDATED = 'June 2026';

export function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="font-semibold text-slate-800 text-sm">{BRAND}</span>
          <Link
            to="/privacy"
            className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
          >
            Privacy Policy →
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
            <h1 className="text-2xl font-bold text-slate-900">{BRAND} — SMS &amp; WhatsApp Notification Terms</h1>
            <p className="mt-2 text-xs text-slate-400">Last updated: {LAST_UPDATED}</p>
          </div>

          {/* Section 1 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">1. Program Description &amp; How to Opt In</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {BRAND} operates a transactional messaging program exclusively for laundry order tracking.
              Before any message is sent, customers must complete the Customer Registration Form available
              at the point of service. The form requires:
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600 list-disc list-inside ml-2">
              <li>Full name</li>
              <li>Mobile phone number</li>
              <li>
                Explicit consent — by checking the following mandatory, unchecked-by-default box:
              </li>
            </ul>
            <blockquote className="mt-3 border-l-4 border-blue-400 pl-4 py-2 bg-blue-50 rounded-r-lg">
              <p className="text-sm text-blue-800 italic">
                "I agree and authorize the registration of my data and consent to receive SMS notifications
                about my laundry order status."
              </p>
            </blockquote>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              No messages are sent unless the customer actively checks this consent box and submits the form.
              Consent is never pre-selected, bundled with another action, or required to complete the order.
            </p>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              These messages are <strong>strictly transactional</strong>. No marketing, promotional, or
              third-party messages will be sent through this program.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">2. Message Frequency</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Message frequency varies and depends on the number of status changes for your laundry order.
              Typical status updates include: Order Received, In Process, Ready for Pickup / Out for Delivery,
              and Completed.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              You may receive up to <strong>{MAX_MESSAGES} messages</strong> per order.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">3. Secure Order Tracking Link</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Each notification will contain a unique, cryptographically generated private URL. This link
              provides read-only access to your order status. Access is restricted exclusively to the holder
              of that URL — no public directory exists and no other user can view your order information
              through this link.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">4. Opt-Out (Stop Receiving Messages)</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              You may cancel notifications at any time.
            </p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              To stop receiving messages, reply{' '}
              <strong className="text-slate-800">STOP</strong>,{' '}
              <strong className="text-slate-800">CANCEL</strong>, or{' '}
              <strong className="text-slate-800">END</strong> to any message you receive.
            </p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Upon receiving your opt-out request, the system will record your preference and no further
              updates will be sent via this channel for current or future orders.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">5. Help &amp; Support</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              For help or questions about this messaging program, reply{' '}
              <strong className="text-slate-800">HELP</strong> or contact us at:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600 ml-2">
              <li>
                Email:{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li>Phone: {SUPPORT_PHONE}</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">6. Message and Data Rates</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Message and data rates may apply.</strong> Contact your mobile carrier for details
              about your plan's messaging costs.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">7. Carrier Liability</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Carriers are not liable for delayed or undelivered messages. Message delivery depends on
              your carrier's network availability.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-3">8. Privacy</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your mobile information will not be shared with third parties for marketing or promotional
              purposes. For full details on how we handle your data, see our{' '}
              <Link to="/privacy" className="text-blue-600 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          {/* Footer divider */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-slate-400">{BRAND} · SMS Notification Program · {LAST_UPDATED}</p>
            <Link to="/privacy" className="text-xs text-blue-600 hover:underline">
              Privacy Policy →
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}
