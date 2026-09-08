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
   * A CURATED artwork from the ACT (Vanderbilt) library — the same collection
   * Visio Divina prays with — resolved through visioSelect's artworkById.
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
   */
  artId?: number;
};

export type MysterySetDef = {
  key: MysterySet;
  name: string;
  /** When it is traditionally prayed — shown on the intro. */
  days: string;
  /** One sentence naming what the whole set is about. */
  blurb: string;
  mysteries: Mystery[];
};

export const MYSTERY_SETS: Record<MysterySet, MysterySetDef> = {
  joyful: {
    key: "joyful",
    name: "The Joyful Mysteries",
    days: "Mondays and Saturdays",
    blurb: "The coming of Christ, and the ordinary lives that carried him.",
    mysteries: [
      { n: 1, title: "The Annunciation", ref: "Luke 1:26-38", artId: 48278, fruit: "Humility",
        meditation: "Gabriel comes to a young woman in an unimportant town, and she says yes without knowing what it will cost." },
      { n: 2, title: "The Visitation", ref: "Luke 1:39-56", artId: 48279, fruit: "Love of neighbour",
        meditation: "Mary goes to Elizabeth. Two pregnant women meet, and the first thing either of them does is sing." },
      { n: 3, title: "The Nativity", ref: "Luke 2:1-20", artId: 48387, fruit: "Poverty of spirit",
        meditation: "God arrives without room, without status, and the news goes first to men working a night shift." },
      { n: 4, title: "The Presentation in the Temple", ref: "Luke 2:22-38", artId: 56557, fruit: "Obedience",
        meditation: "Two old people have been waiting their whole lives, and they recognise him at once." },
      { n: 5, title: "The Finding in the Temple", ref: "Luke 2:41-52", artId: 59224, fruit: "Joy in finding Jesus",
        meditation: "Three days of looking, and he is where his Father is. His mother does not understand, and keeps it anyway." },
    ],
  },
  sorrowful: {
    key: "sorrowful",
    name: "The Sorrowful Mysteries",
    days: "Tuesdays and Fridays",
    blurb: "The passion — what love was willing to bear.",
    mysteries: [
      { n: 1, title: "The Agony in the Garden", ref: "Matthew 26:36-46", artId: 48391, fruit: "Sorrow for sin",
        meditation: "He asks for it to pass. He is not pretending. And still: not what I want, but what you want." },
      { n: 2, title: "The Scourging at the Pillar", ref: "Matthew 27:26", artId: 48274, fruit: "Purity",
        meditation: "The body God took is the body that is struck. Nothing about this is symbolic." },
      { n: 3, title: "The Crowning with Thorns", ref: "Matthew 27:27-31", artId: 46134, fruit: "Moral courage",
        meditation: "They dress him as a king to mock him, and are more right than they know." },
      { n: 4, title: "The Carrying of the Cross", ref: "John 19:17", artId: 59353, fruit: "Patience",
        meditation: "He carries it as far as he can, and then a stranger from the crowd is made to help." },
      { n: 5, title: "The Crucifixion", ref: "John 19:18-30", artId: 48390, fruit: "Perseverance",
        meditation: "He gives his mother a son and his friend a mother, and then he says it is finished." },
    ],
  },
  glorious: {
    key: "glorious",
    name: "The Glorious Mysteries",
    days: "Wednesdays and Sundays",
    blurb: "Easter and what followed — death undone, and the Church begun.",
    mysteries: [
      { n: 1, title: "The Resurrection", ref: "Matthew 28:1-10", artId: 48301, fruit: "Faith",
        meditation: "The women come to care for a body and find the grave empty and the guards undone." },
      { n: 2, title: "The Ascension", ref: "Acts 1:6-11", artId: 48398, fruit: "Hope",
        meditation: "He goes, and they are left staring upward until they are told to get on with it." },
      { n: 3, title: "The Descent of the Holy Spirit", ref: "Acts 2:1-13", artId: 59680, fruit: "Love of God",
        meditation: "Wind and fire, and a frightened room becomes a church that can be understood in every language." },
      // ── The two Marian mysteries. Written as what the tradition holds and
      //    what scripture pictures, not as doctrine an Anglican is asked to
      //    assert — see the file header. The owner may want to reword, replace
      //    (some Anglican uses put the Great Commission and the Last Judgement
      //    here) or keep them.
      { n: 4, title: "The Assumption of Mary", ref: "Revelation 12:1-6", fruit: "Devotion to Mary",
        meditation: "The tradition holds that the one who carried him was carried home. We pray with her, at the end of her long yes." },
      { n: 5, title: "The Coronation of Mary", ref: "Luke 1:46-55", artId: 58434, fruit: "Trust in God's promise",
        meditation: "He has lifted up the lowly. What was promised in her song is finished in her." },
    ],
  },
  luminous: {
    key: "luminous",
    name: "The Luminous Mysteries",
    days: "Thursdays",
    blurb: "The ministry — the years between the manger and the cross.",
    mysteries: [
      { n: 1, title: "The Baptism in the Jordan", ref: "Matthew 3:13-17", artId: 48290, fruit: "Openness to the Spirit",
        meditation: "He stands in the river with everyone else, and heaven says: this one, beloved." },
      { n: 2, title: "The Wedding at Cana", ref: "John 2:1-11", artId: 59676, fruit: "Trust in Mary's care",
        meditation: "The wine runs out, as it does. His mother notices before anyone else, and simply tells him." },
      { n: 3, title: "The Proclamation of the Kingdom", ref: "Mark 1:14-15", artId: 48379, fruit: "Repentance",
        meditation: "The kingdom has come near — near enough to turn around for." },
      { n: 4, title: "The Transfiguration", ref: "Matthew 17:1-8", artId: 48307, fruit: "Desire for holiness",
        meditation: "For a moment they see him as he is, and Peter wants to build something and stay." },
      { n: 5, title: "The Institution of the Eucharist", ref: "Matthew 26:26-30", artId: 58334, fruit: "Adoration",
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

export const SIGN_OF_THE_CROSS =
  "In the name of the Father, and of the Son, and of the Holy Spirit. Amen.";

export const APOSTLES_CREED =
  "I believe in God, the Father almighty, creator of heaven and earth. " +
  "I believe in Jesus Christ, his only Son, our Lord, who was conceived by the Holy Spirit, " +
  "born of the Virgin Mary, suffered under Pontius Pilate, was crucified, died, and was buried; " +
  "he descended to the dead. On the third day he rose again; he ascended into heaven, " +
  "he is seated at the right hand of the Father, and he will come again to judge the living and the dead. " +
  "I believe in the Holy Spirit, the holy catholic Church, the communion of saints, " +
  "the forgiveness of sins, the resurrection of the body, and the life everlasting. Amen.";

export const OUR_FATHER =
  "Our Father, who art in heaven, hallowed be thy Name, thy kingdom come, thy will be done, " +
  "on earth as it is in heaven. Give us this day our daily bread. And forgive us our trespasses, " +
  "as we forgive those who trespass against us. And lead us not into temptation, but deliver us from evil. Amen.";

export const HAIL_MARY =
  "Hail Mary, full of grace, the Lord is with thee. Blessed art thou among women, " +
  "and blessed is the fruit of thy womb, Jesus. Holy Mary, Mother of God, " +
  "pray for us sinners, now and at the hour of our death. Amen.";

export const GLORY_BE =
  "Glory be to the Father, and to the Son, and to the Holy Spirit: " +
  "as it was in the beginning, is now, and will be for ever. Amen.";

/** Prayed after the Glory Be on each decade. Optional in most uses — the deck
 *  offers it as a beat the reader can simply tap past. */
export const FATIMA_PRAYER =
  "O my Jesus, forgive us our sins, save us from the fires of hell, " +
  "and lead all souls to heaven, especially those in most need of thy mercy. Amen.";

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
  "O God, whose only-begotten Son, by his life, death, and resurrection, " +
  "has purchased for us the rewards of eternal life: grant, we beseech thee, " +
  "that meditating upon these mysteries of the most holy Rosary of the Blessed Virgin Mary, " +
  "we may imitate what they contain and obtain what they promise; " +
  "through the same Christ our Lord. Amen.";

export const HAIL_HOLY_QUEEN =
  "Hail, holy Queen, Mother of mercy, our life, our sweetness, and our hope. " +
  "To thee do we cry, poor banished children of Eve; to thee do we send up our sighs, " +
  "mourning and weeping in this valley of tears. Turn then, most gracious advocate, " +
  "thine eyes of mercy toward us, and after this our exile show unto us the blessed fruit " +
  "of thy womb, Jesus. O clement, O loving, O sweet Virgin Mary. Amen.";

/** The three Hail Marys on the opening beads are each offered for one of the
 *  theological virtues — the deck names which as you pray it. */
export const OPENING_INTENTIONS = ["for faith", "for hope", "for love"] as const;

/** Beads in a decade. Named rather than inlined because the deck counts them
 *  in three places (the counter, the dots, and the advance). */
export const BEADS_PER_DECADE = 10;
