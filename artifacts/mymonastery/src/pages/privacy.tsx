// Public-facing privacy policy. Linked from the App Store listing and
// from TestFlight metadata — so it must render for logged-out users too.
// That's why this page doesn't use <Layout> or useAuth. Anyone with the
// URL can read it, including Apple review reviewers before they create
// an account.
//
// Rewritten July 27, 2026 against the current codebase — replaces the
// prior version, which described the invite-only model, the Fellows/
// circles system, Letters, Messages, RSVPs, Gratitude, and Lectio
// Divina, none of which exist in the app any longer, and omitted the
// live Google Calendar integration.
//
// Keep the content in sync with:
//   - ios/App/App/Info.plist NS*UsageDescription strings
//   - ios/App/App/PrivacyInfo.xcprivacy (Apple's privacy manifest)
//   - Any third-party subprocessor changes in api-server

const LAST_UPDATED = "July 27, 2026";
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

function MailLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline" style={{ color: "#8FAF96" }}>
      {CONTACT_EMAIL}
    </a>
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

      <p className="text-sm leading-relaxed mb-4" style={{ color: "#C8D4C0" }}>
        Phoebe ("Phoebe," "we," "us," or "our") is an iOS and web app for
        keeping a daily practice of Christian prayer, rooted in the Book
        of Common Prayer and the wider Anglican and Episcopal tradition.
        This policy explains what we collect, why we collect it, who can
        see it, and what you can do about it.
      </p>
      <p className="text-sm leading-relaxed mb-4" style={{ color: "#C8D4C0" }}>
        Phoebe is published by Jeremy Cannon, an individual sole
        proprietor based in the United States. This policy covers the iOS
        app, the web app at withphoebe.app, the installable desktop
        version of that web app, and any TestFlight or beta builds we
        distribute. The iOS app is a wrapper around the same web app and
        shares the same backend, so the same policy applies to both.
      </p>
      <p className="text-sm leading-relaxed mb-8" style={{ color: "#C8D4C0" }}>
        We have written this in plain English. Where we have had to use a
        legal term, we have tried to also say what it actually means.
      </p>

      <Section title="The short version">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Phoebe is free. There are no ads, no advertising networks, no
            in-app purchases, and no subscriptions. We do not sell your
            data and we never have.
          </li>
          <li>
            We do not track you across other apps or websites. There is
            no advertising identifier, no product-analytics SDK, and no
            cross-site tracking anywhere in the app.
          </li>
          <li>
            You can use Phoebe's core prayer practices without an account
            at all. If you do, your data stays on your device.
          </li>
          <li>
            What you write in Phoebe — your prayer list, your notes, your
            practice history — is private to you unless you take a
            specific action to share it.
          </li>
          <li>
            You can export everything we hold about you, or delete your
            account entirely, from inside the app at any time.
          </li>
          <li>
            Questions: <MailLink />.
          </li>
        </ul>
      </Section>

      <Section title="Who this covers">
        <p>
          This policy applies to everyone who uses Phoebe, whether or not
          you have an account. It covers the iOS app, the web app, and
          beta builds. It does not cover the other organizations' websites
          and apps that Phoebe links to or embeds — those are described
          under "Content from other organizations" below, and each of them
          has its own privacy policy that governs what happens once you
          are there.
        </p>
      </Section>

      <Section title="The three ways to use Phoebe, and what each one collects">
        <p>
          How much information we hold about you depends entirely on how
          you use the app. There are three paths, and the difference
          between them is significant.
        </p>
        <p>
          <strong>As a guest, with no account.</strong> You can use
          Phoebe's core prayer practices — a full daily rhythm, set up for
          you automatically — without registering for anything. In this
          mode we do not collect your email address, your name, or a
          password, and nothing you do is sent to our servers tied to a
          persistent identity. Your rhythm, your settings, and your
          history are stored on your device only, in local browser or
          device storage. The practical consequence is that this data
          cannot be recovered by us or by you if you clear your browser
          storage, delete the app, or switch devices. It is not backed up
          anywhere.
        </p>
        <p>
          <strong>With a registered account.</strong> Creating an account
          requires an email address, a display name, and a password. We
          hash your password with scrypt and a random per-user salt before
          storing it, which means we never see or store the password
          itself. A profile photo is optional. An account is what makes
          server-synced history, push notification reminders, and group
          participation possible, because all three require us to know who
          you are across devices.
        </p>
        <p>
          <strong>Through an invite link.</strong> Someone already using
          Phoebe can send you a link, either to join a specific group or
          simply to try the app. An invite link is a way in, not a
          requirement: anyone can sign up for Phoebe directly, and
          following an invite link leads to either of the two modes above.
          Phoebe is not an invite-only app.
        </p>
      </Section>

      <Section title="Data you give us directly">
        <p>If you have an account, we hold:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Account basics</strong> — your email address, display
            name, password hash, and an optional profile photo.
          </li>
          <li>
            <strong>Your daily rhythm</strong> — which prayer practices
            you have turned on, how they are configured, and the order and
            layout you have arranged them in.
          </li>
          <li>
            <strong>Custom practices you define</strong> — the name you
            give a practice of your own, any reading target you set for
            it, and the completions you log against it.
          </li>
          <li>
            <strong>Your personal prayer list</strong> — the intentions
            you keep and pray through. These are private to you.
          </li>
          <li>
            <strong>Personal notes and reflections</strong> you write
            alongside a practice, where that practice supports them.
          </li>
          <li>
            <strong>Preferences and settings</strong> — text size, backdrop
            theme, your daily reminder time and timezone, silence ladder
            settings, and home-screen layout.
          </li>
          <li>
            <strong>Group membership</strong> — which groups you belong
            to and your role in each one. Roles are described in detail
            under "Who can see your data" below, and the difference
            between them matters: following a group is anonymous, while
            being a member of one is not.
          </li>
          <li>
            <strong>Content you post to a group</strong>, if you are an
            admin or leader of one — weekly plans and any PDF or slide
            deck you upload with them, standing intercessions, and Get
            Involved opportunities.
          </li>
          <li>
            <strong>A gathering you schedule</strong>, if your group uses
            that feature — its date, time, and location, and (see
            "Third-party services we use" below) a Google Calendar invite
            we send to attendees on the group's behalf.
          </li>
          <li>
            <strong>Rule-of-life requests</strong> — if you ask your
            group's clergy contact for help or counsel through the app,
            we store what you wrote and deliver it to that person. This is
            a beta feature.
          </li>
          <li>
            <strong>Prayer requests.</strong> This feature is currently
            turned off for all users, so no new prayer requests are being
            collected. The underlying data model still exists, and if we
            turn the feature back on, it will be governed by this policy
            and we will note the change here.
          </li>
        </ul>
      </Section>

      <Section title="Data we collect automatically">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>A session cookie</strong> with a 30-day lifetime, so
            you stay signed in.
          </li>
          <li>
            <strong>An Apple Push Notification device token</strong>, if
            you turn on reminders, so we can send your daily bell to the
            right device.
          </li>
          <li>
            <strong>Practice completion events</strong> — which practice,
            when, and for how long where duration applies. This is what
            makes streaks, "time in prayer" totals, and your own history
            possible.
          </li>
          <li>
            <strong>Listening and reading history</strong> for podcast
            episodes and daily reflections — which ones, when, and for how
            long — so the app can offer "continue listening" and show
            what you have already read today.
          </li>
          <li>
            <strong>App-open timestamps</strong>, rounded to 15-minute
            windows and tied to your account, kept for 90 days and then
            deleted. We only ever look at these in aggregate — how many
            people opened the app in a given window — not as a per-person
            activity log, and it is never sold, shared, or used to build a
            profile of you.
          </li>
        </ul>
      </Section>

      <Section title="What we do not collect">
        <p>
          Some of what a privacy policy needs to say is about absences.
          Phoebe does not collect device location. It does not record
          microphone audio. It does not read health or fitness data, and
          it requests no access to Apple Health or any equivalent. It does
          not connect to your Apple Music, Spotify, or other music account,
          and it holds no record of your listening habits outside the app.
          It does not collect an advertising identifier (IDFA) or any
          equivalent, because there is nothing in the app that would use
          one. It does not track you across other apps or websites. There
          are no product-analytics SDKs, no advertising networks, and no
          payment processors anywhere in the app.
        </p>
        <p>
          Phoebe also cannot find you through your contacts or your phone
          number. There is no contacts-based people search in the app at
          all. The only ways an account is discoverable are a group admin
          adding you by an email address they already know, and an invite
          or join link that someone deliberately sends you.
        </p>
      </Section>

      <Section title="Why we ask for iOS permissions">
        <p>
          Phoebe asks for two permissions:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Notifications</strong> — to send your daily reminder
            bell at the time you choose.
          </li>
          <li>
            <strong>Camera and Photos</strong> — only so you can take or
            choose a profile photo. Phoebe uses this at the moment you
            set your picture and at no other time; it does not read your
            photo library in the background or look at anything you
            haven't handed it.
          </li>
        </ul>
        <p>
          Both are optional. Declining notifications means you won't get
          the bell; declining camera and photos means you won't have a
          profile picture. Everything else works either way.
        </p>
        <p>
          Phoebe does not request access to your microphone, your
          location, your contacts, or your health data.
        </p>
      </Section>

      <Section title="Third-party services we use">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Apple</strong> — Apple Push Notification service, used
            to deliver your daily reminder bell.
          </li>
          <li>
            <strong>Google</strong> — if you or your group's leader
            schedules a gathering with a specific date and time, we use a
            single Google account that we operate (invites@withphoebe.app)
            to create a Google Calendar event for it and email attendees a
            calendar invite through Gmail. This uses our own Google
            account, not yours: Phoebe does not sign in to your Google
            account, does not read your Google Calendar or contacts, and
            this only happens for gatherings your group actually
            schedules.
          </li>
          <li>
            <strong>Music for Audio Divina</strong> — Phoebe draws the
            music for Audio Divina from the Apple Music catalogue. This is
            a catalogue lookup, not an account connection: Phoebe does not
            sign in to your Apple Music account, does not read your
            library or playlists, and does not report anything back to
            Apple Music about you. What we record is the duration you
            spent in the practice, not what you listened to.
          </li>
          <li>
            <strong>Railway</strong> — hosts our API server and Postgres
            database. Traffic is encrypted in transit, and data at rest is
            encrypted using the host's disk encryption.
          </li>
          <li>
            <strong>Sentry</strong> — error monitoring, active only where
            configured. Sentry receives technical details about a crash or
            error: a stack trace, the screen or route you were on, and the
            app version. It does not receive your prayer content, your
            notes, or your IP address.
          </li>
        </ul>
      </Section>

      <Section title="Content from other organizations">
        <p>
          Some of what you read, watch, and listen to in Phoebe comes from
          other organizations, and your device connects to them directly
          rather than through our servers. That means those organizations
          can see that a request came from your device, including your IP
          address, in the ordinary way any website sees a visitor. We
          don't control what they collect, and their privacy policies
          govern that, not ours.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Podcast audio and artwork</strong> stream directly
            from each show's host, including Forward Movement and networks
            such as Megaphone, Libsyn, Simplecast, Podbean, and
            Buzzsprout.
          </li>
          <li>
            <strong>The Washington National Cathedral livestream</strong>,
            embedded from YouTube. We use YouTube's no-cookie embed mode,
            which limits what YouTube stores about you unless you play the
            video.
          </li>
          <li>
            <strong>Daily reflections</strong> from Forward Day by Day,
            the Society of St. John the Evangelist, and the Center for
            Action and Contemplation. Some of these open in an in-app
            reader that shares your device's normal browser cookie
            storage, which means a cookie choice you make on one of those
            sites is remembered consistently rather than asked again each
            time.
          </li>
          <li>
            <strong>Scripture and lectionary content</strong> from
            lectionarypage.net and Bible.com, and the Episcopal Church's
            Find a Church directory.
          </li>
          <li>
            <strong>Meeting links</strong> that a group adds, such as a
            Zoom link for a gathering. These belong to the group, not to
            us.
          </li>
          <li>
            <strong>The guided spiritual journey course</strong>, whose
            videos are embedded from YouTube. Your progress through the
            course is currently stored on your device only.
          </li>
        </ul>
      </Section>

      <Section title="Who can see your data">
        <p>
          Phoebe has no public user profiles. Nothing you do in the app is
          published to the open internet, and there is no way for a
          stranger to browse users.
        </p>
        <p>
          <strong>Your personal content is private by default.</strong>
          {" "}Your prayer list, your custom practice logs, your personal
          notes, your reading and listening history, and your streaks are
          visible to you alone. They are not visible to other members of
          your groups, and they are not visible to your group's admins,
          unless you take a specific action to share something.
        </p>
        <p>
          <strong>Joining a group is not anonymous.</strong> When you join
          a group, you appear by name and profile photo in that group's
          roster, where other members of the same group can see you. This
          visibility is limited to that specific group: members of one
          group are not visible to another group.
        </p>
        <p>
          <strong>An admin can still make someone's presence quieter.</strong>
          {" "}A group's leader can move a person to a lighter, count-only
          tier — visible to the admin, but not listed by name to other
          members. This is a leader's choice for a particular person, not
          the default for anyone who joins.
        </p>
        <p>
          <strong>Admins see their own group's full roster.</strong> An
          admin can see everyone who has joined the group they
          administer, by name, because managing a group — removing
          someone, or moving them to the quieter tier above — requires
          knowing who has actually joined. This is leader visibility for
          moderation, not peer visibility: it is not available to
          non-admin members, and administering one group gives no
          visibility into another.
        </p>
        <p>
          <strong>Shared group content is visible to that group.</strong>
          {" "}Weekly plans, standing intercessions, shared rules of life, and
          Get Involved opportunities posted by an admin are shown to that
          group's members. Where a group prays a shared rule
          of life, the app shows how many people kept a given practice
          that week as an aggregate count — not a list of who did and who
          didn't.
        </p>
        <p>
          <strong>A scheduled gathering's attendees are visible to Google.
          </strong> If your group schedules a gathering, the attendee
          email addresses are sent to Google so it can deliver the
          calendar invite — see "Third-party services we use" above.
        </p>
        <p>
          <strong>Rule-of-life requests go to one person.</strong> A
          request you send to your group's clergy contact is visible to
          that clergy contact. It is not shown to the group.
        </p>
        <p>
          Beyond this, we share data only where we have to: with the
          service providers listed above who process data on our behalf,
          and where the law requires it, such as a valid legal request. We
          do not sell your data to anyone for any purpose.
        </p>
      </Section>

      <Section title="How we secure your data">
        <ul className="list-disc pl-5 space-y-1">
          <li>All traffic is encrypted in transit over HTTPS and WSS.</li>
          <li>
            Passwords are hashed with scrypt and a random per-user salt.
            We cannot read your password, and we cannot recover it for you
            — we can only help you set a new one.
          </li>
          <li>
            Data at rest is encrypted using our host's disk encryption.
          </li>
        </ul>
        <p>
          No system is perfectly secure, and we would rather say so than
          imply otherwise. Phoebe is built and maintained by one person,
          and we have made the security choices above deliberately. If you
          find a vulnerability, please write to us at <MailLink /> before
          disclosing it publicly, and we will address it as quickly as we
          can.
        </p>
      </Section>

      <Section title="How long we keep your data">
        <p>
          Your content — practices, custom practice definitions, prayer
          list, notes, group content, and activity logs — is kept until
          you delete it or delete your account. When you delete your
          account, we permanently remove the account and the content you
          own. This is immediate and it is not reversible.
        </p>
        <p>
          Two things outlive an account deletion, and both are limited.
          Content you posted to a group as an admin, such as a weekly plan
          or a standing intercession, may remain with that group so the
          group's shared record isn't broken by one person leaving.
          Aggregate metrics that contain no identifying information, such
          as coarse app-open counts, remain in aggregate form after the
          underlying per-account record has been deleted on its own
          90-day schedule. Error reports held by Sentry expire on Sentry's
          own retention schedule.
        </p>
        <p>
          If you use Phoebe as a guest, there is nothing for us to delete,
          because we never held it. That data lives on your device and
          ends when you clear your storage or remove the app.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Whatever jurisdiction you're in, these are available to you
          today, from inside the app, under Settings:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Export your data.</strong> Downloads a JSON file
            containing everything your account holds.
          </li>
          <li>
            <strong>Delete your account.</strong> Permanently removes your
            account and the content you own, immediately.
          </li>
          <li>
            <strong>Correct your information.</strong> Edit your display
            name and profile photo directly in Settings.
          </li>
        </ul>
        <p>
          If you are in the European Economic Area or the United Kingdom,
          you also have the right to object to or restrict certain
          processing, and the right to lodge a complaint with your local
          data protection authority. If you are in California, you have
          the right to know what we collect, to delete it, and not to be
          discriminated against for exercising those rights — and note
          that we do not sell or share personal information as those terms
          are defined under California law, so there is nothing to opt out
          of. For anything the in-app tools don't cover, write to{" "}
          <MailLink /> and we will handle it.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Phoebe is not directed to children under 13, and we do not
          knowingly collect personal information from anyone under 13. You
          must be at least 13 to register an account. If you believe a
          child under 13 has created an account, write to <MailLink />{" "}
          and we will delete it.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We will update this policy when the app changes in a way that
          affects it, and the date at the top will always reflect the last
          revision. If a change materially affects how we handle your
          information, we will tell you in the app rather than relying on
          you to notice a new date. Continuing to use Phoebe after a
          change means you accept the updated policy.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Phoebe is published by Jeremy Cannon, an individual sole
          proprietor doing business as Phoebe, in the United States. For
          any question about this policy, your data, or a request we
          haven't made easy enough in the app, write to <MailLink />. A
          real person reads it.
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
