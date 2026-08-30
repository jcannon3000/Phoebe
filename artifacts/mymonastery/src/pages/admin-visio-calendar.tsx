/**
 * /admin/visio-calendar — the Visio Divina year, one row per week.
 *
 * Owner: "can you build an admin tool that shows the weekly calendar for the
 * visio divina?"
 *
 * The generated schedule is keyed by DAY, with all seven days of a week
 * carrying the same entry — right for the runtime (a plain date lookup) and
 * unreadable for a person. This collapses it back into the weeks it was built
 * from and shows what someone will actually meet.
 *
 * WHY THE "reading" COLUMN IS THE ONE TO WATCH: `followsToday` is what lets
 * the deck say "This week's reading" and hand the reader off to the passage.
 * It is true only when the artwork's own verses OVERLAP the Sunday's
 * appointed ones — a same-chapter match is deliberately not enough, because
 * the card once announced Matthew 22:15-22 on a week appointing 22:34-46. A
 * week with a passage and no ✓ is working correctly: a good picture for the
 * week that does not claim to be the reading.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { VISIO_SCHEDULE } from "@/lib/visioSchedule";
import { ACT_CATALOGUE } from "@/lib/visioCatalogue";
import { ACT_COMMENTARY_CATALOGUE } from "@/lib/visioCommentaryCatalogue";
import { canonicalRef } from "@/lib/visioSelect";

const BG = "#0A1A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.9)";
const FAINT = "rgba(200,212,192,0.62)";
const BORDER = "rgba(200,212,192,0.18)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Row = {
  sunday: string; monday: string; id: number; ref: string; followsToday: boolean;
  title: string; artist: string | null; img: string; curated: boolean; hasEssay: boolean;
};

/** Local-noon in, local parts out — the convention the schedule is built on. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d);
}
/** The Sunday a week closes on — a Sunday maps to itself. */
function sundayEnding(iso: string): string {
  const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return ymd(d);
}
function pretty(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function AdminVisioCalendarPage() {
  const [, setLocation] = useLocation();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [onlyUnclaimed, setOnlyUnclaimed] = useState(false);

  const { data: who, isLoading: whoLoading } = useQuery<{ isSuperAdmin: boolean }>({
    queryKey: ["/api/admin/am-super"],
    queryFn: () => apiRequest("GET", "/api/admin/am-super") as Promise<{ isSuperAdmin: boolean }>,
  });

  /** The union the schedule is built from, so every pin resolves. */
  const byId = useMemo(() => {
    const m = new Map<number, { title: string; artist: string | null; img: string; essay: string; curated: boolean }>();
    for (const a of ACT_CATALOGUE) m.set(a.id, { title: a.title, artist: a.artist, img: a.img, essay: a.essay, curated: true });
    for (const a of ACT_COMMENTARY_CATALOGUE) {
      const prev = m.get(a.id);
      if (prev) m.set(a.id, { ...prev, essay: prev.essay || a.essay });
      else m.set(a.id, { title: a.title, artist: a.artist, img: a.img, essay: a.essay, curated: false });
    }
    return m;
  }, []);

  const rows = useMemo<Row[]>(() => {
    const bySunday = new Map<string, { id: number; ref: string; followsToday: boolean }>();
    for (const [date, entry] of Object.entries(VISIO_SCHEDULE)) {
      const sunday = sundayEnding(date);
      if (!bySunday.has(sunday)) bySunday.set(sunday, entry);
    }
    const out: Row[] = [];
    for (const [sunday, entry] of [...bySunday.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (Number(sunday.slice(0, 4)) !== year) continue;
      const art = byId.get(entry.id);
      out.push({
        sunday, monday: addDays(sunday, -6), id: entry.id, ref: entry.ref,
        followsToday: entry.followsToday,
        title: art?.title ?? `(work ${entry.id} is not in the catalogue)`,
        artist: art?.artist ?? null, img: art?.img ?? "",
        curated: !!art?.curated,
        hasEssay: !!art?.essay && /^https?:\/\//i.test(art.essay),
      });
    }
    return out;
  }, [byId, year]);

  const shown = onlyUnclaimed ? rows.filter((r) => !r.followsToday) : rows;

  const stats = useMemo(() => {
    const uses = new Map<number, number>();
    for (const r of rows) uses.set(r.id, (uses.get(r.id) ?? 0) + 1);
    return {
      weeks: rows.length,
      claiming: rows.filter((r) => r.followsToday).length,
      curated: rows.filter((r) => r.curated).length,
      withEssay: rows.filter((r) => r.hasEssay).length,
      distinct: uses.size,
      // The cap is three appearances a year, an appearance being a week.
      overCap: [...uses.values()].filter((n) => n > 3).length,
      missing: rows.filter((r) => !r.img).length,
    };
  }, [rows]);

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const d of Object.keys(VISIO_SCHEDULE)) ys.add(Number(d.slice(0, 4)));
    return [...ys].sort();
  }, []);

  const thisSunday = sundayEnding(ymd(new Date()));

  if (whoLoading) {
    return <div style={{ minHeight: "100dvh", background: BG, color: FAINT, fontFamily: FONT, padding: 40 }}>Checking…</div>;
  }
  if (!who?.isSuperAdmin) {
    return <div style={{ minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, padding: 40 }}>Not available.</div>;
  }

  const cell: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top", borderBottom: `1px solid ${BORDER}` };
  const pill = (on: boolean): React.CSSProperties => ({
    borderRadius: 999, padding: "7px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
    fontFamily: FONT, color: WARM,
    background: on ? "rgba(46,107,64,0.9)" : "transparent",
    border: `1px solid ${on ? "rgba(46,107,64,0.6)" : BORDER}`,
  });

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, padding: "calc(env(safe-area-inset-top) + 16px) 20px calc(env(safe-area-inset-bottom) + 40px)" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <button
          type="button" onClick={() => setLocation("/admin/tools")}
          style={{ background: "transparent", border: "none", color: FAINT, fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "6px 2px", marginBottom: 10 }}
        >← Admin tools</button>

        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>Visio Divina — the year by week</h1>
        <p style={{ color: FAINT, fontSize: 14, lineHeight: 1.55, margin: "0 0 18px" }}>
          One work per week, Monday to Sunday, chosen for that Sunday's Eucharistic
          readings. A week only says “This week's reading” when the artwork's own
          verses overlap the appointed ones — a same-chapter match is not enough.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          {years.map((y) => (
            <button key={y} type="button" onClick={() => setYear(y)} style={pill(y === year)}>{y}</button>
          ))}
          <button type="button" onClick={() => setOnlyUnclaimed((v) => !v)} style={pill(onlyUnclaimed)}>
            Only weeks not on the reading
          </button>
        </div>

        <p style={{ color: SAGE, fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>
          {stats.weeks} weeks · {stats.claiming} on the week's reading · {stats.curated} from the
          curated library · {stats.withEssay} with a commentary · {stats.distinct} distinct works
          {stats.overCap > 0 && <strong style={{ color: "#E8A0A0" }}> · {stats.overCap} works over the 3-week cap</strong>}
          {stats.missing > 0 && <strong style={{ color: "#E8A0A0" }}> · {stats.missing} pins not in the catalogue</strong>}
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ color: SAGE, textAlign: "left", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                <th style={{ ...cell, width: 130 }}>Week</th>
                <th style={{ ...cell, width: 56 }} aria-label="Artwork" />
                <th style={cell}>Work</th>
                <th style={{ ...cell, width: 190 }}>Passage</th>
                <th style={{ ...cell, width: 90 }}>Reading</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isNow = r.sunday === thisSunday;
                return (
                  <tr key={r.sunday} style={{ background: isNow ? "rgba(46,107,64,0.18)" : "transparent" }}>
                    <td style={{ ...cell, whiteSpace: "nowrap", color: isNow ? WARM : FAINT }}>
                      {pretty(r.monday)} – {pretty(r.sunday)}
                      {isNow && <div style={{ color: SAGE, fontSize: 11, marginTop: 3 }}>this week</div>}
                    </td>
                    <td style={cell}>
                      {r.img
                        ? <img src={r.img} alt="" loading="lazy" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 5 }} />
                        : <div style={{ width: 44, height: 44, borderRadius: 5, background: "rgba(232,160,160,0.18)" }} />}
                    </td>
                    <td style={cell}>
                      <div style={{ fontWeight: 600 }}>{r.title}</div>
                      <div style={{ color: FAINT, fontSize: 12.5, marginTop: 2 }}>
                        {r.artist ?? "—"}
                        {r.curated && <span style={{ color: SAGE }}> · curated</span>}
                        {r.hasEssay && <span style={{ color: SAGE }}> · commentary</span>}
                      </div>
                    </td>
                    <td style={{ ...cell, color: FAINT }}>{r.ref ? canonicalRef(r.ref) : "—"}</td>
                    <td style={cell}>
                      {r.followsToday
                        ? <span style={{ color: SAGE, fontWeight: 700 }} title="The artwork's verses overlap this Sunday's reading">✓</span>
                        : <span style={{ color: "rgba(200,212,192,0.35)" }} title="A good picture for the week, but not the appointed passage">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {shown.length === 0 && (
          <p style={{ color: FAINT, fontSize: 14, marginTop: 20 }}>Nothing scheduled in {year}.</p>
        )}

        <p style={{ color: FAINT, fontSize: 12.5, lineHeight: 1.6, margin: "24px 0 0" }}>
          Generated by <code>build:visio-schedule</code>. Regenerating the artwork catalogue
          without regenerating this leaves pins on works that no longer exist — they fall back to
          live matching, silently, which is how a week stops showing one image.
        </p>
      </div>
    </div>
  );
}
