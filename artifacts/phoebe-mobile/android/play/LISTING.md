# Phoebe on Google Play — closed-testing pack

Everything the Play Console asks for before a closed test can go out, plus the
owner-only steps the agent cannot do (a private signing key, a Google account).
Facts below were checked against the manifest, the built bundle and the source
on 2026-09-16; re-check anything marked *verify* before answering a form.

## 1. The 12-tester rule

A **personal** developer account created after 13 November 2023 must run a
closed test with **at least 12 testers opted in, continuously, for 14 days**
before it may apply for production access. Organisation accounts and older
personal accounts are exempt. Both Google-Group and per-email tester lists
count; testers must **install the app from the opt-in link** (not sideload)
and stay opted in the whole 14 days — a tester who leaves resets nothing for
the others, but the count must never drop below 12 on any day.

Plan: recruit 14–15 Android testers so a drop-out doesn't break the run.

## 2. Owner-only steps (in order)

1. **Upload key (once, never in the repo).** From the repo root:
   ```
   keytool -genkeypair -v -keystore artifacts/phoebe-mobile/android/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
   Then create `artifacts/phoebe-mobile/android/keystore.properties`:
   ```
   storeFile=upload-keystore.jks
   storePassword=<password>
   keyAlias=upload
   keyPassword=<password>
   ```
   Both files are gitignored (`*.jks`, `keystore.properties`). Back them up in
   a password manager. Enrol in **Play App Signing** at first upload so a lost
   upload key can be reset by Google.
2. **Build the signed bundle**: `cd artifacts/phoebe-mobile && pnpm run build && pnpm run cap:sync:android`, then
   `cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew bundleRelease`
   → `android/app/build/outputs/bundle/release/app-release.aab` (about 39 MB).
   Bump `versionCode` in `android/app/build.gradle` by one for every upload.
3. **Play Console → Create app**: name *Phoebe*, app (not game), free,
   package `app.withphoebe.mobile` is fixed by the bundle.
4. **Testing → Closed testing → create a track**, add the tester emails or a
   Google Group, upload the .aab, roll out. Send testers the opt-in URL the
   console shows; the 14 days start when 12 are opted in.
5. **After the first upload**: Setup → App signing → copy the **SHA-256
   certificate fingerprint** of the *app signing key* into Railway as
   `ANDROID_SHA256_CERT_FINGERPRINTS` (comma-separated if several). Until
   then `https://withphoebe.app/.well-known/assetlinks.json` answers with an
   empty list and withphoebe.app links open in the browser, not the app.
6. **Push (optional for the test, needed for release)**: create a Firebase
   project for `app.withphoebe.mobile`, drop `google-services.json` into
   `android/app/`, and set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`,
   `FCM_PRIVATE_KEY` in Railway. Without it the app runs normally — it asks
   before registering and skips push — and daily reminders still arrive as
   local notifications.

## 3. Store listing

- **App name:** Phoebe
- **Short description (80 max):** A quiet daily prayer rhythm — the Daily Office, contemplation, the Examen.
- **Full description:**

  Phoebe helps you keep a daily rhythm of prayer in the Episcopal and Anglican tradition.

  Pray the Daily Office — Morning, Midday and Evening Prayer and Compline from the Book of Common Prayer — as a slideshow you can read, listen to, or mark as prayed from your own book. Sit in silence with a gentle bell. Review the day with the Examen. Meditate on a painting chosen for Sunday's Gospel with Visio Divina. Read Forward Day by Day and other daily reflections in a calm reader.

  Shape your own routine: choose the practices that fit your morning and evening, and Phoebe lays them out as a simple daily list. Keep it as you go, and let the rhythm hold you.

  Use Phoebe without an account, or sign in to keep your rhythm and progress on every device.

- **Category:** Lifestyle. **Tags:** prayer, meditation, Christian.
- **Contact email:** *verify* (the account's support address). **Website:** https://withphoebe.app
- **Privacy policy URL:** https://withphoebe.app/privacy (serves 200).
- **App icon 512×512:** `android/play-store-icon-512.png`.
- **Feature graphic 1024×500:** `android/play/feature-graphic-1024x500.png`.
- **Phone screenshots (1080×2400, at least 2):** `android/play/screenshots/`.

## 4. App content declarations

- **Privacy policy:** the URL above.
- **Ads:** No. There is no ad SDK in the Android build (dependencies are the
  Capacitor plugins listed in `android/app/capacitor.build.gradle` only).
- **App access:** parts of the app need an account — provide a test account
  (any email sign-up works; there is no invite code for the basic app).
- **Content rating (IARC):** no violence, sexual content, profanity, drugs,
  gambling or user-to-user communication in the current build (community
  features are switched off for everyone). Expect *Everyone*.
- **Target audience:** 18 and over (avoids the Families policy; the app is
  not designed for children).
- **News app:** No. **COVID-19 contact tracing:** No.
- **Data safety** — *collected* means sent to withphoebe.app over HTTPS:
  - Personal info → **Email address, Name**: collected, optional (phones can
    use Phoebe without an account), for account management; not shared.
  - Personal info → **User IDs**: collected (an anonymous device user is
    created for phones without an account), for app functionality.
  - **App activity** → other user-generated content and in-app actions:
    collected — practices kept, prayer sessions, gratitude entries — for app
    functionality; not shared.
  - **Device or other IDs**: collected only when push is enabled (an FCM
    token), for notifications. Not collected until Firebase is set up.
  - **Not collected:** location (no location permission on Android),
    contacts (`READ_CONTACTS` is not declared, so the invite-from-contacts
    feature is inert on Android), health data (Health Connect deferred),
    photos, files, financial info, messages.
  - Encrypted in transit: yes (HTTPS only). Deletion: users can delete their
    account and data in Settings → Account, and a JSON export is offered.
- **Permissions in the bundle** (from `aapt2 dump badging`): INTERNET,
  POST_NOTIFICATIONS, VIBRATE, RECEIVE_BOOT_COMPLETED, WAKE_LOCK,
  ACCESS_NETWORK_STATE, USE_BIOMETRIC, USE_FINGERPRINT,
  com.google.android.c2dm.permission.RECEIVE. None needs a permissions
  declaration form.

## 5. What testers should know

- The app runs without Firebase: reminders are local notifications; there is
  no server push yet.
- Sign in with Apple is iOS-only; testers sign in with email or Google.
- withphoebe.app links open in the browser until step 5 above is done.
- The in-app reader is the same as iOS's: Phoebe's reader view on the
  publisher pages it dresses (oremus, SSJE, Nouwen, Day by Day, Sojourners,
  The Living Church) with a Standard/Reader toggle, Previous issues and aA.
  On Android aA scales the whole page (WebView text zoom) rather than the
  reading text alone.
- Known gaps: the Home Screen widget and the app badge are iOS-only.
