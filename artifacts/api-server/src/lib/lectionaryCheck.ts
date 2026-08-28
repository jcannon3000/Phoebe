/**
 * The forward lection checker (owner: "make sure we are showing the right
 * readings for the saint days … build a mechanism that could check forward
 * to see the lection … check at 3am ET each day").
 *
 * Ground truth: Forward Movement's Daily Prayer site publishes its 1979 BCP
 * Daily Office lectionary as static JSON (data/lectionary/
 * bcp1979_daily_office.json + bcp1979_daily_psalms.json — the same files
 * their own daily-readings page renders from). This job fetches them, walks
 * the next N days through OUR calendar (getOfficeDay → getLectionaryReadings,
 * the exact path the office assembles from), maps our week key to FM's day
 * slug, and diffs the appointed lessons and psalms.
 *
 * What a mismatch means: either our lectionary table is wrong for that day,
 * our CALENDAR resolved the day differently than FM's (also a finding), or
 * the slug mapping below has a hole (reported as "unmapped", never silently
 * skipped). Lesser feasts don't move the office readings on either side —
 * both systems keep the weekday cycle and only major Holy Days carry
 * propers — so saint days are covered by exactly this comparison.
 *
 * Runs at 3 AM ET daily (self-gated tick) and once shortly after boot; the
 * latest report is held in memory and served by GET /api/admin/lectionary-check.
 */
import { getOfficeDay } from "./liturgicalCalendar";
import { getLectionaryReadings } from "./lectionary";

const FM_BASE = "https://prayer.forwardmovement.org/data/lectionary";
const UA = "Phoebe/1.0 (prayer app; +https://withphoebe.app; jcannon3000@gmail.com)";

type FmRow = { type: string; citation: string; day: string; when: string };

let fmCache: { office: FmRow[]; psalms: FmRow[]; fetchedAt: number } | null = null;

async function fetchFm(): Promise<{ office: FmRow[]; psalms: FmRow[] }> {
  if (fmCache && Date.now() - fmCache.fetchedAt < 20 * 60 * 60 * 1000) return fmCache;
  const get = async (name: string): Promise<FmRow[]> => {
    const res = await fetch(`${FM_BASE}/${name}.json`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`FM ${name} ${res.status}`);
    const data = (await res.json()) as FmRow[];
    if (!Array.isArray(data)) throw new Error(`FM ${name}: unexpected shape`);
    return data;
  };
  const [office, psalms] = await Promise.all([get("bcp1979_daily_office"), get("bcp1979_daily_psalms")]);
  fmCache = { office, psalms, fetchedAt: Date.now() };
  return fmCache;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

/**
 * OUR lectionary week key → candidate FM day slugs, most specific first.
 * The caller keeps the first candidate that exists in FM's data; none
 * existing is reported as "unmapped" — a mapping hole is a finding, not a
 * pass.
 */
export function fmSlugCandidates(weekKey: string): string[] {
  const out: string[] = [];
  let m = /^proper_(\d+)_([a-z]+)$/.exec(weekKey);
  if (m) out.push(`${m[2]}-proper-${m[1]}`);
  m = /^advent_(\d)_([a-z]+)$/.exec(weekKey);
  // Advent alone uses WORDED ordinals on FM ("friday-first-advent") — every
  // other season is numeric ("friday-1st-lent"). Found by the checker's own
  // December run of 24 "unmapped" days.
  const WORD_ORD = ["", "first", "second", "third", "fourth"];
  if (m) out.push(`${m[2]}-${WORD_ORD[+m[1]!] ?? ORD[+m[1]!]}-advent`, `${m[2]}-${ORD[+m[1]!]}-advent`);
  m = /^epiphany_(\d)_([a-z]+)$/.exec(weekKey);
  if (m) out.push(`${m[2]}-${ORD[+m[1]!]}-epiphany`);
  m = /^epiphany_last_([a-z]+)$/.exec(weekKey);
  if (m) out.push(`${m[1]}-last-epiphany`);
  m = /^lent_(\d)_([a-z]+)$/.exec(weekKey);
  if (m) out.push(`${m[2]}-${ORD[+m[1]!]}-lent`);
  m = /^easter_(\d)_([a-z]+)$/.exec(weekKey);
  if (m) {
    const n = +m[1]!;
    // Easter Week itself is FM's bare "<weekday>-easter"; weeks 2+ are ordinal.
    if (n === 1) out.push(`${m[2]}-easter`, `${m[2]}-easter-week`);
    else out.push(`${m[2]}-${ORD[n]}-easter`);
  }
  m = /^holyweek_([a-z]+)$/.exec(weekKey);
  if (m) out.push(`${m[1]}-holy-week`);
  m = /^christmas_dec(\d+)$/.exec(weekKey);
  if (m) {
    out.push(`december-${m[1]}`);
    if (m[1] === "25") out.push("christmas-day");
    if (m[1] === "26") out.push("st-stephen");
    if (m[1] === "27") out.push("st-john");
    if (m[1] === "28") out.push("holy-innocents");
    if (m[1] === "24") out.push("christmas-eve");
  }
  m = /^christmas_jan(\d+)$/.exec(weekKey);
  if (m) out.push(m[1] === "1" ? "holy-name" : `january-${m[1]}`, `january-${m[1]}`);
  m = /^christmas_(\d)_sunday$/.exec(weekKey);
  if (m) out.push(`sunday-${ORD[+m[1]!]}-sunday-after-christmas`);
  m = /^epiphany_jan(\d+)$/.exec(weekKey);
  if (m) out.push(`january-${m[1]}`);
  if (weekKey === "epiphany_day") out.push("epiphany");
  // FM has no ash-wednesday slug — the BCP lectionary places Ash Wednesday
  // in the Last Epiphany week, and FM keys it that way.
  if (weekKey === "ash_wednesday") out.push("ash-wednesday", "wednesday-last-epiphany");
  if (weekKey === "trinity_sunday") out.push("trinity-sunday");
  if (weekKey === "trinity_eve") out.push("eve-trinity-sunday");
  if (weekKey === "pentecost_eve") out.push("eve-of-pentecost");
  if (weekKey === "ascension_eve") out.push("eve-of-ascension");
  if (/^pentecost/.test(weekKey)) out.push("pentecost", "day-of-pentecost");
  return out;
}

/** Both sides write BCP-style citations ("Deut. 7:12-16") — normalize the
 *  cosmetics so only real differences remain: separators (";" vs ","), long
 *  dashes and "--", ALL whitespace, trailing periods, and the handful of
 *  book-abbreviation splits ("Rev." vs "Revelation") the first run surfaced. */
const BOOK_ALIASES: Array<[RegExp, string]> = [
  [/^rev(elation)?\b/, "revelation"],
  [/^num(bers)?\b/, "numbers"],
  [/^deut(eronomy)?\b/, "deuteronomy"],
  [/^gen(esis)?\b/, "genesis"],
  [/^ex(od(us)?)?\b/, "exodus"],
  [/^lev(iticus)?\b/, "leviticus"],
  [/^josh(ua)?\b/, "joshua"],
  [/^judg(es)?\b/, "judges"],
  [/^(1|2) ?sam(uel)?\b/, "$1samuel"],
  [/^(1|2) ?k(in)?gs\b/, "$1kings"],
  [/^(1|2) ?chr(on(icles)?)?\b/, "$1chronicles"],
  [/^neh(emiah)?\b/, "nehemiah"],
  [/^ps(alms?)?\b/, "psalm"],
  [/^prov(erbs)?\b/, "proverbs"],
  [/^eccl(es(iastes)?)?\b/, "ecclesiastes"],
  [/^isa(iah)?\b/, "isaiah"],
  [/^jer(emiah)?\b/, "jeremiah"],
  [/^lam(entations)?\b/, "lamentations"],
  [/^ezek(iel)?\b/, "ezekiel"],
  [/^dan(iel)?\b/, "daniel"],
  [/^hos(ea)?\b/, "hosea"],
  [/^ob(ad(iah)?)?\b/, "obadiah"],
  [/^mic(ah)?\b/, "micah"],
  [/^nah(um)?\b/, "nahum"],
  [/^hab(akkuk)?\b/, "habakkuk"],
  [/^zeph(aniah)?\b/, "zephaniah"],
  [/^hag(gai)?\b/, "haggai"],
  [/^zech(ariah)?\b/, "zechariah"],
  [/^mal(achi)?\b/, "malachi"],
  [/^matt(hew)?\b/, "matthew"],
  [/^m(ar)?k\b/, "mark"],
  [/^l(u)?ke?\b/, "luke"],
  [/^rom(ans)?\b/, "romans"],
  [/^(1|2) ?cor(inthians)?\b/, "$1corinthians"],
  [/^gal(atians)?\b/, "galatians"],
  [/^eph(esians)?\b/, "ephesians"],
  [/^phil(ippians)?\b/, "philippians"],
  [/^col(ossians)?\b/, "colossians"],
  [/^(1|2) ?thess(alonians)?\b/, "$1thessalonians"],
  [/^(1|2) ?tim(othy)?\b/, "$1timothy"],
  [/^tit(us)?\b/, "titus"],
  [/^philem(on)?\b/, "philemon"],
  [/^heb(rews)?\b/, "hebrews"],
  [/^ja(me)?s\b/, "james"],
  [/^(1|2) ?pet(er)?\b/, "$1peter"],
  [/^(1|2|3) ?j(oh)?n\b/, "$1john"],
  [/^ecclus\b|^sirach\b/, "sirach"],
  [/^wis(dom)?\b/, "wisdom"],
];
function normCitation(c: string): string {
  let s = c
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/--/g, "-")
    .replace(/\./g, "")
    .replace(/;/g, ",")
    // Our table's footnote stars ("Esther 1:1-4, 10-19*" — the or-Judith
    // alternates) and the two sides' bracket styles for optional verses
    // ("[1:1-4]" vs "(1:1-4)") are cosmetics, not appointments. Brackets
    // become commas, NOT nothing — stripping them glued "2:36-41(42-47)"
    // into "2:36-4142-47" (a checker bug the first year-run exposed).
    .replace(/\*/g, "")
    .replace(/[\[\]()]/g, ",")
    .replace(/,+/g, ",")
    .replace(/,\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, to] of BOOK_ALIASES) {
    if (re.test(s)) { s = s.replace(re, to); break; }
  }
  // A stray comma between book name and chapter ("Heb., 1:1-12") is a
  // table typo, not a different appointment.
  return s.replace(/\s+/g, "").replace(/([a-z]),(?=\d)/g, "$1");
}

/** Our table writes in-line alternates ("John 11:1-27 or 12:1-10"); FM
 *  writes them as separate rows. Expand ours into every variant. */
function expandAlternates(norm: string): string[] {
  // An alternate's second half always starts with a DIGIT ("…,or12:1-10") —
  // a bare /or/ split carved "1Corinthians" into "1c"+"inthians" (the
  // year-run's six false Sunday errors).
  const parts = norm.split(/,?or(?=\d)/);
  if (parts.length < 2) return [norm];
  const book = /^[0-9]?[a-z]+/.exec(parts[0]!)?.[0] ?? "";
  return parts.map((p, i) => (i === 0 || /^[0-9]?[a-z]/.test(p) ? p : book + p)).filter(Boolean);
}

/** FM's psalm citations ("psalm_105_i", "psalm_119_aleph") → the psalm
 *  NUMBER. Portions use different vocabularies on the two sides (i/ii and
 *  Hebrew letters vs verse ranges), so numbers are what can be compared. */
function fmPsalmNumber(c: string): string | null {
  const m = /^psalm_(\d+)/.exec(c);
  return m ? m[1]! : null;
}
function ourPsalmNumber(c: string): string | null {
  const m = /^(\d+)/.exec(c.trim());
  return m ? m[1]! : null;
}

export type DayCheck = {
  ymd: string;
  weekKey: string;
  year: 1 | 2;
  feast: string | null;
  fmSlug: string | null;
  ok: boolean;
  /** Real disagreements — a lesson one side appoints and the other doesn't. */
  problems: string[];
  /**
   * Differences that are usually the BCP's own latitude, not errors: the
   * bracketed/alternate PSALMS (FM lists the bracketed option, our table
   * often carries the alternate — both are the prayer book), and a Holy
   * Day's extra FM slots (we deliberately serve MP1+MP2+EP2 of the four).
   * Reported so the owner can eyeball them; they don't fail the day.
   */
  notes: string[];
};

export type LectionaryReport = {
  generatedAt: string;
  daysChecked: number;
  okCount: number;
  problems: DayCheck[];
  days: DayCheck[];
};

let lastReport: LectionaryReport | null = null;
export function getLectionaryReport(): LectionaryReport | null { return lastReport; }

/** One date, in ET — the app's liturgical home timezone. */
function etDate(offsetDays: number): { date: Date; ymd: string } {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() + offsetDays);
  const ymd = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
  return { date: new Date(et.getFullYear(), et.getMonth(), et.getDate(), 12), ymd };
}

export async function runLectionaryCheck(daysAhead = 14): Promise<LectionaryReport> {
  const { office, psalms } = await fetchFm();
  const slugSet = new Set(office.map((r) => r.day));
  const days: DayCheck[] = [];

  for (let i = 0; i < daysAhead; i++) {
    const { date, ymd } = etDate(i);
    const od = getOfficeDay(date);
    const problems: string[] = [];
    const notes: string[] = [];
    const check: DayCheck = {
      ymd, weekKey: od.lectionaryWeekKey, year: od.liturgicalYear,
      feast: od.feastName, fmSlug: null, ok: true, problems, notes,
    };
    days.push(check);

    /**
     * A major Holy Day serves its PROPER readings on both sides — compare
     * against FM's feast slug (their holy_day_* rows), not the weekday the
     * calendar happens to fall on. The first run flagged Holy Cross Day as
     * 13 mismatches when both systems were serving the feast correctly.
     */
    const feastSlugs = od.holyDayReadings && od.feastName
      ? (() => {
          const base = od.feastName.toLowerCase();
          const slugify = (x: string) => x.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const saintFirst = /^saint ([a-z]+)/.exec(base)?.[1];
          return [
            slugify(base.replace(/^saint /, "st ")),
            // FM truncates several apostles to the bare name — "Saint Michael
            // and All Angels" is just "st-michael" (Michaelmas was the one
            // 60-day "error": both systems serving the feast, unmapped slug).
            ...(saintFirst ? [`st-${saintFirst}`] : []),
            slugify(base.replace(/^the /, "")),
            slugify(base.replace(/ day$/, "")),
          ];
        })()
      : [];
    const candidates = [...feastSlugs, ...fmSlugCandidates(od.lectionaryWeekKey)];
    const slug = candidates.find((c) => slugSet.has(c)) ?? null;
    check.fmSlug = slug;
    if (!slug) {
      problems.push(`no FM slug for weekKey "${od.lectionaryWeekKey}" (tried: ${candidates.join(", ") || "none"})`);
      check.ok = false;
      continue;
    }

    // Lessons — ours across MP+EP vs FM's three for the day+year.
    const mp = getLectionaryReadings(od, "morning");
    const ep = getLectionaryReadings(od, "evening");
    const ourLessons = [mp.lesson1, mp.lesson2, mp.lesson3, ep.lesson1, ep.lesson2, ep.lesson3]
      .filter(Boolean).map(normCitation).flatMap(expandAlternates);
    const isFeastSlug = feastSlugs.includes(slug);
    const fmLessons = office
      .filter((r) => r.day === slug
        && (isFeastSlug || r.when === String(od.liturgicalYear))
        && (isFeastSlug
          ? ["holy_day_morning_1", "holy_day_morning_2", "holy_day_evening_1", "holy_day_evening_2"].includes(r.type)
          : ["first_reading", "second_reading", "gospel"].includes(r.type)))
      .map((r) => normCitation(r.citation));
    const bookChapter = (x: string) => x.replace(/[:,].*$/, "");
    for (const l of new Set(fmLessons)) {
      if (!ourLessons.includes(l)) {
        // FM lists ALTERNATE readings as extra rows of the same slot
        // (Proper 25's two Sirach 34 spans). When we already carry a lesson
        // from the same book+chapter, the extra is the alternate, not a
        // miss. Holy Days: we serve three of FM's four slots by design.
        const alternate = ourLessons.some((o) => bookChapter(o) === bookChapter(l));
        (isFeastSlug || alternate ? notes : problems).push(`FM appoints lesson "${l}" — we don't`);
      }
    }
    for (const l of new Set(ourLessons)) {
      if (!fmLessons.includes(l)) {
        const alternate = fmLessons.some((f) => bookChapter(f) === bookChapter(l)) || l === "-----";
        (isFeastSlug || alternate ? notes : problems).push(`we appoint lesson "${l}" — FM doesn't`);
      }
    }

    // Psalms — numbers only (portion vocabularies differ; see fmPsalmNumber).
    const ourPs = new Set([...mp.psalms, ...ep.psalms].map(ourPsalmNumber).filter(Boolean) as string[]);
    const fmPs = new Set(psalms
      .filter((r) => r.day === slug
        && (isFeastSlug || r.when === String(od.liturgicalYear)))
      .map((r) => fmPsalmNumber(r.citation)).filter(Boolean) as string[]);
    for (const p of fmPs) if (!ourPs.has(p)) notes.push(`FM appoints Psalm ${p} — we don't`);
    for (const p of ourPs) if (!fmPs.has(p)) notes.push(`we appoint Psalm ${p} — FM doesn't`);

    check.ok = problems.length === 0;
  }

  const report: LectionaryReport = {
    generatedAt: new Date().toISOString(),
    daysChecked: days.length,
    okCount: days.filter((d) => d.ok).length,
    problems: days.filter((d) => !d.ok),
    days,
  };
  lastReport = report;
  const bad = report.problems.length;
  // eslint-disable-next-line no-console
  console.log(`[lectionary-check] ${report.okCount}/${report.daysChecked} days agree with Forward Movement${bad ? ` — ${bad} MISMATCH day(s): ${report.problems.map((p) => p.ymd).join(", ")}` : ""}`);
  return report;
}

let started = false;
let lastRunEtYmd = "";

/** Boot run (~90s in, off the critical path) + a 3 AM ET daily run. */
export function startLectionaryChecker(): void {
  if (started) return;
  started = true;
  setTimeout(() => { void runLectionaryCheck().catch((e) => console.error("[lectionary-check] boot run failed:", e)); }, 90_000);
  setInterval(() => {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const ymd = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
    if (et.getHours() === 3 && lastRunEtYmd !== ymd) {
      lastRunEtYmd = ymd;
      void runLectionaryCheck().catch((e) => console.error("[lectionary-check] 3am run failed:", e));
    }
  }, 10 * 60 * 1000);
}
