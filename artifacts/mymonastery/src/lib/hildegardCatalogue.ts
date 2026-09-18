// ── Hildegard von Bingen, sung ──────────────────────────────────────────────
//
// Owner, 2026-09-18, with the playlist link: "next to hymns have a catalouge
// that says Hildegard, catalouge theses, but also let them shuffle/play the
// whole thing".
//
// Apple Music's own editorial playlist "Hildegard von Bingen Essentials"
// (pl.e893ebd3cc794203878f3f456b4ced2d, curated by Apple Music Medieval):
// 25 recordings, 2 hours 13 minutes, drawn from nine albums — Sequentia's
// Canticles of Ecstasy and Geistliche Gesaenge, Anonymous 4's 11,000 Virgins,
// Ordo Virtutum, and others.
//
// SAME RULE AS THE HYMNAL — nothing of the work itself is reproduced here.
// Hildegard's chant is nine centuries old and long out of copyright, but the
// RECORDINGS are not, and neither are the editions: so this holds only the
// facts that name a recording (its title, who sings it, which album it is on,
// how long it runs) and a link to where it is already published. No texts, no
// translations, no scores. Phoebe holds no audio.
//
// HOW THIS WAS BUILT (2026-09-18), so it can be redone when Apple re-edits the
// playlist:
//   1. music.apple.com/us/playlist/.../pl.e893... — the page's
//      `<script id="serialized-server-data">` JSON carries the whole track
//      list in one document (no pagination at 25), giving title, performers,
//      composer, album and duration, and the Apple Music CATALOG track id in
//      each item's `id` field after the last " - ".
//   2. itunes.apple.com/lookup?id=<25 ids comma-separated> — public, no key,
//      and BATCHED, which sidesteps the ~1/s rate limit that made the hymnal's
//      Apple pass read 429s as "not on Apple Music". All 25 resolved, and
//      every duration agreed with the playlist page to the second, which is
//      what confirms each link is the same RECORDING and not another choir.
//
// Coverage is Apple-only ON PURPOSE. The hymnal was built from a Spotify
// playlist and matched outwards; this one is an Apple editorial playlist, and
// no equivalent exists on the other services — these are specific recordings
// by Sequentia and Anonymous 4, not a tune anyone can sing. Rather than link a
// listener to a different performance and call it the same track, the page
// offers Spotify and YouTube a SEARCH for the recording, clearly labelled as
// one. See lib/musicService.ts for the service choice this shares with /hymns.

export type HildegardTrack = {
  /** Position in Apple's playlist — the order it is meant to be heard in. */
  n: number;
  /** The recording's title, as the playlist names it. */
  name: string;
  /** Performer(s). */
  artist: string;
  /** The album this recording is drawn from. */
  album: string;
  /** Running time, seconds. */
  seconds: number;
  /** Apple Music catalog track id — what MusicKit needs to play it in-app. */
  appleTrackId: string;
  /** music.apple.com track link (universal: opens the Music app if present). */
  appleUrl: string;
};

/** The playlist itself, for "play the whole thing". */
export const HILDEGARD_PLAYLIST = {
  /** Apple Music catalog playlist id — what PhoebeMusic.playPlaylist takes. */
  id: "pl.e893ebd3cc794203878f3f456b4ced2d",
  name: "Hildegard von Bingen Essentials",
  curator: "Apple Music Medieval",
  url: "https://music.apple.com/us/playlist/hildegard-von-bingen-essentials/pl.e893ebd3cc794203878f3f456b4ced2d",
} as const;

export const HILDEGARD_TRACKS: readonly HildegardTrack[] = [
  { n: 1, name: "O Vis Aeternitatis", artist: "Sequentia, Barbara Thornton & Laurie Monahan", album: "Hildegard Von Bingen - Canticles of Ecstasy", seconds: 477, appleTrackId: "258630584", appleUrl: "https://music.apple.com/us/album/o-vis-aeternitatis/258630580?i=258630584&uo=4" },
  { n: 2, name: "Nunc Aperuit Nobis", artist: "Barbara Thornton, Sequentia, Heather Knutson & Susanne Norin", album: "Hildegard Von Bingen - Canticles of Ecstasy", seconds: 121, appleTrackId: "258630631", appleUrl: "https://music.apple.com/us/album/nunc-aperuit-nobis/258630580?i=258630631&uo=4" },
  { n: 3, name: "Quia Ergo Femina Mortem Instruxit", artist: "Janet Youngdahl, Barbara Thornton & Sequentia", album: "Hildegard Von Bingen - Canticles of Ecstasy", seconds: 109, appleTrackId: "258630838", appleUrl: "https://music.apple.com/us/album/quia-ergo-femina-mortem-instruxit/258630580?i=258630838&uo=4" },
  { n: 4, name: "Instrumental piece", artist: "Sequentia & Margriet Tindemans", album: "Hildegard Von Bingen: Geistliche Gesänge", seconds: 108, appleTrackId: "253966249", appleUrl: "https://music.apple.com/us/album/instrumental-piece/253966238?i=253966249&uo=4" },
  { n: 5, name: "Antiphon \"O quam mirabilis est\"", artist: "Anonymous 4", album: "The Origin of Fire: Music and Visions of Hildegard von Bingen", seconds: 212, appleTrackId: "1789090422", appleUrl: "https://music.apple.com/us/album/antiphon-o-quam-mirabilis-est/1789090410?i=1789090422&uo=4" },
  { n: 6, name: "Sequence \"O ignis spiritus paracliti\"", artist: "Anonymous 4", album: "The Origin of Fire: Music and Visions of Hildegard von Bingen", seconds: 473, appleTrackId: "1789090585", appleUrl: "https://music.apple.com/us/album/sequence-o-ignis-spiritus-paracliti/1789090410?i=1789090585&uo=4" },
  { n: 7, name: "Symphonia virginum: O dulcissime amator", artist: "Anonymous 4", album: "Hildegard von Bingen: 11,000 Virgins - Chants for the Feast of St. Ursula", seconds: 565, appleTrackId: "586078310", appleUrl: "https://music.apple.com/us/album/symphonia-virginum-o-dulcissime-amator/586077828?i=586078310&uo=4" },
  { n: 8, name: "Responsory: Favus distillans", artist: "Anonymous 4", album: "Hildegard von Bingen: 11,000 Virgins - Chants for the Feast of St. Ursula", seconds: 413, appleTrackId: "586078314", appleUrl: "https://music.apple.com/us/album/responsory-favus-distillans/586077828?i=586078314&uo=4" },
  { n: 9, name: "O Magne Pater (Antiphon, Fol. 466)", artist: "Sequentia, Barbara Thornton & Benjamin Bagby", album: "Hildegard Von Bingen: Saints", seconds: 188, appleTrackId: "268528974", appleUrl: "https://music.apple.com/us/album/o-magne-pater-antiphon-fol-466/268528972?i=268528974&uo=4" },
  { n: 10, name: "O Euchari, Columba Virtutem Illius (Responsory, Fol. 475v)", artist: "Sequentia, Barbara Thornton & Benjamin Bagby", album: "Hildegard Von Bingen: Saints", seconds: 369, appleTrackId: "268529995", appleUrl: "https://music.apple.com/us/album/o-euchari-columba-virtutem-illius-responsory-fol-475v/268528972?i=268529995&uo=4" },
  { n: 11, name: "Instrumental piece", artist: "Sequentia & Margriet Tindemans", album: "Hildegard Von Bingen: Geistliche Gesänge", seconds: 298, appleTrackId: "253966256", appleUrl: "https://music.apple.com/us/album/instrumental-piece/253966238?i=253966256&uo=4" },
  { n: 12, name: "Antiphon: Studium divinitatis", artist: "Anonymous 4", album: "Hildegard von Bingen: 11,000 Virgins - Chants for the Feast of St. Ursula", seconds: 72, appleTrackId: "586078316", appleUrl: "https://music.apple.com/us/album/antiphon-studium-divinitatis/586077828?i=586078316&uo=4" },
  { n: 13, name: "Instrumental piece", artist: "Sequentia & Margriet Tindemans", album: "Hildegard Von Bingen: Geistliche Gesänge", seconds: 175, appleTrackId: "253966269", appleUrl: "https://music.apple.com/us/album/instrumental-piece/253966238?i=253966269&uo=4" },
  { n: 14, name: "O Jerusalem", artist: "Sequentia, Maria Jonas, Diane Severson & Allegra Silbiger", album: "Hildegard von Bingen: O Jerusalem", seconds: 626, appleTrackId: "1574151825", appleUrl: "https://music.apple.com/us/album/o-jerusalem/1574151819?i=1574151825&uo=4" },
  { n: 15, name: "Quia felix puericia - Magnificat - Quia felix puericia", artist: "Sequentia, Gundula Anders & Carol Schlaikjer", album: "Hildegard von Bingen: O Jerusalem", seconds: 328, appleTrackId: "1574151829", appleUrl: "https://music.apple.com/us/album/quia-felix-puericia-magnificat-quia-felix-puericia/1574151819?i=1574151829&uo=4" },
  { n: 16, name: "O tu illustrata", artist: "Sequentia", album: "Hildegard von Bingen: O Jerusalem", seconds: 467, appleTrackId: "1574152001", appleUrl: "https://music.apple.com/us/album/o-tu-illustrata/1574151819?i=1574152001&uo=4" },
  { n: 17, name: "O Pulchrae Facies (De Virginibus, Antiphona)", artist: "Sequentia & Barbara Thornton", album: "Hildegard Von Bingen: Geistliche Gesänge", seconds: 232, appleTrackId: "253966243", appleUrl: "https://music.apple.com/us/album/o-pulchrae-facies-de-virginibus-antiphona/253966238?i=253966243&uo=4" },
  { n: 18, name: "O Virga Ac Diadema Purpurae Regis (De Sancta Maria, Sequentia)", artist: "Sequentia & Barbara Thornton", album: "Hildegard Von Bingen: Geistliche Gesänge", seconds: 286, appleTrackId: "253966244", appleUrl: "https://music.apple.com/us/album/o-virga-ac-diadema-purpurae-regis-de-sancta-maria-sequentia/253966238?i=253966244&uo=4" },
  { n: 19, name: "Instrumental piece", artist: "Sequentia, Barbara Thornton & Benjamin Bagby", album: "Hildegard Von Bingen: Saints", seconds: 397, appleTrackId: "268529646", appleUrl: "https://music.apple.com/us/album/instrumental-piece/268528972?i=268529646&uo=4" },
  { n: 20, name: "O splendidissima gemma (Antiphon to Maria) [With canticum: Magnificat anima mea dominum (V fol. 154)]", artist: "Sequentia & Benjamin Bagby", album: "Hildegard von Bingen: Celestial Hierarchy", seconds: 621, appleTrackId: "1574151753", appleUrl: "https://music.apple.com/us/album/o-splendidissima-gemma-antiphon-to-maria-with-canticum/1574151745?i=1574151753&uo=4" },
  { n: 21, name: "O speculum columbe (Antiphon to St. John the Evangelist) [With: Gloria patri (V fol. 161v)]", artist: "Sequentia & Benjamin Bagby", album: "Hildegard von Bingen: Celestial Hierarchy", seconds: 454, appleTrackId: "1574151879", appleUrl: "https://music.apple.com/us/album/o-speculum-columbe-antiphon-to-st-john-the-evangelist/1574151745?i=1574151879&uo=4" },
  { n: 22, name: "Prologue: Qui Sunt Hi, Ut Sub Nubes?", artist: "Sequentia", album: "Hildegard von Bingen: Ordo Virtutum", seconds: 144, appleTrackId: "268530009", appleUrl: "https://music.apple.com/us/album/prologue-qui-sunt-hi-ut-sub-nubes/268530002?i=268530009&uo=4" },
  { n: 23, name: "Processional of Embodied Souls", artist: "Sequentia", album: "Hildegard von Bingen: Ordo Virtutum", seconds: 149, appleTrackId: "268530013", appleUrl: "https://music.apple.com/us/album/processional-of-embodied-souls/268530002?i=268530013&uo=4" },
  { n: 24, name: "Ave Maria, O Auctrix Vite", artist: "Heather Knutson, Barbara Thornton & Sequentia", album: "Voices of Ecstacy", seconds: 537, appleTrackId: "304441682", appleUrl: "https://music.apple.com/us/album/ave-maria-o-auctrix-vite/304441637?i=304441682&uo=4" },
  { n: 25, name: "O Virga Mediatrix", artist: "Laurie Monahan, Sequentia & Barbara Thornton", album: "Voices of Ecstacy", seconds: 145, appleTrackId: "304441727", appleUrl: "https://music.apple.com/us/album/o-virga-mediatrix/304441637?i=304441727&uo=4" },
];
