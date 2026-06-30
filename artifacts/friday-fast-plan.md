# Friday Fast — "fast & give to the Capital Area Food Bank"

> Status: PLAN (greenfield — nothing built yet). Reconstructed 2026-06-29 from the
> June 10 design thread (which lived only as discussion; no code/branch/stash
> survived). This doc exists so the design isn't lost again.

## The idea
A traditional Friday discipline reimagined: pod members **fast on Fridays and give
what they'd have spent** to the **Capital Area Food Bank (CAFB)**. Fasting +
almsgiving, together.

## Design evolution (June 10 thread)
1. **Recurring-charge model** — Stripe + **Every.org** as a giving agent on the
   member's behalf (Every.org is the 501(c)(3) of record and issues tax receipts).
2. **Friday opt-in/opt-out** — the confirmation tap doubles as BOTH the observance
   log AND the giving action.
3. **MVP (where it landed)** — *no payment infrastructure at all*: a Friday push,
   a "Yes, I'm fasting 🌿" tap, and a "Donate Now" link out to CAFB.
4. **Last step in the thread** — set up ONE CAFB **virtual fundraiser page**
   ("Phoebe Friday Fast") so the whole pod's giving pools + is tracked in one place.

## Tiers to build

### Tier 1 — Observance + link-out (the MVP). Buildable now, no money/accounts.
- **Observance log (PRIVATE):** reuse `practice_log_entries` via
  `/api/practice-log/:kind` with a new `kind = "friday-fast"` (add to the `KINDS`
  allowlist in `routes/practice-log.ts`). NOTE: this table is *strictly private by
  design* ("presence, not performance; no peer feed"). So the in-app log is the
  member's own; the **communal dimension is the external CAFB fundraiser page**, not
  an in-app pod feed. (An in-app "N of your pod are fasting" feed would be a separate,
  deliberate departure from the private-practice stance — flagged, not assumed.)
- **Friday push:** new `runFridayFastReminderSender` in `lib/bellSender.ts` +
  helper in `lib/pushSender.ts`, modeled on `runLectioReminderSender` (already fires
  Mon/Wed/Fri local). Fridays, local morning, gated on opt-in. Deep-links to the page.
- **Surface:** a `/friday-fast` page (explanation → "Yes, I'm fasting 🌿" tap logs
  the observance → "Donate Now" opens the CAFB page) + a Practices-menu entry
  (`menu-practices.tsx`). Later: a Friday-gated home card.
- **Receipts:** issued by CAFB / Every.org on THEIR page (donor enters email there).
  The app touches no money.
- **Opt-in flag:** a per-user pref (e.g. `users.friday_fast_opt_in`) gating the push.

### Tier 2 — In-app giving with receipts (the fuller "before" model). Needs accounts + decisions.
- **2a — Every.org Donate Link + webhook (lighter, recommended next):** the tap opens
  an Every.org-hosted CAFB donation (optionally prefilled amount). Every.org emails the
  donor a receipt automatically AND fires a webhook → we store a `friday_fast_donations`
  row (amount, receipt URL, day) and reflect "you gave $X · receipt sent." **No Stripe
  code on our side** (Every.org handles payments). Needs: a free Every.org account +
  webhook signing secret; a webhook endpoint `POST /api/webhooks/everyorg`.
- **2b — Full Stripe recurring + Every.org disbursement (heavier):** in-app saved-card
  recurring charge via Stripe; Every.org disburses to CAFB + supplies receipts. Needs:
  Stripe account + keys, Every.org partner API, PCI/Stripe-Elements, a payments data
  model, webhooks. This is the original "recurring-charge" idea.

## Grounded integration points (verified in code 2026-06-29)
- Log: `api-server/src/routes/practice-log.ts` (generic `/practice-log/:kind`, has a
  `KINDS` allowlist; strictly private).
- Push: `api-server/src/lib/bellSender.ts` (`runLectioReminderSender` Mon/Wed/Fri is the
  template) + `lib/pushSender.ts` helpers; cron-driven, per-user APNs token + opt-in gate.
- Pod: `group_members` + `GET /api/groups/:slug/practices` (if in-app communal view is ever wanted).
- Privacy policy currently states "no Stripe; the app is free; no payment processing" —
  Tier 2 will require updating `artifacts/phoebe-mobile/privacy-policy-prompt.md`
  (add Every.org and/or Stripe as a subprocessor).

## Open decisions (need from product owner)
1. **Which tier to build first?** (Recommend: Tier 1 now → Tier 2a next.)
2. **Communal:** external-only pooling via the CAFB page (recommended, privacy-consistent),
   or an in-app "your pod is fasting too" view (departs from private-practice design)?
3. **CAFB fundraiser URL** — is the "Phoebe Friday Fast" page live? Paste the URL.
4. **Accounts** — do we have an Every.org account and/or Stripe account/keys yet?
