# Phoebe Design System (extracted from canonical surfaces)

> Match these tokens for any new UI so it reads as native Phoebe — calm, on-palette (NO yellow), one-thing-at-a-time.


## Principles

- One calm column. Single centered column (max ~560–640px), one thing at a time — a titled page with optional back link and stacked card groups. Never a dense dashboard.
- 'A forest chapel at dusk.' Deep forest-green base (#091A10), warm off-white text (#F0EDE6), muted sage secondary (#8FAF96). Surfaces are translucent green washes over the page, not opaque plastic cards — depth comes from layered greens + 1px borders, not heavy shadows.
- NO yellow, ever. Warmth is terracotta (#C47A65) or a restrained amber-brown (#E8B45E / #C17F24) used only for streaks/traditions/error accents. Gratitude and steps were deliberately moved off yellow to green/blue.
- Borders over shadows. Hairline green borders define everything; box-shadows are reserved for subtle 'breathing' glows, focus rings, and sheet lift.
- Contemplative, unhurried motion. Pulses breathe over 2–5s with low contrast and ease-in-out — candlelight, not alerts; reduced-motion honored.
- Two fonts, two jobs. Space Grotesk (tight letter-spacing) for ALL UI/structure; italic Georgia exclusively for prayer/contemplative body text (entries, prayers, intentions). Never mix.
- Quiet, reverent copy and labels. Uppercase letter-spaced eyebrows (.section-header) mark sections like hours of the Daily Office; primary buttons are 'a quiet invitation, not a demand.'
- Companionship, not surveillance. Social surfaces reveal only today (first 3 shared dots, no totals/times/history); encouragement is one warm tap.
- Gentle, generous tap feedback. Everything interactive scales to 0.97 on press; native iOS tap-highlight suppressed in favor of the app's own feedback.
- Native-first, safe-area-aware. var(--top-chrome) and env(safe-area-inset-bottom) are baked into headers, drawers, sheets and overlays so content clears the notch / Dynamic Island and home indicator on edge-to-edge iOS.
- Consistency by convention, not abstraction: the same const block (WARM/SAGE/FONT/CARD_BG/CARD_B + the rgba(46,107,64,...) green family) is re-declared in each component, and the bottom-sheet shell (spring, #0C2417, radius 24, grabber, rgba(6,18,11,0.6) scrim) is copied verbatim across WalkPartnerSheet and FellowSettingsSheet — match those exact values to look native.

## Palette

- Page background (deepest): #091A10 — the forest-at-dusk base; set on html, body, #root, Layout root, and every full-screen header. HSL var: --background: 145 49% 7%.
- Drawer/darkest surface: #040D06 — slide-out side drawers (DrawerMenu, WayOfLoveDrawer) only.
- Card surface base: #0F2818 (HSL --card: 141 45% 11%). In practice almost every card uses a translucent GREEN WASH over the page instead: background rgba(46,107,64,0.08–0.12).
- Bottom-sheet surface: #0C2417 (WalkPartnerSheet, FellowSettingsSheet). FddJournalSheet uses its own BG const; full-screen overlays use #0C1F12, closing/arrived panels #11291C.
- Primary text (warm off-white): #F0EDE6 — WARM. const everywhere. HSL --foreground: 42 25% 92%.
- Slightly warmer body text inside italic Georgia bodies: #E8E4D8.
- Secondary text (muted sage): #8FAF96 — SAGE. const everywhere. HSL --muted-foreground.
- Faint sage (labels, hints, chevrons): rgba(143,175,150,0.4–0.7); section-eyebrow color rgba(143,175,150,0.5–0.55).
- Interactive accent (sage): #C8D4C0 — used for pill text, ghost-button text, secondary links. HSL --accent: 96 19% 79%.
- Brighter sage link/affirmation: #A8C5A0 — 'sent' confirmations, create-one links, avatar initials.
- Active/primary button green: #2D5E3F — btn-sage, primary submit. HSL --primary: 142 35% 27%.
- Green wash family (THE workhorse): card bg rgba(46,107,64,0.08–0.12); card border rgba(46,107,64,0.18–0.3); solid pill bg rgba(46,107,64,0.85); pill border rgba(46,107,64,0.6).
- Live/'done' dot + kept green: rgba(110,180,130,0.95) (DOT_ON); brighter mint pulse target rgba(176,230,150,1) and #6FAF85 'something new' dot.
- Prayer/warmth terracotta (errors, prayer accent): #C47A65 (HSL --destructive: 13 45% 58%); softer error text #E0A87E / #E8B872.
- Amber/traditions accent (USE SPARINGLY, never yellow): streak fire #E8B45E, community badge bg #C58A2A on #1A1208 text, traditions amber #C17F24. Gratitude 'new' dot #D98C4A. Avatar fallback bg #1A4A2E with #A8C5A0 initials.
- Backdrop scrim: rgba(6,18,11,0.6) (sheets) or rgba(0,0,0,0.55) (FddJournalSheet) + backdropFilter blur(2px).
- NO yellow anywhere — warmth is always terracotta/amber-brown or green/blue; gratitude/steps cards were explicitly migrated off yellow to green/blue (task #78).

## Typography

- Sans family: 'Space Grotesk', system-ui, sans-serif — declared as const FONT / SPACE_GROTESK in every component; CSS var --app-font-sans / --font-sans. Variable weight 300–700, loaded via @fontsource-variable with an alias @font-face so the unsuffixed name resolves. This is the default body/UI font.
- Serif family: Georgia, 'Times New Roman', serif (--app-font-serif). System Georgia by design (NOT Playfair). Used ONLY for prayer/contemplative body text — always italic: gratitude entries, Heart-to-Heart composer body, intentions, prayer-request bodies, 'before you go' prompts.
- Wordmark 'Phoebe': fontSize 2.0625rem (33px), font-bold, letterSpacing -0.03em, Space Grotesk, #F0EDE6.
- Page H1 (MenuHub): 30px / weight 800 / letterSpacing -0.02em. Page H1 (gratitude): text-xl (20px) / bold. Sheet name title: 18px / 600. Section sub-header (FellowsConnect h3): 15px / 600.
- Card/row title: 15–16px / weight 600–700 (font-medium 500 for list-row names). MenuHub item label 16px/700; fellow row name 15px/500.
- Body / control text: 13–15px. Pills 12.5–13px / 600. Tab labels 13px / 600.
- Eyebrow / section header (THE signature label): fontSize 10–11px, fontWeight 600–700, textTransform uppercase, letterSpacing 0.14–0.18em, color faint sage rgba(143,175,150,0.5–0.55). Codified as .section-header (0.7rem, 0.15em). Always sentence/Title-from-i18n, rendered uppercase via CSS.
- Italic Georgia prayer body sizes: 15px (entries) up to 21–26px (composer/overlay prompts), lineHeight 1.4–1.55.
- Headings get font-semibold + tracking-tight globally (h1–h6 in @layer base). Letter-spacing -0.01em to -0.03em on Space Grotesk titles is the house tightening.
- Two practical weights dominate: 500 (medium, names/body) and 600–700 (semibold/bold, titles, pills, eyebrows). 800 reserved for the big page H1.

## Shapes

- Radius scale (CSS --radius: 1rem base): sm = calc(r-4px)=12px, md = calc(r-2px)=14px, lg = 1rem=16px, xl = calc(r+4px)=20px. But components hard-code px radii directly far more than the scale.
- Cards / list rows: borderRadius 16 (MenuHub items) or rounded-2xl=16px (fellow rows, gratitude cards, stat tiles). This is the default card shape.
- Inner/menu rows inside drawers: rounded-xl = 12px.
- Pills / chips / tabs / dots / avatars: fully round — borderRadius 999 or rounded-full. Tap pills px-3.5 py-1.5.
- Bottom sheets: borderTopLeftRadius / borderTopRightRadius 24 (Walk/FellowSettings) or 20 (FddJournal); flat bottom (borderBottom: none).
- Borders are the primary surface-definition device (shadows are rare on cards). Standard card border: 1px solid rgba(46,107,64,0.18–0.3). Solid-pill border rgba(46,107,64,0.6). Ghost/secondary control border rgba(46,107,64,0.4). Hairline dividers: 1px solid rgba(46,107,64,0.15) or rgba(200,212,192,0.15) (1px-height flex rule). Dashed empty-state border: 1px dashed rgba(46,107,64,0.2). Focus/'alive' borders pulse between low and high alpha of the same green (see motion).
- Background fill convention: translucent green wash over the page (rgba(46,107,64,0.08–0.12)) rather than an opaque card color — gives the 'parchment over forest' depth. Active/selected states bump the same wash to 0.22–0.25 and lighten the border (e.g. rgba(168,197,160,0.7)).
- Inputs/textarea fill: dark rgba(15,40,24,0.6) or rgba(9,26,16,0.45) with green border + inset shadow; rounded-2xl or rounded-full (search).
- Sheet grabber handle: a centered pill 36–38px wide × 4px tall, borderRadius 999/2, background rgba(143,175,150,0.3–0.4), margin 0 auto 14–16px.

## Components

- CARD (tappable list item, MenuHub): <button> flex, align-center, gap 14, textAlign left, background rgba(46,107,64,0.10), border 1px solid rgba(46,107,64,0.22), borderRadius 16, padding 16px 18px. Layout: 24px emoji (w:28 centered) · flex-1 {16px/700 label + optional 9.5px uppercase badge pill + 13px sage sub} · optional 9px green 'new' dot with 3px glow ring · chevron '›' 22px in rgba(143,175,150,0.4). hover:opacity-90. onClick plays playOpeningSwell(2).
- LIST ROW (FellowsConnect): div flex align-center gap-3, rounded-2xl, px-4 py-3, mb-2, background rgba(46,107,64,0.12), border 1px solid rgba(46,107,64,0.3). Layout: Avatar(40) · flex-1 truncate {15px/500 name + optional second line: dots + 12px sage status} · right cluster gap-2.5 {streak '🔥 N' in #E8B45E, action Pill, 30×30 round icon button}.
- AVATAR: img rounded-full object-cover with 1px rgba(46,107,64,0.3) border; fallback = round div bg #1A4A2E, color #A8C5A0, font-semibold, initials (first letters of up to 2 words), fontSize = size*0.32. Default sizes 40 (rows), 48 (sheet), 12×12 (drawer profile).
- PILL / button (FellowsConnect Pill, 3 kinds): rounded-full, text-[12.5px] font-semibold, px-3.5 py-1.5, active:scale-[0.97]. solid = bg rgba(46,107,64,0.85)/text WARM/border rgba(46,107,64,0.6); ghost = bg rgba(200,212,192,0.08)/text #C8D4C0/border rgba(46,107,64,0.4); muted (disabled state) = transparent bg/text rgba(182,210,188,0.5)/border rgba(143,175,150,0.22). Disabled → opacity 0.6.
- PRIMARY BUTTON: full-width, bg #2D5E3F (or rgba(46,107,64,0.85–0.92)), color WARM, border 1px rgba(46,107,64,0.6–0.7), rounded-xl/full, py-3 to py-3.5, font-semibold, active:scale-[0.99]. Disabled → bg rgba(46,107,64,0.18), text rgba(143,175,150,0.5), border rgba(46,107,64,0.3), opacity 0.4. The .btn-sage variant adds a slow 4s breathing box-shadow pulse (rgba(45,94,63,...)).
- SECONDARY / GHOST BUTTON: transparent or rgba(200,212,192,0.08) bg, #A8C5A0 or #C8D4C0 text, often borderless; 'Open your … →', 'Find from contacts'.
- BOTTOM SHEET (canonical — WalkPartnerSheet ≡ FellowSettingsSheet, AnimatePresence): (1) backdrop motion.div initial/animate/exit opacity 0↔1, position fixed inset 0, background rgba(6,18,11,0.6), zIndex 60, backdropFilter blur(2px), onClick=onClose. (2) panel motion.div initial y:'100%' → animate y:0 → exit y:'100%', transition {type:'spring', damping:32, stiffness:320}, position fixed left/right/bottom 0, zIndex 61, background #0C2417, borderTopLeftRadius/Right 24, border 1px solid rgba(46,107,64,0.4) with borderBottom none, padding '10px 20px calc(env(safe-area-inset-bottom) + 22px)', maxHeight 86vh, overflowY auto. (3) grabber pill 38×4 rgba(143,175,150,0.4) centered, margin 0 auto 16px. (4) header row Avatar(48) + name 18px/600 + sage status line. FddJournalSheet is the flex-end-centered variant: scrim rgba(0,0,0,0.55), align-items flex-end, inner maxWidth 560, radius 20, boxShadow 0 -12px 40px rgba(0,0,0,0.45).
- FULL-SCREEN OVERLAY (GratitudeNudge / Heart-to-Heart composer): AnimatePresence motion.div opacity fade (duration 0.25), fixed inset-0, flex-col centered, background #0C1F12 (or a radial-gradient dusk for the composer), paddingTop calc(var(--safe-top) + 12–24px), paddingBottom calc(env(safe-area-inset-bottom) + 16–24px). Close = 36×36 round button top-right, bg rgba(46,107,64,0.18), border rgba(46,107,64,0.35), color #C8D4C0, '×' 18px. Inner column maxWidth 420.
- TABS (gratitude): rounded-full px-4 py-2, font-[13px]/600. active = bg rgba(46,107,64,0.25), border rgba(46,107,64,0.5), text WARM; inactive = bg rgba(46,107,64,0.08), border rgba(46,107,64,0.2), text SAGE. Optional 7px round 'new' dot (#D98C4A) trailing the label.
- SEGMENTED TOGGLE (private/public): inline-flex rounded-full p-0.5, container bg rgba(15,40,24,0.6) + border rgba(46,107,64,0.4). Each segment rounded-full px-3 py-1 text-[12px]/600; selected = bg rgba(46,107,64,0.85)/WARM, unselected = transparent/rgba(143,175,150,0.7). Labels carry an emoji (🔒 Private / 🌿 Public).
- STAT TILE: flex-1 rounded-2xl px-4 py-5 text-center, bg rgba(46,107,64,0.10), border rgba(46,107,64,0.22); value 22px/600 WARM over 11px sage label. Used in 2-up rows.
- CHECK/DONE MARKER: 18–20px round, when done bg #A8C5A0 or DOT_ON with #0C1F12 '✓' (12px/700–800); when undone transparent with 1–1.5px rgba(143,175,150,0.4–0.5) border. Undone cards drop to opacity 0.55 and use a faint border.
- RHYTHM DOTS: 11px round (shared) / 5–6px (pill). done = bg rgba(110,180,130,0.95), no border; undone = transparent + 1–1.5px solid rgba(143,175,150,0.5–0.55). Only first 3 shared.
- HEADER PILL (DailyProgress / Menu): inline-flex rounded-full px-3 py-1.5 text-xs/600, bg rgba(200,212,192,0.08), color #C8D4C0, border 1px rgba(46,107,64,0.3), letterSpacing -0.01em. COUNT BADGE: round, bg #E8B45E / #C58A2A, dark text, fontSize 10–11/700, minWidth 16–18.
- DRAWER (side menu): motion.div initial x:'100%' → 0 → exit x:'100%', transition {type:'tween', duration 0.25, ease easeOut}, fixed top/right/bottom 0, width min(340px,90vw), bg #040D06, borderLeft 1px rgba(46,107,64,0.18). Sections divided by 1px rgba(46,107,64,0.15) borders; rows rounded-xl px-3 py-2 with hover bg rgba(200,212,192,0.06).

## Motion

- Library: framer-motion (motion + AnimatePresence) for every overlay/sheet/drawer.
- Bottom sheet panel: SPRING — transition {type:'spring', damping:32, stiffness:320}; enter y:'100%'→0, exit 0→y:'100%'. This is THE canonical sheet motion.
- Side drawers: TWEEN — {type:'tween', duration:0.25, ease:'easeOut'}; x:'100%'↔0.
- Backdrops & full-screen overlays: opacity TWEEN, duration 0.25 (overlay) / unspecified default (sheet backdrop). Always wrapped in AnimatePresence so exit animates.
- Page content mount (Layout main): opacity 0→1, y 10→0, duration 0.5, custom ease [0.22, 1, 0.36, 1].
- Press feedback (global): every button/a/[role=button]/.tap-shrink transitions transform 0.12s ease-out and scales to 0.97 on :active (disabled buttons exempt); -webkit-tap-highlight-color transparent. Components also add active:scale-[0.97]–[0.99] inline.
- Signature 'breathing' pulses — all slow (1.7s–5s), ease-in-out, infinite, calm not throbbing: card-breathe (5s box-shadow), btn-pulse (4s, btn-sage), input-pulse / turn-pulse (2.5–3s border glow), glow-breathe (4s green shadow), avatar-breathe (5s), feast-ticker (14s), prayer-avatar-pulse (2.4s ring), intercession-breathe (3.4s scale+opacity loader), title-glow (3.6s text-shadow halo).
- Daily-progress dot pulse: dp-dot-pulse 1.7s color-only pulse to brighter mint (NO scale); staggered animationDelay (i*0.12s) when the whole day is kept. dp-card-pulse 1.7s green border+glow on fresh completion.
- Category-specific border/bar pulses exist (letters=olive, practices=forest, gatherings=green) all ~2–2.6s ease-in-out, low→high alpha of the SAME hue.
- Every pulse/animation respects @media (prefers-reduced-motion: reduce) where defined (dp-dot, dp-card).
- Float/entrance helpers: float 4s, office-enter / garden-toast-enter (fade-up translateY 10–12px→0). Staggered list rows via variants (rowV) in recap.
- House feel: motion is unhurried and 'breathing' — long periods, gentle ease-in-out, low-contrast amplitude. Nothing snappy or attention-grabbing; pulses read as candlelight, not notifications.

## Spacing

- Page wrapper: max-width — MenuHub uses maxWidth 640; pages use Tailwind max-w-xl (576px) / max-w-7xl on the Layout <main>; sheets cap inner maxWidth 420–560. All centered with margin 0 auto / mx-auto, width 100%.
- Layout main: pt-2 pb-12 px-4 sm:px-6 md:px-8, max-w-7xl mx-auto. Header px-4 sm:px-6 md:px-8 pb-2 md:pb-5, sticky top-0 z-10.
- Vertical rhythm between card groups: gap 22 (MenuHub groups), gap 10 within a group; gratitude uses mb-5/mb-6 between blocks, space-y-2 between cards.
- Card internal padding: 16px 18px (MenuHub), px-4 py-3 (rows), p-3/p-4 (composer/search containers), px-4 py-5 (stat tiles). Drawer rows px-3 py-2 / px-3.5 py-3.
- Component-internal gaps: gap 14 (card emoji↔text), gap-3 / gap-3.5 (avatar↔text), gap-2 / gap-2.5 (right-side action clusters), gap 6 (dots), gap-1.5 (tab label↔dot).
- Row spacing in lists: mb-2 between rows; sections separated by mt-6 + a hairline rule (sectionHeader pattern: 15px title + flex-1 1px line).
- Eyebrow→content gap: mb-1.5 to mb-3; subtitle→groups: mb-20px.
- SAFE AREA is first-class. Top chrome uses var(--top-chrome) = calc(max(0.5rem, env(safe-area-inset-top)) + 4px) — THE single knob for header/drawer top padding; full-screen overlays use calc(var(--safe-top) + 12–24px). Bottom of sheets/overlays always pads calc(env(safe-area-inset-bottom) + 16–22px) or max(18px, env(safe-area-inset-bottom)). WebView is edge-to-edge under a transparent status bar.
- overflow-x: clip on body (not hidden, so sticky headers still stick); .no-scrollbar utility hides scrollbars on horizontal strips.