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
};

export type YouTubeCatalogue = {
  /** The route this catalogue lives at. */
  path: string;
  eyebrow: string;
  title: string;
  blurb: string;
  /** Shown above each track's title on the /video page. */
  videoEyebrow: string;
  tracks: readonly YouTubeTrack[];
};

export const HILDEGARD_YOUTUBE: YouTubeCatalogue = {
  path: "/hildegard",
  eyebrow: "Hildegard",
  title: "Hildegard von Bingen",
  blurb: "Her chants, sung by many voices. Tap one to hear it here.",
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
