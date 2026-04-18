import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import type { MyActivePrayerFor } from "@/components/pray-for-them";

// Full-screen detail + management page for a private prayer I'm currently
// offering for another user. Styled to match the "gathering" (tradition-new)
// template: dark #091A10 canvas, Space Grotesk headings, #8FAF96 captions,
// #2D5E3F primary action.
//
// URL: /pray-for/:email
// Data: /api/prayers-for/mine (the full list), filtered by recipientEmail.
//
// Actions:
//   • Pray another 3 / 7 days → POST /api/prayers-for/:id/renew
//   • Mark as finished        → POST /api/prayers-for/:id/end
// Both invalidate the list and navigate back to /people/:email.

export default function PrayerForDetail() {
  const [, params] = useRoute<{ email: string }>("/pray-for/:email");
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const emailParam = params?.email ? decodeURIComponent(params.email) : "";
  const returnHref = emailParam ? `/people/${encodeURIComponent(emailParam)}` : "/people";

  const { data: mine = [], isLoading } = useQuery<MyActivePrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
  });

  const prayer = mine.find(p => p.recipientEmail === emailParam) ?? null;

  const renewMutation = useMutation({
    mutationFn: (durationDays: 3 | 7) =>
      apiRequest("POST", `/api/prayers-for/${prayer!.id}/renew`, { durationDays }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] });
      setLocation(returnHref);
    },
  });

  const endMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/prayers-for/${prayer!.id}/end`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] });
      setLocation(returnHref);
    },
  });

  const [confirmEnd, setConfirmEnd] = useState(false);

  // ── Shell: back button header + content ───────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#091A10" }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <button
          onClick={() => setLocation(returnHref)}
          className="text-sm"
          style={{ color: "#8FAF96" }}
        >
          ← Back
        </button>
      </div>

      <div className="flex-1 px-6 pt-4 pb-24 max-w-lg mx-auto w-full">

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3 mt-6">
            <div className="h-8 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            <div className="h-4 w-2/3 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            <div className="h-40 rounded-xl animate-pulse mt-8" style={{ background: "#0F2818" }} />
          </div>
        )}

        {/* No prayer found for this email */}
        {!isLoading && !prayer && (
          <div className="mt-8">
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              No active prayer 🌿
            </h1>
            <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
              You don't have an active prayer for this person right now.
            </p>
            <button
              onClick={() => setLocation(`/pray-for/new/${encodeURIComponent(emailParam)}`)}
              className="w-full py-4 rounded-2xl text-base font-semibold"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              Write a prayer →
            </button>
          </div>
        )}

        {/* Detail */}
        {prayer && <PrayerDetail
          prayer={prayer}
          onRenew={(d) => renewMutation.mutate(d)}
          onEndRequest={() => setConfirmEnd(true)}
          renewing={renewMutation.isPending}
        />}
      </div>

      {/* Confirm-end sheet — small modal, deliberately not the full-screen
          template since it's just a yes/no check. */}
      <AnimatePresence>
        {confirmEnd && prayer && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmEnd(false); }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
            >
              <h2 className="text-lg font-semibold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Mark as finished?
              </h2>
              <p className="text-sm mb-5" style={{ color: "#8FAF96" }}>
                The prayer will close and {prayer.recipientName.split(" ")[0]} will no
                longer see that you're praying for them.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmEnd(false)}
                  className="flex-1 py-3 rounded-2xl text-sm font-medium"
                  style={{ color: "#8FAF96", background: "rgba(200,212,192,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
                >
                  Keep praying
                </button>
                <button
                  onClick={() => endMutation.mutate()}
                  disabled={endMutation.isPending}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  {endMutation.isPending ? "Ending…" : "Mark finished"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Detail body ──────────────────────────────────────────────────────────

function PrayerDetail({
  prayer,
  onRenew,
  onEndRequest,
  renewing,
}: {
  prayer: MyActivePrayerFor;
  onRenew: (days: 3 | 7) => void;
  onEndRequest: () => void;
  renewing: boolean;
}) {
  const firstName = prayer.recipientName.split(" ")[0];
  const started = new Date(prayer.startedAt);
  const expires = new Date(prayer.expiresAt);
  const dayNumber = Math.min(
    prayer.durationDays,
    Math.max(1, Math.ceil((Date.now() - started.getTime()) / (1000 * 60 * 60 * 24))),
  );
  const daysRemaining = Math.max(
    0,
    Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );

  const startedLabel = started.toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });

  return (
    <div>
      {/* Banner — top metadata */}
      <p className="text-[10px] uppercase tracking-[0.22em] mb-3" style={{ color: "rgba(143,175,150,0.55)" }}>
        A prayer held in private
      </p>
      <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        You're praying for {firstName} 🌿
      </h1>
      <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
        Day {dayNumber} of {prayer.durationDays} · started {startedLabel}
      </p>

      {/* Prayer text card */}
      <div
        className="rounded-2xl px-5 py-5 mb-8"
        style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(143,175,150,0.55)" }}>
          Your prayer
        </p>
        <p
          className="text-base whitespace-pre-wrap"
          style={{
            color: "#F0EDE6",
            fontFamily: "Playfair Display, Georgia, serif",
            fontStyle: "italic",
            lineHeight: 1.65,
          }}
        >
          {prayer.prayerText}
        </p>
      </div>

      {/* Stat row — remaining */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="rounded-2xl px-4 py-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.25)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(143,175,150,0.55)" }}>
            Days remaining
          </p>
          <p className="text-xl font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            {daysRemaining}
          </p>
        </div>
        <div className="rounded-2xl px-4 py-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.25)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(143,175,150,0.55)" }}>
            Ends
          </p>
          <p className="text-xl font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            {expires.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
      </div>

      {/* Renew */}
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-3" style={{ color: "#C8D4C0" }}>
        Pray longer
      </p>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {([3, 7] as const).map(d => (
          <button
            key={d}
            onClick={() => onRenew(d)}
            disabled={renewing}
            className="py-3.5 rounded-2xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{
              background: "rgba(46,107,64,0.18)",
              border: "1px solid rgba(46,107,64,0.45)",
              color: "#F0EDE6",
            }}
          >
            {renewing ? "…" : `+ ${d} more days`}
          </button>
        ))}
      </div>

      {/* End */}
      <button
        onClick={onEndRequest}
        className="w-full py-3 rounded-2xl text-sm font-medium"
        style={{
          color: "#8FAF96",
          background: "rgba(200,212,192,0.04)",
          border: "1px solid rgba(46,107,64,0.2)",
        }}
      >
        Mark as finished
      </button>
    </div>
  );
}
