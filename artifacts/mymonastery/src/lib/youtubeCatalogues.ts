// ── Music on YouTube, played inside Phoebe ──────────────────────────────────
//
// Owner, 2026-09-18: "could we also do Hildegard as well as youtube pages" (with
// Spotify's "This Is Hildegard von Bingen", 37i9dQZF1DZ06evO1sh2c3) and "Try
// to find Mary Lou's Mass on YouTube and make that a third pill". Each track
// plays on the /video page (pages/video-watch) exactly as a hymn does.
//
// WHAT IS HELD: a track's title, its performers, its length, and the id of a
// YouTube upload of THE SAME RECORDING. No audio, no texts. A track with no
// youtubeId is shown dimmed as "Not on YouTube", never linked to a different
// performance.
//
// HOW THE IDS WERE FOUND (2026-09-18), the hymnal's rule: youtube.com/results
// searched from inside a Browser-pane tab already on youtube.com (a scripted
// fetch from outside meets a consent loop), ytInitialData parsed, and a hit
// kept only when (1) its channel names a CREDITED performer, either the
// artist's own channel or YouTube's auto-generated "<name> - Topic" release
// channel, (2) its title carries the track title's words, and (3) its length
// is within 3 seconds. Length alone is never evidence.
//   - Hildegard: 30 of 39 (tracks from open.spotify.com/embed/playlist/…
//     __NEXT_DATA__). The misses are Oxford Camerata's O Euchari and O virga
//     ac diadema, Joseph Wicks, Tapestry, Klaus Reimann, Samuel Jones, and
//     three of Vox Animae's five Ordo Virtutum parts.
//   - Taizé Songs: all 12 of the community's "Taizé Music" playlist, every one
//     on Taizé's OWN channel (UC7eh2w-pOp8u8nf7afQbNgQ, author "Taizé"), so
//     the channel check is the strongest it gets and no length matching was
//     needed. Titles are cleaned for the row — the 🎶, the leading "Taizé -/|/"
//     and the "New Songs 2020 (Acoustic)" series prefix come off, each
//     language keeping its own spelling — and what was stripped is kept in the
//     artist line where it says something ("New Songs 2020 (Acoustic)"). Two
//     are not single chants and say so: "Songs in Arabic" runs an hour, and
//     "Instrumental 4" is the New CD's untitled fourth track — BOTH hidden at
//     the owner's word (2026-09-19), leaving ten single chants.
//   - Mary Lou's Mass: 24 of 24, every track the official "Mary Lou
//     Williams - Topic" upload of the Smithsonian Folkways album (tracks from
//     itunes.apple.com/lookup?id=160593555&entity=song).

export type YouTubeTrack = {
  n: number;
  title: string;
  /** Performers (the composer left out where she is also the subject). */
  artist: string;
  seconds: number;
  /** The same recording on YouTube, or null when none could be proved. */
  youtubeId: string | null;
  /**
   * Kept in the catalogue but NOT LISTED — the owner asked for it out, and a
   * record of what was here is worth more than a silent deletion, so it can
   * come back by deleting one word. The reason belongs on the row.
   */
  hidden?: true;
};

export type YouTubeCatalogue = {
  /** The route this catalogue lives at. */
  path: string;
  eyebrow: string;
  title: string;
  blurb: string;
  /** Shown above each track's title on the /video page. */
  videoEyebrow: string;
  /** A line for the browse sheet — what this catalogue IS, in a few words. */
  browse: string;
  /**
   * A note at the TOP of the catalogue's own page, and nowhere else — a line
   * about why this music, in the voice of whoever said it. No catalogue
   * carries one today (the one that did, Sakamoto, was taken out 2026-09-23);
   * the field and its rendering stay for the next one that wants it.
   */
  note?: string;
  tracks: readonly YouTubeTrack[];
};

export const HILDEGARD_YOUTUBE: YouTubeCatalogue = {
  path: "/hildegard",
  eyebrow: "Hildegard",
  title: "Hildegard von Bingen",
  blurb: "Her chants, sung by many voices. Tap one to hear it here.",
  browse: "Chants of Hildegard von Bingen",
  videoEyebrow: "Hildegard von Bingen",
  tracks: [
  {"n": 1, "title": "Ave generosa", "artist": "Oxford Camerata, Jeremy Summerly", "seconds": 392, "youtubeId": "zgtLcTrZNJE"},
  {"n": 2, "title": "Alleluia O Virga Mediatrix", "artist": "Ensemble la Sportelle, Owain Park, Marie-Josée Matar", "seconds": 191, "youtubeId": "_0y2SNNaZew"},
  {"n": 3, "title": "Deus enim (Antifona con note lunghe)", "artist": "Tiziana Fumagalli", "seconds": 54, "youtubeId": "HDJACfaUkrA"},
  {"n": 4, "title": "O frondens virga (As Breaks The Dawn)", "artist": "Esin Yardimli Alves Pereira", "seconds": 178, "youtubeId": "8kV2G7hhC7M"},
  {"n": 5, "title": "O Euchari in leta via", "artist": "Oxford Camerata, Jeremy Summerly", "seconds": 534, "youtubeId": null},
  {"n": 6, "title": "O Magne Pater", "artist": "Dominik Johnson, Daniela Kosinova", "seconds": 199, "youtubeId": "wA7-GleLPts"},
  {"n": 7, "title": "O Ecclesia, BN 64", "artist": "The Gesualdo Six, Owain Park", "seconds": 85, "youtubeId": "SBf1lOhaFuQ"},
  {"n": 8, "title": "O pastor animarum (Antifona)", "artist": "Tiziana Fumagalli", "seconds": 91, "youtubeId": "8hNjTEcKGSQ"},
  {"n": 9, "title": "Laus Trinitate: Laus Trinitati", "artist": "Oxford Camerata, Jeremy Summerly", "seconds": 90, "youtubeId": "u1IxfbzsUfg"},
  {"n": 10, "title": "Lydian (Arr. R. Smedvig)", "artist": "Rolf Smedvig, Empire Brass", "seconds": 71, "youtubeId": "944qdiOmpTo"},
  {"n": 11, "title": "O Jerusalem, BN 49", "artist": "Emma Kirkby, Gothic Voices, Christopher Page, Doreen Muskett", "seconds": 482, "youtubeId": "jThMFXT6QlM"},
  {"n": 12, "title": "De virginibus (Antifona)", "artist": "Tiziana Fumagalli", "seconds": 186, "youtubeId": "MdRYFmy7P6I"},
  {"n": 13, "title": "O ignis Spiritus Paraclitus", "artist": "Oxford Camerata, Jeremy Summerly", "seconds": 354, "youtubeId": "3hp6vSX-BQ4"},
  {"n": 14, "title": "Ave Generosa: Antiphona I - Arr. Chamber Ensemble", "artist": "Varanus Ensemble", "seconds": 196, "youtubeId": "tSMBZE6I0rs"},
  {"n": 15, "title": "Ave generosa, BN 17", "artist": "Margaret Philpot, Gothic Voices, Christopher Page", "seconds": 277, "youtubeId": "uvemh8JC0Gc"},
  {"n": 16, "title": "In matutinis laudibus (Antifona)", "artist": "Tiziana Fumagalli", "seconds": 63, "youtubeId": "oE8l5xSUwRw"},
  {"n": 17, "title": "O virga ac diadema", "artist": "Oxford Camerata, Jeremy Summerly", "seconds": 475, "youtubeId": null},
  {"n": 18, "title": "O gloriosissimi lux", "artist": "Joseph Wicks", "seconds": 129, "youtubeId": null},
  {"n": 19, "title": "O viridissima virga, BN 19", "artist": "Gothic Voices, Christopher Page, Doreen Muskett", "seconds": 194, "youtubeId": "Fqs0BOoKkIU"},
  {"n": 20, "title": "Sed diabolus (Antifona con note lunghe)", "artist": "Tiziana Fumagalli", "seconds": 52, "youtubeId": "Cpn-wIE0Ho0"},
  {"n": 21, "title": "Kyrie eleison", "artist": "Oxford Camerata, Jeremy Summerly", "seconds": 272, "youtubeId": "QbLAk_RViC4"},
  {"n": 22, "title": "O lucidissima", "artist": "Laurie Monahan, Tapestry", "seconds": 347, "youtubeId": null},
  {"n": 23, "title": "O presul vere civitatis, BN 45", "artist": "Margaret Philpot, Gothic Voices, Christopher Page", "seconds": 372, "youtubeId": "J45mU21YvHg"},
  {"n": 24, "title": "In Evangelium (Antifona)", "artist": "Tiziana Fumagalli", "seconds": 100, "youtubeId": "G80Q8B5lmeg"},
  {"n": 25, "title": "O Jerusalem, BN 49", "artist": "Christopher Page, Gothic Voices", "seconds": 573, "youtubeId": "YXwkmL_PJ6o"},
  {"n": 26, "title": "Ave Generosa: Sequentia et Antifona II - Arr. Chamber Ensemble", "artist": "Varanus Ensemble", "seconds": 298, "youtubeId": "l3Or_2oB3k8"},
  {"n": 27, "title": "Columba aspexit, BN 54", "artist": "Emma Kirkby, Gothic Voices, Christopher Page, Doreen Muskett", "seconds": 319, "youtubeId": "puAOTgq3Wkc"},
  {"n": 28, "title": "Spiritus sanctus vivificans vita, BN 24 - Version 1", "artist": "Carolin Widmann", "seconds": 169, "youtubeId": "rJzGvztFByc"},
  {"n": 29, "title": "Ordo Virtutum, Pt. III", "artist": "Vox Animae", "seconds": 715, "youtubeId": null},
  {"n": 30, "title": "Spiritual Dance (Arr. R. Smedvig)", "artist": "Rolf Smedvig, Empire Brass", "seconds": 234, "youtubeId": "XTaoKzeQ8v8"},
  {"n": 31, "title": "O ignis spiritus, BN 28", "artist": "Gothic Voices, Christopher Page", "seconds": 288, "youtubeId": "jgIvbV8B-7c"},
  {"n": 32, "title": "Symphonia et Ordo virtutum: O Euchari, in leta via", "artist": "Elin Manahan Thomas", "seconds": 103, "youtubeId": "GHVMO84sK7c"},
  {"n": 33, "title": "Ordo Virtutum, Pt. V", "artist": "Vox Animae", "seconds": 292, "youtubeId": "KQ6YCIQ8-q0"},
  {"n": 34, "title": "Winners And Losers", "artist": "Sune Mattias Emanuelsson", "seconds": 73, "youtubeId": "WTNk0-yKRlQ"},
  {"n": 35, "title": "O Frondens Virga", "artist": "Klaus Reimann", "seconds": 193, "youtubeId": null},
  {"n": 36, "title": "O Virga Mediatrix", "artist": "Samuel Jones", "seconds": 259, "youtubeId": null},
  {"n": 37, "title": "Ordo Virtutum, Pt. II", "artist": "Vox Animae", "seconds": 1480, "youtubeId": null},
  {"n": 38, "title": "Ordo Virtutum, Pt. IV", "artist": "Vox Animae", "seconds": 567, "youtubeId": "gwjBrHk7O3k"},
  {"n": 39, "title": "Ordo Virtutum, Pt. I", "artist": "Vox Animae", "seconds": 1077, "youtubeId": null},
  ],
};

export const MARY_LOUS_MASS: YouTubeCatalogue = {
  path: "/mary-lous-mass",
  eyebrow: "Mary Lou's Mass",
  title: "Mary Lou's Mass",
  blurb: "Mary Lou Williams's jazz Mass (Smithsonian Folkways), in album order. Tap a track to hear it here.",
  browse: "Mary Lou Williams's jazz Mass",
  videoEyebrow: "Mary Lou's Mass",
  tracks: [
  {"n": 1, "title": "Willis", "artist": "Mary Lou Williams", "seconds": 221, "youtubeId": "9nxLp_eZKA8"},
  {"n": 2, "title": "O.W.", "artist": "Mary Lou Williams", "seconds": 140, "youtubeId": "SOAC4pVRjNs"},
  {"n": 3, "title": "Praise the Lord", "artist": "Mary Lou Williams", "seconds": 133, "youtubeId": "b_QAR8DW5ZQ"},
  {"n": 4, "title": "Old Time Spiritual", "artist": "Mary Lou Williams", "seconds": 74, "youtubeId": "62mySrS90HM"},
  {"n": 5, "title": "The Lord Says", "artist": "Mary Lou Williams", "seconds": 115, "youtubeId": "2lfW7MxSAws"},
  {"n": 6, "title": "Act of Contrition", "artist": "Mary Lou Williams", "seconds": 91, "youtubeId": "4UvNvhQ2BtA"},
  {"n": 7, "title": "Kyrie Eleison (Lord, Have Mercy)", "artist": "Mary Lou Williams", "seconds": 108, "youtubeId": "1CYHZEAdb3I"},
  {"n": 8, "title": "Gloria", "artist": "Mary Lou Williams", "seconds": 116, "youtubeId": "yCPRT3WT4Ow"},
  {"n": 9, "title": "Medi I and Medi II", "artist": "Mary Lou Williams", "seconds": 244, "youtubeId": "Rh59nqNRcRg"},
  {"n": 10, "title": "In His Day / Peace I Leave With You / Alleluia", "artist": "Mary Lou Williams", "seconds": 57, "youtubeId": "wzWehtX130Y"},
  {"n": 11, "title": "Lazarus", "artist": "Mary Lou Williams", "seconds": 281, "youtubeId": "ZpZ2lRL7-Qg"},
  {"n": 12, "title": "Credo", "artist": "Mary Lou Williams", "seconds": 143, "youtubeId": "PHvAjq-Y6-M"},
  {"n": 13, "title": "Credo (Instrumental)", "artist": "Mary Lou Williams", "seconds": 352, "youtubeId": "93YuDCGch9Q"},
  {"n": 14, "title": "Holy, Holy, Holy", "artist": "Mary Lou Williams", "seconds": 148, "youtubeId": "T_ttXKs40m8"},
  {"n": 15, "title": "Amen", "artist": "Mary Lou Williams", "seconds": 21, "youtubeId": "uXjqUFeP52Q"},
  {"n": 16, "title": "Our Father", "artist": "Mary Lou Williams", "seconds": 135, "youtubeId": "N_VLih8iAPY"},
  {"n": 17, "title": "Lamb of God", "artist": "Mary Lou Williams", "seconds": 207, "youtubeId": "vshCQ3fNHV8"},
  {"n": 18, "title": "It Is Always Spring", "artist": "Mary Lou Williams", "seconds": 158, "youtubeId": "d4iRjoVTa8w"},
  {"n": 19, "title": "People In Trouble", "artist": "Mary Lou Williams", "seconds": 211, "youtubeId": "bRD0CknXc_E"},
  {"n": 20, "title": "One", "artist": "Mary Lou Williams", "seconds": 87, "youtubeId": "drtuK8jQGWw"},
  {"n": 21, "title": "Praise the Lord (Come Holy Spirit)", "artist": "Mary Lou Williams", "seconds": 239, "youtubeId": "Tf8HPuBJKIU"},
  {"n": 22, "title": "Jesus Is the Best", "artist": "Mary Lou Williams", "seconds": 178, "youtubeId": "VBgt2m189YA"},
  {"n": 23, "title": "Tell Him Not to Talk Too Long", "artist": "Mary Lou Williams", "seconds": 157, "youtubeId": "cOYQecik8Hg"},
  {"n": 24, "title": "I Have a Dream", "artist": "Mary Lou Williams", "seconds": 119, "youtubeId": "hjWxDgaeiXo"},
  ],
};

export const TAIZE_SONGS: YouTubeCatalogue = {
  path: "/taize-songs",
  eyebrow: "Taizé Songs",
  title: "Taizé Songs",
  blurb: "Chants from the community at Taizé, sung by the brothers. Tap one to hear it here.",
  browse: "Songs from the Taizé community",
  videoEyebrow: "Taizé",
  tracks: [
  {"n": 1, "title": "Jubilate Coeli (canon)", "artist": "Taizé", "seconds": 168, "youtubeId": "tS9tQbXPFHc"},
  {"n": 2, "title": "Jesús inclinó la cabeza", "artist": "Taizé", "seconds": 147, "youtubeId": "XhhMJYzWQOQ"},
  {"n": 3, "title": "Meine Seele ist zu Tode betrübt", "artist": "Taizé", "seconds": 140, "youtubeId": "PhvwVuzP2Ao"},
  {"n": 4, "title": "Benedictus qui venit", "artist": "Taizé", "seconds": 165, "youtubeId": "0ueVfbtA4vk"},
  {"n": 5, "title": "Confitemini Domino", "artist": "Taizé", "seconds": 248, "youtubeId": "Nm0232sv47U"},
  {"n": 6, "title": "Jésus, ma joie", "artist": "Taizé", "seconds": 185, "youtubeId": "TDzytd1ZjII"},
  {"n": 7, "title": "Przybądź Duchu Boży", "artist": "Taizé · New Songs 2020 (Acoustic)", "seconds": 122, "youtubeId": "1J1FuPlYC8k"},
  {"n": 8, "title": "Herre, visa mig vägen", "artist": "Taizé · New Songs 2020 (Acoustic)", "seconds": 116, "youtubeId": "k47fQ2CNqQU"},
  {"n": 9, "title": "D'un arbre séculaire — Cantique de Noël", "artist": "Taizé", "seconds": 161, "youtubeId": "dTMkA_nlpr8"},
  {"n": 10, "title": "Tu sei sorgente viva", "artist": "Taizé", "seconds": 163, "youtubeId": "6YXCUrcCUbg"},
  // Owner, 2026-09-19: "Take out those two songs" — the list is ten single
  // chants. These two were the odd ones out: an hour-long continuous track and
  // an untitled instrumental.
  {"n": 11, "title": "Songs in Arabic: Remain With Me", "artist": "Taizé · a continuous hour", "seconds": 3857, "youtubeId": "83Bt6fPthHo", "hidden": true},
  {"n": 12, "title": "Instrumental 4", "artist": "Taizé · from the New CD", "seconds": 58, "youtubeId": "B3wBSpJnEvM", "hidden": true},
  ],
};

// ── Spirituals ──────────────────────────────────────────────────────────────
//
// Owner, 2026-09-19, with the Smithsonian Folkways page: "Call it Spirityals"
// — his typo; the catalogue is "Spirituals". Dock Reed's "Negro Folk Music of
// Alabama, Vol. 5: Spirituals" (Folkways, 1953), sung by Dock Reed with Vera
// Hall on three of the sixteen.
//
// ASSEMBLED FROM THE ALBUM'S OWN YouTube playlist (OLAK5uy_mfIolxcx…, found
// from a track's watch page), which gives the album's ORDER; every track is an
// official "- Topic" upload, Dock Reed's or Vera Hall's, credited here as the
// album credits them. Not the whole-album video, which would be one 35-minute
// row. Nothing of the singing is held here, as everywhere: a title, a length
// and a link. No lyrics.
//
// NOT THE SAME THING as lib/spirituals' 136 Slave Songs (project
// spirituals-library), which are TEXTS said as canticles. This is a recording
// to listen to. Both can be called "spirituals"; if that ever confuses anyone,
// this one is the music catalogue.
export const SPIRITUALS: YouTubeCatalogue = {
  path: "/spirituals-album",
  eyebrow: "Spirituals",
  title: "Spirituals",
  blurb: "Dock Reed and Vera Hall, Alabama, 1953 (Smithsonian Folkways). Tap one to hear it here.",
  browse: "Dock Reed and Vera Hall, Alabama, 1953",
  videoEyebrow: "Spirituals",
  tracks: [
  {"n": 1, "title": "I'm Going Home on the Morning Train", "artist": "Dock Reed", "seconds": 122, "youtubeId": "kT32EJbc_AQ"},
  {"n": 2, "title": "My God Ain't No Lying Man", "artist": "Dock Reed", "seconds": 133, "youtubeId": "INt-TfXmXTA"},
  {"n": 3, "title": "Where the Sun Will Never Go Down", "artist": "Dock Reed", "seconds": 126, "youtubeId": "xvCWG3NrI44"},
  {"n": 4, "title": "Troubled Lord I'm Troubled", "artist": "Dock Reed", "seconds": 92, "youtubeId": "6Vzhq6fSBJQ"},
  {"n": 5, "title": "Look How They Done My Lord", "artist": "Dock Reed", "seconds": 123, "youtubeId": "sUFTuhGkIMw"},
  {"n": 6, "title": "Job Job", "artist": "Dock Reed", "seconds": 136, "youtubeId": "JxyTZVRITY8"},
  {"n": 7, "title": "What Month Was Jesus Born In", "artist": "Vera Hall", "seconds": 130, "youtubeId": "v8Zl2y79YAw"},
  {"n": 8, "title": "Somebody's Talking About Jesus", "artist": "Dock Reed", "seconds": 91, "youtubeId": "ZaGFNqhxLhs"},
  {"n": 9, "title": "Death is Awful", "artist": "Dock Reed", "seconds": 106, "youtubeId": "ktfcHiAVwXE"},
  {"n": 10, "title": "I'm Climbing Up the Hills of Mt. Zion", "artist": "Dock Reed", "seconds": 103, "youtubeId": "bp_glJ2H3xM"},
  {"n": 11, "title": "Low Down the Chariot and Let Me Ride", "artist": "Dock Reed", "seconds": 129, "youtubeId": "pseqiycD2Q0"},
  {"n": 12, "title": "The Blood Done Signed My Name", "artist": "Dock Reed", "seconds": 203, "youtubeId": "jW3_YbbixbU"},
  {"n": 13, "title": "Everybody Talkin’ about Heaven Ain’t Goin’ There", "artist": "Dock Reed", "seconds": 171, "youtubeId": "TIGDytf4J-k"},
  {"n": 14, "title": "Noah, Noah", "artist": "Vera Hall", "seconds": 85, "youtubeId": "3C6YTQ-nz0g"},
  {"n": 15, "title": "Plumb the Line", "artist": "Dock Reed", "seconds": 99, "youtubeId": "wdsNZ11VPGQ"},
  {"n": 16, "title": "Travelling Shoes", "artist": "Vera Hall", "seconds": 104, "youtubeId": "LlTLLtJ9rJc"},
  ],
};

/**
 * EVERY MUSIC CATALOGUE, in one list (owner, 2026-09-19: "let do a browse
 * catalogue pill again that brings up different options"). The browse sheet
 * reads this, so adding a catalogue here is the whole procedure. /hymns is its
 * own page rather than a YouTubeCatalogue — it has hymn numbers, the hymnal's
 * order and the public-domain words — so it is named here by hand.
 */
export const MUSIC_CATALOGUES: ReadonlyArray<{ path: string; title: string; browse: string }> = [
  { path: "/hymns", title: "Hymns", browse: "The Hymnal 1982, as recorded" },
  ...[HILDEGARD_YOUTUBE, MARY_LOUS_MASS, TAIZE_SONGS, SPIRITUALS].map((c) => ({
    path: c.path, title: c.title, browse: c.browse,
  })),
];

/**
 * THE TRACK BEHIND A LOGGED LISTEN (owner, 2026-09-19, of the Lately rows:
 * "If one of these is from the catalogue if they hit it it should open the
 * browser page").
 *
 * A logged entry keeps only the TEXT of what was heard — "O Magne Pater —
 * Dominik Johnson, Daniela Kosinova" — which is exactly the string the
 * catalogue pages write, so the way back is to read it again. Matched on the
 * whole line, case- and space-insensitively, and only when the track still
 * has a YouTube recording: a row that cannot play must not pretend it can.
 */
const CATALOGUES = [HILDEGARD_YOUTUBE, MARY_LOUS_MASS, TAIZE_SONGS, SPIRITUALS] as const;

/** How a track is written into the listening log. Kept in ONE place so the
 *  page that logs it and the lookup that reads it back cannot drift. */
export function trackLoggedAs(t: YouTubeTrack): string {
  return `${t.title} — ${t.artist}`;
}

export function findCatalogueTrack(what: string): { catalogue: YouTubeCatalogue; track: YouTubeTrack } | null {
  const key = (what ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!key) return null;
  for (const catalogue of CATALOGUES) {
    for (const track of catalogue.tracks) {
      if (!track.youtubeId) continue;
      if (trackLoggedAs(track).replace(/\s+/g, " ").trim().toLowerCase() === key) return { catalogue, track };
    }
  }
  return null;
}
