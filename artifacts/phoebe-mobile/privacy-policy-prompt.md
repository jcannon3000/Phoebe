# Privacy Policy Generation Prompt — Phoebe

Copy everything below the line into your LLM of choice (or hand to a privacy lawyer as a factual brief).

---

Write a privacy policy for an iOS app called **Phoebe** (App Store listing name: "Phoebe: Prayer Together"), published by **Jeremy Cannon** (sole developer, US-based). The policy will be hosted at `https://withphoebe.app/privacy` and linked from the App Store listing and TestFlight.

Tone: plain-English, warm but precise. Roughly 1,500–2,500 words. Use clear section headings. No legal jargon where plain words work. Include a "Last updated" line with today's date. End with a contact email placeholder: `privacy@withphoebe.app`.

Jurisdictions to cover: US (general), California (CCPA/CPRA), EU/UK (GDPR). Include a standard children's data section stating the app is not directed to children under 13.

## About the app

Phoebe is a spiritual-practice app for small faith communities. Users create and share two core types of content:
- **Practices** (daily/recurring spiritual activities — prayer, listening, fasting, lectio divina, etc.)
- **Traditions / Rituals** (scheduled gatherings — times, locations, intentions, RSVP tracking)

Users belong to small private circles (invite-only). There are no public profiles, no public feeds, no advertising, no tracking across other apps or sites.

The iOS app is a thin Capacitor wrapper around the web app at `withphoebe.app`; both share the same backend.

## Data we collect directly from users

**Account identity (required):**
- Email address
- Full name
- Profile photo (optional; stored as base64 up to 7MB)

**Authentication identifiers (one of):**
- Password (hashed server-side)
- Google OAuth ID + stored Google access/refresh tokens (only if user signs in with Google)
- Apple Sign In identity token + optional name/email (only if user signs in with Apple)

**Preferences:**
- Daily "bell" (reminder) time
- Timezone
- Biometric lock toggle (Face ID re-lock after idle)
- Presence visibility toggle (whether other circle members see when user is active)

**User-generated content:**
- Prayer requests and intentions (text)
- Practices: name, intention, reflection prompts, state, template type, optional long-form text
- Traditions/Rituals: name, description, frequency, intention, location
- Letters / correspondences (full text)
- Notes and reflections
- Calendar event associations (Google Calendar event IDs tied to practices/rituals)

**Optional connected-service data:**
- Apple Music user token (only if user opts in to Apple Music integration for "listening" practices)

## Data collected automatically

- **Session cookies** — httpOnly, Secure, SameSite=None, 30-day expiry; backed by Postgres session store
- **APNs device token** for push notifications (sent to server and stored per device)
- **Presence signals** — real-time WebSocket messages indicating when user is active in the app (user_id, display name, email, avatar URL, joined_at timestamp); visible only to other members of the user's circles when presence is enabled
- **Practice completion logs** — when a user finishes a practice, a log is sent to circle members in real time (moment ID, post ID, display name, email, template type)
- **Prayer streak records** — per-user completion dates
- **Onboarding state flags** — which setup steps the user has completed
- **Login timestamps** via `created_at` fields on session records

We do **not** collect: device location, microphone, device calendar, health data, advertising identifiers, IDFA, or any cross-app/cross-site tracking data.

## iOS permissions and why

- **Contacts** — Only when the user taps "Invite from contacts." Selected names/emails/phones are used to send circle invites. Contact data is not uploaded in bulk and is not stored server-side beyond the invite record itself.
- **Face ID** — Optional device-level re-lock after 5+ minutes of idle. Face ID authentication happens entirely on-device; we never receive biometric data.
- **Camera** — Only when the user chooses to take a new profile photo.
- **Photo Library** — Only when the user chooses an existing photo for their profile.
- **Push Notifications** — Daily bell reminders and circle activity updates. Permission is requested contextually, not on first launch.
- **Local Notifications** — Offline fallback for bell reminders; scheduled on-device.

## Third-party services (subprocessors)

- **Google LLC**
  - Google OAuth 2.0 — for "Sign in with Google" (scopes: email, profile)
  - Google Calendar API — to create and sync calendar invites for practices and rituals (sent from `invites@withphoebe.app`)
  - Gmail API — to deliver calendar invites and administrative emails from `invites@withphoebe.app`
- **Apple Inc.**
  - Sign in with Apple — for native iOS authentication (identity token, optional first-time name/email)
  - Apple Push Notification service (APNs) — for push notifications (no third-party push vendor)
  - Apple Music API — optional; only if user connects Apple Music for listening practices
- **Google Fonts CDN** — for typography (fonts.googleapis.com, fonts.gstatic.com); a request to these domains exposes IP address and user-agent to Google per their standard policy
- **Backend hosting and database** — Postgres database and API server (hosting provider: [FILL IN — e.g., Railway, Fly.io, AWS])

We do **not** use: analytics SDKs, crash reporting SDKs, advertising networks, Mixpanel, PostHog, Google Analytics, Sentry, Firebase, or Stripe. The app is free; there is no payment processing.

## How data is shared

**Within a user's circles:** Other members of a circle can see the user's name, email, avatar, prayer requests, practice content, ritual RSVPs, real-time presence (if enabled), and practice completion events.

**Via invite links:** Practices and letters can be shared via token-based invite links. Anyone holding the link can view the shared content. Links are not publicly indexed.

**No sale of personal data.** No sharing with advertisers. No data brokers.

**Legal disclosure:** We may disclose data if required by law, valid legal process, or to protect the rights and safety of users.

## Storage and transmission

- All traffic uses HTTPS; WebSocket traffic uses WSS in production
- Server-side data is stored in Postgres; at-rest encryption depends on the hosting provider's default disk encryption
- On-device data is stored inside the iOS app sandbox: localStorage within the WKWebView, Capacitor Preferences (iOS UserDefaults), and an App Group container (`group.app.withphoebe.mobile`) for the Home Screen widget (which only reads a small summary: next bell time, next practice name, current lectio prompt)
- Session cookies: httpOnly, Secure, SameSite=None, 30-day maxAge

## Data retention

- Session cookies: 30 days
- User content (practices, rituals, letters, prayer requests, completion logs, streaks): retained indefinitely until the user manually deletes the content or requests account deletion
- Google/Apple OAuth tokens: retained as long as the user's account is active or until revoked

## User rights

Include standard GDPR/CCPA rights language: access, correction, deletion, portability, objection, restriction, and (for California) opt-out of sale/sharing — noting that we do not sell or share data for advertising.

**Honest disclosure to include verbatim:** "Self-service account deletion and data export are not yet available in the app. During this early-access period, you can request deletion or a copy of your data by emailing privacy@withphoebe.app, and we will complete the request within 30 days."

## Children's data

The app is not directed to children under 13. We do not knowingly collect personal data from children under 13. If you believe a child has provided data, contact privacy@withphoebe.app and we will delete it.

## Apple privacy manifest alignment

The policy should be consistent with the app's `PrivacyInfo.xcprivacy`, which declares the following as collected and linked to the user's identity, used only for app functionality (not tracking):
- Email address
- Name
- Device ID (APNs token)
- User-generated content (prayers, intentions, reflections)

The app does **not** track users across other companies' apps or websites.

## Security

Passwords are hashed server-side. OAuth tokens are stored server-side and transmitted only over HTTPS. Apple Sign In flows use nonce-based CSRF protection. Face ID authentication happens on-device; biometric data never leaves the device.

## Changes to this policy

Standard "we may update this policy" clause with notification via in-app notice or email for material changes.

## Contact

`privacy@withphoebe.app` — and the developer's mailing address (to be added by developer).

---

**Important instructions for the policy-writing model:**
1. Do not invent any data types, SDKs, or practices not listed above
2. Where a fact is marked `[FILL IN ...]`, leave a clearly visible placeholder — do not guess
3. Do not claim compliance certifications we do not have (SOC 2, ISO 27001, HIPAA, etc.)
4. Use the exact honest-disclosure sentence in the "User rights" section verbatim
5. Make clear that integration with Google/Apple/Apple Music only applies to users who opt in to those specific flows
