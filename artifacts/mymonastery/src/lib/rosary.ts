// ── The Rosary — its mysteries, its prayers, and which set belongs to today ──
//
// The data behind pages/rosary.tsx. Kept separate from the page for the same
// reason the office keeps its lectionary out of the deck: the shape of the
// practice is one thing, the words are another, and the words are what the
// owner will want to edit.
//
// A NOTE ON THIS BEING AN EPISCOPAL APP. What follows is the Dominican rosary
// as it is actually prayed — five decades, a mystery to each, the Hail Mary on
// every bead — because that is what "the rosary … the different mysteries"
// means, and Anglicans who pray it pray this one. Two places where an
// Episcopal reading differs from a Roman one are marked in the mysteries
// below; both are written descriptively (what scripture and the tradition say
// happened) rather than doctrinally, so they sit honestly in an Anglican
// mouth. The owner should read them and decide — that is a call about the
// app's churchmanship, not a technical one.
//
// The other Anglican rosary — Vaught's 33-bead ring of cruciform beads and
// weeks — is a DIFFERENT object with no mysteries. If that is wanted it is a
// second practice, not a variant of this one.

export type MysterySet = "joyful" | "sorrowful" | "glorious" | "luminous";

export type Mystery = {
  /** 1–5 within its set. */
  n: number;
  title: string;
  /** Where it is read — opens in the reader, like every other passage. */
  ref: string;
  /** One line to hold while the decade is prayed. */
  meditation: string;
  /** The virtue the decade has traditionally been offered for. */
  fruit: string;
  /**
   * CURATED artworks from the ACT (Vanderbilt) library — the same collection
   * Visio Divina prays with — resolved through visioSelect's artworkById.
   *
   * ONE PER DAY THE SET IS PRAYED (owner: "for the mysteries that are prayed
   * multiple times a week, how about you have different pictures for the
   * different scenes on different days"). The Joyful, Sorrowful and Glorious
   * sets come round twice a week, so they carry two: Monday's Annunciation is
   * a Mafa painting and Saturday's is Mary Jane Miller's icon. The index is
   * the day's position in the set's own `dayNumbers`, so it is the same
   * picture for everyone on a given day, and choosing a set off its day falls
   * back to the first.
   *
   * Where the library has only one work on a subject (the Scourging) the list
   * simply holds one and both days show it.
   *
   * Curated by hand, one per mystery, and deliberately NOT matched by chapter:
   * Luke 1 holds both the Annunciation and the Visitation, and Luke 2 holds the
   * Nativity, the Presentation and the Finding, so a chapter matcher
   * illustrates three different mysteries with the same painting and labels
   * the Visitation with an Annunciation. Subject first, then a spread of
   * hands — the Cameroonian JESUS MAFA series, Frank Wesley's Indian
   * paintings, Mary Jane Miller's icons, John August Swanson's serigraphs and
   * a few European masters — so five decades are not five of one style.
   *
   * Undefined where the library genuinely has nothing on the subject (the
   * Assumption); the beat simply shows no picture.
   *
   * EVERY ID HERE HAS BEEN MEASURED. Nothing narrower than 3:5 and nothing
   * wider than 16:9 (owner) — a very tall icon shrinks to a stamp inside the
   * beat's 34dvh cap, and a very wide one leaves the mystery unreadable at
   * phone width. Two works already in use failed and were replaced: 59718
   * (2.04) and 59177 (0.55). Adding one: fetch the JPEG header and check the
   * ratio before it goes in the list.
   */
  artIds?: number[];
};

export type MysterySetDef = {
  key: MysterySet;
  name: string;
  /** When it is traditionally prayed — shown on the intro. */
  days: string;
  /** The same days as weekday numbers (0 = Sunday), in order. Picks which of
   *  a mystery's pictures today gets — see Mystery.artIds. */
  dayNumbers: number[];
  /** One sentence naming what the whole set is about. */
  blurb: string;
  mysteries: Mystery[];
};

export const MYSTERY_SETS: Record<MysterySet, MysterySetDef> = {
  joyful: {
    key: "joyful",
    dayNumbers: [1, 6],
    name: "The Joyful Mysteries",
    days: "Mondays and Saturdays",
    blurb: "The coming of Christ, and the ordinary lives that carried him.",
    mysteries: [
      { n: 1, title: "The Annunciation", ref: "Luke 1:26-38", artIds: [48278, 59673, 59234], fruit: "Humility",
        meditation: "Gabriel comes to a young woman in an unimportant town, and she says yes without knowing what it will cost." },
      { n: 2, title: "The Visitation", ref: "Luke 1:39-56", artIds: [48279, 59190, 58365], fruit: "Love of neighbour",
        meditation: "Mary goes to Elizabeth. Two pregnant women meet, and the first thing either of them does is sing." },
      { n: 3, title: "The Nativity", ref: "Luke 2:1-20", artIds: [48387, 59201, 57108], fruit: "Poverty of spirit",
        meditation: "God arrives without room, without status, and the news goes first to men working a night shift." },
      { n: 4, title: "The Presentation in the Temple", ref: "Luke 2:22-38", artIds: [54414, 59646, 59769], fruit: "Obedience",
        meditation: "Two old people have been waiting their whole lives, and they recognise him at once." },
      { n: 5, title: "The Finding in the Temple", ref: "Luke 2:41-52", artIds: [59224, 48280, 59221], fruit: "Joy in finding Jesus",
        meditation: "Three days of looking, and he is where his Father is. His mother does not understand, and keeps it anyway." },
    ],
  },
  sorrowful: {
    key: "sorrowful",
    dayNumbers: [2, 5],
    name: "The Sorrowful Mysteries",
    days: "Tuesdays and Fridays",
    blurb: "The passion — what love was willing to bear.",
    mysteries: [
      { n: 1, title: "The Agony in the Garden", ref: "Matthew 26:36-46", artIds: [48391, 56551, 59717], fruit: "Sorrow for sin",
        meditation: "He asks for it to pass. He is not pretending. And still: not what I want, but what you want." },
      { n: 2, title: "The Scourging at the Pillar", ref: "Matthew 27:26", artIds: [48274, 59143, 58357], fruit: "Purity",
        meditation: "The body God took is the body that is struck. Nothing about this is symbolic." },
      { n: 3, title: "The Crowning with Thorns", ref: "Matthew 27:27-31", artIds: [46134, 58355], fruit: "Moral courage",
        meditation: "They dress him as a king to mock him, and are more right than they know." },
      { n: 4, title: "The Carrying of the Cross", ref: "John 19:17", artIds: [59353, 59166, 59352], fruit: "Patience",
        meditation: "He carries it as far as he can, and then a stranger from the crowd is made to help." },
      { n: 5, title: "The Crucifixion", ref: "John 19:18-30", artIds: [48390, 59218, 58356, 56778], fruit: "Perseverance",
        meditation: "He gives his mother a son and his friend a mother, and then he says it is finished." },
    ],
  },
  glorious: {
    key: "glorious",
    dayNumbers: [3, 0],
    name: "The Glorious Mysteries",
    days: "Wednesdays and Sundays",
    blurb: "Easter and what followed — death undone, and the Church begun.",
    mysteries: [
      { n: 1, title: "The Resurrection", ref: "Matthew 28:1-10", artIds: [48301, 59213, 59246], fruit: "Faith",
        meditation: "The women come to care for a body and find the grave empty and the guards undone." },
      { n: 2, title: "The Ascension", ref: "Acts 1:6-11", artIds: [48398, 59720, 57474], fruit: "Hope",
        meditation: "He goes, and they are left staring upward until they are told to get on with it." },
      { n: 3, title: "The Descent of the Holy Spirit", ref: "Acts 2:1-13", artIds: [59680, 48388, 59681], fruit: "Love of God",
        meditation: "Wind and fire, and a frightened room becomes a church that can be understood in every language." },
      // ── The two Marian mysteries. Written as what the tradition holds and
      //    what scripture pictures, not as doctrine an Anglican is asked to
      //    assert — see the file header. The owner may want to reword, replace
      //    (some Anglican uses put the Great Commission and the Last Judgement
      //    here) or keep them.
      { n: 4, title: "The Assumption of Mary", ref: "Revelation 12:1-6", artIds: [57111, 59249, 59657], fruit: "Devotion to Mary",
        meditation: "The tradition holds that the one who carried him was carried home. We pray with her, at the end of her long yes." },
      { n: 5, title: "The Coronation of Mary", ref: "Luke 1:46-55", artIds: [58434, 57112], fruit: "Trust in God's promise",
        meditation: "He has lifted up the lowly. What was promised in her song is finished in her." },
    ],
  },
  luminous: {
    key: "luminous",
    dayNumbers: [4],
    name: "The Luminous Mysteries",
    days: "Thursdays",
    blurb: "The ministry — the years between the manger and the cross.",
    mysteries: [
      { n: 1, title: "The Baptism in the Jordan", ref: "Matthew 3:13-17", artIds: [48290, 59682, 59675], fruit: "Openness to the Spirit",
        meditation: "He stands in the river with everyone else, and heaven says: this one, beloved." },
      { n: 2, title: "The Wedding at Cana", ref: "John 2:1-11", artIds: [59676, 48305, 58825], fruit: "Trust in Mary's care",
        meditation: "The wine runs out, as it does. His mother notices before anyone else, and simply tells him." },
      { n: 3, title: "The Proclamation of the Kingdom", ref: "Mark 1:14-15", artIds: [48379, 57121, 48284, 59266], fruit: "Repentance",
        meditation: "The kingdom has come near — near enough to turn around for." },
      { n: 4, title: "The Transfiguration", ref: "Matthew 17:1-8", artIds: [48307, 57114, 59679], fruit: "Desire for holiness",
        meditation: "For a moment they see him as he is, and Peter wants to build something and stay." },
      { n: 5, title: "The Institution of the Eucharist", ref: "Matthew 26:26-30", artIds: [58334, 48272], fruit: "Adoration",
        meditation: "On the night before he suffered, he took bread — and it has not stopped being given since." },
    ],
  },
};

/**
 * The set traditionally prayed on a given day.
 *
 * Sunday Glorious · Monday Joyful · Tuesday Sorrowful · Wednesday Glorious ·
 * Thursday Luminous · Friday Sorrowful · Saturday Joyful.
 *
 * The reader can always choose another on the intro — this only decides what
 * is offered first, the way the office offers today's psalms.
 */
/**
 * Which of a mystery's pictures today gets.
 *
 * The first cut indexed by WEEKDAY ALONE, so a set prayed twice a week only
 * ever reached its first two pictures — a third and fourth were dead weight
 * (owner: "if there are more than two images for a mystery that gets shown
 * twice a week, why don't you rotate the pictures"). The week now advances the
 * window as well, so the list is walked end to end however long it is:
 *
 *   Joyful (Mon + Sat), three pictures — wk0: 1st, 2nd · wk1: 3rd, 1st ·
 *   wk2: 2nd, 3rd, then round again. Every picture is seen every three weeks.
 *   Luminous (Thu only) simply advances one picture a week.
 *
 * The week number is counted off a fixed Thursday epoch from the LOCAL
 * calendar date, so it turns over at local midnight on the same day for
 * everyone and never lands between two of a day's own renders.
 */
export function artIdForDay(set: MysterySetDef, m: Mystery, d: Date = new Date()): number | null {
  if (!m.artIds || m.artIds.length === 0) return null;
  const slot = Math.max(0, set.dayNumbers.indexOf(d.getDay()));
  const days = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  const week = Math.floor((days + 3) / 7);
  const i = week * Math.max(1, set.dayNumbers.length) + slot;
  return m.artIds[((i % m.artIds.length) + m.artIds.length) % m.artIds.length] ?? m.artIds[0] ?? null;
}

export function mysterySetForDay(d: Date = new Date()): MysterySet {
  switch (d.getDay()) {
    case 0: return "glorious";
    case 1: return "joyful";
    case 2: return "sorrowful";
    case 3: return "glorious";
    case 4: return "luminous";
    case 5: return "sorrowful";
    default: return "joyful";
  }
}

// ── The prayers ─────────────────────────────────────────────────────────────
//
// Traditional texts. The Hail Mary is given in the form Anglicans who pray the
// rosary generally use. Kept here as data so they can be reworded in one place
// rather than hunted through the deck.

/**
 * THE PRAYERS ARE BROKEN INTO LINES THE WAY THE OFFICE BREAKS THEM (owner:
 * "the Our Father and other texts should have the line breaks like they would
 * in the offices — like the creed — look in the office").
 *
 * The convention is the one in api-server/src/seeds/bcpTexts.ts: a new line at
 * each clause of the prayer, TWO SPACES of indent for a line that continues
 * the clause above it, four for a second level. It is how the Prayer Book sets
 * them on the page, and it is what makes the Creed readable rather than a
 * paragraph — you can find your place again after looking away.
 *
 * PrayerLines in pages/rosary.tsx renders the indent as real padding rather
 * than as leading spaces, so a line that wraps on a narrow phone wraps to its
 * own indent instead of back to the margin.
 */
export const SIGN_OF_THE_CROSS =
  "In the name of the Father,\n" +
  "and of the Son,\n" +
  "and of the Holy Spirit. Amen.";

export const APOSTLES_CREED =
  "I believe in God, the Father almighty,\n" +
  "  creator of heaven and earth.\n" +
  "I believe in Jesus Christ, his only Son, our Lord,\n" +
  "  who was conceived by the Holy Spirit,\n" +
  "  born of the Virgin Mary,\n" +
  "  suffered under Pontius Pilate,\n" +
  "  was crucified, died, and was buried;\n" +
  "  he descended to the dead.\n" +
  "  On the third day he rose again;\n" +
  "  he ascended into heaven,\n" +
  "  he is seated at the right hand of the Father,\n" +
  "  and he will come again to judge the living and the dead.\n" +
  "I believe in the Holy Spirit,\n" +
  "  the holy catholic Church,\n" +
  "  the communion of saints,\n" +
  "  the forgiveness of sins,\n" +
  "  the resurrection of the body,\n" +
  "  and the life everlasting. Amen.";

export const OUR_FATHER =
  "Our Father, who art in heaven,\n" +
  "  hallowed be thy Name,\n" +
  "  thy kingdom come,\n" +
  "  thy will be done,\n" +
  "    on earth as it is in heaven.\n" +
  "Give us this day our daily bread.\n" +
  "And forgive us our trespasses,\n" +
  "  as we forgive those who trespass against us.\n" +
  "And lead us not into temptation,\n" +
  "  but deliver us from evil. Amen.";

export const HAIL_MARY =
  "Hail Mary, full of grace,\n" +
  "  the Lord is with thee.\n" +
  "Blessed art thou among women,\n" +
  "  and blessed is the fruit of thy womb, Jesus.\n" +
  "Holy Mary, Mother of God,\n" +
  "  pray for us sinners,\n" +
  "  now and at the hour of our death. Amen.";

export const GLORY_BE =
  "Glory be to the Father, and to the Son, and to the Holy Spirit:\n" +
  "  as it was in the beginning, is now, and will be for ever. Amen.";

/** Prayed after the Glory Be on each decade. Optional in most uses — the deck
 *  offers it as a beat the reader can simply tap past. */
export const FATIMA_PRAYER =
  "O my Jesus, forgive us our sins,\n" +
  "  save us from the fires of hell,\n" +
  "  and lead all souls to heaven,\n" +
  "  especially those in most need of thy mercy. Amen.";

/**
 * THE CLOSE, which the first build left out.
 *
 * After the Hail, holy Queen the received form says the versicle and response
 * and then the concluding collect — it is not an optional flourish, it is how
 * the rosary ends. Both are given in the same traditional English as the Our
 * Father above ("thy", "beseech"), which is also the register of the app's
 * Rite I office texts, so the deck does not change voice at its last beat.
 */
export const CONCLUDING_VERSICLE = "Pray for us, O holy Mother of God.";
export const CONCLUDING_RESPONSE = "That we may be made worthy of the promises of Christ.";

export const CONCLUDING_PRAYER =
  "O God, whose only-begotten Son,\n" +
  "  by his life, death, and resurrection,\n" +
  "  has purchased for us the rewards of eternal life:\n" +
  "grant, we beseech thee,\n" +
  "  that meditating upon these mysteries\n" +
  "    of the most holy Rosary of the Blessed Virgin Mary,\n" +
  "  we may imitate what they contain\n" +
  "    and obtain what they promise;\n" +
  "through the same Christ our Lord. Amen.";

export const HAIL_HOLY_QUEEN =
  "Hail, holy Queen, Mother of mercy,\n" +
  "  our life, our sweetness, and our hope.\n" +
  "To thee do we cry, poor banished children of Eve;\n" +
  "  to thee do we send up our sighs,\n" +
  "  mourning and weeping in this valley of tears.\n" +
  "Turn then, most gracious advocate,\n" +
  "  thine eyes of mercy toward us,\n" +
  "  and after this our exile\n" +
  "    show unto us the blessed fruit of thy womb, Jesus.\n" +
  "O clement, O loving, O sweet Virgin Mary. Amen.";

/** The three Hail Marys on the opening beads are each offered for one of the
 *  theological virtues — the deck names which as you pray it. */
export const OPENING_INTENTIONS = ["for faith", "for hope", "for love"] as const;

/** Beads in a decade. Named rather than inlined because the deck counts them
 *  in three places (the counter, the dots, and the advance). */
export const BEADS_PER_DECADE = 10;


/* ══════════════════════════════════════════════════════════════════════
   THE ANGLICAN ROSARY (owner: "then build an Anglican rosary version")

   Anglican prayer beads are a different object from a Roman rosary and are
   prayed differently, so this is a second FORM rather than a fourth set of
   mysteries. Thirty-three beads for the years of our Lord's life: the cross,
   one invitatory bead, then four "cruciform" beads dividing four "weeks" of
   seven. You enter at the cross, say the invitatory, and go round —
   cruciform, seven; cruciform, seven — four times to complete the circle.
   The circle is traditionally prayed THREE times (33 × 3 = 99, and the
   invitatory at the end makes 100), then you close at the cross.

   The form dates to the 1980s (the Solitaries of DeKoven, Texas) and there is
   no single authorised text: what is fixed is the SHAPE, and a devotion is
   chosen to fill it. The four offered here are the ones in common use, and
   every word of every one is traditional or long out of copyright — the
   Trisagion, the Kyrie, the Gloria, the Agnus Dei acclamation, and Julian of
   Norwich (d. 1416). Nothing here is invented and nothing is under licence.
   ══════════════════════════════════════════════════════════════════════ */

export type AnglicanSet = "jesus" | "julian" | "trisagion" | "lamb";

export type AnglicanSetDef = {
  key: AnglicanSet;
  name: string;
  /** One sentence on what praying this set is like. */
  blurb: string;
  /** Where the words come from — shown on the intro, because they are not ours. */
  source: string;
  /** Said at the cross, entering and leaving. */
  cross: string;
  /** Said once on the invitatory bead, at the start. */
  invitatory: string;
  /** Said on each of the four cruciform beads, and what it is called. The
   *  cruciform prayer and the week prayer are usually two DIFFERENT prayers
   *  (Trisagion and Jesus Prayer, say), so each carries its own name — the
   *  first cut headed every slide with the set's name and left you unable to
   *  tell the two apart. */
  cruciform: string;
  cruciformTitle: string;
  /** Said on each of the seven beads of a week. */
  week: string;
  weekTitle: string;
  /** One icon for the set, from the same ACT library — see artIds above for
   *  the 3:5–16:9 rule these were measured against. */
  artId?: number;
};

/** The invitatory every set shares — the office's own opening versicle. */
const ANGLICAN_INVITATORY =
  "O God, make speed to save us.\n" +
  "O Lord, make haste to help us.\n" +
  "\n" +
  "Glory to the Father, and to the Son, and to the Holy Spirit:\n" +
  "  as it was in the beginning, is now, and will be for ever. Amen.";

export const ANGLICAN_SETS: Record<AnglicanSet, AnglicanSetDef> = {
  jesus: {
    key: "jesus",
    name: "The Jesus Prayer",
    blurb: "One sentence, prayed until it prays itself. The oldest and plainest way through the beads.",
    source: "The Jesus Prayer of the Christian East; the Trisagion, in use since the fifth century.",
    cross: SIGN_OF_THE_CROSS,
    invitatory: ANGLICAN_INVITATORY,
    cruciform: "Holy God,\nHoly and Mighty,\nHoly Immortal One,\nhave mercy upon us.",
    cruciformTitle: "The Trisagion",
    // Four lines, as the owner sets it — the shape a repeated prayer is said
    // in, one breath to a line, not a sentence to be read across.
    week: "Lord Jesus Christ,\nSon of God,\nhave mercy on me,\na sinner.",
    weekTitle: "The Jesus Prayer",
    artId: 57124,
  },
  julian: {
    key: "julian",
    name: "Julian of Norwich",
    blurb: "An anchoress in a plague year, insisting that love is the meaning and that all shall be well.",
    source: "Julian of Norwich, Revelations of Divine Love (d. 1416).",
    cross: SIGN_OF_THE_CROSS,
    invitatory: ANGLICAN_INVITATORY,
    cruciform: "All shall be well,\nand all shall be well,\nand all manner of thing shall be well.",
    cruciformTitle: "All shall be well",
    week: "God of your goodness,\ngive me yourself,\nfor you are enough to me.",
    weekTitle: "God of your goodness",
    artId: 57119,
  },
  trisagion: {
    key: "trisagion",
    name: "The Trisagion",
    blurb: "Holy, and mighty, and immortal — and still merciful. A set for when there is nothing left to say.",
    source: "The Trisagion and the Kyrie, from the ancient liturgies of the Church.",
    cross: SIGN_OF_THE_CROSS,
    invitatory: ANGLICAN_INVITATORY,
    cruciform: "Holy God,\nHoly and Mighty,\nHoly Immortal One,\nhave mercy upon us.",
    cruciformTitle: "The Trisagion",
    week: "Lord, have mercy.\nChrist, have mercy.\nLord, have mercy.",
    weekTitle: "Kyrie eleison",
    artId: 57123,
  },
  lamb: {
    key: "lamb",
    name: "Agnus Dei",
    blurb: "The words said at the breaking of the bread, carried out of the liturgy and into the hand.",
    source: "The Agnus Dei and John 1:29, from the eucharistic liturgy.",
    cross: SIGN_OF_THE_CROSS,
    invitatory: ANGLICAN_INVITATORY,
    cruciform: "Behold the Lamb of God,\nwho takes away the sin of the world.",
    cruciformTitle: "Behold the Lamb of God",
    week: "Jesus, Lamb of God,\nhave mercy on us.",
    weekTitle: "Agnus Dei",
    artId: 57121,
  },
};

/** Beads in one "week" of the Anglican circle, and cruciform beads per circle. */
export const BEADS_PER_WEEK = 7;
export const WEEKS_PER_CIRCLE = 4;
/** Times round the circle. Three is the received practice; see the header. */
export const ANGLICAN_CIRCLES = 3;

/** Said on the invitatory bead at the end, before returning to the cross. */
export const ANGLICAN_CLOSING_PRAYER =
  "Our Father, who art in heaven,\n" +
  "  hallowed be thy Name,\n" +
  "  thy kingdom come,\n" +
  "  thy will be done,\n" +
  "    on earth as it is in heaven.\n" +
  "Give us this day our daily bread.\n" +
  "And forgive us our trespasses,\n" +
  "  as we forgive those who trespass against us.\n" +
  "And lead us not into temptation,\n" +
  "  but deliver us from evil.\n" +
  "For thine is the kingdom, and the power, and the glory,\n" +
  "  for ever and ever. Amen.";

/** Said at the cross on the way out. */
export const ANGLICAN_DISMISSAL =
  "The Lord bless us, and preserve us from all evil,\n" +
  "  and keep us in eternal life. Amen.";
