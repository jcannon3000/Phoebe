export type SlideType =
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
  | "lesson"
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
