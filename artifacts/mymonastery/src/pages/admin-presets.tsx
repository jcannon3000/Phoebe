import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { RULE_PRESETS, type RulePreset } from "@/lib/rulePresets";
import WayOfLoveRuleFlow, { type RoutineSpec } from "@/components/WayOfLoveRuleFlow";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { snapshotRoutine, restoreRoutine } from "@/lib/routineDesignGuard";
import { setRoutineSyncSuspended } from "@/lib/routineSync";
import {
  fetchRoutinePresetOverlay, refreshRoutinePresets, resolveAdoptPreset,
  specToPresetBody, specToDefaultSeed, SEED_DEFAULT_FALLBACK, type DefaultSeed,
} from "@/lib/rulePresetsStore";
import { TRACKED_REFLECTION_SOURCES, type ReflectionSource } from "@/lib/officePrefs";
import { RELATIONAL_PRACTICES, CUSTOM_SLOTS, type CustomSlot, type RelationalPracticeId } from "@/lib/customAnchors";

/**
 * ADMIN → PRESET ROUTINES.
 *
 * Owner: "I want an admin tool where I could edit the preset routines
 * including the default one."
 *
 * Two things live on this page, and they are genuinely different shapes:
 *
 *   · THE DEFAULT RHYTHM — what a new device seeds and what "reset routine to
 *     default" returns to. It is not one of the picker's rules (it lives in
 *     guestSeed, not RULE_PRESETS), so it gets its own editor: the two side
 *     levels, the newsletter, the cards to turn on, the relational practices,
 *     the silence goal.
 *   · THE STARTER RULES — the named rhythms in "Begin a preset routine".
 *
 * Edits are an OVERLAY on what ships in the app: saving writes a row, and
 * "Revert to built-in" deletes it. Nothing here can break the app for someone
 * offline — with no rows, or no network, the presets in the bundle are what
 * people get.
 *
 * The structured fields cover what these rules actually vary. Everything else
 * a RulePreset can carry — day rules, custom anchors, per-side names, anchor
 * reflections — is edited as JSON below them, and is CARRIED THROUGH on save
 * either way, because a form that silently dropped the field it doesn't render
 * is how VTS's Chapel would disappear the first time someone renamed the rule.
 */

const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const DIM = "rgba(143,175,150,0.55)";
const CARD = "rgba(200,212,192,0.05)";
const BORDER = "1px solid rgba(46,107,64,0.28)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

const PRAY_CHOICES = ["none", "offices", "devotion", "psalms", "readings", "guidedPrayer",
  "examen", "compline", "fdd", "contemplation", "creation", "community", "ownPractice"] as const;
const LEVELS = ["ask", "office", "devotion", "psalms", "readings", "guided-prayer",
  "examen", "compline", "fdd", "reflect-sit", "custom"] as const;
const PRACTICE_FLAGS = ["cobreathe", "audio", "examen", "walk", "visio", "compline"] as const;
const SLOTTED = ["cobreathe", "listening", "examen", "walk", "reading", "visio", "icons", "taize", "spirituals"] as const;
// Every card the default may turn on — the home-layout keys, in the order the
// home reads them. Kept in step with the server's HOME_MODULE_KEYS.
const CARD_KEYS = ["office", "feeds", "contemplation", "listening", "reading", "walk", "cobreathe",
  "compline", "examen", "visio", "icons", "lectio", "taize", "spirituals",
  "cac", "fdd", "ssje", "vts", "nouwen", "sojo", "grist", "ncmp", "podcasts", "requests", "prayer-list"] as const;

type Row = { slug: string; body: Record<string, unknown>; hidden?: boolean; sortOrder?: number | null };

const btn = (primary = false): React.CSSProperties => ({
  padding: "9px 14px", borderRadius: 10, cursor: "pointer", fontFamily: FONT, fontSize: 13.5,
  fontWeight: 600, color: primary ? WARM : SAGE,
  background: primary ? "rgba(46,107,64,0.55)" : "transparent",
  border: primary ? "1px solid rgba(110,180,130,0.5)" : BORDER,
});
const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(9,26,16,0.5)", border: BORDER,
  borderRadius: 10, padding: "10px 12px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none",
};
const label: React.CSSProperties = {
  color: DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.8px",
  fontFamily: FONT, margin: "0 0 6px",
};

/** A row of tappable chips — the multi-selects this page is mostly made of. */
function Chips({ options, selected, onToggle }: {
  options: readonly string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button key={o} type="button" onClick={() => onToggle(o)}
            style={{
              padding: "6px 10px", borderRadius: 999, cursor: "pointer", fontFamily: FONT, fontSize: 12.5,
              color: on ? WARM : DIM, background: on ? "rgba(46,107,64,0.5)" : "transparent",
              border: on ? "1px solid rgba(110,180,130,0.5)" : BORDER,
            }}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: readonly string[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...field, cursor: "pointer" }}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function AdminPresetsPage() {
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<Row[]>([]);
  const [storedDefault, setStoredDefault] = useState<DefaultSeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);   // preset id/slug
  const [editingDefault, setEditingDefault] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  /**
   * EDIT OPENS THE REAL CUSTOMIZER.
   *
   * Owner: "what I wanted for each is when I hit Edit it would go through the
   * full flow as if I was editing my own routine." So this mounts the same
   * WayOfLoveRuleFlow everyone else uses, in PRESCRIBE mode — the mode that
   * exists for designing a rule that isn't yours: commit() hands the finished
   * routine to onPrescribe instead of writing it to the admin's account.
   *
   * The flow still writes as it goes (that is how it captures a rule-config),
   * so the admin's own rhythm is snapshotted on the way in, the sync is
   * suspended for the session, and everything is put back on the way out —
   * the same guard prescribing uses (lib/routineDesignGuard).
   */
  const [designing, setDesigning] = useState<string | null>(null);
  const snapRef = useRef<Record<string, string> | null>(null);
  const restoredRef = useRef(false);
  const beginDesign = (slug: string) => {
    snapRef.current = snapshotRoutine();
    restoredRef.current = false;
    setRoutineSyncSuspended(true);
    // The flow seeds itself from ?adopt= on mount (resolveAdoptPreset knows
    // the overlay rows and the default's reserved slug), so the URL carries
    // which rule is being edited. replace, so Back doesn't re-enter it.
    try { window.history.replaceState(null, "", `/admin/presets?adopt=${encodeURIComponent(slug)}`); } catch { /* ignore */ }
    setDesigning(slug);
  };
  const endDesign = () => {
    if (!restoredRef.current && snapRef.current) { restoreRoutine(snapRef.current); restoredRef.current = true; }
    try { window.history.replaceState(null, "", "/admin/presets"); } catch { /* ignore */ }
    setDesigning(null);
  };
  // Leaving the page mid-design must still put the admin's rhythm back.
  useEffect(() => () => {
    if (!restoredRef.current && snapRef.current) { restoreRoutine(snapRef.current); restoredRef.current = true; }
  }, []);
  const flowLeaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchRoutinePresetOverlay();
      setRows((data.presets ?? []) as Row[]);
      setStoredDefault((data.default ?? null) as DefaultSeed | null);
      setError(null);
    } catch {
      setError("Couldn't read the presets. The built-in ones are still what people see.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const rowFor = (slug: string) => rows.find((r) => r.slug === slug);

  /** What the picker will actually show for a rule: the built-in with the
   *  admin's row laid over it, exactly as getEffectiveRulePresets merges. */
  const effective = useMemo(() => {
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    const builtIn = RULE_PRESETS.map((p) => ({
      id: p.id, base: p, row: bySlug.get(p.id) ?? null,
      body: { ...p, ...((bySlug.get(p.id)?.body ?? {}) as Partial<RulePreset>), id: p.id } as RulePreset,
    }));
    const added = rows
      .filter((r) => !RULE_PRESETS.some((p) => p.id === r.slug))
      .map((r) => ({ id: r.slug, base: null, row: r, body: { ...(r.body as unknown as RulePreset), id: r.slug } }));
    return [...builtIn, ...added];
  }, [rows]);

  const save = async (slug: string, body: unknown, hidden = false) => {
    setStatus(null); setError(null);
    try {
      await apiRequest("PUT", `/api/routine-presets/${encodeURIComponent(slug)}`, { body, hidden });
      setStatus(slug === "__default__" ? "Default rhythm saved." : `Saved "${slug}".`);
      await load();
      await refreshRoutinePresets(true); // this device sees it immediately too
    } catch (e) {
      setError(`Save failed — ${(e as Error)?.message ?? "unknown error"}. Nothing changed.`);
    }
  };
  const revert = async (slug: string) => {
    setStatus(null); setError(null);
    try {
      await apiRequest("DELETE", `/api/routine-presets/${encodeURIComponent(slug)}`);
      setStatus(`"${slug}" is back to what ships in the app.`);
      await load();
      await refreshRoutinePresets(true);
    } catch (e) {
      setError(`Couldn't revert — ${(e as Error)?.message ?? "unknown error"}.`);
    }
  };

  /** The customizer finished: map what it built onto the stored shape, put the
   *  admin's own rhythm back, and save. */
  const saveFromFlow = (spec: RoutineSpec) => {
    const slug = designing;
    if (!slug) return;
    if (slug === "__default__") {
      const base = storedDefault ?? SEED_DEFAULT_FALLBACK;
      void save(slug, specToDefaultSeed(spec, base));
    } else {
      const current = effective.find((e) => e.id === slug);
      const base = (current?.body ?? resolveAdoptPreset(slug)) as RulePreset | null;
      if (!base) { setError("That rule disappeared while it was being edited — nothing was saved."); endDesign(); return; }
      void save(slug, specToPresetBody(spec, base), rowFor(slug)?.hidden ?? false);
    }
    endDesign();
  };

  // ── The default rhythm ─────────────────────────────────────────────────────
  const DEFAULT_FALLBACK: DefaultSeed = {
    // What guestSeed writes today (seed v7), shown so the editor opens on the
    // real default rather than an empty form.
    morning: "guided-prayer", evening: "ask", reflection: "cac",
    cards: ["cac", "visio"], relational: ["gratitude"], silenceMin: 0,
    slots: { visio: "evening" }, version: 1,
  };
  const [draftDefault, setDraftDefault] = useState<DefaultSeed>(DEFAULT_FALLBACK);
  useEffect(() => { setDraftDefault(storedDefault ?? DEFAULT_FALLBACK); /* eslint-disable-next-line */ }, [storedDefault]);

  const defaultEditor = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={label}>Morning</p>
          <Select value={draftDefault.morning} options={LEVELS}
            onChange={(v) => setDraftDefault((d) => ({ ...d, morning: v }))} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={label}>Evening</p>
          <Select value={draftDefault.evening} options={LEVELS}
            onChange={(v) => setDraftDefault((d) => ({ ...d, evening: v }))} />
        </div>
      </div>
      <div>
        <p style={label}>Newsletter</p>
        <Select value={draftDefault.reflection ?? "none"} options={["none", ...TRACKED_REFLECTION_SOURCES]}
          onChange={(v) => setDraftDefault((d) => ({ ...d, reflection: v === "none" ? undefined : v as ReflectionSource }))} />
      </div>
      <div>
        <p style={label}>Cards turned on</p>
        <Chips options={CARD_KEYS} selected={draftDefault.cards ?? []}
          onToggle={(v) => setDraftDefault((d) => ({
            ...d, cards: (d.cards ?? []).includes(v) ? d.cards.filter((c) => c !== v) : [...(d.cards ?? []), v],
          }))} />
        <p style={{ ...label, textTransform: "none", letterSpacing: 0, margin: "8px 0 0", fontSize: 11.5 }}>
          A newsletter or practice needs its card here, or the person's rhythm sets the preference and shows nothing.
        </p>
      </div>
      <div>
        <p style={label}>Relational practices</p>
        <Chips options={RELATIONAL_PRACTICES.map((r) => r.id)} selected={draftDefault.relational ?? []}
          onToggle={(v) => setDraftDefault((d) => ({
            ...d, relational: (d.relational ?? []).includes(v as RelationalPracticeId)
              ? d.relational.filter((x) => x !== v) : [...(d.relational ?? []), v as RelationalPracticeId],
          }))} />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ width: 140 }}>
          <p style={label}>Silence (min)</p>
          <input type="number" min={0} max={180} value={draftDefault.silenceMin ?? 0} style={field}
            onChange={(e) => setDraftDefault((d) => ({ ...d, silenceMin: Math.max(0, Math.min(180, parseInt(e.target.value || "0", 10) || 0)) }))} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={label}>Practice times</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SLOTTED.filter((k) => (draftDefault.cards ?? []).some((c) => c === k || (k === "listening" && c === "listening")))
              .map((k) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: DIM, fontFamily: FONT, fontSize: 12.5 }}>{k}</span>
                  <select
                    value={(draftDefault.slots ?? {})[k] ?? "anytime"}
                    onChange={(e) => setDraftDefault((d) => ({ ...d, slots: { ...(d.slots ?? {}), [k]: e.target.value as CustomSlot } }))}
                    style={{ ...field, width: "auto", padding: "6px 8px", fontSize: 12.5, cursor: "pointer" }}
                  >
                    {CUSTOM_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </span>
              ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={btn(true)}
          onClick={() => void save("__default__", { ...draftDefault, version: (draftDefault.version ?? 1) + 1 })}>
          Save the default rhythm
        </button>
        {storedDefault && (
          <button type="button" style={btn()} onClick={() => void revert("__default__")}>
            Back to the built-in default
          </button>
        )}
        <button type="button" style={btn()} onClick={() => setEditingDefault(false)}>Close</button>
      </div>
      <p style={{ color: DIM, fontFamily: FONT, fontSize: 12, lineHeight: 1.55, margin: 0 }}>
        Saving bumps the version, which is what carries the change onto devices already
        sitting on an untouched default. A person who has customized their own rhythm is
        never touched by this.
      </p>
    </div>
  );

  // ── One starter rule ───────────────────────────────────────────────────────
  const [draft, setDraft] = useState<RulePreset | null>(null);
  const [extraJson, setExtraJson] = useState("");
  const openPreset = (id: string) => {
    const e = effective.find((x) => x.id === id);
    if (!e) return;
    setEditing(id);
    setDraft(JSON.parse(JSON.stringify(e.body)));
    // The fields with no control of their own, kept editable and never dropped.
    const { customAnchors, dayRules, customNames, anchorReflection, rows: presetRows, silenceSide, contemplationStyle } = e.body;
    setExtraJson(JSON.stringify(
      { customAnchors, dayRules, customNames, anchorReflection, rows: presetRows, silenceSide, contemplationStyle },
      null, 2,
    ));
  };

  const presetEditor = draft && (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ width: 80 }}>
          <p style={label}>Emoji</p>
          <input value={draft.emoji ?? ""} style={{ ...field, textAlign: "center" }}
            onChange={(e) => setDraft({ ...draft, emoji: e.target.value.slice(0, 4) })} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={label}>Title</p>
          <input value={draft.title ?? ""} style={field}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </div>
      </div>
      <div>
        <p style={label}>Blurb</p>
        <textarea value={draft.blurb ?? ""} rows={3} style={{ ...field, resize: "vertical" }}
          onChange={(e) => setDraft({ ...draft, blurb: e.target.value })} />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={label}>Morning prayer</p>
          <Select value={draft.pray} options={PRAY_CHOICES}
            onChange={(v) => setDraft({ ...draft, pray: v as RulePreset["pray"] })} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={label}>Evening prayer (blank = same)</p>
          <Select value={draft.evening ?? draft.pray} options={PRAY_CHOICES}
            onChange={(v) => setDraft({ ...draft, evening: v as RulePreset["pray"] })} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        {(["morning", "evening"] as const).map((side) => (
          <label key={side} style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={draft.sides?.[side] !== false}
              onChange={(e) => setDraft({ ...draft, sides: { ...draft.sides, [side]: e.target.checked } })} />
            {side} on
          </label>
        ))}
        <label style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={!!draft.silence}
            onChange={(e) => setDraft({ ...draft, silence: e.target.checked })} />
          silence
        </label>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: DIM, fontFamily: FONT, fontSize: 12.5 }}>goal min</span>
          <input type="number" min={0} max={180} value={draft.goalMin ?? 0}
            style={{ ...field, width: 90 }}
            onChange={(e) => setDraft({ ...draft, goalMin: Math.max(0, Math.min(180, parseInt(e.target.value || "0", 10) || 0)) })} />
        </span>
      </div>
      <div>
        <p style={label}>Newsletters</p>
        <Chips options={TRACKED_REFLECTION_SOURCES} selected={draft.reflections ?? []}
          onToggle={(v) => setDraft({
            ...draft,
            reflections: (draft.reflections ?? []).includes(v as ReflectionSource)
              ? draft.reflections.filter((r) => r !== v)
              : [...(draft.reflections ?? []), v as ReflectionSource],
          })} />
      </div>
      <div>
        <p style={label}>Standing practices</p>
        <Chips options={PRACTICE_FLAGS}
          selected={Object.entries(draft.practices ?? {}).filter(([, on]) => on).map(([k]) => k)}
          onToggle={(v) => setDraft({
            ...draft,
            practices: { ...(draft.practices ?? {}), [v]: !(draft.practices ?? {})[v as keyof typeof draft.practices] },
          })} />
      </div>
      <div>
        <p style={label}>Relational practices</p>
        <Chips options={RELATIONAL_PRACTICES.map((r) => r.id)} selected={draft.relational ?? []}
          onToggle={(v) => setDraft({
            ...draft,
            relational: (draft.relational ?? []).includes(v as RelationalPracticeId)
              ? draft.relational!.filter((x) => x !== v)
              : [...(draft.relational ?? []), v as RelationalPracticeId],
          })} />
      </div>
      {/* WHEN those practices ride. They were carried through on save but had
          no field, so a rule's practice times could only be changed by hand in
          the JSON box (audit, eleanor-3a). Shown for the practices this rule
          actually turns on, plus any that already carry a time. The flag is
          called "audio" and the slot is called "listening" — the same practice
          under two names, so the row maps between them. */}
      <div>
        <p style={label}>Practice times</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {SLOTTED.filter((k) => {
            const flag = k === "listening" ? "audio" : k;
            return (draft.practiceSlots ?? {})[k] !== undefined
              || (draft.practices ?? {})[flag as keyof NonNullable<RulePreset["practices"]>] === true;
          }).map((k) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: DIM, fontFamily: FONT, fontSize: 12.5 }}>{k}</span>
              <select
                value={(draft.practiceSlots ?? {})[k] ?? "anytime"}
                onChange={(e) => setDraft({
                  ...draft,
                  practiceSlots: { ...(draft.practiceSlots ?? {}), [k]: e.target.value as CustomSlot },
                })}
                style={{ ...field, width: "auto", padding: "6px 8px", fontSize: 12.5, cursor: "pointer" }}
              >
                {CUSTOM_SLOTS.map((sl) => <option key={sl} value={sl}>{sl}</option>)}
              </select>
            </span>
          ))}
          {SLOTTED.every((k) => {
            const flag = k === "listening" ? "audio" : k;
            return (draft.practiceSlots ?? {})[k] === undefined
              && (draft.practices ?? {})[flag as keyof NonNullable<RulePreset["practices"]>] !== true;
          }) && (
            <span style={{ color: DIM, fontFamily: FONT, fontSize: 12.5 }}>
              Turn a standing practice on above to give it a time.
            </span>
          )}
        </div>
      </div>
      <div>
        <p style={label}>Everything else (JSON — day rules, custom anchors, per-side names)</p>
        <textarea value={extraJson} rows={8} spellCheck={false}
          style={{ ...field, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
          onChange={(e) => setExtraJson(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={btn(true)} onClick={() => {
          let extra: Record<string, unknown> = {};
          try { extra = extraJson.trim() ? JSON.parse(extraJson) : {}; }
          catch { setError("That JSON doesn't parse — nothing was saved."); return; }
          // Undefined keys are dropped so the JSON box can also REMOVE a field.
          const merged: Record<string, unknown> = { ...draft, ...extra };
          for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === null) delete merged[k];
          void save(editing!, merged, rowFor(editing!)?.hidden ?? false);
          setEditing(null);
        }}>Save</button>
        {rowFor(editing ?? "") && (
          <>
            <button type="button" style={btn()} onClick={() => {
              void save(editing!, rowFor(editing!)!.body, !(rowFor(editing!)!.hidden));
              setEditing(null);
            }}>{rowFor(editing!)!.hidden ? "Show in the picker" : "Hide from the picker"}</button>
            <button type="button" style={btn()} onClick={() => { void revert(editing!); setEditing(null); }}>
              Revert to built-in
            </button>
          </>
        )}
        <button type="button" style={btn()} onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </div>
  );

  if (designing) {
    // Mounted the way rule-of-life.tsx and prescribe-routine.tsx mount it —
    // chromeless Layout with the leaf backdrop — so editing a preset looks
    // exactly like editing your own rhythm, which is the whole ask.
    return (
      <Layout bgPhoto={flowLeaf} chromeless onClose={endDesign}>
        <WayOfLoveRuleFlow
          prescribe
          // The rule itself, not a slug in the URL — see adoptPreset.
          adoptPreset={resolveAdoptPreset(designing)}
          onPrescribe={saveFromFlow}
          onBack={endDesign}
          onDone={() => { /* unused in prescribe mode — commit() routes to onPrescribe */ }}
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "18px 18px 60px", display: "flex", flexDirection: "column", gap: 18 }}>
        <button type="button" onClick={() => setLocation("/admin/tools")} style={{ ...btn(), alignSelf: "flex-start" }}>← Admin tools</button>
        <div>
          <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 24, fontWeight: 700, margin: 0 }}>Preset routines</h1>
          <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, lineHeight: 1.55, margin: "8px 0 0" }}>
            The rhythms people can start from, and the default a new device seeds. Edits
            here are an overlay: what ships in the app stays the fallback, so nothing you
            do can leave someone offline without a rule.
          </p>
        </div>

        {status && <p style={{ color: "#A8C5A0", fontFamily: FONT, fontSize: 13.5, margin: 0 }}>{status}</p>}
        {error && <p style={{ color: "#E5A3A3", fontFamily: FONT, fontSize: 13.5, margin: 0 }}>{error}</p>}
        {loading && <p style={{ color: DIM, fontFamily: FONT, fontSize: 13.5 }}>Reading…</p>}

        {/* THE DEFAULT */}
        <div style={{ background: CARD, border: BORDER, borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <p style={{ color: WARM, fontFamily: FONT, fontSize: 16, fontWeight: 700, margin: 0 }}>
                🌱 The default rhythm {storedDefault ? "· edited" : "· as it ships"}
              </p>
              <p style={{ color: DIM, fontFamily: FONT, fontSize: 12.5, margin: "4px 0 0" }}>
                What a new device seeds, and where “reset routine to default” lands.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button type="button" style={btn(true)} onClick={() => beginDesign("__default__")}>Edit</button>
              {!editingDefault && (
                <button type="button" style={btn()} onClick={() => setEditingDefault(true)}>Quick fields</button>
              )}
            </div>
          </div>
          {editingDefault && <div style={{ marginTop: 16 }}>{defaultEditor}</div>}
        </div>

        {/* THE STARTER RULES */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {effective.map((e) => {
            const open = editing === e.id;
            return (
              <div key={e.id} style={{ background: CARD, border: BORDER, borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: WARM, fontFamily: FONT, fontSize: 15.5, fontWeight: 700, margin: 0 }}>
                      {e.body.emoji} {e.body.title ?? e.id}
                      {e.row && !e.base && <span style={{ color: DIM, fontSize: 12, fontWeight: 500 }}> · added</span>}
                      {e.row && e.base && <span style={{ color: DIM, fontSize: 12, fontWeight: 500 }}> · edited</span>}
                      {e.row?.hidden && <span style={{ color: "#E5A3A3", fontSize: 12, fontWeight: 500 }}> · hidden</span>}
                    </p>
                    <p style={{ color: DIM, fontFamily: FONT, fontSize: 12.5, margin: "4px 0 0", lineHeight: 1.5 }}>
                      {e.body.blurb ?? "—"}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button type="button" style={btn(true)} onClick={() => beginDesign(e.id)}>Edit</button>
                    {!open && <button type="button" style={btn()} onClick={() => openPreset(e.id)}>Quick fields</button>}
                  </div>
                </div>
                {open && <div style={{ marginTop: 16 }}>{presetEditor}</div>}
              </div>
            );
          })}
        </div>

        {/* ADD ONE */}
        <AddPreset onAdd={(slug) => { setRows((r) => [...r, { slug, body: { id: slug, title: slug, emoji: "🌿", sides: { morning: true, evening: true }, pray: "offices", silence: false, goalMin: 0, reflections: [] } }]); openPreset(slug); }} />
      </div>
    </Layout>
  );
}

function AddPreset({ onAdd }: { onAdd: (slug: string) => void }) {
  const [slug, setSlug] = useState("");
  return (
    <div style={{ background: CARD, border: BORDER, borderRadius: 14, padding: 16, display: "flex", gap: 10, alignItems: "flex-end" }}>
      <div style={{ flex: 1 }}>
        <p style={label}>Add a rule (its id — letters, numbers, dashes)</p>
        <input value={slug} onChange={(e) => setSlug(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))}
          placeholder="lent-2027" style={field} />
      </div>
      <button type="button" style={btn(true)} disabled={!slug}
        onClick={() => { if (slug) { onAdd(slug); setSlug(""); } }}>Add</button>
    </div>
  );
}
