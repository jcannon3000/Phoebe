import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { openExternal } from "@/lib/openExternal";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CTA = "#2D5E3F";
const CARD = "rgba(46,107,64,0.10)";
const CARD_B = "rgba(46,107,64,0.22)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// Bible.com YouVersion book codes
const BOOK_MAP: Record<string, string> = {
  genesis: "GEN", gen: "GEN", gn: "GEN",
  exodus: "EXO", exo: "EXO", ex: "EXO",
  leviticus: "LEV", lev: "LEV",
  numbers: "NUM", num: "NUM",
  deuteronomy: "DEU", deu: "DEU", deut: "DEU",
  joshua: "JOS", josh: "JOS",
  judges: "JDG", judg: "JDG",
  ruth: "RUT",
  "1 samuel": "1SA", "1samuel": "1SA", "1sa": "1SA", "1sam": "1SA",
  "2 samuel": "2SA", "2samuel": "2SA", "2sa": "2SA", "2sam": "2SA",
  "1 kings": "1KI", "1kings": "1KI", "1ki": "1KI",
  "2 kings": "2KI", "2kings": "2KI", "2ki": "2KI",
  "1 chronicles": "1CH", "1chr": "1CH", "1ch": "1CH",
  "2 chronicles": "2CH", "2chr": "2CH", "2ch": "2CH",
  ezra: "EZR",
  nehemiah: "NEH", neh: "NEH",
  esther: "EST", esth: "EST",
  job: "JOB",
  psalms: "PSA", psalm: "PSA", ps: "PSA", psa: "PSA", salmos: "PSA", salmo: "PSA",
  proverbs: "PRO", prov: "PRO", proverbios: "PRO",
  ecclesiastes: "ECC", eccl: "ECC",
  "song of solomon": "SNG", "song of songs": "SNG", sos: "SNG", cantar: "SNG",
  isaiah: "ISA", isa: "ISA", isaias: "ISA",
  jeremiah: "JER", jer: "JER", jeremias: "JER",
  lamentations: "LAM", lam: "LAM",
  ezekiel: "EZK", ezek: "EZK", ezequiel: "EZK",
  daniel: "DAN", dan: "DAN",
  hosea: "HOS", hos: "HOS", oseas: "HOS",
  joel: "JOL",
  amos: "AMO",
  obadiah: "OBA", obad: "OBA",
  jonah: "JON", jon: "JON", jonas: "JON",
  micah: "MIC", mic: "MIC", miqueas: "MIC",
  nahum: "NAM", nah: "NAM",
  habakkuk: "HAB", hab: "HAB",
  zephaniah: "ZEP", zeph: "ZEP", sofonias: "ZEP",
  haggai: "HAG", hag: "HAG", ageo: "HAG",
  zechariah: "ZEC", zech: "ZEC", zacarias: "ZEC",
  malachi: "MAL", mal: "MAL", malaquias: "MAL",
  matthew: "MAT", matt: "MAT", mt: "MAT", mateo: "MAT",
  mark: "MRK", mk: "MRK", marcos: "MRK",
  luke: "LUK", lk: "LUK", lucas: "LUK",
  john: "JHN", jn: "JHN", juan: "JHN",
  acts: "ACT", hechos: "ACT",
  romans: "ROM", rom: "ROM", romanos: "ROM",
  "1 corinthians": "1CO", "1cor": "1CO", "1co": "1CO", "1 corintios": "1CO",
  "2 corinthians": "2CO", "2cor": "2CO", "2co": "2CO", "2 corintios": "2CO",
  galatians: "GAL", gal: "GAL", galatas: "GAL",
  ephesians: "EPH", eph: "EPH", efesios: "EPH",
  philippians: "PHP", phil: "PHP", filipenses: "PHP",
  colossians: "COL", col: "COL", colosenses: "COL",
  "1 thessalonians": "1TH", "1th": "1TH", "1 tesalonicenses": "1TH",
  "2 thessalonians": "2TH", "2th": "2TH", "2 tesalonicenses": "2TH",
  "1 timothy": "1TI", "1ti": "1TI", "1tim": "1TI", "1 timoteo": "1TI",
  "2 timothy": "2TI", "2ti": "2TI", "2tim": "2TI", "2 timoteo": "2TI",
  titus: "TIT", tit: "TIT", tito: "TIT",
  philemon: "PHM", phm: "PHM", filemon: "PHM",
  hebrews: "HEB", heb: "HEB", hebreos: "HEB",
  james: "JAS", jas: "JAS", santiago: "JAS",
  "1 peter": "1PE", "1pe": "1PE", "1pet": "1PE", "1 pedro": "1PE",
  "2 peter": "2PE", "2pe": "2PE", "2pet": "2PE", "2 pedro": "2PE",
  "1 john": "1JN", "1jn": "1JN", "1 juan": "1JN",
  "2 john": "2JN", "2jn": "2JN", "2 juan": "2JN",
  "3 john": "3JN", "3jn": "3JN", "3 juan": "3JN",
  jude: "JUD", jud: "JUD", judas: "JUD",
  revelation: "REV", rev: "REV", apocalipsis: "REV",
};

// Version IDs on bible.com
const VERSIONS = [
  { id: 128, label: "NVI (Español)" },
  { id: 173, label: "RVC (Español)" },
  { id: 111, label: "NIV (English)" },
  { id: 59,  label: "ESV (English)" },
  { id: 1,   label: "KJV (English)" },
];

function parseRef(input: string): string | null {
  const s = input.trim();
  // Match: optional number prefix + book name + space + chapter + optional :verse or :verse-verse
  const m = s.match(/^(\d\s*)?([a-záéíóúüñ ]+?)\s+(\d+)(?::(\d+)(?:-\d+)?)?$/i);
  if (!m) return null;
  const prefix = (m[1] ?? "").trim();
  const bookRaw = ((prefix ? prefix + " " : "") + m[2]).trim().toLowerCase().replace(/\s+/g, " ");
  const chapter = m[3];
  const verse = m[4];
  const code = BOOK_MAP[bookRaw];
  if (!code) return null;
  return verse ? `${code}.${chapter}.${verse}` : `${code}.${chapter}`;
}

const QUICK_REFS = [
  "John 3:16", "Psalm 23", "Romans 8:28", "Jeremiah 29:11",
  "Philippians 4:13", "Isaiah 40:31", "Matthew 5:3", "Psalm 91:1",
  "Juan 3:16", "Salmos 23", "Romanos 8:28",
];

export default function JardinBiblePage() {
  const [, setLocation] = useLocation();
  const [ref, setRef] = useState("");
  const [version, setVersion] = useState(128);
  const [error, setError] = useState("");

  const open = (refStr: string) => {
    const parsed = parseRef(refStr);
    if (!parsed) { setError(`Couldn't parse "${refStr}" — try "John 3:16" or "Salmos 23"`); return; }
    setError("");
    openExternal(`https://www.bible.com/bible/${version}/${parsed}`);
  };

  const eyebrow = { color: SAGE_DIM, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT };

  return (
    <Layout>
      <div style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "4px 2px 28px", fontFamily: FONT }}>
        <button type="button" onClick={() => setLocation("/menu/jardin")}
          style={{ background: "none", border: "none", color: SAGE_DIM, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: "0 0 12px" }}>
          ← El Jardín
        </button>

        <p style={{ ...eyebrow, margin: "4px 0 2px" }}>Bible Lookup</p>
        <h1 style={{ color: WARM, fontSize: 22, fontWeight: 700, margin: "0 0 18px", lineHeight: 1.25 }}>Open any passage</h1>

        {/* Version picker */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ ...eyebrow, margin: "0 0 8px" }}>Translation</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {VERSIONS.map((v) => (
              <button key={v.id} type="button" onClick={() => setVersion(v.id)}
                style={{ padding: "6px 14px", borderRadius: 99, fontFamily: FONT, fontSize: 13, cursor: "pointer",
                  background: version === v.id ? CTA : CARD,
                  border: `1px solid ${version === v.id ? "rgba(168,197,160,0.5)" : CARD_B}`,
                  color: WARM }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reference input */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={ref}
            onChange={(e) => { setRef(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && open(ref)}
            placeholder="e.g. John 3:16 or Salmos 23"
            style={{ flex: 1, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "11px 14px",
              color: WARM, fontFamily: FONT, fontSize: 15, outline: "none" }}
          />
          <button type="button" onClick={() => open(ref)} disabled={!ref.trim()}
            style={{ padding: "11px 20px", borderRadius: 12, background: ref.trim() ? CTA : CARD,
              border: `1px solid rgba(168,197,160,0.35)`, color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 700,
              cursor: ref.trim() ? "pointer" : "default" }}>
            Open ↗
          </button>
        </div>
        {error && <p style={{ color: "#E07070", fontSize: 13, margin: "8px 0 0", fontFamily: FONT }}>{error}</p>}

        {/* Quick references */}
        <p style={{ ...eyebrow, margin: "22px 0 10px" }}>Quick references</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {QUICK_REFS.map((q) => (
            <button key={q} type="button" onClick={() => open(q)}
              style={{ padding: "7px 14px", borderRadius: 99, background: CARD, border: `1px solid ${CARD_B}`,
                color: WARM, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}>
              {q}
            </button>
          ))}
        </div>

        <p style={{ color: SAGE_DIM, fontSize: 12, marginTop: 24, lineHeight: 1.5 }}>
          Opens in Bible.com — tap Back to return here.
        </p>
      </div>
    </Layout>
  );
}
