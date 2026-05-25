// ─────────────────────────────────────────────────────────────────────────
// Saints — a browsable, searchable index of the Episcopal calendar's
// commemorations, for finding a holy companion in prayer.
//
// PARITY WITH THE HOME SCREEN: the index is DERIVED from the same liturgical
// calendar that drives the home-screen feast header — the BCP Holy Days
// (fixed-feasts.ts) plus the Lesser Feasts & Fasts 2022 commemorations
// (lesser-feasts.ts). So every saint the home screen can name is guaranteed
// to be available here, on the same date, with no drift.
//
// CURATED DETAIL: the bare calendar gives a name, a role, life dates, and a
// rank. On top of that we overlay an ENRICHMENTS table — "known for" prose,
// traditional patronage, tagged intentions, a BCP collect excerpt, an
// Anglican note — for a selected cross-section. Enrichment is matched by the
// commemoration's normalized core name (the part before the first comma), so
// it tracks the calendar even when dates or groupings differ.
//
// PATRONAGE is filled ONLY where traditionally attested — better blank than
// invented. COLLECT excerpts come from the public-domain 1979 BCP (Holy Days
// + All Saints only; the LFF collects are copyrighted, so commemorations
// carry none).
// ─────────────────────────────────────────────────────────────────────────

import { HOLY_DAYS } from "@/lib/liturgical/fixed-feasts";
import { LESSER_FEASTS } from "@/lib/liturgical/lesser-feasts";
import type { FixedFeastEntry } from "@/lib/liturgical/types";

export type SaintRank = "principalFeast" | "holyDay" | "commemoration";

export type Vocation =
  | "apostle" | "evangelist" | "martyr" | "bishop" | "archbishop"
  | "priest" | "deacon" | "theologian" | "mystic" | "monastic"
  | "abbot" | "abbess" | "hermit" | "religious" | "reformer"
  | "missionary" | "pastor" | "teacher" | "poet" | "composer"
  | "scholar" | "nurse" | "physician" | "queen" | "king" | "prophet"
  | "layperson" | "mother";

export type Intention =
  | "grief" | "illness" | "healing" | "dying" | "suffering"
  | "vocation" | "doubt" | "faith" | "conversion" | "reconciliation"
  | "justice" | "courage" | "perseverance" | "prayer" | "study"
  | "creativity" | "childbirth" | "children" | "family" | "marriage" | "poverty"
  | "the_poor" | "hospitality" | "peace" | "protection" | "travel"
  | "leadership" | "mission" | "hope" | "temptation" | "work"
  | "mental_health" | "the_elderly" | "animals";

export interface FeastDate {
  month: number; // 1–12
  day: number; // 1–31
}

export interface Saint {
  id: string;
  name: string; // full calendar name, e.g. "Julian of Norwich, Mystic and Theologian"
  feastDate: FeastDate;
  rank: SaintRank;
  yearsLived?: string;
  vocation: Vocation[];
  knownFor?: string;
  patronOf: string[];
  intercedesFor: Intention[];
  collectExcerpt?: string;
  anglicanNote?: string;
}

export const INTENTION_LABELS: Partial<Record<Intention, string>> = {
  the_poor: "the poor",
  the_elderly: "the elderly",
  mental_health: "mental health",
};

export function intentionLabel(i: Intention): string {
  return INTENTION_LABELS[i] ?? i.charAt(0).toUpperCase() + i.slice(1);
}

export const RANK_LABELS: Record<SaintRank, string> = {
  principalFeast: "Principal Feast",
  holyDay: "Holy Day",
  commemoration: "Commemoration",
};

// ─── Enrichment ────────────────────────────────────────────────────────────

interface Enrichment {
  vocation?: Vocation[];
  knownFor?: string;
  patronOf?: string[];
  intercedesFor?: Intention[];
  collectExcerpt?: string; // BCP (public domain) — Holy Days only
  anglicanNote?: string;
}

// Normalize a calendar name to its core for enrichment lookup + search:
// take the part before the first comma, lowercase, strip diacritics.
function normalizeCore(name: string): string {
  return name
    .split(",")[0]
    .replace(/\s*\([^)]*\)/g, "") // drop parentheticals, e.g. "(Dorcas)"
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/['ʼʻ’`´]/g, "") // strip apostrophes / Hawaiian okina
    .replace(/\s+/g, " ")
    .trim();
}

// Keyed by normalizeCore(<calendar name>). Authored from the calendar text so
// the join is exact.
const ENRICHMENTS: Record<string, Enrichment> = {
  // ── Holy Days (BCP) ──
  "the holy name": {
    intercedesFor: ["faith"],
    collectExcerpt: "Plant in every heart the love of the Savior of the world.",
  },
  "the confession of saint peter the apostle": {
    vocation: ["apostle"],
    intercedesFor: ["faith", "doubt"],
    collectExcerpt: "Keep your Church steadfast upon the rock of this faith.",
  },
  "the conversion of saint paul the apostle": {
    vocation: ["apostle"],
    intercedesFor: ["conversion", "vocation", "doubt"],
    collectExcerpt: "Cause the light of the Gospel to shine throughout the world.",
  },
  "the presentation of our lord jesus christ in the temple": {
    intercedesFor: ["the_elderly", "hope"],
    collectExcerpt: "That we may be presented to you with pure and clean hearts.",
  },
  "saint joseph": {
    vocation: ["layperson"],
    patronOf: ["workers", "fathers", "a holy death"],
    intercedesFor: ["work", "family", "dying"],
    collectExcerpt: "Give us grace to imitate his uprightness and obedience.",
  },
  "the annunciation": {
    intercedesFor: ["vocation", "childbirth", "faith"],
    collectExcerpt: "Pour your grace into our hearts, O Lord.",
  },
  "saint mark the evangelist": {
    vocation: ["evangelist"],
    patronOf: ["Venice", "notaries"],
    intercedesFor: ["mission", "faith"],
    collectExcerpt: "Make us firmly grounded in the truth of the Gospel.",
  },
  "saints philip and james": {
    vocation: ["apostle"],
    intercedesFor: ["faith", "vocation"],
    collectExcerpt: "Grant us grace and strength to bear witness to the truth.",
  },
  "the visitation": {
    intercedesFor: ["childbirth", "justice", "family"],
    collectExcerpt: "Blessed in bearing Christ, more blessed in keeping your word.",
  },
  "saint barnabas the apostle": {
    vocation: ["apostle", "missionary"],
    patronOf: ["Cyprus"],
    intercedesFor: ["reconciliation", "hospitality", "mission"],
    collectExcerpt: "Grant us to give generously for the relief of the poor.",
  },
  "the nativity of saint john the baptist": {
    vocation: ["prophet"],
    intercedesFor: ["conversion", "courage", "vocation"],
    collectExcerpt: "Make us constantly to speak the truth and boldly rebuke vice.",
  },
  "saint peter and saint paul": {
    vocation: ["apostle", "martyr"],
    patronOf: ["fishermen", "missionaries", "theologians"],
    intercedesFor: ["faith", "mission", "courage"],
    collectExcerpt: "Stand firm upon the one foundation, which is Jesus Christ.",
  },
  "saint mary magdalene": {
    vocation: ["apostle"],
    patronOf: ["penitents", "contemplatives"],
    intercedesFor: ["grief", "healing", "conversion"],
    collectExcerpt: "Heal us of all our infirmities, and let us know you.",
  },
  "saint james the apostle": {
    vocation: ["apostle", "martyr"],
    patronOf: ["pilgrims", "Spain"],
    intercedesFor: ["travel", "perseverance", "vocation"],
    collectExcerpt: "Pour upon your Church the spirit of self-denying service.",
  },
  "the transfiguration of our lord jesus christ": {
    intercedesFor: ["prayer", "hope"],
    collectExcerpt: "By faith, may we behold the King in his beauty.",
  },
  "saint mary the virgin": {
    vocation: ["layperson", "mother"],
    patronOf: ["mothers", "the Church"],
    intercedesFor: ["childbirth", "family", "faith"],
    collectExcerpt: "May we share with her the glory of your eternal kingdom.",
  },
  "saint bartholomew the apostle": {
    vocation: ["apostle", "martyr"],
    patronOf: ["tanners", "leatherworkers"],
    intercedesFor: ["faith", "mission"],
    collectExcerpt: "Grant us grace truly to believe and to preach your Word.",
  },
  "holy cross day": {
    intercedesFor: ["suffering", "hope"],
    collectExcerpt: "Give us grace to take up our cross and follow him.",
  },
  "saint matthew": {
    vocation: ["apostle", "evangelist"],
    patronOf: ["accountants", "tax collectors", "bankers"],
    intercedesFor: ["conversion", "work", "vocation"],
    collectExcerpt: "With ready will and heart, follow the call of our Lord.",
  },
  "saint michael and all angels": {
    patronOf: ["protection against evil", "soldiers", "the sick"],
    intercedesFor: ["protection", "courage"],
    collectExcerpt: "May your angels help and defend us here on earth.",
  },
  "saint luke the evangelist": {
    vocation: ["evangelist", "physician"],
    patronOf: ["physicians", "artists", "surgeons"],
    intercedesFor: ["illness", "healing", "creativity"],
    collectExcerpt: "Continue in your Church your love and power to heal.",
  },
  "saint simon and saint jude": {
    vocation: ["apostle", "martyr"],
    patronOf: ["lost causes", "desperate situations"],
    intercedesFor: ["hope", "doubt", "perseverance"],
    collectExcerpt: "Make known the love and mercy of our Lord.",
  },
  "all saints day": {
    intercedesFor: ["grief", "hope", "faith"],
    collectExcerpt: "You knit together your elect in one communion and fellowship.",
  },
  "saint andrew the apostle": {
    vocation: ["apostle", "martyr"],
    patronOf: ["Scotland", "fishermen"],
    intercedesFor: ["mission", "vocation", "faith"],
    collectExcerpt: "Give us grace to follow your call without delay.",
  },
  "saint thomas the apostle": {
    vocation: ["apostle", "martyr"],
    patronOf: ["architects", "India", "those who struggle with doubt"],
    intercedesFor: ["doubt", "faith"],
    collectExcerpt: "Grant us, without doubt, to believe in Jesus Christ.",
  },
  "saint stephen": {
    vocation: ["deacon", "martyr"],
    patronOf: ["deacons", "stonemasons"],
    intercedesFor: ["courage", "reconciliation", "the_poor"],
    collectExcerpt: "Grant us grace to love even our enemies.",
  },
  "saint john": {
    vocation: ["apostle", "evangelist", "theologian"],
    patronOf: ["theologians", "writers"],
    intercedesFor: ["faith", "creativity", "hope"],
    collectExcerpt: "May we walk in the light of your truth.",
  },
  "the holy innocents": {
    vocation: ["martyr"],
    patronOf: ["children"],
    intercedesFor: ["grief", "protection"],
    collectExcerpt: "Receive the innocent; frustrate the designs of evil tyrants.",
  },

  // ── Lesser Feasts (curated cross-section) ──
  "william laud": {
    vocation: ["archbishop", "martyr"],
    knownFor:
      "Archbishop of Canterbury who pressed for order and 'the beauty of holiness' in worship, and was executed during the English Civil War.",
    intercedesFor: ["courage", "perseverance"],
    anglicanNote:
      "His insistence on reverent, sacramental worship shaped the High Church and later Anglo-Catholic tradition.",
  },
  "antony of egypt": {
    vocation: ["monastic", "hermit"],
    knownFor:
      "Father of Christian monasticism, who sold all he had and withdrew to the Egyptian desert to wrestle in prayer.",
    patronOf: ["monastics", "those with skin diseases"],
    intercedesFor: ["temptation", "perseverance", "prayer"],
  },
  "brigid of kildare": {
    vocation: ["abbess", "monastic"],
    knownFor:
      "One of Ireland's patron saints, founder of the great monastery at Kildare, remembered for boundless hospitality to the poor.",
    patronOf: ["Ireland", "poets", "dairy workers"],
    intercedesFor: ["hospitality", "the_poor", "peace"],
  },
  "absalom jones": {
    vocation: ["priest"],
    knownFor:
      "Born enslaved, he bought his freedom and became the first African American ordained a priest in the Episcopal Church.",
    intercedesFor: ["justice", "perseverance", "reconciliation"],
    anglicanNote:
      "Founder of the African Episcopal Church of St. Thomas in Philadelphia — a cornerstone of Black Episcopal life.",
  },
  "polycarp": {
    vocation: ["bishop", "martyr"],
    knownFor:
      "Bishop of Smyrna and a disciple of John, martyred in great old age, refusing to curse the Christ he had served eighty-six years.",
    intercedesFor: ["courage", "perseverance", "faith"],
  },
  "george herbert": {
    vocation: ["priest", "poet"],
    knownFor:
      "Country parson and poet whose verse in The Temple turns the ordinary into prayer with disarming tenderness.",
    intercedesFor: ["creativity", "vocation", "prayer"],
    anglicanNote:
      "His poems and A Priest to the Temple set the enduring Anglican ideal of the faithful, humble parish priest.",
  },
  "perpetua and felicity": {
    vocation: ["martyr", "layperson", "mother"],
    knownFor:
      "A young nursing mother and her companions martyred at Carthage; her prison diary is one of the earliest writings by a Christian woman.",
    patronOf: ["mothers", "those facing childbirth"],
    intercedesFor: ["courage", "childbirth", "family"],
  },
  "gregory the great": {
    vocation: ["bishop", "theologian", "pastor"],
    knownFor:
      "Bishop of Rome who called himself 'servant of the servants of God,' shaped the Church's pastoral care and song.",
    patronOf: ["musicians", "teachers"],
    intercedesFor: ["leadership", "study"],
    anglicanNote:
      "He sent Augustine of Canterbury to evangelize the English — the root of the English Church.",
  },
  "harriet ross tubman": {
    vocation: ["prophet", "layperson"],
    knownFor:
      "Escaped slavery and returned again and again to lead others to freedom on the Underground Railroad, trusting God to light the way.",
    intercedesFor: ["justice", "courage", "travel"],
  },
  "thomas cranmer": {
    vocation: ["archbishop", "martyr", "reformer"],
    knownFor:
      "Archbishop of Canterbury and chief architect of the English Reformation, burned at the stake after thrusting first into the fire the hand that had signed his recantation.",
    intercedesFor: ["courage", "faith"],
    anglicanNote:
      "Principal author of the Book of Common Prayer; his cadences still shape how Anglicans pray in English.",
  },
  // The app's calendar groups the Oxford Martyrs on Oct 16.
  "hugh latimer": {
    vocation: ["bishop", "martyr", "reformer"],
    knownFor:
      "Hugh Latimer, Nicholas Ridley, and Thomas Cranmer — the 'Oxford Martyrs,' bishops burned under Mary for the English Reformation. 'Be of good comfort... we shall this day light such a candle.'",
    intercedesFor: ["courage", "faith", "perseverance"],
    anglicanNote:
      "Cranmer, principal author of the Book of Common Prayer, died with them — foundational witnesses of Anglican reform.",
  },
  "charles henry brent": {
    vocation: ["bishop", "missionary"],
    knownFor:
      "Missionary bishop of the Philippines who fought the opium trade and helped birth the modern ecumenical movement.",
    intercedesFor: ["mission", "reconciliation", "justice"],
    anglicanNote:
      "His call for Christian unity at Edinburgh 1910 helped launch the Faith and Order movement.",
  },
  "john keble": {
    vocation: ["priest", "poet"],
    knownFor:
      "Oxford priest and poet whose 1833 Assize Sermon on 'National Apostasy' is reckoned the start of the Oxford Movement.",
    intercedesFor: ["faith", "creativity"],
    anglicanNote:
      "His book The Christian Year and the Tractarians renewed Catholic faith and devotion within Anglicanism.",
  },
  "john donne": {
    vocation: ["priest", "poet"],
    knownFor:
      "Metaphysical poet who became Dean of St. Paul's, preaching mortality and mercy with unsparing power — 'never send to know for whom the bell tolls.'",
    intercedesFor: ["grief", "creativity", "doubt"],
    anglicanNote:
      "One of the great Anglican preacher-poets; his Holy Sonnets and Devotions remain devotional classics.",
  },
  "frederick denison maurice": {
    vocation: ["priest", "theologian", "reformer"],
    knownFor:
      "Theologian of the Kingdom of God and a founder of Christian Socialism, who insisted the gospel had everything to do with the poor.",
    intercedesFor: ["justice", "the_poor", "study"],
    anglicanNote:
      "A founder of Christian Socialism and of workers' education in the Church of England.",
  },
  "martin luther king": {
    vocation: ["pastor", "martyr", "prophet"],
    knownFor:
      "Baptist pastor and prophet of the civil rights movement, who preached nonviolent love against the sin of racism and was martyred in Memphis.",
    intercedesFor: ["justice", "reconciliation", "courage"],
  },
  "catherine of siena": {
    vocation: ["mystic", "religious", "reformer"],
    knownFor:
      "Dominican mystic whose visions and fierce letters called popes and princes to reform, even as she served plague victims.",
    patronOf: ["Italy", "the sick"],
    intercedesFor: ["reconciliation", "illness", "justice"],
  },
  "athanasius of alexandria": {
    vocation: ["bishop", "theologian"],
    knownFor:
      "Bishop of Alexandria who, exiled five times, defended the full divinity of Christ when most of the world had gone the other way.",
    intercedesFor: ["doubt", "perseverance", "faith"],
  },
  "monica": {
    vocation: ["layperson", "mother"],
    knownFor:
      "Mother of Augustine, who prayed and wept for her brilliant, wayward son for decades until he turned to Christ.",
    patronOf: ["mothers", "wives", "those praying for wayward children"],
    intercedesFor: ["family", "perseverance", "conversion"],
  },
  "julian of norwich": {
    vocation: ["mystic", "hermit"],
    knownFor:
      "An anchoress who, gravely ill, received sixteen 'showings' of God's love and wrote them down — the assurance that 'all shall be well.'",
    patronOf: ["anchorites", "contemplatives", "those facing serious illness"],
    intercedesFor: ["doubt", "illness", "hope", "grief"],
    anglicanNote:
      "Her Revelations of Divine Love is the first book in English known to be written by a woman.",
  },
  "frances perkins": {
    vocation: ["layperson", "reformer"],
    knownFor:
      "First woman in a U.S. presidential cabinet, architect of Social Security and the end of child labor, who saw public service as Christian vocation.",
    intercedesFor: ["justice", "work", "the_poor"],
    anglicanNote:
      "A devout Episcopalian who made monthly retreats; her reforms flowed from a sacramental sense of the common good.",
  },
  "evelyn underhill": {
    vocation: ["layperson", "mystic", "teacher"],
    knownFor:
      "Laywoman whose writing on mysticism and the spiritual life drew countless ordinary people into deeper prayer.",
    intercedesFor: ["prayer", "study", "doubt"],
    anglicanNote:
      "An Anglican laywoman and the first woman to lead retreats in the Church of England; her book Mysticism reshaped English devotion.",
  },
  "pauli murray": {
    vocation: ["priest", "reformer", "layperson"],
    knownFor:
      "Poet, lawyer, and civil rights pioneer whose legal thought armed the movements for racial and gender justice, and the first Black woman ordained an Episcopal priest.",
    intercedesFor: ["justice", "reconciliation", "vocation"],
    anglicanNote:
      "Ordained in 1977, she celebrated her first Eucharist at the chapel where her enslaved grandmother had been baptized.",
  },
  "benedict of nursia": {
    vocation: ["monastic", "abbot"],
    knownFor:
      "Father of Western monasticism, whose Rule balanced prayer and work — 'ora et labora' — into a school for the Lord's service.",
    patronOf: ["Europe", "monastics", "students"],
    intercedesFor: ["study", "perseverance", "peace"],
  },
  "william white": {
    vocation: ["bishop"],
    knownFor:
      "Chaplain to the Continental Congress who held the scattered American church together after the Revolution and gave it a constitution.",
    intercedesFor: ["leadership", "reconciliation"],
    anglicanNote: "Principal organizer and first Presiding Bishop of the Episcopal Church.",
  },
  "macrina of caesarea": {
    vocation: ["monastic", "teacher"],
    knownFor:
      "Teacher and monastic who shaped the faith of her brothers Basil the Great and Gregory of Nyssa, and met her own death with serene hope.",
    intercedesFor: ["study", "grief", "faith"],
  },
  "clare of assisi": {
    vocation: ["abbess", "monastic"],
    knownFor:
      "Follower of Francis who fled wealth to found the Poor Clares, embracing 'holy poverty' with joy for forty years.",
    patronOf: ["eyes and eye disease", "television"],
    intercedesFor: ["poverty", "perseverance", "prayer"],
  },
  "florence nightingale": {
    vocation: ["nurse", "reformer", "layperson"],
    knownFor:
      "The 'lady with the lamp,' who answered a sense of divine calling by founding modern nursing and reforming care for the sick poor.",
    patronOf: ["nurses"],
    intercedesFor: ["illness", "healing", "vocation"],
  },
  "jonathan myrick daniels": {
    vocation: ["martyr", "layperson"],
    knownFor:
      "An Episcopal seminarian who answered the call to Selma and was killed stepping in front of a shotgun to shield a young Black woman.",
    intercedesFor: ["justice", "courage"],
  },
  "augustine of hippo": {
    vocation: ["bishop", "theologian"],
    knownFor:
      "Restless seeker turned bishop of Hippo, whose Confessions and City of God shaped Western Christianity — 'our hearts are restless until they rest in you.'",
    patronOf: ["theologians", "those seeking conversion"],
    intercedesFor: ["conversion", "doubt", "study"],
  },
  "constance": {
    vocation: ["religious", "martyr"],
    knownFor:
      "Episcopal sisters and clergy — the 'Martyrs of Memphis' — who stayed to nurse the dying through the 1878 yellow fever epidemic and died doing it.",
    intercedesFor: ["illness", "dying", "courage"],
  },
  "cyprian of carthage": {
    vocation: ["bishop", "martyr", "theologian"],
    knownFor:
      "Bishop of Carthage and martyr who guided his flock through persecution and wrote tenderly on the unity of the Church.",
    intercedesFor: ["reconciliation", "courage", "leadership"],
  },
  "hildegard of bingen": {
    vocation: ["abbess", "mystic", "composer"],
    knownFor:
      "Benedictine abbess, visionary, composer, and natural scientist — a 'feather on the breath of God' who counseled popes and emperors.",
    intercedesFor: ["creativity", "study", "healing"],
  },
  "edward bouverie pusey": {
    vocation: ["priest", "theologian"],
    knownFor:
      "Oxford scholar who, after Newman's departure, became the steady leader of the movement to recover Catholic faith and practice in Anglicanism.",
    intercedesFor: ["faith", "study", "perseverance"],
    anglicanNote:
      "A leader of the Oxford Movement; he championed sacramental confession and the revival of religious orders in the Church of England.",
  },
  "lancelot andrewes": {
    vocation: ["bishop", "scholar"],
    knownFor:
      "Bishop and master of many languages, the finest preacher of his age, whose private prayers are an Anglican treasure.",
    intercedesFor: ["study", "prayer"],
    anglicanNote:
      "He led the company of translators who produced the King James Bible; his Preces Privatae remain a devotional classic.",
  },
  "vida dutton scudder": {
    vocation: ["teacher", "reformer", "layperson"],
    knownFor:
      "Scholar and educator who joined the settlement-house movement and Christian Socialism, binding contemplative prayer to the work of justice.",
    intercedesFor: ["justice", "study", "the_poor"],
    anglicanNote:
      "An Anglo-Catholic laywoman and member of the Society of the Companions of the Holy Cross.",
  },
  "teresa of avila": {
    vocation: ["mystic", "religious", "reformer"],
    knownFor:
      "Carmelite reformer and mystic whose Interior Castle maps the soul's journey into God, written with wit and steel.",
    patronOf: ["those who pray", "people who suffer headaches"],
    intercedesFor: ["prayer", "perseverance", "illness"],
  },
  "ignatius of antioch": {
    vocation: ["bishop", "martyr"],
    knownFor:
      "Bishop of Antioch who, led to Rome to die, wrote luminous letters begging the churches not to prevent his witness — 'I am God's wheat.'",
    intercedesFor: ["courage", "perseverance", "faith"],
  },
  "richard hooker": {
    vocation: ["priest", "theologian"],
    knownFor:
      "Gentle, formidable theologian whose Laws of Ecclesiastical Polity gave Anglicanism its reasoned, irenic temper.",
    intercedesFor: ["study", "reconciliation", "peace"],
    anglicanNote: "He framed the enduring Anglican appeal to Scripture, tradition, and reason held together.",
  },
  "charles simeon": {
    vocation: ["priest"],
    knownFor:
      "Cambridge preacher who endured years of opposition in his parish and helped kindle the evangelical revival and the missionary movement.",
    intercedesFor: ["perseverance", "mission", "vocation"],
    anglicanNote: "A father of Anglican evangelicalism and a founder of the Church Missionary Society.",
  },
  "consecration of samuel seabury": {
    vocation: ["bishop"],
    knownFor:
      "The first bishop of the Episcopal Church, consecrated in Scotland when English bishops would not, linking America to the wider Church.",
    intercedesFor: ["leadership", "perseverance"],
    anglicanNote: "First American bishop; his Scottish consecration shaped the Episcopal Church's eucharistic prayer.",
  },
  "margaret of scotland": {
    vocation: ["queen", "layperson"],
    knownFor:
      "Queen who reformed the Scottish church, fed orphans and the poor with her own hands, and washed the feet of the needy.",
    patronOf: ["Scotland"],
    intercedesFor: ["family", "the_poor", "justice"],
  },
  "hilda of whitby": {
    vocation: ["abbess", "monastic"],
    knownFor:
      "Founding abbess of Whitby, so wise that kings and bishops sought her counsel; she nurtured the cowherd-poet Caedmon's gift.",
    intercedesFor: ["study", "leadership", "reconciliation"],
    anglicanNote: "She hosted the Synod of Whitby (664), a turning point for the English Church.",
  },

  // ── January ──
  "elizabeth seton": { vocation: ["religious", "teacher"], knownFor: "Widow and convert who founded the Sisters of Charity and America's first free Catholic school — the first native-born U.S. citizen to be canonized.", intercedesFor: ["family", "study", "grief"] },
  "sarah": { vocation: ["monastic"], knownFor: "Sarah, Theodora, and Syncletica — Desert Mothers of fourth- and fifth-century Egypt whose hard-won sayings on prayer and humility shaped early monasticism.", intercedesFor: ["prayer", "perseverance", "temptation"] },
  "harriet bedell": { vocation: ["deacon", "missionary"], knownFor: "Episcopal deaconess who served Native peoples in Oklahoma, Alaska, and among the Florida Seminole, honoring their language and culture.", intercedesFor: ["mission", "reconciliation"] },
  "julia chester emery": { vocation: ["layperson", "missionary"], knownFor: "For forty years led the Episcopal Church's Woman's Auxiliary, building the United Thank Offering and a vast network of mission support.", intercedesFor: ["mission", "perseverance"] },
  "aelred of rievaulx": { vocation: ["monastic", "abbot", "theologian"], knownFor: "Cistercian abbot of Rievaulx whose treatise Spiritual Friendship found the love of God within the love of friends.", intercedesFor: ["reconciliation", "prayer"] },
  "hilary of poitiers": { vocation: ["bishop", "theologian"], knownFor: "Bishop of Poitiers and 'hammer of the Arians,' exiled for defending the divinity of Christ in the Western church.", intercedesFor: ["doubt", "faith", "perseverance"] },
  "richard meux benson": { vocation: ["priest", "monastic"], knownFor: "Founded the Society of St. John the Evangelist (the Cowley Fathers), reviving men's religious life in the Anglican Communion; remembered with Bishop Charles Gore.", intercedesFor: ["prayer", "vocation"] },
  "wulfstan of worcester": { vocation: ["bishop"], knownFor: "The last Anglo-Saxon bishop, who kept his see at Worcester after the Norman Conquest and worked to end the Bristol slave trade.", intercedesFor: ["justice", "perseverance"] },
  "fabian": { vocation: ["bishop", "martyr"], knownFor: "Bishop of Rome martyred in the persecution under the emperor Decius.", intercedesFor: ["courage"] },
  "agnes and cecilia of rome": { vocation: ["martyr"], knownFor: "Agnes, a young virgin martyr of the early Roman church; Cecilia, martyr and the traditional patron of music.", patronOf: ["musicians"], intercedesFor: ["courage", "creativity"] },
  "vincent of saragossa": { vocation: ["deacon", "martyr"], knownFor: "Deacon of Saragossa and the first martyr of Spain, who died under the emperor Diocletian.", intercedesFor: ["courage"] },
  "phillips brooks": { vocation: ["bishop", "priest"], knownFor: "Beloved Boston preacher and bishop, who wrote the carol 'O Little Town of Bethlehem.'", intercedesFor: ["creativity", "hope"] },
  "florence li tim-oi": { vocation: ["priest"], knownFor: "The first woman ordained a priest in the Anglican Communion, ordained in 1944 to serve wartime Macao.", anglicanNote: "Her ordination, decades ahead of its time, foreshadowed the priesthood of women across the Communion.", intercedesFor: ["vocation", "courage", "perseverance"] },
  "timothy and titus": { vocation: ["bishop"], knownFor: "Companions and coworkers of the Apostle Paul, entrusted with the young churches of Ephesus and Crete.", intercedesFor: ["leadership", "vocation"] },
  "john chrysostom": { vocation: ["bishop", "theologian"], knownFor: "Archbishop of Constantinople called 'golden-mouthed' for his preaching; his eucharistic liturgy is still prayed across the Eastern church.", intercedesFor: ["study", "the_poor", "courage"] },
  "thomas aquinas": { vocation: ["religious", "theologian", "scholar"], knownFor: "Dominican friar whose Summa Theologiae wove faith and reason into the great synthesis of medieval theology.", patronOf: ["students", "theologians"], intercedesFor: ["study"] },
  "liliuokalani of hawaii": { vocation: ["queen"], knownFor: "Last sovereign queen of Hawai'i, composer of 'Aloha 'Oe,' who met the overthrow of her kingdom with Christian dignity and forgiveness.", intercedesFor: ["reconciliation", "grief", "leadership"] },
  "marcella of rome": { vocation: ["monastic", "scholar"], knownFor: "Roman noblewoman who turned her palace into a house of prayer and study, a mother of Western monasticism for women.", intercedesFor: ["study", "prayer"] },

  // ── February ──
  "anskar": { vocation: ["bishop", "missionary"], knownFor: "The 'Apostle of the North,' a monk who carried the gospel into Denmark and Sweden.", patronOf: ["Scandinavia"], intercedesFor: ["mission", "perseverance"] },
  "manche masemola": { vocation: ["martyr"], knownFor: "A South African teenager martyred by her own family for seeking baptism — remembered among the modern martyrs at Westminster Abbey.", intercedesFor: ["courage", "faith"] },
  "agatha of sicily": { vocation: ["martyr"], knownFor: "A young Sicilian woman martyred under Decius for her faith and her refusal of a powerful suitor.", intercedesFor: ["courage"], patronOf: ["those with breast cancer"] },
  "the martyrs of japan": { vocation: ["martyr"], knownFor: "Twenty-six Christians — friars, laymen, and children — crucified at Nagasaki in 1597 at the start of Japan's long persecution.", intercedesFor: ["courage", "perseverance"] },
  "bakhita": { vocation: ["religious"], knownFor: "Kidnapped and enslaved as a Sudanese child, she found freedom and faith in Italy and became a Canossian sister known for radiant gentleness.", intercedesFor: ["healing", "perseverance", "hope"] },
  "scholastica": { vocation: ["monastic"], knownFor: "Sister of Benedict and a mother of women's monasticism, remembered for a last night of holy conversation with her brother.", intercedesFor: ["family", "prayer"] },
  "the consecration of barbara clementine harris": { vocation: ["bishop"], knownFor: "In 1989 became the first woman consecrated a bishop in the Anglican Communion — a Philadelphia priest and tireless advocate for the marginalized.", intercedesFor: ["justice"] },
  "theodora": { vocation: ["queen"], knownFor: "Byzantine empress who restored the holy images to the Church, ending the iconoclast controversy.", intercedesFor: ["leadership", "faith"] },
  "cyril and methodius": { vocation: ["missionary", "bishop"], knownFor: "Brothers and missionaries to the Slavs who created an alphabet and translated the Scriptures and liturgy into their tongue.", intercedesFor: ["mission", "study"] },
  "thomas bray": { vocation: ["priest", "missionary"], knownFor: "Anglican priest who founded the SPCK and the SPG, seeding libraries, schools, and missions across the colonies.", intercedesFor: ["mission", "study"] },
  "janani luwum": { vocation: ["archbishop", "martyr"], knownFor: "Archbishop of Uganda, murdered in 1977 for confronting the brutality of Idi Amin's regime.", intercedesFor: ["courage", "justice"] },
  "martin luther": { vocation: ["pastor", "reformer", "theologian"], knownFor: "The Augustinian friar whose Ninety-Five Theses lit the Protestant Reformation and whose translations gave Germany the Bible in its own tongue.", intercedesFor: ["faith", "study", "courage"] },
  "agnes tsao kou ying": { vocation: ["martyr", "layperson"], knownFor: "Chinese catechists — Agnes Tsao Kou Ying, Agatha Lin Zhao, and Lucy Yi Zhenmei — martyred for teaching and keeping the faith.", intercedesFor: ["courage", "faith"] },
  "frederick douglass": { vocation: ["reformer", "layperson"], knownFor: "Escaped from slavery to become the great abolitionist orator and writer, a lay leader whose faith fueled the fight for freedom.", intercedesFor: ["justice"] },
  "margaret of cortona": { vocation: ["religious"], knownFor: "A Franciscan penitent whose dramatic conversion led her to care for the sick and poor of Cortona.", intercedesFor: ["conversion", "the_poor", "illness"] },
  "emily malbone morgan": { vocation: ["layperson"], knownFor: "Laywoman who founded the Society of the Companions of the Holy Cross, binding intercessory prayer to social justice.", intercedesFor: ["prayer", "justice"] },
  "photini": { vocation: ["layperson"], knownFor: "The Samaritan woman who met Jesus at the well (John 4) — by tradition named Photini, 'the enlightened,' and counted an evangelist.", intercedesFor: ["conversion", "courage"] },
  "anna julia haywood cooper": { vocation: ["teacher", "scholar"], knownFor: "Born enslaved, she became an educator and scholar — 'the Voice of the South' — championing the education of Black women.", intercedesFor: ["study", "justice"] },

  // ── March ──
  "david of wales": { vocation: ["bishop", "monastic"], knownFor: "Monastic bishop and patron of Wales, who told his monks to 'do the little things' for God.", patronOf: ["Wales"], intercedesFor: ["perseverance", "mission"] },
  "chad of lichfield": { vocation: ["bishop", "monastic"], knownFor: "Humble bishop of Lichfield who evangelized the English Midlands and went on foot among his people.", intercedesFor: ["mission", "perseverance"] },
  "john and charles wesley": { vocation: ["priest"], knownFor: "Anglican priests whose evangelical revival became Methodism — John the preacher and organizer, Charles the author of thousands of hymns.", intercedesFor: ["conversion", "creativity", "mission"] },
  "gregory of nyssa": { vocation: ["bishop", "theologian"], knownFor: "Cappadocian bishop and mystical theologian who taught the soul's endless ascent into the boundless God.", intercedesFor: ["study", "prayer", "grief"] },
  "james theodore holly": { vocation: ["bishop", "missionary"], knownFor: "The first African American bishop in the Episcopal Church, who led a community of emigrants in founding the church in Haiti.", intercedesFor: ["mission", "justice", "perseverance"] },
  "vincent de paul": { vocation: ["priest"], knownFor: "Vincent de Paul and Louise de Marillac, apostles of charity in France, who organized the care of the poor, the sick, and the abandoned.", patronOf: ["charitable works"], intercedesFor: ["the_poor"] },
  "patrick of ireland": { vocation: ["bishop", "missionary"], knownFor: "Carried back to the land of his enslavement as a missionary bishop, he is the apostle and patron of Ireland.", patronOf: ["Ireland"], intercedesFor: ["mission", "conversion", "perseverance"] },
  "cyril of jerusalem": { vocation: ["bishop", "theologian"], knownFor: "Bishop of Jerusalem whose Catechetical Lectures still guide those preparing for baptism.", intercedesFor: ["study", "faith"] },
  "cuthbert": { vocation: ["bishop", "monastic"], knownFor: "Beloved monk-bishop of Lindisfarne, hermit and wonderworker of the Northumbrian church.", intercedesFor: ["prayer", "healing"] },
  "thomas ken": { vocation: ["bishop"], knownFor: "Bishop of Bath and Wells and a steadfast Nonjuror, who gave the Church the Doxology, 'Praise God from whom all blessings flow.'", intercedesFor: ["courage", "prayer"] },
  "james de koven": { vocation: ["priest"], knownFor: "Wisconsin priest and eloquent defender of catholic worship and the Real Presence in the Episcopal Church.", anglicanNote: "A leading voice for Anglo-Catholic ritual in nineteenth-century America.", intercedesFor: ["faith", "courage"] },
  "gregory the illuminator": { vocation: ["bishop", "missionary"], knownFor: "Apostle of Armenia, whose witness made it the first nation to embrace the Christian faith.", intercedesFor: ["mission", "perseverance"] },
  "oscar romero": { vocation: ["archbishop", "martyr"], knownFor: "Archbishop of San Salvador, shot at the altar in 1980 for defending the poor — a voice for the voiceless and martyr of the Americas.", intercedesFor: ["justice", "courage", "the_poor"] },
  "harriet monsell": { vocation: ["monastic"], knownFor: "Widow who founded the Community of St. John Baptist, renewing the religious life for women in the Church of England.", intercedesFor: ["vocation", "grief"] },
  "james solomon russell": { vocation: ["priest"], knownFor: "Born enslaved, he became a priest and founder of Saint Paul's College in Virginia, a builder of Black Episcopal life.", intercedesFor: ["study", "justice", "perseverance"] },
  "mary of egypt": { vocation: ["monastic", "hermit"], knownFor: "A great penitent who left a dissolute life in Alexandria for decades of solitary repentance in the desert beyond the Jordan.", intercedesFor: ["conversion", "perseverance"] },

  // ── April ──
  "james lloyd breck": { vocation: ["priest", "missionary"], knownFor: "The 'Apostle of the Wilderness,' who planted churches, schools, and monastic communities across the American frontier.", intercedesFor: ["mission", "perseverance"] },
  "richard of chichester": { vocation: ["bishop"], knownFor: "Bishop of Chichester remembered for the prayer to know Christ 'more clearly, love more dearly, follow more nearly.'", intercedesFor: ["vocation"] },
  "harriet starr cannon": { vocation: ["monastic"], knownFor: "Founder of the Community of St. Mary, an early American sisterhood serving the sick, orphaned, and poor.", intercedesFor: ["vocation", "illness"] },
  "tikhon": { vocation: ["bishop"], knownFor: "Russian Orthodox patriarch who shepherded the church in America and through the Soviet persecution, an ecumenist and reconciler.", intercedesFor: ["reconciliation"] },
  "william augustus muhlenberg": { vocation: ["priest"], knownFor: "Priest, hymnwriter, and reformer who founded schools, a hospital, and a Christian community, urging a broader, more catholic church.", intercedesFor: ["the_poor", "illness", "creativity"] },
  "dietrich bonhoeffer": { vocation: ["pastor", "theologian", "martyr"], knownFor: "German pastor and theologian of 'costly grace,' hanged by the Nazis for resisting Hitler.", intercedesFor: ["courage", "justice"] },
  "william law": { vocation: ["priest"], knownFor: "Nonjuring priest whose A Serious Call to a Devout and Holy Life shaped the Wesleys and generations of English devotion.", intercedesFor: ["prayer", "study"] },
  "george augustus selwyn": { vocation: ["bishop", "missionary"], knownFor: "First bishop of New Zealand, who learned the Māori tongue and carried the gospel across the islands of the Pacific.", intercedesFor: ["mission", "travel"] },
  "zenaida": { vocation: ["physician"], knownFor: "Zenaida, Philonella, and Hermione — early women remembered as 'unmercenary physicians' who healed without charge in Christ's name.", intercedesFor: ["healing", "illness"], patronOf: ["physicians"] },
  "damien": { vocation: ["priest", "missionary"], knownFor: "Damien and Marianne Cope, who gave their lives serving the exiled lepers of Molokai in Hawai'i.", intercedesFor: ["illness", "the_poor"], patronOf: ["those with leprosy", "outcasts"] },
  "peter williams cassey": { vocation: ["deacon"], knownFor: "Peter Williams Cassey, a Black deacon who founded a school for African American children in California, and Annie Besant Cassey, his coworker and wife.", intercedesFor: ["study", "justice"] },
  "kateri tekakwitha": { vocation: ["layperson"], knownFor: "Mohawk-Algonquin laywoman, 'Lily of the Mohawks,' who embraced the faith amid hardship — the first Native American saint.", intercedesFor: ["perseverance"] },
  "juana ines de la cruz": { vocation: ["monastic", "poet", "scholar"], knownFor: "Mexican nun, poet, and scholar who defended women's right to learning against the powers of her age.", intercedesFor: ["study", "creativity"] },
  "alphege": { vocation: ["archbishop", "martyr"], knownFor: "Archbishop of Canterbury martyred by Viking raiders when he refused to let his ransom burden the poor.", intercedesFor: ["courage"] },
  "anselm": { vocation: ["archbishop", "theologian"], knownFor: "Archbishop of Canterbury and 'father of scholasticism,' who sought 'faith seeking understanding' and the reason of the Incarnation.", intercedesFor: ["study"] },
  "hadewijch of brabant": { vocation: ["poet", "mystic"], knownFor: "Thirteenth-century Beguine whose visionary poems sing of 'Minne,' the overwhelming love of God.", intercedesFor: ["creativity", "prayer"] },
  "toyohiko kagawa": { vocation: ["reformer", "missionary"], knownFor: "Japanese evangelist who lived in the slums of Kobe and gave his life to labor reform, cooperatives, and peace.", intercedesFor: ["justice", "the_poor", "peace"] },
  "zita of tuscany": { vocation: ["layperson"], knownFor: "A household servant of Lucca who made her daily work a life of prayer and quiet charity to the poor.", patronOf: ["domestic workers"], intercedesFor: ["work"] },

  // ── May ──
  "elisabeth cruciger": { vocation: ["poet"], knownFor: "Former nun and friend of the Luthers, the first woman hymnwriter of the Reformation.", intercedesFor: ["creativity"] },
  "martyrs of the reformation era": { vocation: ["martyr"], knownFor: "All who died for conscience and faith across the divisions of the Reformation — Catholic and Protestant alike — remembered together in penitence.", intercedesFor: ["reconciliation", "courage"] },
  "george of lydda": { vocation: ["martyr"], knownFor: "Soldier-martyr of the early church whose legend made him patron of England and of all who fight dragons within and without.", patronOf: ["England", "soldiers"], intercedesFor: ["courage"] },
  "gregory of nazianzus": { vocation: ["bishop", "theologian", "poet"], knownFor: "Cappadocian bishop called 'the Theologian,' whose orations on the Trinity steadied the Nicene faith.", intercedesFor: ["study", "faith", "doubt"] },
  "johann arndt and jacob boehme": { vocation: ["mystic"], knownFor: "German mystics whose writings on union with Christ nourished the inner, heartfelt strands of Protestant devotion.", intercedesFor: ["prayer"] },
  "pachomius of tabennisi": { vocation: ["monastic", "abbot"], knownFor: "An Egyptian father of communal monasticism, who first gathered hermits under a common rule and roof.", intercedesFor: ["prayer", "perseverance"] },
  "thurgood marshall": { vocation: ["layperson", "reformer"], knownFor: "Lawyer who argued Brown v. Board of Education and became the first Black justice of the U.S. Supreme Court, a faithful Episcopalian.", intercedesFor: ["justice"] },
  "dunstan": { vocation: ["archbishop", "monastic"], knownFor: "Archbishop of Canterbury, reformer of English monasticism, and a craftsman in metal and music.", patronOf: ["blacksmiths", "goldsmiths", "musicians"], intercedesFor: ["creativity", "leadership"] },
  "alcuin": { vocation: ["deacon", "abbot", "scholar"], knownFor: "Deacon and scholar of York who led Charlemagne's renewal of learning and worship.", intercedesFor: ["study"] },
  "lydia of thyatira": { vocation: ["layperson"], knownFor: "A dealer in purple cloth and the first convert in Europe, whose household became the church at Philippi.", patronOf: ["dyers"], intercedesFor: ["hospitality", "work", "conversion"] },
  "helena of constantinople": { vocation: ["queen"], knownFor: "Mother of Constantine, whose pilgrimage tradition credits with finding the true cross and building the holy places of Jerusalem.", intercedesFor: ["travel"] },
  "jackson kemper": { vocation: ["bishop", "missionary"], knownFor: "The first missionary bishop of the Episcopal Church, who rode the frontier from the Great Lakes to the Plains.", intercedesFor: ["mission", "travel"] },
  "bede the venerable": { vocation: ["monastic", "priest", "scholar"], knownFor: "Northumbrian monk of Jarrow and 'father of English history,' whose Ecclesiastical History of the English People still tells the story of the church among the English.", intercedesFor: ["study"], anglicanNote: "The first great scholar of the English church; he died translating John's Gospel into English." },
  "augustine": { vocation: ["archbishop", "missionary"], knownFor: "Sent by Gregory the Great, he became the first Archbishop of Canterbury and apostle to the English.", anglicanNote: "His mission in 597 is the founding of the See of Canterbury.", intercedesFor: ["mission", "courage"] },
  "mechthild of magdeburg": { vocation: ["mystic", "poet"], knownFor: "Beguine mystic whose The Flowing Light of the Godhead poured out the love between the soul and God.", intercedesFor: ["prayer", "creativity"] },

  // ── June ──
  "justin": { vocation: ["martyr", "theologian", "layperson"], knownFor: "Philosopher who found in Christ the true wisdom, the first great Christian apologist, martyred at Rome.", intercedesFor: ["study", "courage"] },
  "blandina and her companions": { vocation: ["martyr"], knownFor: "A young enslaved woman and her companions, the Martyrs of Lyons, whose endurance under torture astonished their persecutors.", intercedesFor: ["courage", "perseverance"] },
  "the martyrs of uganda": { vocation: ["martyr"], knownFor: "Young pages of the Bugandan court burned alive in 1886 for refusing to renounce Christ — seed of a great African church.", intercedesFor: ["courage", "faith"] },
  "john xxiii": { vocation: ["bishop"], knownFor: "The 'good pope' who called the Second Vatican Council and threw open the windows of the Church to renewal and reconciliation.", intercedesFor: ["reconciliation"] },
  "boniface": { vocation: ["bishop", "missionary", "martyr"], knownFor: "Apostle of Germany, who felled the sacred oak of Thor and gave his life carrying the gospel to the Frisians.", patronOf: ["Germany"], intercedesFor: ["mission"] },
  "melania the elder": { vocation: ["monastic"], knownFor: "Wealthy Roman widow who founded monasteries in Jerusalem and championed the desert fathers.", intercedesFor: ["prayer", "study"] },
  "columba of iona": { vocation: ["abbot", "monastic", "missionary"], knownFor: "Irish monk who founded the monastery of Iona, the cradle of Christianity in Scotland.", patronOf: ["Ireland"], intercedesFor: ["mission", "reconciliation"] },
  "ephrem of nisibis": { vocation: ["deacon", "poet", "theologian"], knownFor: "Syrian deacon called the 'harp of the Spirit,' whose hymns taught the faith in song.", intercedesFor: ["creativity"] },
  "enmegahbowh": { vocation: ["priest", "missionary"], knownFor: "Ojibwe leader and the first Native American priest in the Episcopal Church, peacemaker among his people.", intercedesFor: ["reconciliation", "peace"] },
  "the first book of common prayer": { knownFor: "The 1549 Prayer Book, which first gave the English church a common liturgy in its own tongue — the root of all Anglican worship.", anglicanNote: "Cranmer's book made the daily prayer of the Church the prayer of the people.", intercedesFor: ["prayer"] },
  "basil of caesarea": { vocation: ["bishop", "theologian", "monastic"], knownFor: "Cappadocian bishop, defender of the Trinity, author of a monastic rule, and founder of one of the first Christian hospitals.", intercedesFor: ["the_poor"] },
  "joseph butler": { vocation: ["bishop", "theologian"], knownFor: "Bishop whose Analogy of Religion answered the skeptics of his age with patient reason.", intercedesFor: ["doubt", "study", "faith"] },
  "marina the monk": { vocation: ["monastic"], knownFor: "A woman who lived hidden as a monk and bore a false accusation in silence for years before her innocence was known.", intercedesFor: ["perseverance"] },
  "bernard mizeki": { vocation: ["martyr", "teacher"], knownFor: "African catechist who carried the gospel in what is now Zimbabwe and was martyred for his witness.", intercedesFor: ["courage", "mission"] },
  "adelaide teague case": { vocation: ["teacher", "layperson"], knownFor: "Educator and the first woman to be a full professor at an Episcopal seminary, a teacher of religious education and peace.", intercedesFor: ["study", "peace"] },
  "alban": { vocation: ["martyr"], knownFor: "The first martyr of Britain, who sheltered a fleeing priest, took his place, and died in his stead.", intercedesFor: ["courage"] },
  "isabel florence hapgood": { vocation: ["layperson", "scholar"], knownFor: "Translator and ecumenist who brought Russian literature and Orthodox liturgy to the English-speaking world.", intercedesFor: ["reconciliation"] },
  "irenaeus of lyons": { vocation: ["bishop", "theologian"], knownFor: "Bishop of Lyons who confronted the gnostics and taught that 'the glory of God is a human being fully alive.'", intercedesFor: ["faith", "study", "reconciliation"] },

  // ── July ──
  "moses the black": { vocation: ["monastic", "martyr"], knownFor: "A robber turned desert monk whose radical humility and refusal of violence made him a father of the Egyptian desert.", intercedesFor: ["conversion", "perseverance", "peace"] },
  "eva lee matthews": { vocation: ["monastic"], knownFor: "Founder of the Community of the Transfiguration, an Episcopal sisterhood serving children and the poor.", intercedesFor: ["children", "the_poor", "vocation"] },
  "priscilla and aquila": { vocation: ["layperson"], knownFor: "A married couple and coworkers of Paul who taught the faith, hosted the church in their home, and instructed the eloquent Apollos.", intercedesFor: ["hospitality", "marriage", "study"] },
  "argula von grumbach": { vocation: ["scholar", "reformer", "layperson"], knownFor: "Bavarian noblewoman and the first published Protestant woman writer, who defended the Reformation in print.", intercedesFor: ["study", "courage"] },
  "elizabeth cady stanton": { vocation: ["reformer", "layperson"], knownFor: "Elizabeth Cady Stanton, Amelia Bloomer, and Sojourner Truth — reformers and prophets of the rights and dignity of women.", intercedesFor: ["justice"] },
  "maria skobtsova": { vocation: ["monastic", "martyr"], knownFor: "Orthodox nun in Paris who sheltered Jews and the destitute and died at Ravensbrück, by tradition in another's place.", intercedesFor: ["justice", "courage", "the_poor"] },
  "john cassian": { vocation: ["monastic", "theologian"], knownFor: "Carried the wisdom of the Egyptian desert to the West; his Conferences shaped Benedict and all Western monasticism.", intercedesFor: ["prayer"] },
  "thomas a kempis": { vocation: ["monastic", "priest"], knownFor: "Augustinian canon whose The Imitation of Christ is, after the Bible, among the most beloved books of devotion.", intercedesFor: ["prayer"] },
  "the parents of the blessed virgin mary": { vocation: ["layperson"], knownFor: "By tradition Joachim and Anne, the parents of Mary, remembered as the grandparents of our Lord.", intercedesFor: ["family"], patronOf: ["grandparents", "expectant mothers"] },
  "william reed huntington": { vocation: ["priest"], knownFor: "Influential priest and reformer whose vision gave the Anglican Communion the Chicago-Lambeth Quadrilateral.", anglicanNote: "His four-point basis for Christian unity remains a touchstone of Anglican identity.", intercedesFor: ["reconciliation", "leadership"] },
  "johann sebastian bach": { vocation: ["composer"], knownFor: "The supreme church musician, who signed his works 'to the glory of God alone' and turned Scripture into towering sound.", intercedesFor: ["creativity"] },
  "mary and martha of bethany": { vocation: ["layperson"], knownFor: "Sisters of Bethany and friends of Jesus — Martha who served and confessed him, Mary who sat at his feet.", intercedesFor: ["hospitality", "prayer"], patronOf: ["cooks", "homemakers"] },
  "william wilberforce": { vocation: ["reformer", "layperson"], knownFor: "Evangelical member of Parliament whose lifelong campaign ended the British slave trade.", intercedesFor: ["justice", "perseverance"] },
  "ignatius of loyola": { vocation: ["priest"], knownFor: "Soldier turned founder of the Jesuits, whose Spiritual Exercises still train countless souls to find God in all things.", intercedesFor: ["prayer", "conversion"] },

  // ── August ──
  "joseph of arimathaea": { vocation: ["layperson"], knownFor: "The secret disciple who boldly asked for the body of Jesus and laid him in his own new tomb.", patronOf: ["funeral directors"], intercedesFor: ["grief", "courage", "dying"] },
  "joanna": { vocation: ["layperson"], knownFor: "Joanna, Mary, and Salome — the myrrh-bearing women who followed Jesus, kept watch at the cross, and first found the empty tomb.", intercedesFor: ["grief", "faith"] },
  "john mason neale": { vocation: ["priest", "poet"], knownFor: "Priest and hymn translator who gave English its versions of 'O come, O come, Emmanuel' and 'Good King Wenceslas.'", intercedesFor: ["creativity"] },
  "dominic": { vocation: ["priest", "religious"], knownFor: "Founder of the Order of Preachers (the Dominicans), who answered heresy with study, poverty, and proclamation.", intercedesFor: ["study", "mission", "faith"] },
  "edith stein": { vocation: ["scholar", "monastic", "martyr"], knownFor: "Jewish philosopher and convert who became a Carmelite nun (Teresa Benedicta of the Cross) and died at Auschwitz.", intercedesFor: ["study", "courage"] },
  "laurence of rome": { vocation: ["deacon", "martyr"], knownFor: "Deacon of Rome who, ordered to surrender the church's treasure, presented the poor — and was martyred on a gridiron.", patronOf: ["the poor"], intercedesFor: ["courage", "the_poor"] },
  "jeremy taylor": { vocation: ["bishop", "theologian"], knownFor: "Bishop and golden-tongued writer whose Holy Living and Holy Dying are classics of Anglican devotion.", intercedesFor: ["dying"] },
  "bernard of clairvaux": { vocation: ["abbot", "monastic", "theologian"], knownFor: "Cistercian abbot whose preaching and burning love of God shaped a century — 'the mellifluous doctor.'", intercedesFor: ["prayer"], patronOf: ["beekeepers"] },
  "louis": { vocation: ["king", "layperson"], knownFor: "King of France remembered for justice, almsgiving, and personal holiness on the throne.", intercedesFor: ["justice", "leadership"] },
  "thomas gallaudet and henry winter syle": { vocation: ["priest"], knownFor: "Priests who pioneered ministry among the Deaf, bringing word and sacrament in sign language.", intercedesFor: ["vocation", "mission"] },
  "the beheading of saint john the baptist": { vocation: ["prophet", "martyr"], knownFor: "The death of the forerunner, beheaded by Herod for fearlessly speaking the truth.", intercedesFor: ["courage"] },
  "margaret ward": { vocation: ["martyr"], knownFor: "Margaret Ward, Margaret Clitherow, and Anne Line — Englishwomen martyred for sheltering priests in penal times.", intercedesFor: ["courage", "hospitality"] },
  "aidan of lindisfarne": { vocation: ["bishop", "monastic", "missionary"], knownFor: "Gentle monk of Iona who, from the island of Lindisfarne, re-evangelized the north of England on foot.", intercedesFor: ["mission", "perseverance"] },

  // ── September ──
  "david pendleton oakerhater": { vocation: ["deacon"], knownFor: "Cheyenne warrior turned deacon, 'God's warrior,' who brought the gospel to his own people in Oklahoma.", intercedesFor: ["peace", "reconciliation"] },
  "the martyrs of new guinea": { vocation: ["martyr"], knownFor: "Missionaries and local Christians who refused to flee and died serving their people during the Second World War.", intercedesFor: ["courage", "perseverance"] },
  "phoebe": { vocation: ["deacon"], knownFor: "Deacon of the church at Cenchreae, commended by Paul as a benefactor and the trusted bearer of his Letter to the Romans.", intercedesFor: ["hospitality", "vocation"] },
  "paul jones": { vocation: ["bishop"], knownFor: "Bishop of Utah who lost his see for preaching against war, a steadfast witness for Christian peace.", intercedesFor: ["peace", "courage"] },
  "katharina zell": { vocation: ["reformer", "layperson"], knownFor: "Strasbourg reformer and writer who married a priest, sheltered refugees, and defended the gospel and the poor.", intercedesFor: ["hospitality", "the_poor"] },
  "hannah more": { vocation: ["layperson", "teacher"], knownFor: "Writer and philanthropist of the evangelical revival who founded schools for the poor and wrote for their dignity.", intercedesFor: ["study", "the_poor"] },
  "kassiani": { vocation: ["abbess", "poet", "composer"], knownFor: "Byzantine abbess and hymnographer, the only woman whose hymns are sung in the Orthodox liturgy.", intercedesFor: ["creativity"] },
  "the nativity of the blessed virgin mary": { knownFor: "The birth of Mary, the mother of our Lord — the dawn that heralds the coming of Christ.", intercedesFor: ["childbirth", "family"] },
  "alexander crummell": { vocation: ["priest", "missionary", "scholar"], knownFor: "Priest, missionary, and intellectual who labored for the dignity and education of people of African descent on two continents.", intercedesFor: ["justice", "study"] },
  "john henry hobart": { vocation: ["bishop"], knownFor: "Energetic bishop of New York whose 'Evangelical Truth and Apostolic Order' revived the Episcopal Church.", intercedesFor: ["leadership", "mission"] },
  "catherine of genoa": { vocation: ["mystic", "nurse", "layperson"], knownFor: "Married laywoman, hospital director, and mystic of God's purifying love.", intercedesFor: ["illness", "healing"] },
  "ninian": { vocation: ["bishop", "missionary"], knownFor: "Early missionary bishop who carried the gospel to the southern Picts from his 'White House' at Whithorn.", intercedesFor: ["mission"] },
  "theodore of tarsus": { vocation: ["archbishop", "scholar"], knownFor: "Archbishop of Canterbury who organized the English church and made Canterbury a center of learning.", intercedesFor: ["study", "leadership"] },
  "john coleridge patteson": { vocation: ["bishop", "missionary", "martyr"], knownFor: "Missionary bishop of Melanesia, martyred in reprisal for the crimes of slave-traders against the islanders.", intercedesFor: ["mission", "courage", "reconciliation"] },
  "philander chase": { vocation: ["bishop", "missionary"], knownFor: "Pioneer bishop of the western frontier who founded Kenyon College and Jubilee College out of nothing.", intercedesFor: ["mission", "study", "perseverance"] },
  "thecla of iconium": { vocation: ["martyr"], knownFor: "Convert and companion of Paul, honored from antiquity as the first woman martyr, who survived fire and beasts.", intercedesFor: ["courage"] },
  "anna ellison butler alexander": { vocation: ["deacon", "teacher"], knownFor: "Georgia-born deaconess, the first Black deaconess in the Episcopal Church, who founded a school and church for her people.", intercedesFor: ["study", "justice"] },
  "sergius of radonezh": { vocation: ["monastic", "abbot"], knownFor: "Renewer of Russian monasticism whose humble holiness made his Trinity monastery the heart of a nation's faith.", intercedesFor: ["prayer", "peace", "perseverance"] },
  "euphrosyne/smaragdus of alexandria": { vocation: ["monastic"], knownFor: "An Alexandrian who, to give her life wholly to God, lived hidden as the monk Smaragdus.", intercedesFor: ["prayer", "vocation"] },
  "paula and eustochium of rome": { vocation: ["monastic", "scholar"], knownFor: "Mother and daughter of Rome who founded monasteries in Bethlehem and supported Jerome's translation of the Scriptures.", intercedesFor: ["study"] },
  "jerome": { vocation: ["priest", "scholar", "monastic"], knownFor: "Fierce and brilliant scholar who translated the Bible into Latin — the Vulgate that fed the Western church for a thousand years.", intercedesFor: ["study"] },

  // ── October ──
  "therese of lisieux": { vocation: ["monastic"], knownFor: "Carmelite who taught the 'little way' of small things done with great love, a doctor of the Church.", patronOf: ["the missions", "florists"], intercedesFor: ["prayer"] },
  "remigius of rheims": { vocation: ["bishop", "missionary"], knownFor: "Bishop who baptized Clovis and the Franks, a founder of Christian France.", intercedesFor: ["mission", "conversion"] },
  "john raleigh mott": { vocation: ["layperson", "missionary"], knownFor: "Lay leader of the YMCA and student movements, a tireless ecumenist who won the Nobel Peace Prize.", intercedesFor: ["reconciliation", "mission"] },
  "francis of assisi": { vocation: ["religious"], knownFor: "The poor man of Assisi who wedded Lady Poverty, preached to all creation, and bore the wounds of Christ.", patronOf: ["animals", "ecology"], intercedesFor: ["animals", "peace", "the_poor"] },
  "william tyndale": { vocation: ["priest", "martyr", "scholar"], knownFor: "Translator strangled and burned for putting the Bible into plain English — his words live on in every English Scripture.", intercedesFor: ["study", "courage"] },
  "birgitta of sweden": { vocation: ["mystic", "religious"], knownFor: "Wife, mother, and visionary who founded the Bridgettine order and counseled popes and kings.", intercedesFor: ["family"], patronOf: ["Sweden"] },
  "robert grosseteste": { vocation: ["bishop", "scholar"], knownFor: "Bishop of Lincoln and pioneering scientist-theologian who joined rigorous learning to pastoral reform.", intercedesFor: ["study"] },
  "philip": { vocation: ["deacon", "evangelist"], knownFor: "One of the seven deacons, who carried the gospel to Samaria and baptized the Ethiopian official on the desert road.", intercedesFor: ["mission"] },
  "edith cavell": { vocation: ["nurse"], knownFor: "English nurse in occupied Belgium, shot for helping soldiers escape — 'patriotism is not enough; I must have no hatred.'", intercedesFor: ["courage", "healing", "reconciliation"], patronOf: ["nurses"] },
  "samuel isaac joseph schereschewsky": { vocation: ["bishop", "missionary", "scholar"], knownFor: "Bishop in China who, paralyzed, typed his translation of the Bible with one finger for over twenty years.", intercedesFor: ["perseverance", "study"] },
  "henry martyn": { vocation: ["priest", "missionary", "scholar"], knownFor: "Anglican missionary who translated the New Testament into Urdu and Persian before dying young, 'to burn out for God.'", intercedesFor: ["mission"] },
  "cornelius the centurion": { vocation: ["layperson"], knownFor: "The God-fearing Roman centurion whose baptism by Peter opened the door of the church to the Gentiles.", intercedesFor: ["conversion"] },
  "tabitha of joppa": { vocation: ["layperson"], knownFor: "Tabitha (Dorcas) of Joppa, a disciple 'full of good works and acts of charity,' raised to life by Peter.", patronOf: ["seamstresses"], intercedesFor: ["the_poor"] },
  "alfred": { vocation: ["king"], knownFor: "King of Wessex who saved English Christianity from the Vikings and translated works of faith for his people.", intercedesFor: ["leadership", "study"] },
  "james hannington": { vocation: ["bishop", "missionary", "martyr"], knownFor: "Bishop of Eastern Equatorial Africa, martyred with his companions on the road to Uganda.", intercedesFor: ["courage", "mission"] },
  "maryam of qidun": { vocation: ["monastic", "hermit"], knownFor: "A desert solitary who, after a grievous fall, was sought out by her uncle and restored to grace and hope.", intercedesFor: ["conversion", "perseverance"] },

  // ── November ──
  "all faithful departed": { knownFor: "All Souls' Day — a day to remember before God all the faithful departed, and to pray in the sure hope of the resurrection.", intercedesFor: ["grief", "hope", "dying"] },
  "adeline blanchard tyler and her companions": { vocation: ["nurse", "religious"], knownFor: "Pioneering Episcopal nursing sisters who cared for the sick and the wounded of the Civil War.", intercedesFor: ["illness", "healing"] },
  "william temple": { vocation: ["archbishop", "theologian"], knownFor: "Archbishop of Canterbury, ecumenist and social reformer, who proclaimed the gospel's claim on the whole of common life.", intercedesFor: ["justice", "reconciliation"] },
  "willibrord": { vocation: ["bishop", "missionary"], knownFor: "Northumbrian monk and 'Apostle of Frisia,' first archbishop of Utrecht.", intercedesFor: ["mission"] },
  "ammonius": { vocation: ["hermit", "monastic"], knownFor: "A learned desert hermit so set against high office that, by tradition, he maimed himself to avoid being made a bishop.", intercedesFor: ["prayer", "perseverance"] },
  "richard rolle": { vocation: ["hermit", "mystic", "poet"], knownFor: "Richard Rolle, Walter Hilton, and Margery Kempe — English mystics whose writings map the soul's fire, ladder, and pilgrimage of love.", intercedesFor: ["prayer"] },
  "leo of rome": { vocation: ["bishop", "theologian"], knownFor: "Bishop of Rome whose Tome steadied the Church's faith in Christ, and who turned Attila from the gates of Rome.", intercedesFor: ["faith", "leadership", "courage"] },
  "martin of tours": { vocation: ["bishop", "monastic"], knownFor: "Soldier who cut his cloak for a beggar — and met Christ in him — then became a monk and beloved bishop of Tours.", patronOf: ["soldiers", "the poor"], intercedesFor: ["the_poor"] },
  "herman of alaska": { vocation: ["monastic", "missionary"], knownFor: "Russian monk of Kodiak who defended the Alaskan native peoples and embodied the gospel's gentleness.", intercedesFor: ["justice", "peace"] },
  "hugh of lincoln": { vocation: ["bishop", "monastic"], knownFor: "Carthusian monk and bishop of Lincoln, fearless before kings and tender to lepers and the poor.", intercedesFor: ["the_poor", "courage"] },
  "elizabeth of hungary": { vocation: ["layperson"], knownFor: "A princess and young widow who gave her wealth to the poor and built a hospital, serving the sick with her own hands.", intercedesFor: ["the_poor", "illness"] },
  "edmund": { vocation: ["king", "martyr"], knownFor: "King of East Anglia, killed by the Danes for refusing to renounce Christ or rule under a pagan.", intercedesFor: ["courage"] },
  "mechthilde of hackeborn and gertrude the great": { vocation: ["monastic", "mystic", "theologian"], knownFor: "Nuns of Helfta whose visions of the Sacred Heart and the love of God enriched the Church's prayer.", intercedesFor: ["prayer"] },
  "clive staples lewis": { vocation: ["scholar", "teacher"], knownFor: "Oxford scholar and the twentieth century's great apologist — Mere Christianity, The Screwtape Letters, and the Chronicles of Narnia.", intercedesFor: ["study", "doubt", "creativity"] },
  "clement of rome": { vocation: ["bishop"], knownFor: "Early bishop of Rome whose letter to the Corinthians, calling them to humility and order, is among the oldest Christian writings outside the New Testament.", intercedesFor: ["reconciliation", "leadership"] },
  "catherine of alexandria": { vocation: ["martyr"], knownFor: "Catherine of Alexandria, Barbara, and Margaret — early women martyrs whose courage and learning were honored across the medieval church.", intercedesFor: ["courage", "study"], patronOf: ["students", "philosophers"] },
  "james otis sargent huntington": { vocation: ["monastic", "priest"], knownFor: "Founder of the Order of the Holy Cross, the first enduring monastic order for men in the American church.", intercedesFor: ["the_poor"] },
  "kamehameha and emma of hawaii": { vocation: ["king", "queen"], knownFor: "King and Queen of Hawai'i who welcomed the Anglican church to the islands and founded its hospital and schools.", intercedesFor: ["illness", "leadership"] },

  // ── December ──
  "charles de foucauld": { vocation: ["hermit", "priest", "martyr"], knownFor: "Soldier and explorer turned hermit among the Tuareg of the Sahara, who sought to be a 'universal brother' and died at his post.", intercedesFor: ["prayer", "hospitality"] },
  "channing moore williams": { vocation: ["bishop", "missionary"], knownFor: "Pioneering Episcopal missionary bishop in China and Japan, who planted the church and translated its prayers.", intercedesFor: ["mission"] },
  "francis xavier": { vocation: ["priest", "missionary"], knownFor: "Jesuit who carried the gospel across India, the Indies, and Japan, baptizing tens of thousands.", patronOf: ["the missions"], intercedesFor: ["mission"] },
  "john of damascus": { vocation: ["priest", "theologian", "poet"], knownFor: "The last of the Greek fathers, defender of the holy images and a great hymn-writer of the Eastern church.", intercedesFor: ["creativity"] },
  "clement of alexandria": { vocation: ["priest", "theologian", "teacher"], knownFor: "Learned teacher of Alexandria who commended Christ as the true Word to the wisdom of the Greeks.", intercedesFor: ["study"] },
  "nicholas of myra": { vocation: ["bishop"], knownFor: "Bishop of Myra famed for secret gifts to the poor — the saint behind Santa Claus.", patronOf: ["children", "sailors"], intercedesFor: ["the_poor", "children"] },
  "ambrose of milan": { vocation: ["bishop", "theologian"], knownFor: "Bishop of Milan who stood up to emperors, baptized Augustine, and gave the Western church its hymns.", intercedesFor: ["courage"], patronOf: ["beekeepers"] },
  "nicholas ferrar": { vocation: ["deacon"], knownFor: "Founder of the household community at Little Gidding, a life of prayer, work, and hospitality praised by George Herbert and T. S. Eliot.", intercedesFor: ["prayer", "hospitality"] },
  "francis de sales": { vocation: ["bishop", "theologian"], knownFor: "Francis de Sales and Jane de Chantal — gentle guides of the devout life for ordinary people, founders of the Visitation order.", intercedesFor: ["prayer"] },
  "lucy of syracuse": { vocation: ["martyr"], knownFor: "Young Sicilian martyr whose name means 'light,' kept near the year's darkest day.", patronOf: ["the blind", "those with eye trouble"], intercedesFor: ["illness", "courage"] },
  "john of the cross": { vocation: ["mystic", "priest", "reformer", "poet"], knownFor: "Carmelite reformer and poet of 'the dark night of the soul,' who found God in the deepest emptiness.", intercedesFor: ["prayer", "doubt", "suffering"] },
  "nino of georgia": { vocation: ["missionary"], knownFor: "A captive woman whose witness and healing brought the nation of Georgia to the Christian faith.", intercedesFor: ["mission", "healing"] },
  "dorothy l. sayers": { vocation: ["scholar", "poet", "teacher"], knownFor: "Mystery novelist, dramatist, and translator of Dante, who made the creeds vivid and the work of the mind a vocation.", intercedesFor: ["creativity", "study", "work"] },
  "katharina von bora": { vocation: ["reformer", "layperson"], knownFor: "A runaway nun who married Martin Luther and built the household that became a model of Reformation family life.", intercedesFor: ["family"] },
  "thomas becket": { vocation: ["archbishop", "martyr"], knownFor: "Archbishop of Canterbury cut down in his own cathedral for defending the Church against the king.", intercedesFor: ["courage"] },
  "frances joseph gaudet": { vocation: ["layperson", "reformer", "teacher"], knownFor: "Black educator of New Orleans, a pioneer of prison reform and of schooling for neglected children.", intercedesFor: ["justice", "study"] },
};

// ─── Build the index from the calendar + enrichment ─────────────────────────

const RANK_MAP: Record<FixedFeastEntry["rank"], SaintRank> = {
  principal_feast: "principalFeast",
  holy_day: "holyDay",
  lesser_feast: "commemoration",
};

function slugify(core: string): string {
  return core.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildSaint(e: FixedFeastEntry): Saint {
  const core = normalizeCore(e.name);
  const enr = ENRICHMENTS[core];
  return {
    id: `${slugify(core) || "feast"}-${e.month}-${e.day}`,
    name: e.name,
    feastDate: { month: e.month, day: e.day },
    rank: RANK_MAP[e.rank],
    yearsLived: e.life,
    vocation: enr?.vocation ?? [],
    knownFor: enr?.knownFor ?? e.description,
    patronOf: enr?.patronOf ?? [],
    intercedesFor: enr?.intercedesFor ?? [],
    collectExcerpt: enr?.collectExcerpt,
    anglicanNote: enr?.anglicanNote,
  };
}

// Every commemoration the home screen can name — Holy Days + Lesser Feasts —
// in calendar order. Deduped by id (defensive against a shared date).
export const SAINTS: Saint[] = (() => {
  const seen = new Set<string>();
  const all: Saint[] = [];
  for (const e of [...HOLY_DAYS, ...LESSER_FEASTS]) {
    const s = buildSaint(e);
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    all.push(s);
  }
  all.sort((a, b) =>
    a.feastDate.month - b.feastDate.month || a.feastDate.day - b.feastDate.day,
  );
  return all;
})();

// ─── Lookups (used by the views) ────────────────────────────────────────────

// Free-text search across name, "known for", patronage, Anglican note,
// vocation, and tagged intentions (so a need like "grief" surfaces companions).
export function searchSaints(query: string): Saint[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SAINTS.filter((s) => {
    const hay = [
      s.name,
      s.knownFor ?? "",
      s.anglicanNote ?? "",
      ...s.patronOf,
      ...s.vocation,
      ...s.intercedesFor.map(intentionLabel),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function getSaintById(id: string): Saint | undefined {
  return SAINTS.find((s) => s.id === id);
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export function feastDateLabel(d: FeastDate): string {
  return `${MONTHS_SHORT[d.month - 1]} ${d.day}`;
}
