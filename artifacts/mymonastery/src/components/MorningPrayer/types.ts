export type SlideType =
  // Intro / threshold slide shown before the office or devotion
  // begins — names the liturgy and the tradition it belongs to.
  | "office_intro"
  | "opening"
  | "opening_sentence"
  | "confession"
  | "absolution"
  | "invitatory"
  | "invitatory_psalm"
  // Title-only slide that introduces the psalm — big "Psalm 23"
  // headline, mirrors the intercessions_portal layout. The verses
  // follow on subsequent slides (4 verses each).
  | "psalm_title"
  | "psalm"
  // Doxology slide that seals the psalm — the Gloria Patri lives on
  // its own slide after the verse chunks rather than tacked onto the
  // last verse. Same eyebrow / breadcrumb as the verse slides.
  | "psalm_gloria"
  | "lesson"
  // Title slide for a lesson — big reference headline ("Romans 14:1-12")
  // + appointed-for subtitle, mirroring psalm_title. Followed by
  // lesson_verses chunks when local Bible data has the passage.
  | "lesson_title"
  // Chunked numbered-verse slide for a lesson, matching the psalm
  // verse layout. metadata.verses carries Array<{chapter, verse, text}>.
  | "lesson_verses"
  // Title-only slide for canticles longer than 4 verses — same big
  // headline pattern as psalm_title.
  | "canticle_title"
  | "canticle"
  | "creed"
  | "lords_prayer"
  | "suffrages"
  | "collect"
  | "prayer_for_mission"
  // Per-item intercession slide produced by buildIntercessionSlides
  // (one slide per request / prayers-for / circle intention / feed
  // entry). The renderer detects this type to render the prayer-mode-
  // style centered avatar + name + eyebrow + italic body, instead of
  // the default left-aligned missal layout.
  | "intercessions"
  // Marker slide that signals "hand off to /prayer-mode here." The
  // office viewer detects this type, navigates to /prayer-mode with
  // a returnTo, and treats the slide as transparent for back/next
  // navigation thereafter.
  | "intercessions_portal"
  | "general_thanksgiving"
  // Optional personal-thanksgiving prompt, spliced in client-side
  // before the closing when the "include gratitude slide" office
  // pref is on. Not produced by the server's assembleMorningPrayer
  // — see MorningPrayerSlideshow's slide-list assembly. Reflective
  // rather than interactive: prompts the user to name what they're
  // grateful for and tap Continue. The dedicated /gratitude surface
  // remains the place for actual journal entries.
  | "personal_thanksgiving"
  // Forward Day by Day audio meditation. Produced by the server and
  // injected after the second canticle (before the Creed) — the
  // homily/meditation position in the BCP rubric. metadata carries
  // { audioUrl, durationSeconds, publishedAt }. Same for all users;
  // injected fresh on every office request so the 05:00 ET FDD
  // publish reaches users without a cache rebuild.
  | "fdd_meditation"
  // The salutation before the Lord's Prayer ("The Lord be with you. /
  // And also with you. / Let us pray.") — spliced in CLIENT-side when
  // Settings → Praying the office is set to "Together" (the exchange the
  // BCP appoints for group use, omitted when praying alone). Not produced
  // by the server assemblers.
  | "salutation"
  // The Officiant's invitation to the Confession ("Let us confess our sins
  // against God and our neighbor.") — spliced in CLIENT-side before the
  // Confession when Settings → Praying the office is "Together". The BCP has
  // the Officiant bid the confession; Phoebe omits it when praying alone. Not
  // produced by the server assemblers.
  | "confession_invitation"
  | "closing";

export interface CallAndResponseLine {
  speaker: "officiant" | "people" | "both";
  text: string;
}

export interface Slide {
  id: string;
  type: SlideType;
  emoji: string;
  eyebrow: string;
  title: string | null;
  content: string;
  isCallAndResponse: boolean;
  callAndResponseLines: CallAndResponseLine[] | null;
  bcpReference: string | null;
  isScrollable: boolean;
  scrollHint: string | null;
  metadata: Record<string, unknown>;
}

export interface OfficeDayInfo {
  season: string;
  liturgicalYear: number;
  sundayLabel: string;
  weekdayLabel: string;
  properNumber: number | null;
  feastName: string | null;
  isMajorFeast: boolean;
  useAlleluia: boolean;
  totalSlides: number;
}

export interface MemberPresence {
  name: string;
  email: string;
  loggedAt: string | null;
}
