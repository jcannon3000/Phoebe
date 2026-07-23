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

const LAST_UPDATED = "May 28, 2026";
const CONTACT_EMAIL = "invites@withphoebe.app";

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

// Body extracted so the registration screen can render the same content
// in a modal — see TermsBody for the same pattern.
export function PrivacyBody() {
  return (
    <>
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
            <li>A password (hashed with scrypt and a per-user salt)</li>
          </ul>
          <p>As you use the app, you can create content that we store on your behalf:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Prayer requests and intentions</li>
            <li>Practices you set up — name, intention, reflection notes, completion logs</li>
            <li>Traditions and gatherings — name, description, location, intention, RSVP tracking</li>
            <li>Letters and correspondences</li>
            <li>One-to-one messages you send to other members</li>
            <li>Reflections and comments you share within a group</li>
            <li>Podcast episodes you recommend to your community, with any note you add</li>
            <li>Prayers you record privately for another member ("prayers for")</li>
            <li>Notes, reflections, and gratitude entries</li>
            <li>Your daily reminder ("bell") time and timezone</li>
          </ul>
          <p>
            If you join our waitlist or request an invite on our public website, we store the email address,
            name, and any message you include so we can follow up about access. You can ask us to delete this at
            any time.
          </p>
        </Section>

        <Section title="Data we collect automatically">
          <ul className="list-disc pl-5 space-y-1">
            <li>A session cookie so you stay signed in (30-day lifetime)</li>
            <li>An Apple Push Notification service device token, if you enable notifications</li>
            <li>Presence signals (when you are actively using the app) — only shared with members of your circles if you leave presence enabled; you can turn this off in Settings</li>
            <li>Practice completion events — sent to your circle members so they see your activity</li>
            <li>Prayer streak records and onboarding state flags</li>
            <li>Prayer and listening session records — when you pray or listen in the app, we log which surface you used (for example, Morning Prayer or a podcast), how long, and the start and end times, to power your "time in prayer" totals and streaks. You can mark a session private.</li>
            <li>Podcast listening history — which shows and episodes you've played, and when, so we can offer "continue listening" and recommendations</li>
            <li>App-open timestamps, rounded to 15-minute windows, used only for our own aggregate product metrics</li>
          </ul>
          <p>
            We do not collect device location, microphone audio, the device calendar, health data, the advertising
            identifier (IDFA), or any cross-app or cross-website tracking data.
          </p>
        </Section>

        <Section title="Why we ask for iOS permissions">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Face ID</strong> — optional app re-lock after a period of idle. Face ID authentication
              happens entirely on your device; we never receive biometric data.
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
              <strong>Google</strong> — if your community uses calendar invites, Phoebe creates Google Calendar
              events from a shared account (invites@withphoebe.app) and sends them via Gmail. We don't use
              Google for sign-in.
            </li>
            <li>
              <strong>Apple</strong> — Apple Push Notification service, governed by Apple's privacy terms.
            </li>
            <li>
              <strong>Railway</strong> — our API server and Postgres database run on Railway (Railway Corp.).
              Traffic is encrypted in transit; data at rest is encrypted by Railway's default disk encryption.
            </li>
            <li>
              <strong>Sentry</strong> — error monitoring (Functional Software, Inc., dba Sentry). When the
              Service hits a server error, or the app crashes on your device, we send Sentry the technical
              details needed to diagnose and fix it: the error and its stack trace, the screen or route
              involved, the app version, and an internal account ID where relevant. App crashes are relayed
              through our own server rather than a third-party tracker embedded in the app. We do
              <strong>not</strong> send Sentry your prayer content, messages, letters, or your IP address.
              Sentry runs only when we have it configured.
            </li>
          </ul>
          <p>
            Other than the Sentry error monitoring described above, we do not use product-analytics SDKs,
            advertising networks, marketing or attribution trackers, or payment processors. We do not track you
            across other apps or websites. Phoebe is free; there are no in-app purchases.
          </p>
        </Section>

        <Section title="Content from other websites and apps">
          <p>
            Some of what Phoebe shows comes straight from other organizations, and playing or opening it
            connects your device directly to them. That means they receive your IP address and basic device and
            browser information, under their own privacy policies rather than ours:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Podcasts.</strong> Audio and cover art stream directly from each show's host — for
              example, Forward Movement and podcast networks such as Megaphone, Libsyn, Simplecast, Podbean, and
              Buzzsprout. The host sees your device's connection when you play or browse a show.
            </li>
            <li>
              <strong>The Washington National Cathedral livestream</strong> is embedded from YouTube
              (youtube-nocookie.com); watching it connects your device to Google/YouTube.
            </li>
            <li>
              <strong>Daily reflections and readings</strong> — Forward Day by Day (Forward Movement), the
              Society of St. John the Evangelist, the Center for Action and Contemplation, the Revised Common
              Lectionary (lectionarypage.net), Scripture on Bible.com, and the Episcopal Church's "Find a Church"
              directory — open on those organizations' own sites.
            </li>
            <li>
              <strong>Meeting links</strong> a community adds (such as Zoom or Google Calendar) open on those
              services.
            </li>
          </ul>
          <p>
            We don't hand your account data to these third parties — the connection happens because your device
            loads their content. We don't control their practices, and we'd encourage you to review their
            policies if you have questions.
          </p>
        </Section>

        <Section title="Who can see your data">
          <p>
            Members of a prayer circle you join can see your name, profile photo, prayer requests, practice
            activity, RSVP status, and presence (if enabled). Practices and letters can be shared via invite
            link; anyone holding the link can view the shared content. Invite links are not publicly indexed.
          </p>
          <p>
            Content you post in a community is visible to that community's members. There are no public
            profiles, and we do not use phone numbers or your contacts to find or suggest people — your
            account is not discoverable unless someone already knows your email or has your invite link.
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
          <p>
            Jeremy Cannon<br />
            6427 Langston Blvd<br />
            Arlington, VA 22207<br />
            United States
          </p>
        </Section>
    </>
  );
}

export default function PrivacyPage() {
  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "#091A10", color: "#F0EDE6", fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      <div className="max-w-2xl mx-auto px-5 py-10 pb-24">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.href = "/";
          }}
          className="text-sm mb-6 inline-flex items-center gap-1"
          style={{ color: "#8FAF96" }}
        >
          ← Back
        </button>
        <PrivacyBody />
      </div>
    </div>
  );
}
