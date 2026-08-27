/**
 * /admin/art-library — the owner's curation surface for the ACT art library.
 *
 * Owner: "create an admin tool where I can go through the library. If I
 * click on a picture I can either delete it or toggle if it is an icon.
 * Also show me the metadata that is used for searching."
 *
 * One grid over BOTH pools (the Visio library and the icon catalogue,
 * deduped by ACT id), searchable over the same metadata the practices
 * search. Clicking a work opens it large with every searchable field laid
 * out, and the two verbs: Delete (hidden — gone from every surface, greyed
 * here so it can be Restored) and the icon toggle (forces a work into or
 * out of Praying with Icons; "default" is wherever the harvest put it).
 * Writes go to act_overrides server-side, so they outlive catalogue
 * regenerations; every art surface consults them at render time.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ACT_CATALOGUE } from "@/lib/visioCatalogue";
import { ICON_CATALOGUE } from "@/lib/iconCatalogue";
import {
  ACT_OVERRIDES_EVENT, actOverrideFor, isActHidden, setActOverride, refreshActOverrides,
} from "@/lib/actOverrides";
import { openExternal } from "@/lib/openExternal";
import { apiRequest } from "@/lib/queryClient";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** Everything we know about one work, merged across the two generated pools. */
type Work = {
  id: number;
  title: string;
  artist: string | null;
  date: string | null;
  where: string | null;
  img: string;
  act: string;
  licence: string;
  attribution: string;
  refs: string[];
  days: string[];
  people: string[];
  subjects: string[];
  essay: string;
  /** Which harvest(s) the work came from. */
  inLibrary: boolean;
  harvestIcon: boolean;
};

const WORKS: Work[] = (() => {
  const map = new Map<number, Work>();
  for (const a of ACT_CATALOGUE) {
    map.set(a.id, {
      id: a.id, title: a.title, artist: a.artist, date: a.date, where: a.where,
      img: a.img, act: a.act, licence: a.licence, attribution: a.attribution,
      refs: a.refs, days: a.days, people: a.people, subjects: a.subjects,
      essay: a.essay, inLibrary: true, harvestIcon: false,
    });
  }
  for (const a of ICON_CATALOGUE) {
    const existing = map.get(a.id);
    if (existing) { existing.harvestIcon = true; continue; }
    map.set(a.id, {
      id: a.id, title: a.title, artist: a.artist, date: a.date, where: a.where,
      img: a.img, act: a.act, licence: a.licence, attribution: a.attribution,
      refs: [], days: [], people: a.people, subjects: [],
      essay: "", inLibrary: false, harvestIcon: true,
    });
  }
  return [...map.values()].sort((x, y) => (x.artist ?? "").localeCompare(y.artist ?? "") || x.id - y.id);
})();

function norm(s: string): string {
  try { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch { return s.toLowerCase(); }
}
/** The searchable haystack — the SAME fields the practices search, plus the
 *  library-only ones (refs, days, subjects), so the owner sees exactly what a
 *  search can land on. */
function hay(w: Work): string {
  return norm([w.id, w.title, w.artist ?? "", ...w.people, ...w.subjects, ...w.refs, ...w.days].join(" "));
}

/** Whether this work currently shows in Praying with Icons. */
function effectiveIcon(w: Work): boolean {
  const ov = actOverrideFor(w.id);
  return ov?.isIcon ?? w.harvestIcon;
}

export default function AdminArtLibraryPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, setOv] = useState(0);
  useEffect(() => {
    const on = () => setOv((v) => v + 1);
    window.addEventListener(ACT_OVERRIDES_EVENT, on);
    void refreshActOverrides();
    return () => window.removeEventListener(ACT_OVERRIDES_EVENT, on);
  }, []);

  // Super-admin gate — same endpoint + explicit queryFn the group-settings
  // page uses (the default query plumbing doesn't cover this key).
  const { data: who, isLoading: whoLoading } = useQuery<{ isSuperAdmin: boolean }>({
    queryKey: ["/api/admin/am-super"],
    queryFn: () => apiRequest("GET", "/api/admin/am-super") as Promise<{ isSuperAdmin: boolean }>,
  });

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return WORKS;
    const words = q.split(/\s+/).filter(Boolean);
    return WORKS.filter((w) => { const h = hay(w); return words.every((x) => h.includes(x)); });
  }, [query]);

  const open = openId != null ? WORKS.find((w) => w.id === openId) ?? null : null;

  const write = async (id: number, patch: { hidden?: boolean; isIcon?: boolean | null }) => {
    setBusy(true); setError("");
    try { await setActOverride(id, patch); }
    catch { setError("Save failed — check the connection and try again."); }
    finally { setBusy(false); }
  };

  const meta = (label: string, value: string) => value ? (
    <div style={{ marginTop: 10 }}>
      <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: 0 }}>{label}</p>
      <p style={{ color: WARM, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.55, margin: "3px 0 0", overflowWrap: "anywhere" }}>{value}</p>
    </div>
  ) : null;

  const pill = (label: string, on: boolean, onClick: () => void) => (
    <button
      type="button" onClick={onClick} disabled={busy}
      style={{
        userSelect: "none", WebkitTapHighlightColor: "transparent",
        borderRadius: 999, padding: "10px 16px", fontSize: 13.5, fontWeight: 600,
        fontFamily: FONT, cursor: "pointer", color: WARM, opacity: busy ? 0.6 : 1,
        background: on ? "rgba(46,107,64,0.6)" : "rgba(240,237,230,0.06)",
        border: on ? "1px solid rgba(143,175,150,0.65)" : `1px solid ${BORDER}`,
      }}
    >
      {label}
    </button>
  );

  if (whoLoading) {
    return <div style={{ minHeight: "100dvh", background: BG }} />;
  }
  if (!who?.isSuperAdmin) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15 }}>This page is for app administrators.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: BG, padding: "calc(env(safe-area-inset-top) + 14px) 16px calc(env(safe-area-inset-bottom) + 24px)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
          <button type="button" onClick={() => setLocation("/admin/tools")}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer", padding: 6 }}>
            ← Admin
          </button>
          <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>Art library</span>
          <span style={{ width: 60 }} />
        </div>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 12px" }}>
          {WORKS.length} works. Tap one to see its searchable metadata, delete it, or toggle it in and out of Praying with Icons. Deletions and toggles survive catalogue regenerations.
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — title, artist, person, subject, scripture, id…"
          inputMode="search"
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 15, padding: "12px 14px",
            borderRadius: 12, outline: "none", color: WARM, fontFamily: FONT,
            background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
          }}
        />
        <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "8px 0 10px" }}>{results.length} shown</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {results.map((w) => {
            const hidden = isActHidden(w.id);
            const icon = effectiveIcon(w);
            return (
              <button
                key={w.id} type="button" onClick={() => setOpenId(w.id)}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent",
                  display: "flex", flexDirection: "column", gap: 6, padding: 8, minWidth: 0, overflow: "hidden",
                  borderRadius: 12, cursor: "pointer", textAlign: "left",
                  background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
                  opacity: hidden ? 0.38 : 1,
                }}
              >
                <img src={w.img} alt="" loading="lazy" decoding="async"
                  style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 8 }} />
                <span style={{ color: WARM, fontFamily: SERIF, fontSize: 12.5, fontStyle: "italic", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {w.title}
                </span>
                <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {hidden && <span style={{ color: "#d8a0a0", fontFamily: FONT, fontSize: 9.5, letterSpacing: "0.12em", border: "1px solid rgba(216,160,160,0.4)", borderRadius: 999, padding: "2px 7px" }}>DELETED</span>}
                  {icon && <span style={{ color: SAGE, fontFamily: FONT, fontSize: 9.5, letterSpacing: "0.12em", border: `1px solid ${BORDER}`, borderRadius: 999, padding: "2px 7px" }}>ICON</span>}
                  {w.inLibrary && <span style={{ color: FAINT, fontFamily: FONT, fontSize: 9.5, letterSpacing: "0.12em", border: `1px solid ${BORDER}`, borderRadius: 999, padding: "2px 7px" }}>LIBRARY</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {open && (() => {
        const hidden = isActHidden(open.id);
        const icon = effectiveIcon(open);
        const ov = actOverrideFor(open.id);
        return (
          <div role="dialog" aria-modal="true" onClick={() => setOpenId(null)}
            style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(4,12,7,0.8)", overflowY: "auto", padding: "24px 16px" }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: "#0c1f13", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 18, maxWidth: 560, margin: "0 auto", boxSizing: "border-box" }}>
              <img src={open.img} alt={open.title}
                style={{ width: "100%", maxHeight: "46vh", objectFit: "contain", borderRadius: 10, background: "rgba(0,0,0,0.3)" }} />
              <p style={{ color: WARM, fontFamily: SERIF, fontSize: 19, fontStyle: "italic", margin: "12px 0 2px", lineHeight: 1.3 }}>{open.title}</p>
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: 0 }}>
                {[open.artist, open.date].filter(Boolean).join(" · ")}
              </p>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                {pill(hidden ? "Restore to library" : "Delete", hidden, () => void write(open.id, { hidden: !hidden }))}
                {pill(icon ? "In icon prayer ✓" : "Not in icon prayer", icon, () => void write(open.id, { isIcon: !icon }))}
                {ov?.isIcon != null && pill("Reset icon toggle", false, () => void write(open.id, { isIcon: null }))}
              </div>
              {error && <p style={{ color: "#d8a0a0", fontFamily: FONT, fontSize: 12.5, margin: "8px 0 0" }}>{error}</p>}

              {/* The metadata a search can land on — the owner asked to see it. */}
              {meta("ACT id", String(open.id))}
              {meta("People", open.people.join(" · "))}
              {meta("Subjects", open.subjects.join(" · "))}
              {meta("Scriptures", open.refs.join(" · "))}
              {meta("Liturgical days", open.days.join(" · "))}
              {meta("Where", open.where ?? "")}
              {meta("Licence", open.licence)}
              {meta("Attribution", open.attribution)}
              {meta("Pools", [open.inLibrary ? "Visio library" : "", open.harvestIcon ? "icon harvest" : ""].filter(Boolean).join(" · ") || "—")}

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="button" onClick={() => openExternal(open.act, { reader: false })}
                  style={{ flex: 1, background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`, color: SAGE, borderRadius: 999, padding: "11px 16px", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
                  Open on ACT ↗
                </button>
                <button type="button" onClick={() => setOpenId(null)}
                  style={{ flex: 1, background: "rgba(46,107,64,0.55)", border: `1px solid ${BORDER}`, color: WARM, borderRadius: 999, padding: "11px 16px", fontSize: 13.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
