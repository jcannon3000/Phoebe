/**
 * Your Way of Love — the hub for a person's prayer rhythm.
 *
 * Reached from the "Your Way of Love" entry under the user's name in the
 * drawer menu. Two jobs:
 *
 *   1. Show progress — current streak, whether they've prayed today,
 *      when they last prayed, and how many in their circle prayed today.
 *
 *   2. View + edit WOL commitments — all 7 Way of Love stages displayed
 *      as inline-editable cards. Tap any stage to see what was committed
 *      and change it without re-running the full Rule of Life wizard.
 *      Saved to GET/PUT /api/rule-of-life/wol.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import {
  PRACTICES,
  PRACTICE_ORDER,
  WAY_OF_LOVE_ATTRIBUTION,
  type PracticeId,
} from "@/lib/wayOfLove";

// ── Design tokens (match WayOfLoveStep) ─────────────────────────────────
const BG_CARD  = "rgba(46,107,64,0.10)";
const BORDER   = "rgba(46,107,64,0.22)";
const CHIP_ON  = "rgba(46,107,64,0.45)";
const CHIP_ON_B = "rgba(46,107,64,0.75)";
const CHIP_OFF  = "rgba(46,107,64,0.08)";
const CHIP_OFF_B = "rgba(46,107,64,0.28)";
const WARM   = "#F0EDE6";
const SAGE   = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CTA    = "#2D5E3F";
const FONT   = "'Space Grotesk', system-ui, sans-serif";

const STAGE_EMOJIS: Record<PracticeId, string> = {
  turn: "🔄", learn: "📖", pray: "🙏",
  worship: "⛪", bless: "🤲", go: "🌍", rest: "🌙",
};

// ── Types ────────────────────────────────────────────────────────────────
type WolStageData = { optionIds: string[]; custom: string };
type WolSelections = Partial<Record<PracticeId, WolStageData>>;
type WolResponse = { selections: WolSelections };

// Only `loggedToday` is used now (drives the Pray CTA's label + href); the
// other fields remain for the endpoint's shape.
type PrayerStreak = {
  streak: number;
  lastPrayedDate: string | null;
  loggedToday?: boolean;
  gardenPrayedTodayCount?: number;
};

// ── One WOL stage card ────────────────────────────────────────────────────
function StageCard({
  pid,
  data,
  onSave,
}: {
  pid: PracticeId;
  data: WolStageData;
  onSave: (d: WolStageData) => void;
}) {
  const practice = PRACTICES[pid];
  const [editing, setEditing] = useState(false);
  const [localSelected, setLocalSelected] = useState<Set<string>>(() => new Set(data.optionIds));
  const [localCustom, setLocalCustom] = useState(data.custom);

  const openEdit = () => {
    setLocalSelected(new Set(data.optionIds));
    setLocalCustom(data.custom);
    setEditing(true);
  };

  const save = () => {
    onSave({ optionIds: Array.from(localSelected), custom: localCustom.trim() });
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  const toggle = (id: string) =>
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const hasCommitment = data.optionIds.length > 0 || data.custom.trim().length > 0;

  return (
    <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
      {/* Header — always visible, tapping opens/closes edit panel */}
      <button
        type="button"
        onClick={() => (editing ? cancel() : openEdit())}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px", background: "none", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 20, flexShrink: 0 }}>{STAGE_EMOJIS[pid]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: WARM, fontSize: 15, fontWeight: 700, fontFamily: FONT, margin: 0 }}>
            {practice.title.default}
          </p>
          <p style={{ color: SAGE_DIM, fontSize: 12, fontFamily: FONT, margin: "2px 0 0", fontStyle: "italic" }}>
            {practice.definition.default}
          </p>
        </div>
        {editing
          ? <ChevronUp size={16} style={{ color: SAGE_DIM, flexShrink: 0 }} />
          : <ChevronDown size={16} style={{ color: SAGE_DIM, flexShrink: 0 }} />}
      </button>

      {/* Committed practices — shown in view mode */}
      {!editing && hasCommitment && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {data.optionIds.map((id) => {
            const opt = practice.options.find((o) => o.id === id);
            if (!opt) return null;
            return (
              <span
                key={id}
                style={{
                  background: CHIP_ON, border: `1px solid ${CHIP_ON_B}`,
                  color: WARM, borderRadius: 999, padding: "5px 11px",
                  fontSize: 12.5, fontFamily: FONT,
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}
              >
                <Check size={11} strokeWidth={2.5} />
                {opt.label.default}
              </span>
            );
          })}
          {data.custom.trim() && (
            <span
              style={{
                color: SAGE, fontSize: 12.5, fontFamily: FONT, fontStyle: "italic",
                padding: "5px 2px", lineHeight: 1.4, width: "100%",
              }}
            >
              {data.custom}
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {!editing && !hasCommitment && (
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, padding: "0 16px 14px", margin: 0 }}>
          Nothing committed yet — tap to add
        </p>
      )}

      {/* Edit panel */}
      {editing && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${BORDER}` }}>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: FONT, margin: "14px 0 10px" }}>
            Choose a practice
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {practice.options.map((o) => {
              const on = localSelected.has(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  style={{
                    background: on ? CHIP_ON : CHIP_OFF,
                    border: `1px solid ${on ? CHIP_ON_B : CHIP_OFF_B}`,
                    color: WARM, borderRadius: 10, padding: "9px 12px",
                    fontSize: 13.5, fontFamily: FONT, cursor: "pointer",
                    textAlign: "left", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 8,
                    transition: "background 0.12s, border-color 0.12s",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {on && <Check size={13} strokeWidth={2.5} />}
                    {o.label.default}
                  </span>
                  <span style={{ color: SAGE_DIM, fontSize: 11, whiteSpace: "nowrap" }}>
                    {o.defaultCadence === "daily" ? "Daily"
                      : o.defaultCadence === "weekly" ? "Weekly"
                      : "Now and then"}
                  </span>
                </button>
              );
            })}
            <textarea
              value={localCustom}
              onChange={(e) => setLocalCustom(e.target.value)}
              placeholder="Or write your own…"
              rows={2}
              style={{
                background: CHIP_OFF, border: `1px solid ${CHIP_OFF_B}`,
                borderRadius: 10, padding: "9px 12px", color: WARM,
                fontFamily: FONT, fontSize: 13.5, lineHeight: 1.5,
                resize: "none", outline: "none", marginTop: 2,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={save}
              style={{
                flex: 1, background: CTA, border: `1px solid ${CHIP_ON_B}`,
                color: WARM, borderRadius: 10, padding: "10px 16px",
                fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancel}
              style={{
                background: "none", border: `1px solid ${CHIP_OFF_B}`,
                color: SAGE, borderRadius: 10, padding: "10px 16px",
                fontSize: 14, fontFamily: FONT, cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function DailyPracticePage() {
  const qc = useQueryClient();

  const { data: streakData } = useQuery<PrayerStreak>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak") as Promise<PrayerStreak>,
    staleTime: 60_000,
  });

  const { data: wolData, isLoading: wolLoading } = useQuery<WolResponse>({
    queryKey: ["/api/rule-of-life/wol"],
    queryFn: () => apiRequest("GET", "/api/rule-of-life/wol") as Promise<WolResponse>,
    staleTime: 5 * 60_000,
    // Fail fast rather than sitting on "Loading…" through retry backoff —
    // an empty/usable page beats a long spinner if the fetch errors.
    retry: 1,
  });

  const saveMut = useMutation({
    mutationFn: (selections: WolSelections) =>
      apiRequest("PUT", "/api/rule-of-life/wol", { selections }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/rule-of-life/wol"] }),
  });

  const loggedToday = !!streakData?.loggedToday;
  const beginHref = loggedToday ? "/prayer-mode?reset=1" : "/prayer-mode";

  const selections: WolSelections = wolData?.selections ?? {};

  const handleSaveStage = (pid: PracticeId, stageData: WolStageData) => {
    const next: WolSelections = { ...selections, [pid]: stageData };
    saveMut.mutate(next);
  };

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4 sm:px-0">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm mb-3"
          style={{ color: SAGE }}
        >
          <ChevronLeft size={14} /> Home
        </Link>

        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>
          Your Way of Love 🌿
        </h1>
        <p className="text-sm mb-5" style={{ color: SAGE }}>
          Seven practices for a Jesus-centered life — see what you've committed to and refine it any time.
        </p>

        <Link
          href={beginHref}
          className="block text-center mb-7 rounded-xl px-4 py-3 font-semibold transition-opacity hover:opacity-90"
          style={{ background: CTA, color: WARM, fontFamily: FONT }}
        >
          {loggedToday ? "Pray again →" : "Begin today's prayer →"}
        </Link>

        {/* WOL stages */}
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT, margin: 0 }}>
            The seven practices
          </h2>
          <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
        </div>
        <p className="text-[13px] mb-4" style={{ color: SAGE_DIM, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
          Tap any practice to view or change what you've committed to.
        </p>

        {wolLoading ? (
          <p style={{ color: SAGE_DIM, fontSize: 14, textAlign: "center", padding: "24px 0" }}>Loading…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {PRACTICE_ORDER.map((pid) => (
              <StageCard
                key={pid}
                pid={pid}
                data={selections[pid] ?? { optionIds: [], custom: "" }}
                onSave={(d) => handleSaveStage(pid, d)}
              />
            ))}
          </div>
        )}

        <p className="text-[11px] text-center mt-6" style={{ color: SAGE_DIM, fontFamily: FONT }}>
          {WAY_OF_LOVE_ATTRIBUTION}
        </p>

        {/* Prayer settings shortcuts */}
        <div className="flex items-center gap-3 mb-3 mt-8">
          <h2 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT, margin: 0 }}>
            Prayer settings
          </h2>
          <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/bcp/daily-office/settings?side=morning"
            className="w-full flex items-center gap-3 rounded-xl px-3 py-3 transition-opacity hover:opacity-90"
            style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}
          >
            <span style={{ fontSize: 20 }}>🌅</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT, margin: 0 }}>Morning</p>
              <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>Depth, reminder, way to pray, and reflection</p>
            </div>
            <ChevronLeft size={16} style={{ color: SAGE_DIM, flexShrink: 0, transform: "rotate(180deg)" }} />
          </Link>
          <Link
            href="/bcp/daily-office/settings?side=evening"
            className="w-full flex items-center gap-3 rounded-xl px-3 py-3 transition-opacity hover:opacity-90"
            style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}
          >
            <span style={{ fontSize: 20 }}>🌙</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT, margin: 0 }}>Evening</p>
              <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>Depth, reminder, way to pray, and reflection</p>
            </div>
            <ChevronLeft size={16} style={{ color: SAGE_DIM, flexShrink: 0, transform: "rotate(180deg)" }} />
          </Link>
        </div>
      </div>
    </Layout>
  );
}
