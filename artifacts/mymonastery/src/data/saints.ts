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
  | "scholar" | "nurse" | "physician" | "queen" | "prophet"
  | "layperson" | "mother";

export type Intention =
  | "grief" | "illness" | "healing" | "dying" | "suffering"
  | "vocation" | "doubt" | "faith" | "conversion" | "reconciliation"
  | "justice" | "courage" | "perseverance" | "prayer" | "study"
  | "creativity" | "childbirth" | "family" | "marriage" | "poverty"
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
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
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
  "all saints' day": {
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
