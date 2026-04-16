import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ─────────────────────────────────────────────────────────────────
export type MyActivePrayerFor = {
  id: number;
  prayerText: string;
  durationDays: number;
  startedAt: string;
  expiresAt: string;
  acknowledgedAt: string | null;
  recipientUserId: number;
  recipientName: string;
  recipientEmail: string;
  recipientAvatarUrl: string | null;
  expired: boolean;
};

export type PrayerForMe = {
  id: number;
  startedAt: string;
  expiresAt: string;
  prayerUserId: number;
  prayerName: string;
  prayerEmail: string;
  prayerAvatarUrl: string | null;
};

// Hook that returns the currently-active (unacknowledged) prayer I am
// offering for this recipient, if any.
export function useMyPrayerForRecipient(recipientUserId: number | null | undefined) {
  const query = useQuery<MyActivePrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
  });
  const match = recipientUserId
    ? (query.data ?? []).find(p => p.recipientUserId === recipientUserId && !p.expired) ?? null
    : null;
  return { prayer: match, isLoading: query.isLoading };
}

// ─── Pray for them button + entry modal ────────────────────────────────────
export function PrayForThemButton({
  recipientUserId,
  recipientName,
}: {
  recipientUserId: number;
  recipientName: string;
}) {
  const [open, setOpen] = useState(false);
  const firstName = recipientName.split(" ")[0];

  const { prayer: existing } = useMyPrayerForRecipient(recipientUserId);

  // Day X of Y label — simple Math.ceil from startedAt.
  let dayLabel: string | null = null;
  if (existing) {
    const started = new Date(existing.startedAt).getTime();
    const day = Math.min(
      existing.durationDays,
      Math.max(1, Math.ceil((Date.now() - started) / (1000 * 60 * 60 * 24))),
    );
    dayLabel = `Day ${day} of ${existing.durationDays}`;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 mb-6"
        style={{
          background: existing ? "rgba(46,107,64,0.12)" : "#2D5E3F",
          border: existing ? "1px solid rgba(46,107,64,0.35)" : "1px solid rgba(46,107,64,0.5)",
          color: existing ? "#A8C5A0" : "#F0EDE6",
        }}
      >
        <span className="flex items-center gap-2">
          <span>🙏</span>
          <span>{existing ? `You're praying for ${firstName}` : `Pray for ${firstName}`}</span>
        </span>
        <span className="text-[11px]" style={{ color: existing ? "rgba(168,197,160,0.7)" : "rgba(240,237,230,0.7)" }}>
          {existing ? dayLabel : "Begin"}
        </span>
      </button>

      {open && (
        <PrayForThemModal
          recipientUserId={recipientUserId}
          recipientName={recipientName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PrayForThemModal({
  recipientUserId,
  recipientName,
  onClose,
}: {
  recipientUserId: number;
  recipientName: string;
  onClose: () => void;
}) {
  const firstName = recipientName.split(" ")[0];
  const [text, setText] = useState("");
  const [days, setDays] = useState<3 | 7>(7);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/prayers-for", {
      recipientUserId,
      prayerText: text.trim(),
      durationDays: days,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] });
      onClose();
    },
  });

  const canSubmit = text.trim().length > 0 && !createMutation.isPending;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-t-3xl shadow-2xl px-6 pt-6 pb-10"
          style={{ backgroundColor: "#0F2818", border: "1px solid rgba(46,107,64,0.25)" }}
        >
          <div className="max-w-md mx-auto">
            <p className="text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: "rgba(143,175,150,0.5)" }}>
              A quiet prayer
            </p>
            <h2 className="text-xl font-semibold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Pray for {firstName}
            </h2>
            <p className="text-xs mb-5" style={{ color: "#8FAF96" }}>
              This prayer is private. {firstName} won't see what you wrote.
            </p>

            <textarea
              value={text}
              onChange={e => setText(e.target.value.slice(0, 1000))}
              rows={4}
              autoFocus
              placeholder={`Lord, I lift up ${firstName} today…`}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none mb-4"
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(46,107,64,0.25)",
                color: "#F0EDE6",
                fontFamily: "Playfair Display, Georgia, serif",
                fontStyle: "italic",
                lineHeight: 1.6,
              }}
            />

            <p className="text-xs mb-2" style={{ color: "#8FAF96" }}>Pray for them for:</p>
            <div className="flex gap-2 mb-5">
              {([3, 7] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: days === d ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                    border: `1px solid ${days === d ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.2)"}`,
                    color: days === d ? "#F0EDE6" : "#8FAF96",
                  }}
                >
                  {d} days
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: "#8FAF96", background: "rgba(200,212,192,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!canSubmit}
                className="flex-1 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {createMutation.isPending ? "Beginning…" : "Begin praying"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
