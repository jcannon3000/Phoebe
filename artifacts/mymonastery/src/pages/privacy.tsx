// Public-facing privacy policy. Linked from the App Store listing and
// from TestFlight metadata — so it must render for logged-out users too.
// That's why this page doesn't use <Layout> or useAuth. Anyone with the
// URL can read it, including Apple review reviewers before they create
// an account.
//
// Keep the content in sync with:
//   - ios/App/App/Info.plist NS*UsageDescription strings
//   - ios/App/App/PrivacyInfo.xcprivacy (Apple's privacy manifest)
//   - Any third-party subprocessor changes in api-server

const LAST_UPDATED = "April 24, 2026";
const CONTACT_EMAIL = "privacy@withphoebe.app";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2
        className="text-xl font-semibold mb-3"
        style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: "#C8D4C0" }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "#091A10", color: "#F0EDE6", fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      <div className="max-w-2xl mx-auto px-5 py-10 pb-24">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Privacy Policy
        </h1>
        <p className="text-xs mb-8" style={{ color: "rgba(143,175,150,0.75)" }}>
          Last updated {LAST_UPDATED}
        </p>

        <Section title="Who this covers">
          <p>
            This policy describes how <strong>Phoebe</strong> handles personal data. Phoebe is an iOS app and web
            application for small faith communities, created and operated by Jeremy Cannon. It is available on
            the App Store as <em>Phoebe: Prayer Together</em>, on TestFlight, and on the web at withphoebe.app.
          </p>
          <p>
            We do not sell personal data. We do not use advertising networks. We do not track you across other
            apps or websites.
          </p>
        </Section>

        <Section title="Data you give us directly">
          <p>When you create an account, you provide:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your email address and display name (required)</li>
            <li>A profile photo (optional)</li>
            <li>A password, or a Sign in with Google / Sign in with Apple identifier</li>
          </ul>
          <p>As you use the app, you can create content that we store on your behalf:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Prayer requests and intentions</li>
            <li>Practices you set up — name, intention, reflection notes, completion logs</li>
            <li>Traditions and gatherings — name, description, location, intention, RSVP tracking</li>
            <li>Letters and correspondences</li>
            <li>Notes, reflections, and gratitude entries</li>
            <li>Your daily reminder ("bell") time and timezone</li>
          </ul>
        </Section>

        <Section title="Data we collect automatically">
          <ul className="list-disc pl-5 space-y-1">
            <li>A session cookie so you stay signed in (30-day lifetime)</li>
            <li>An Apple Push Notification service device token, if you enable notifications</li>
            <li>Presence signals (when you are actively using the app) — only shared with members of your circles if you leave presence enabled; you can turn this off in Settings</li>
            <li>Practice completion events — sent to your circle members so they see your activity</li>
            <li>Prayer streak records and onboarding state flags</li>
          </ul>
          <p>
            We do not collect device location, microphone audio, the device calendar, health data, the advertising
            identifier (IDFA), or any cross-app or cross-website tracking data.
          </p>
        </Section>

        <Section title="Why we ask for iOS permissions">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Contacts</strong> — only when you tap "Invite from contacts." We use selected names, emails,
              and phone numbers to send invites. We do not upload your contact list.
            </li>
            <li>
              <strong>Face ID</strong> — optional app re-lock after idle. Face ID authentication happens entirely
              on your device; we never receive biometric data.
            </li>
            <li>
              <strong>Camera</strong> and <strong>Photos</strong> — only when you choose to take or pick a
              profile photo.
            </li>
            <li>
              <strong>Notifications</strong> — for your daily bell and circle activity. You can turn these off any
              time in iOS Settings.
            </li>
          </ul>
        </Section>

        <Section title="Third-party services">
          <p>We share limited data with the following providers so the app can function:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Google</strong> — if you Sign in with Google, we receive your email and profile info. If
              your community uses calendar invites, Phoebe creates Google Calendar events from a shared account
              (invites@withphoebe.app) and sends them via Gmail.
            </li>
            <li>
              <strong>Apple</strong> — Sign in with Apple and Apple Push Notification service, both governed by
              Apple's privacy terms. If you connect Apple Music for listening practices, a token you provide is
              stored so we can check "now playing" status.
            </li>
            <li>
              <strong>Google Fonts</strong> — our web pages load fonts from Google's CDN, which exposes your IP
              address to Google per their standard terms.
            </li>
            <li>
              <strong>Our hosting provider</strong> — the Phoebe API and database run on a managed cloud host.
              Traffic is encrypted in transit; data at rest is encrypted by the host's default disk encryption.
            </li>
          </ul>
          <p>
            We do not use analytics SDKs, crash reporting SDKs, advertising networks, or payment processors.
            Phoebe is free; there are no in-app purchases.
          </p>
        </Section>

        <Section title="Who can see your data">
          <p>
            Members of a prayer circle you join can see your name, profile photo, prayer requests, practice
            activity, RSVP status, and presence (if enabled). Practices and letters can be shared via invite
            link; anyone holding the link can view the shared content. Invite links are not publicly indexed.
          </p>
          <p>
            There are no public profiles. Your account is not discoverable unless someone already knows your
            email or has your invite link.
          </p>
          <p>We may disclose data if required by law or valid legal process.</p>
        </Section>

        <Section title="How we secure your data">
          <p>
            All traffic uses HTTPS (and WSS for real-time updates). Passwords are hashed with scrypt and a random
            per-user salt before storage. Sign in with Apple flows use nonce-based CSRF protection. Google OAuth
            grants are revoked when you log out or delete your account. Face ID authentication happens only on
            your device; biometric data never leaves it.
          </p>
        </Section>

        <Section title="How long we keep your data">
          <p>
            Session cookies expire after 30 days. Your content — practices, traditions, letters, prayer requests,
            activity logs — is kept until you delete it or delete your account. Google OAuth tokens are kept
            while your account is active; logging out revokes them.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can access, correct, export, or delete your personal data at any time from Settings in the app:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Export</strong> — Settings → "Export my data" downloads a JSON file of everything we hold
              about your account.
            </li>
            <li>
              <strong>Delete</strong> — Settings → "Delete account" permanently removes your account and all
              user-owned content. We revoke any Google OAuth grant we still hold.
            </li>
            <li>
              <strong>Correction</strong> — edit your name and photo in Settings → "Profile."
            </li>
          </ul>
          <p>
            If you are in the EU, UK, or California, you have additional rights under GDPR and CCPA/CPRA —
            including the right to object to or restrict processing, and (California) the right to opt out of the
            sale or sharing of personal information. We do not sell or share personal information for advertising,
            so that opt-out is automatic.
          </p>
          <p>
            To exercise any right you cannot complete in-app, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#8FAF96", textDecoration: "underline" }}>
              {CONTACT_EMAIL}
            </a>{" "}
            and we will respond within 30 days.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Phoebe is not directed to children under 13. We do not knowingly collect personal data from children
            under 13. If you believe a child has provided us with data, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#8FAF96", textDecoration: "underline" }}>
              {CONTACT_EMAIL}
            </a>{" "}
            and we will delete it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy as the app evolves. Material changes will be announced in-app or by email
            to the address on your account. The "Last updated" date at the top always reflects the current
            version.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions, concerns, or requests:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#8FAF96", textDecoration: "underline" }}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>
      </div>
    </div>
  );
}
