// ─────────────────────────────────────────────────────────────────────────
// Saints — a browsable, searchable index of the holy people commemorated in
// the Episcopal calendar, for finding a saint to accompany you in prayer.
//
// SOURCE: The Episcopal calendar — Lesser Feasts and Fasts (2022) and A Great
// Cloud of Witnesses. Not Roman, not Orthodox. Language is "commemoration"
// and "feast"; these are the people we remember.
//
// PATRONAGE: `patronOf` is filled ONLY where a patronage is traditionally
// attested. Where none exists (most modern Episcopal commemorations), it is
// left empty on purpose — better blank than invented. Patronage is offered in
// the gentle Anglican key ("traditionally invoked for…"), holding space for
// Anglo-Catholic devotion without asserting doctrine the Episcopal Church
// does not formally teach.
//
// COLLECTS: `collectExcerpt` is a short excerpt of the petition at the heart
// of the collect appointed in the 1979 Book of Common Prayer — which is in
// the public domain. The BCP appoints proper collects for the Holy Days and
// All Saints' Day ONLY; the individual commemorations' collects live in the
// copyrighted LFF 2022, so those entries carry NO excerpt until licensing is
// sorted out. (If a saint has no BCP collect, the field is absent.)
//
// This is a static, hardcoded dataset for v1 (no backend). Migrate to JSON /
// an API later if it grows past a couple hundred entries.
// ─────────────────────────────────────────────────────────────────────────

export type SaintRank = "principalFeast" | "holyDay" | "commemoration";

export type Vocation =
  | "apostle"
  | "evangelist"
  | "martyr"
  | "bishop"
  | "archbishop"
  | "priest"
  | "deacon"
  | "theologian"
  | "mystic"
  | "monastic"
  | "abbot"
  | "abbess"
  | "hermit"
  | "religious"
  | "reformer"
  | "missionary"
  | "pastor"
  | "teacher"
  | "poet"
  | "composer"
  | "scholar"
  | "nurse"
  | "physician"
  | "queen"
  | "prophet"
  | "layperson"
  | "mother";

// Tagged intentions, for the "Find" search. Slugs; see INTENTION_LABELS for
// display strings. Add new intentions here as the dataset grows.
export type Intention =
  | "grief"
  | "illness"
  | "healing"
  | "dying"
  | "suffering"
  | "vocation"
  | "doubt"
  | "faith"
  | "conversion"
  | "reconciliation"
  | "justice"
  | "courage"
  | "perseverance"
  | "prayer"
  | "study"
  | "creativity"
  | "childbirth"
  | "family"
  | "marriage"
  | "poverty"
  | "the_poor"
  | "hospitality"
  | "peace"
  | "protection"
  | "travel"
  | "leadership"
  | "mission"
  | "hope"
  | "temptation"
  | "work"
  | "mental_health"
  | "the_elderly"
  | "animals";

// Feast date as month/day (no year — these recur annually). month 1–12, day 1–31.
export interface FeastDate {
  month: number;
  day: number;
}

export interface Saint {
  id: string; // stable slug (URL-friendly; used for routing /saints/:id)
  name: string;
  feastDate: FeastDate;
  rank: SaintRank;
  yearsLived?: string;
  vocation: Vocation[];
  knownFor: string; // 1–2 sentences, plain prose
  patronOf: string[]; // empty when no traditional patronage exists
  intercedesFor: Intention[];
  collectExcerpt?: string; // short excerpt from the appointed BCP collect (public domain)
  anglicanNote?: string; // relevance to the Anglican tradition specifically
}

// Display labels for intentions whose slug doesn't title-case cleanly.
export const INTENTION_LABELS: Partial<Record<Intention, string>> = {
  the_poor: "the poor",
  the_elderly: "the elderly",
  mental_health: "mental health",
};

export function intentionLabel(i: Intention): string {
  return INTENTION_LABELS[i] ?? i.charAt(0).toUpperCase() + i.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────
// SEED DATA — the Episcopal calendar, in calendar order (Jan → Dec).
// ─────────────────────────────────────────────────────────────────────────

export const SAINTS: Saint[] = [
  // ── JANUARY ──────────────────────────────────────────────────────────
  {
    id: "holy-name",
    name: "The Holy Name of Our Lord Jesus Christ",
    feastDate: { month: 1, day: 1 },
    rank: "holyDay",
    vocation: [],
    knownFor:
      "The naming and circumcision of Jesus on the eighth day, when he was given the Name above every name.",
    patronOf: [],
    intercedesFor: ["faith"],
    collectExcerpt: "Plant in every heart the love of the Savior of the world.",
  },
  {
    id: "william-laud",
    name: "William Laud",
    feastDate: { month: 1, day: 10 },
    rank: "commemoration",
    yearsLived: "1573 – 1645",
    vocation: ["archbishop", "martyr"],
    knownFor:
      "Archbishop of Canterbury who pressed for order and 'the beauty of holiness' in worship, and was executed during the English Civil War.",
    patronOf: [],
    intercedesFor: ["courage", "perseverance"],
    anglicanNote:
      "His insistence on reverent, sacramental worship shaped the High Church and later Anglo-Catholic tradition.",
  },
  {
    id: "antony-of-egypt",
    name: "Antony of Egypt",
    feastDate: { month: 1, day: 17 },
    rank: "commemoration",
    yearsLived: "c. 251 – 356",
    vocation: ["monastic", "hermit"],
    knownFor:
      "Father of Christian monasticism, who sold all he had and withdrew to the Egyptian desert to wrestle in prayer.",
    patronOf: ["monastics", "those with skin diseases"],
    intercedesFor: ["temptation", "perseverance", "prayer"],
  },
  {
    id: "confession-of-peter",
    name: "The Confession of Saint Peter",
    feastDate: { month: 1, day: 18 },
    rank: "holyDay",
    vocation: ["apostle"],
    knownFor:
      "Peter's confession at Caesarea Philippi — 'You are the Messiah, the Son of the living God' — the rock of the Church's faith.",
    patronOf: [],
    intercedesFor: ["faith", "doubt"],
    collectExcerpt: "Keep your Church steadfast upon the rock of this faith.",
  },
  {
    id: "conversion-of-paul",
    name: "The Conversion of Saint Paul",
    feastDate: { month: 1, day: 25 },
    rank: "holyDay",
    vocation: ["apostle"],
    knownFor:
      "The persecutor Saul, struck down on the Damascus road, met the risen Christ and became the apostle to the Gentiles.",
    patronOf: [],
    intercedesFor: ["conversion", "vocation", "doubt"],
    collectExcerpt: "Cause the light of the Gospel to shine throughout the world.",
  },

  // ── FEBRUARY ─────────────────────────────────────────────────────────
  {
    id: "brigid-of-kildare",
    name: "Brigid of Kildare",
    feastDate: { month: 2, day: 1 },
    rank: "commemoration",
    yearsLived: "c. 451 – c. 525",
    vocation: ["abbess", "monastic"],
    knownFor:
      "One of Ireland's patron saints, founder of the great double monastery at Kildare, remembered for boundless hospitality to the poor.",
    patronOf: ["Ireland", "poets", "dairy workers"],
    intercedesFor: ["hospitality", "the_poor", "peace"],
  },
  {
    id: "the-presentation",
    name: "The Presentation of Our Lord (Candlemas)",
    feastDate: { month: 2, day: 2 },
    rank: "holyDay",
    vocation: [],
    knownFor:
      "The infant Jesus presented in the Temple, where aged Simeon and Anna recognized him as 'a light to lighten the nations.'",
    patronOf: [],
    intercedesFor: ["the_elderly", "hope"],
    collectExcerpt: "That we may be presented to you with pure and clean hearts.",
  },
  {
    id: "absalom-jones",
    name: "Absalom Jones",
    feastDate: { month: 2, day: 13 },
    rank: "commemoration",
    yearsLived: "1746 – 1818",
    vocation: ["priest"],
    knownFor:
      "Born enslaved, he bought his freedom and became the first African American ordained a priest in the Episcopal Church.",
    patronOf: [],
    intercedesFor: ["justice", "perseverance", "reconciliation"],
    anglicanNote:
      "Founder of the African Episcopal Church of St. Thomas in Philadelphia — a cornerstone of Black Episcopal life.",
  },
  {
    id: "polycarp",
    name: "Polycarp of Smyrna",
    feastDate: { month: 2, day: 23 },
    rank: "commemoration",
    yearsLived: "c. 69 – c. 155",
    vocation: ["bishop", "martyr"],
    knownFor:
      "Bishop of Smyrna and a disciple of John, martyred in great old age, refusing to curse the Christ he had served eighty-six years.",
    patronOf: [],
    intercedesFor: ["courage", "perseverance", "faith"],
  },
  {
    id: "george-herbert",
    name: "George Herbert",
    feastDate: { month: 2, day: 27 },
    rank: "commemoration",
    yearsLived: "1593 – 1633",
    vocation: ["priest", "poet"],
    knownFor:
      "Country parson and poet whose verse in The Temple turns the ordinary into prayer with disarming tenderness.",
    patronOf: [],
    intercedesFor: ["creativity", "vocation", "prayer"],
    anglicanNote:
      "His poems and A Priest to the Temple set the enduring Anglican ideal of the faithful, humble parish priest.",
  },

  // ── MARCH ────────────────────────────────────────────────────────────
  {
    id: "perpetua-and-companions",
    name: "Perpetua and her Companions",
    feastDate: { month: 3, day: 7 },
    rank: "commemoration",
    yearsLived: "died 202",
    vocation: ["martyr", "layperson", "mother"],
    knownFor:
      "A young nursing mother and her companions martyred at Carthage; her prison diary is one of the earliest writings by a Christian woman.",
    patronOf: ["mothers", "those facing childbirth"],
    intercedesFor: ["courage", "childbirth", "family"],
  },
  {
    id: "gregory-the-great",
    name: "Gregory the Great",
    feastDate: { month: 3, day: 12 },
    rank: "commemoration",
    yearsLived: "c. 540 – 604",
    vocation: ["bishop", "theologian", "pastor"],
    knownFor:
      "Bishop of Rome who called himself 'servant of the servants of God,' shaped the Church's pastoral care and song.",
    patronOf: ["musicians", "teachers"],
    intercedesFor: ["leadership", "study"],
    anglicanNote:
      "He sent Augustine of Canterbury to evangelize the English — the root of the English Church.",
  },
  {
    id: "joseph",
    name: "Saint Joseph",
    feastDate: { month: 3, day: 19 },
    rank: "holyDay",
    vocation: ["layperson"],
    knownFor:
      "The carpenter of Nazareth, husband of Mary and guardian of the child Jesus, who obeyed God's word in dreams without a single recorded word of his own.",
    patronOf: ["workers", "fathers", "a holy death"],
    intercedesFor: ["work", "family", "dying"],
    collectExcerpt: "Give us grace to imitate his uprightness and obedience.",
  },
  {
    id: "thomas-cranmer",
    name: "Thomas Cranmer",
    feastDate: { month: 3, day: 21 },
    rank: "commemoration",
    yearsLived: "1489 – 1556",
    vocation: ["archbishop", "martyr", "reformer"],
    knownFor:
      "Archbishop of Canterbury and chief architect of the English Reformation, burned at the stake after thrusting first into the fire the hand that had signed his recantation.",
    patronOf: [],
    intercedesFor: ["courage", "faith"],
    anglicanNote:
      "Principal author of the Book of Common Prayer; his cadences still shape how Anglicans pray in English.",
  },
  {
    id: "the-annunciation",
    name: "The Annunciation of Our Lord to the Blessed Virgin Mary",
    feastDate: { month: 3, day: 25 },
    rank: "holyDay",
    vocation: [],
    knownFor:
      "The angel Gabriel's announcement to Mary, and her fearless 'yes' — 'Let it be to me according to your word.'",
    patronOf: [],
    intercedesFor: ["vocation", "childbirth", "faith"],
    collectExcerpt: "Pour your grace into our hearts, O Lord.",
  },
  {
    id: "charles-henry-brent",
    name: "Charles Henry Brent",
    feastDate: { month: 3, day: 27 },
    rank: "commemoration",
    yearsLived: "1862 – 1929",
    vocation: ["bishop", "missionary"],
    knownFor:
      "Missionary bishop of the Philippines who fought the opium trade and helped birth the modern ecumenical movement.",
    patronOf: [],
    intercedesFor: ["mission", "reconciliation", "justice"],
    anglicanNote:
      "His call for Christian unity at Edinburgh 1910 helped launch the Faith and Order movement.",
  },
  {
    id: "john-keble",
    name: "John Keble",
    feastDate: { month: 3, day: 29 },
    rank: "commemoration",
    yearsLived: "1792 – 1866",
    vocation: ["priest", "poet"],
    knownFor:
      "Oxford priest and poet whose 1833 Assize Sermon on 'National Apostasy' is reckoned the start of the Oxford Movement.",
    patronOf: [],
    intercedesFor: ["faith", "creativity"],
    anglicanNote:
      "His book The Christian Year and the Tractarians renewed Catholic faith and devotion within Anglicanism.",
  },
  {
    id: "john-donne",
    name: "John Donne",
    feastDate: { month: 3, day: 31 },
    rank: "commemoration",
    yearsLived: "1572 – 1631",
    vocation: ["priest", "poet"],
    knownFor:
      "Metaphysical poet who became Dean of St. Paul's, preaching mortality and mercy with unsparing power — 'never send to know for whom the bell tolls.'",
    patronOf: [],
    intercedesFor: ["grief", "creativity", "doubt"],
    anglicanNote:
      "One of the great Anglican preacher-poets; his Holy Sonnets and Devotions remain devotional classics.",
  },

  // ── APRIL ────────────────────────────────────────────────────────────
  {
    id: "frederick-denison-maurice",
    name: "Frederick Denison Maurice",
    feastDate: { month: 4, day: 1 },
    rank: "commemoration",
    yearsLived: "1805 – 1872",
    vocation: ["priest", "theologian", "reformer"],
    knownFor:
      "Theologian of the Kingdom of God and a founder of Christian Socialism, who insisted the gospel had everything to do with the poor.",
    patronOf: [],
    intercedesFor: ["justice", "the_poor", "study"],
    anglicanNote:
      "A founder of Christian Socialism and of workers' education in the Church of England.",
  },
  {
    id: "martin-luther-king-jr",
    name: "Martin Luther King, Jr.",
    feastDate: { month: 4, day: 4 },
    rank: "commemoration",
    yearsLived: "1929 – 1968",
    vocation: ["pastor", "martyr", "prophet"],
    knownFor:
      "Baptist pastor and prophet of the civil rights movement, who preached nonviolent love against the sin of racism and was martyred in Memphis.",
    patronOf: [],
    intercedesFor: ["justice", "reconciliation", "courage"],
  },
  {
    id: "mark",
    name: "Saint Mark the Evangelist",
    feastDate: { month: 4, day: 25 },
    rank: "holyDay",
    vocation: ["evangelist"],
    knownFor:
      "Companion of Peter and Paul, traditionally the author of the earliest and most urgent of the four Gospels.",
    patronOf: ["Venice", "notaries"],
    intercedesFor: ["mission", "faith"],
    collectExcerpt: "Make us firmly grounded in the truth of the Gospel.",
  },
  {
    id: "catherine-of-siena",
    name: "Catherine of Siena",
    feastDate: { month: 4, day: 29 },
    rank: "commemoration",
    yearsLived: "1347 – 1380",
    vocation: ["mystic", "religious", "reformer"],
    knownFor:
      "Dominican mystic whose visions and fierce letters called popes and princes to reform, even as she served plague victims.",
    patronOf: ["Italy", "the sick"],
    intercedesFor: ["reconciliation", "illness", "justice"],
  },

  // ── MAY ──────────────────────────────────────────────────────────────
  {
    id: "philip-and-james",
    name: "Saint Philip and Saint James",
    feastDate: { month: 5, day: 1 },
    rank: "holyDay",
    vocation: ["apostle"],
    knownFor:
      "Two of the Twelve — Philip, who asked to be shown the Father, and James, called the Less — apostles of the earliest Church.",
    patronOf: [],
    intercedesFor: ["faith", "vocation"],
    collectExcerpt: "Grant us grace and strength to bear witness to the truth.",
  },
  {
    id: "athanasius",
    name: "Athanasius of Alexandria",
    feastDate: { month: 5, day: 2 },
    rank: "commemoration",
    yearsLived: "c. 296 – 373",
    vocation: ["bishop", "theologian"],
    knownFor:
      "Bishop of Alexandria who, exiled five times, defended the full divinity of Christ when most of the world had gone the other way.",
    patronOf: [],
    intercedesFor: ["doubt", "perseverance", "faith"],
  },
  {
    id: "monica",
    name: "Monica, Mother of Augustine",
    feastDate: { month: 5, day: 4 },
    rank: "commemoration",
    yearsLived: "c. 331 – 387",
    vocation: ["layperson", "mother"],
    knownFor:
      "Mother of Augustine, who prayed and wept for her brilliant, wayward son for decades until he turned to Christ.",
    patronOf: ["mothers", "wives", "those praying for wayward children"],
    intercedesFor: ["family", "perseverance", "conversion"],
  },
  {
    id: "julian-of-norwich",
    name: "Julian of Norwich",
    feastDate: { month: 5, day: 8 },
    rank: "commemoration",
    yearsLived: "c. 1342 – c. 1416",
    vocation: ["mystic", "hermit"],
    knownFor:
      "An anchoress who, gravely ill, received sixteen 'showings' of God's love and wrote them down — the assurance that 'all shall be well.'",
    patronOf: ["anchorites", "contemplatives", "those facing serious illness"],
    intercedesFor: ["doubt", "illness", "hope", "grief"],
    anglicanNote:
      "Her Revelations of Divine Love is the first book in English known to be written by a woman.",
  },
  {
    id: "frances-perkins",
    name: "Frances Perkins",
    feastDate: { month: 5, day: 13 },
    rank: "commemoration",
    yearsLived: "1880 – 1965",
    vocation: ["layperson", "reformer"],
    knownFor:
      "First woman in a U.S. presidential cabinet, architect of Social Security and the end of child labor, who saw public service as Christian vocation.",
    patronOf: [],
    intercedesFor: ["justice", "work", "the_poor"],
    anglicanNote:
      "A devout Episcopalian who made monthly retreats; her reforms flowed from a sacramental sense of the common good.",
  },
  {
    id: "the-visitation",
    name: "The Visitation of the Blessed Virgin Mary",
    feastDate: { month: 5, day: 31 },
    rank: "holyDay",
    vocation: [],
    knownFor:
      "Mary's visit to her cousin Elizabeth, where the unborn John leapt for joy and Mary sang the Magnificat.",
    patronOf: [],
    intercedesFor: ["childbirth", "justice", "family"],
    collectExcerpt: "Blessed in bearing Christ, more blessed in keeping your word.",
  },

  // ── JUNE ─────────────────────────────────────────────────────────────
  {
    id: "barnabas",
    name: "Saint Barnabas the Apostle",
    feastDate: { month: 6, day: 11 },
    rank: "holyDay",
    vocation: ["apostle", "missionary"],
    knownFor:
      "Called the 'son of encouragement,' he vouched for the newly converted Paul and gave generously to the first community.",
    patronOf: ["Cyprus"],
    intercedesFor: ["reconciliation", "hospitality", "mission"],
    collectExcerpt: "Grant us to give generously for the relief of the poor.",
  },
  {
    id: "evelyn-underhill",
    name: "Evelyn Underhill",
    feastDate: { month: 6, day: 15 },
    rank: "commemoration",
    yearsLived: "1875 – 1941",
    vocation: ["layperson", "mystic", "teacher"],
    knownFor:
      "Laywoman whose writing on mysticism and the spiritual life drew countless ordinary people into deeper prayer.",
    patronOf: [],
    intercedesFor: ["prayer", "study", "doubt"],
    anglicanNote:
      "An Anglican laywoman and the first woman to lead retreats in the Church of England; her book Mysticism reshaped English devotion.",
  },
  {
    id: "nativity-of-john-the-baptist",
    name: "The Nativity of Saint John the Baptist",
    feastDate: { month: 6, day: 24 },
    rank: "holyDay",
    vocation: ["prophet"],
    knownFor:
      "The forerunner who would 'prepare the way of the Lord' and decrease that Christ might increase — his birth foretold to old Zechariah.",
    patronOf: [],
    intercedesFor: ["conversion", "courage", "vocation"],
    collectExcerpt: "Make us constantly to speak the truth and boldly rebuke vice.",
  },
  {
    id: "peter-and-paul",
    name: "Saint Peter and Saint Paul",
    feastDate: { month: 6, day: 29 },
    rank: "holyDay",
    vocation: ["apostle", "martyr"],
    knownFor:
      "The two great apostles — the fisherman and the persecutor-turned-preacher — who gave their lives at Rome for the gospel they once received.",
    patronOf: ["fishermen", "missionaries", "theologians"],
    intercedesFor: ["faith", "mission", "courage"],
    collectExcerpt: "Stand firm upon the one foundation, which is Jesus Christ.",
  },

  // ── JULY ─────────────────────────────────────────────────────────────
  {
    id: "pauli-murray",
    name: "Pauli Murray",
    feastDate: { month: 7, day: 1 },
    rank: "commemoration",
    yearsLived: "1910 – 1985",
    vocation: ["priest", "reformer", "layperson"],
    knownFor:
      "Poet, lawyer, and civil rights pioneer whose legal thought armed the movements for racial and gender justice, and the first Black woman ordained an Episcopal priest.",
    patronOf: [],
    intercedesFor: ["justice", "reconciliation", "vocation"],
    anglicanNote:
      "Ordained in 1977, she celebrated her first Eucharist at the chapel where her enslaved grandmother had been baptized.",
  },
  {
    id: "benedict-of-nursia",
    name: "Benedict of Nursia",
    feastDate: { month: 7, day: 11 },
    rank: "commemoration",
    yearsLived: "c. 480 – c. 547",
    vocation: ["monastic", "abbot"],
    knownFor:
      "Father of Western monasticism, whose Rule balanced prayer and work — 'ora et labora' — into a school for the Lord's service.",
    patronOf: ["Europe", "monastics", "students"],
    intercedesFor: ["study", "perseverance", "peace"],
  },
  {
    id: "william-white",
    name: "William White",
    feastDate: { month: 7, day: 17 },
    rank: "commemoration",
    yearsLived: "1748 – 1836",
    vocation: ["bishop"],
    knownFor:
      "Chaplain to the Continental Congress who held the scattered American church together after the Revolution and gave it a constitution.",
    patronOf: [],
    intercedesFor: ["leadership", "reconciliation"],
    anglicanNote:
      "Principal organizer and first Presiding Bishop of the Episcopal Church.",
  },
  {
    id: "macrina",
    name: "Macrina the Younger",
    feastDate: { month: 7, day: 19 },
    rank: "commemoration",
    yearsLived: "c. 330 – 379",
    vocation: ["monastic", "teacher"],
    knownFor:
      "Teacher and monastic who shaped the faith of her brothers Basil the Great and Gregory of Nyssa, and met her own death with serene hope.",
    patronOf: [],
    intercedesFor: ["study", "grief", "faith"],
  },
  {
    id: "harriet-tubman",
    name: "Harriet Tubman",
    feastDate: { month: 7, day: 20 },
    rank: "commemoration",
    yearsLived: "c. 1820 – 1913",
    vocation: ["prophet", "layperson"],
    knownFor:
      "Escaped slavery and returned again and again to lead others to freedom on the Underground Railroad, trusting God to light the way.",
    patronOf: [],
    intercedesFor: ["justice", "courage", "travel"],
  },
  {
    id: "mary-magdalene",
    name: "Saint Mary Magdalene",
    feastDate: { month: 7, day: 22 },
    rank: "holyDay",
    vocation: ["apostle"],
    knownFor:
      "Healed by Jesus and faithful to the cross, she was first to meet the risen Lord — the 'apostle to the apostles.'",
    patronOf: ["penitents", "contemplatives"],
    intercedesFor: ["grief", "healing", "conversion"],
    collectExcerpt: "Heal us of all our infirmities, and let us know you.",
  },
  {
    id: "james",
    name: "Saint James the Apostle",
    feastDate: { month: 7, day: 25 },
    rank: "holyDay",
    vocation: ["apostle", "martyr"],
    knownFor:
      "One of the sons of Zebedee, called from his nets, present at the Transfiguration, and the first apostle to be martyred.",
    patronOf: ["pilgrims", "Spain"],
    intercedesFor: ["travel", "perseverance", "vocation"],
    collectExcerpt: "Pour upon your Church the spirit of self-denying service.",
  },

  // ── AUGUST ───────────────────────────────────────────────────────────
  {
    id: "the-transfiguration",
    name: "The Transfiguration of Our Lord",
    feastDate: { month: 8, day: 6 },
    rank: "holyDay",
    vocation: [],
    knownFor:
      "On the mountain Jesus shone with divine glory before Peter, James, and John, and the Father's voice said, 'This is my Son; listen to him.'",
    patronOf: [],
    intercedesFor: ["prayer", "hope"],
    collectExcerpt: "By faith, may we behold the King in his beauty.",
  },
  {
    id: "clare-of-assisi",
    name: "Clare of Assisi",
    feastDate: { month: 8, day: 11 },
    rank: "commemoration",
    yearsLived: "1194 – 1253",
    vocation: ["abbess", "monastic"],
    knownFor:
      "Follower of Francis who fled wealth to found the Poor Clares, embracing 'holy poverty' with joy for forty years.",
    patronOf: ["eyes and eye disease", "television"],
    intercedesFor: ["poverty", "perseverance", "prayer"],
  },
  {
    id: "florence-nightingale",
    name: "Florence Nightingale",
    feastDate: { month: 8, day: 13 },
    rank: "commemoration",
    yearsLived: "1820 – 1910",
    vocation: ["nurse", "reformer", "layperson"],
    knownFor:
      "The 'lady with the lamp,' who answered a sense of divine calling by founding modern nursing and reforming care for the sick poor.",
    patronOf: ["nurses"],
    intercedesFor: ["illness", "healing", "vocation"],
  },
  {
    id: "jonathan-myrick-daniels",
    name: "Jonathan Myrick Daniels",
    feastDate: { month: 8, day: 14 },
    rank: "commemoration",
    yearsLived: "1939 – 1965",
    vocation: ["martyr", "layperson"],
    knownFor:
      "An Episcopal seminarian who answered the call to Selma and was killed stepping in front of a shotgun to shield a young Black woman.",
    patronOf: [],
    intercedesFor: ["justice", "courage"],
  },
  {
    id: "mary-the-virgin",
    name: "Saint Mary the Virgin",
    feastDate: { month: 8, day: 15 },
    rank: "holyDay",
    yearsLived: "1st century",
    vocation: ["layperson", "mother"],
    knownFor:
      "The Mother of our Lord, whose 'yes' to God made her the God-bearer and the first and truest disciple.",
    patronOf: ["mothers", "the Church"],
    intercedesFor: ["childbirth", "family", "faith"],
    collectExcerpt: "May we share with her the glory of your eternal kingdom.",
  },
  {
    id: "bartholomew",
    name: "Saint Bartholomew the Apostle",
    feastDate: { month: 8, day: 24 },
    rank: "holyDay",
    vocation: ["apostle", "martyr"],
    knownFor:
      "One of the Twelve (often identified with Nathanael, 'an Israelite in whom there is no guile'), who carried the gospel east and died a martyr.",
    patronOf: ["tanners", "leatherworkers"],
    intercedesFor: ["faith", "mission"],
    collectExcerpt: "Grant us grace truly to believe and to preach your Word.",
  },
  {
    id: "augustine-of-hippo",
    name: "Augustine of Hippo",
    feastDate: { month: 8, day: 28 },
    rank: "commemoration",
    yearsLived: "354 – 430",
    vocation: ["bishop", "theologian"],
    knownFor:
      "Restless seeker turned bishop of Hippo, whose Confessions and City of God shaped Western Christianity — 'our hearts are restless until they rest in you.'",
    patronOf: ["theologians", "those seeking conversion"],
    intercedesFor: ["conversion", "doubt", "study"],
  },

  // ── SEPTEMBER ────────────────────────────────────────────────────────
  {
    id: "constance-and-companions",
    name: "Constance and her Companions (Martyrs of Memphis)",
    feastDate: { month: 9, day: 9 },
    rank: "commemoration",
    yearsLived: "died 1878",
    vocation: ["religious", "martyr"],
    knownFor:
      "Episcopal sisters and clergy who stayed to nurse the dying through the Memphis yellow fever epidemic and died doing it.",
    patronOf: [],
    intercedesFor: ["illness", "dying", "courage"],
  },
  {
    id: "cyprian-of-carthage",
    name: "Cyprian of Carthage",
    feastDate: { month: 9, day: 13 },
    rank: "commemoration",
    yearsLived: "c. 200 – 258",
    vocation: ["bishop", "martyr", "theologian"],
    knownFor:
      "Bishop of Carthage and martyr who guided his flock through persecution and wrote tenderly on the unity of the Church.",
    patronOf: [],
    intercedesFor: ["reconciliation", "courage", "leadership"],
  },
  {
    id: "holy-cross-day",
    name: "Holy Cross Day",
    feastDate: { month: 9, day: 14 },
    rank: "holyDay",
    vocation: [],
    knownFor:
      "A day to glory in the cross of Christ — the instrument of death made the tree of life and the sign of God's victory.",
    patronOf: [],
    intercedesFor: ["suffering", "hope"],
    collectExcerpt: "Give us grace to take up our cross and follow him.",
  },
  {
    id: "hildegard-of-bingen",
    name: "Hildegard of Bingen",
    feastDate: { month: 9, day: 17 },
    rank: "commemoration",
    yearsLived: "1098 – 1179",
    vocation: ["abbess", "mystic", "composer"],
    knownFor:
      "Benedictine abbess, visionary, composer, and natural scientist — a 'feather on the breath of God' who counseled popes and emperors.",
    patronOf: [],
    intercedesFor: ["creativity", "study", "healing"],
  },
  {
    id: "edward-bouverie-pusey",
    name: "Edward Bouverie Pusey",
    feastDate: { month: 9, day: 18 },
    rank: "commemoration",
    yearsLived: "1800 – 1882",
    vocation: ["priest", "theologian"],
    knownFor:
      "Oxford scholar who, after Newman's departure, became the steady leader of the movement to recover Catholic faith and practice in Anglicanism.",
    patronOf: [],
    intercedesFor: ["faith", "study", "perseverance"],
    anglicanNote:
      "A leader of the Oxford Movement; he championed sacramental confession and the revival of religious orders in the Church of England.",
  },
  {
    id: "matthew",
    name: "Saint Matthew the Apostle and Evangelist",
    feastDate: { month: 9, day: 21 },
    rank: "holyDay",
    vocation: ["apostle", "evangelist"],
    knownFor:
      "A tax collector who rose from his booth at Jesus' word, 'Follow me,' and gave the Church its first Gospel.",
    patronOf: ["accountants", "tax collectors", "bankers"],
    intercedesFor: ["conversion", "work", "vocation"],
    collectExcerpt: "With ready will and heart, follow the call of our Lord.",
  },
  {
    id: "lancelot-andrewes",
    name: "Lancelot Andrewes",
    feastDate: { month: 9, day: 26 },
    rank: "commemoration",
    yearsLived: "1555 – 1626",
    vocation: ["bishop", "scholar"],
    knownFor:
      "Bishop and master of many languages, the finest preacher of his age, whose private prayers are an Anglican treasure.",
    patronOf: [],
    intercedesFor: ["study", "prayer"],
    anglicanNote:
      "He led the company of translators who produced the King James Bible; his Preces Privatae remain a devotional classic.",
  },
  {
    id: "michael-and-all-angels",
    name: "Saint Michael and All Angels",
    feastDate: { month: 9, day: 29 },
    rank: "holyDay",
    vocation: [],
    knownFor:
      "Michaelmas — honoring the archangel Michael and the angelic hosts who worship God and are sent to guard and guide his people.",
    patronOf: ["protection against evil", "soldiers", "the sick"],
    intercedesFor: ["protection", "courage"],
    collectExcerpt: "May your angels help and defend us here on earth.",
  },

  // ── OCTOBER ──────────────────────────────────────────────────────────
  {
    id: "vida-dutton-scudder",
    name: "Vida Dutton Scudder",
    feastDate: { month: 10, day: 10 },
    rank: "commemoration",
    yearsLived: "1861 – 1954",
    vocation: ["teacher", "reformer", "layperson"],
    knownFor:
      "Scholar and educator who joined the settlement-house movement and Christian Socialism, binding contemplative prayer to the work of justice.",
    patronOf: [],
    intercedesFor: ["justice", "study", "the_poor"],
    anglicanNote:
      "An Anglo-Catholic laywoman and member of the Society of the Companions of the Holy Cross.",
  },
  {
    id: "teresa-of-avila",
    name: "Teresa of Ávila",
    feastDate: { month: 10, day: 15 },
    rank: "commemoration",
    yearsLived: "1515 – 1582",
    vocation: ["mystic", "religious", "reformer"],
    knownFor:
      "Carmelite reformer and mystic whose Interior Castle maps the soul's journey into God, written with wit and steel.",
    patronOf: ["those who pray", "people who suffer headaches"],
    intercedesFor: ["prayer", "perseverance", "illness"],
  },
  {
    id: "ignatius-of-antioch",
    name: "Ignatius of Antioch",
    feastDate: { month: 10, day: 17 },
    rank: "commemoration",
    yearsLived: "c. 35 – c. 107",
    vocation: ["bishop", "martyr"],
    knownFor:
      "Bishop of Antioch who, led to Rome to die, wrote luminous letters begging the churches not to prevent his witness — 'I am God's wheat.'",
    patronOf: [],
    intercedesFor: ["courage", "perseverance", "faith"],
  },
  {
    id: "luke",
    name: "Saint Luke the Evangelist",
    feastDate: { month: 10, day: 18 },
    rank: "holyDay",
    vocation: ["evangelist", "physician"],
    knownFor:
      "The beloved physician and companion of Paul, who gave us the Gospel of mercy and the Acts of the Apostles.",
    patronOf: ["physicians", "artists", "surgeons"],
    intercedesFor: ["illness", "healing", "creativity"],
    collectExcerpt: "Continue in your Church your love and power to heal.",
  },
  {
    id: "simon-and-jude",
    name: "Saint Simon and Saint Jude",
    feastDate: { month: 10, day: 28 },
    rank: "holyDay",
    vocation: ["apostle", "martyr"],
    knownFor:
      "Two of the lesser-known Twelve — Simon the Zealot and Jude (Thaddaeus) — faithful witnesses to the ends of the earth.",
    patronOf: ["lost causes", "desperate situations"],
    intercedesFor: ["hope", "doubt", "perseverance"],
    collectExcerpt: "Make known the love and mercy of our Lord.",
  },

  // ── NOVEMBER ─────────────────────────────────────────────────────────
  {
    id: "all-saints",
    name: "All Saints",
    feastDate: { month: 11, day: 1 },
    rank: "principalFeast",
    vocation: [],
    knownFor:
      "The whole company of the faithful in every age — the great cloud of witnesses, known and unknown, who now rest in God.",
    patronOf: [],
    intercedesFor: ["grief", "hope", "faith"],
    collectExcerpt: "You knit together your elect in one communion and fellowship.",
  },
  {
    id: "richard-hooker",
    name: "Richard Hooker",
    feastDate: { month: 11, day: 3 },
    rank: "commemoration",
    yearsLived: "1554 – 1600",
    vocation: ["priest", "theologian"],
    knownFor:
      "Gentle, formidable theologian whose Laws of Ecclesiastical Polity gave Anglicanism its reasoned, irenic temper.",
    patronOf: [],
    intercedesFor: ["study", "reconciliation", "peace"],
    anglicanNote:
      "He framed the enduring Anglican appeal to Scripture, tradition, and reason held together.",
  },
  {
    id: "charles-simeon",
    name: "Charles Simeon",
    feastDate: { month: 11, day: 12 },
    rank: "commemoration",
    yearsLived: "1759 – 1836",
    vocation: ["priest"],
    knownFor:
      "Cambridge preacher who endured years of opposition in his parish and helped kindle the evangelical revival and the missionary movement.",
    patronOf: [],
    intercedesFor: ["perseverance", "mission", "vocation"],
    anglicanNote:
      "A father of Anglican evangelicalism and a founder of the Church Missionary Society.",
  },
  {
    id: "samuel-seabury",
    name: "Samuel Seabury",
    feastDate: { month: 11, day: 14 },
    rank: "commemoration",
    yearsLived: "1729 – 1796",
    vocation: ["bishop"],
    knownFor:
      "The first bishop of the Episcopal Church, consecrated in Scotland when English bishops would not, linking America to the wider Church.",
    patronOf: [],
    intercedesFor: ["leadership", "perseverance"],
    anglicanNote:
      "First American bishop; his Scottish consecration shaped the Episcopal Church's eucharistic prayer.",
  },
  {
    id: "margaret-of-scotland",
    name: "Margaret of Scotland",
    feastDate: { month: 11, day: 16 },
    rank: "commemoration",
    yearsLived: "c. 1045 – 1093",
    vocation: ["queen", "layperson"],
    knownFor:
      "Queen who reformed the Scottish church, fed orphans and the poor with her own hands, and washed the feet of the needy.",
    patronOf: ["Scotland"],
    intercedesFor: ["family", "the_poor", "justice"],
  },
  {
    id: "hilda-of-whitby",
    name: "Hilda of Whitby",
    feastDate: { month: 11, day: 18 },
    rank: "commemoration",
    yearsLived: "614 – 680",
    vocation: ["abbess", "monastic"],
    knownFor:
      "Founding abbess of Whitby, so wise that kings and bishops sought her counsel; she nurtured the cowherd-poet Caedmon's gift.",
    patronOf: [],
    intercedesFor: ["study", "leadership", "reconciliation"],
    anglicanNote:
      "She hosted the Synod of Whitby (664), a turning point for the English Church.",
  },
  {
    id: "andrew",
    name: "Saint Andrew the Apostle",
    feastDate: { month: 11, day: 30 },
    rank: "holyDay",
    vocation: ["apostle", "martyr"],
    knownFor:
      "The first called, who straightway brought his brother Simon Peter to Jesus — the apostle who keeps bringing others to Christ.",
    patronOf: ["Scotland", "fishermen"],
    intercedesFor: ["mission", "vocation", "faith"],
    collectExcerpt: "Give us grace to follow your call without delay.",
  },

  // ── DECEMBER ─────────────────────────────────────────────────────────
  {
    id: "thomas",
    name: "Saint Thomas the Apostle",
    feastDate: { month: 12, day: 21 },
    rank: "holyDay",
    vocation: ["apostle", "martyr"],
    knownFor:
      "The apostle who would not believe until he touched the wounds, and then made the Church's greatest confession: 'My Lord and my God.'",
    patronOf: ["architects", "India", "those who struggle with doubt"],
    intercedesFor: ["doubt", "faith"],
    collectExcerpt: "Grant us, without doubt, to believe in Jesus Christ.",
  },
  {
    id: "stephen",
    name: "Saint Stephen, Deacon and Martyr",
    feastDate: { month: 12, day: 26 },
    rank: "holyDay",
    yearsLived: "1st century",
    vocation: ["deacon", "martyr"],
    knownFor:
      "The first deacon and the first martyr, who, being stoned, prayed for his killers as Christ had done.",
    patronOf: ["deacons", "stonemasons"],
    intercedesFor: ["courage", "reconciliation", "the_poor"],
    collectExcerpt: "Grant us grace to love even our enemies.",
  },
  {
    id: "john",
    name: "Saint John, Apostle and Evangelist",
    feastDate: { month: 12, day: 27 },
    rank: "holyDay",
    vocation: ["apostle", "evangelist", "theologian"],
    knownFor:
      "The beloved disciple, who leaned on the Lord at supper and gave the Church the Gospel and letters of love — 'God is love.'",
    patronOf: ["theologians", "writers"],
    intercedesFor: ["faith", "creativity", "hope"],
    collectExcerpt: "May we walk in the light of your truth.",
  },
  {
    id: "holy-innocents",
    name: "The Holy Innocents",
    feastDate: { month: 12, day: 28 },
    rank: "holyDay",
    vocation: ["martyr"],
    knownFor:
      "The children of Bethlehem killed by Herod's jealousy — the Church's youngest martyrs, who died for a King they never knew.",
    patronOf: ["children"],
    intercedesFor: ["grief", "protection"],
    collectExcerpt: "Receive the innocent; frustrate the designs of evil tyrants.",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Lookup helpers (used by the views). All pure + synchronous over the array.
// ─────────────────────────────────────────────────────────────────────────

// Every saint commemorated on the given month/day (usually 0–2 entries).
export function getSaintsOn(month: number, day: number): Saint[] {
  return SAINTS.filter((s) => s.feastDate.month === month && s.feastDate.day === day);
}

// Today's commemoration(s) in the viewer's local time.
export function getTodaysSaints(now: Date = new Date()): Saint[] {
  return getSaintsOn(now.getMonth() + 1, now.getDate());
}

// The next upcoming commemoration on or after `now` (wraps past year-end).
// Returns the saint(s) sharing the soonest date.
export function getNextCommemoration(now: Date = new Date()): Saint[] {
  const todayKey = (now.getMonth() + 1) * 100 + now.getDate();
  const withKey = SAINTS.map((s) => ({
    s,
    key: s.feastDate.month * 100 + s.feastDate.day,
  }));
  const ahead = withKey
    .filter((x) => x.key > todayKey)
    .sort((a, b) => a.key - b.key);
  const pool = ahead.length > 0 ? ahead : withKey.slice().sort((a, b) => a.key - b.key);
  if (pool.length === 0) return [];
  const soonest = pool[0].key;
  return pool.filter((x) => x.key === soonest).map((x) => x.s);
}

// Saints whose tagged intercessions include the given intention.
export function getSaintsByIntention(intention: Intention): Saint[] {
  return SAINTS.filter((s) => s.intercedesFor.includes(intention));
}

// Free-text search across name, "known for", patronage, and Anglican note.
export function searchSaints(query: string): Saint[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SAINTS.filter((s) => {
    const hay = [
      s.name,
      s.knownFor,
      s.anglicanNote ?? "",
      ...s.patronOf,
      ...s.vocation,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

// The distinct intentions actually used in the dataset, ordered by how many
// saints carry each (most-covered first) — drives the "Find" intention grid.
export function intentionsInUse(): Intention[] {
  const counts = new Map<Intention, number>();
  for (const s of SAINTS) {
    for (const i of s.intercedesFor) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([i]) => i);
}

export function getSaintById(id: string): Saint | undefined {
  return SAINTS.find((s) => s.id === id);
}

// Human label for a feast date, e.g. { month: 5, day: 8 } → "May 8".
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export function feastDateLabel(d: FeastDate): string {
  return `${MONTHS_SHORT[d.month - 1]} ${d.day}`;
}

export const RANK_LABELS: Record<SaintRank, string> = {
  principalFeast: "Principal Feast",
  holyDay: "Holy Day",
  commemoration: "Commemoration",
};

// sessionStorage key the letter composer reads to pre-insert a saint chosen
// from the Saint detail screen's "Add to a letter" action.
export const PENDING_SAINT_KEY = "phoebe:pending-saint";

// The snippet inserted into a letter draft when a saint is added — the name,
// feast date, and either the collect excerpt (quoted) or the "known for" line.
export function saintLetterSnippet(s: Saint): string {
  const head = `${s.name} (${feastDateLabel(s.feastDate)})`;
  const body = s.collectExcerpt ? `“${s.collectExcerpt}”` : s.knownFor;
  return `${head} — ${body}`;
}
