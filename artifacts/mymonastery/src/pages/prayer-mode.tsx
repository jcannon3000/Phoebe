import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { apiRequest } from "@/lib/queryClient";
import { findBcpPrayer } from "@/lib/bcp-prayers";
import type { MyActivePrayerFor } from "@/components/pray-for-them";

// Scale the big prayer-text block by character length so long prayers
// (like the BCP collects) stay on one screen without scrolling, and short
// ones still feel like liturgy.
function fitPrayerText(text: string | null | undefined): { size: number; leading: number } {
  const len = (text ?? "").length;
  if (len < 100)  return { size: 18, leading: 1.8 };
  if (len < 220)  return { size: 16, leading: 1.75 };
  if (len < 360)  return { size: 15, leading: 1.7 };
  if (len < 520)  return { size: 14, leading: 1.65 };
  if (len < 720)  return { size: 13, leading: 1.6 };
  return { size: 12, leading: 1.55 };
}

type Moment = {
  id: number;
  name: string;
  templateType: string | null;
  intention: string;
  intercessionTopic?: string | null;
  intercessionFullText?: string | null;
  intercessionSource?: string | null;
  members: Array<{ name: string; email: string }>;
  todayPostCount: number;
  // Rolling 7-day distinct-prayers count (inclusive of today). Surfaced
  // under each intercession slide so the viewer sees that others have
  // carried this prayer even on days nobody has prayed yet today.
  weekPostCount?: number;
  windowOpen: boolean;
  myUserToken: string | null;
  momentToken: string | null;
  group?: { id: number; name: string; slug: string; emoji: string | null } | null;
};

interface PrayerRequest {
  id: number;
  body: string;
  ownerName: string | null;
  isAnswered: boolean;
  isOwnRequest?: boolean;
  closedAt?: string | null;
}

interface PrayerSlide {
  kind: "intercession" | "request" | "prayer-for" | "prayer-for-expired" | "ask-request" | "pray-for-suggest" | "circle-intention";
  text: string;
  attribution: string;
  fullText?: string | null;
  intention?: string | null;
  // request specific — lets us record an amen against the originating
  // prayer request when the viewer taps "Amen" to advance.
  requestId?: number;
  // intercession specific — needed to fire a moment_posts check-in the
  // instant the viewer taps "Amen", so a community intercession amen
  // lands in both the intercession detail page and the streak count
  // even if the viewer bails out of the slideshow before `handleDone`.
  momentToken?: string | null;
  myUserToken?: string | null;
  // prayer-for specific
  prayerForId?: number;
  recipientName?: string;
  recipientAvatarUrl?: string | null;
  dayLabel?: string;
  // circle-intention specific — included so the slide can link back to the
  // community, and so we can attribute the shared nature of the prayer in
  // the subtitle.
  groupName?: string;
  groupEmoji?: string | null;
  groupSlug?: string;
  // Rolling 7-day unique-prayers count. Rendered as a soft affirmation
  // under the prayer text ("3 people have prayed this this week") so the
  // viewer feels part of a rhythm even on low-activity days.
  weekPrayCount?: number;
}

// One row from GET /api/groups/me/circle-intentions. Flattened across every
// prayer circle the user belongs to; non-archived only; falls back to the
// legacy single `groups.intention` for circles without migrated rows yet.
interface CircleIntention {
  id: number;
  title: string;
  description: string | null;
  groupId: number;
  groupName: string;
  groupSlug: string;
  groupEmoji: string | null;
}

function SlideContent({
  slide,
  onAdvance,
  onRenew,
  onEnd,
  onAskSubmit,
  askSubmitting,
  suggestedFriends,
  onPrayForFriend,
}: {
  slide: PrayerSlide;
  onAdvance: () => void;
  onRenew: (id: number, days: 3 | 7) => void;
  onEnd: (id: number) => void;
  onAskSubmit: (body: string) => void;
  askSubmitting: boolean;
  // Populated only on the "pray-for-suggest" final slide — a list of
  // friends the viewer isn't already praying for. Tap → navigate to the
  // create-a-prayer-for page for that person.
  suggestedFriends: Array<{ name: string; email: string; avatarUrl?: string | null }>;
  onPrayForFriend: (email: string) => void;
}) {
  const [askBody, setAskBody] = useState("");
  const bcpPrayer = slide.kind === "intercession" ? findBcpPrayer(slide.text) : undefined;

  // ── "Pray for one of your friends?" — final slide when the viewer
  // already has an active prayer request of their own. We surface
  // friends they're not currently praying for as pills; tapping one
  // routes to the create-prayer-for page for that person.
  if (slide.kind === "pray-for-suggest") {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Before we close
        </p>
        <p
          className="text-[22px] leading-[1.5] font-medium italic"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          Would you like to pray for one of your friends?
        </p>
        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
        >
          Tap a name to start a prayer for them.
        </p>

        {/* Pill list — centered, wraps. We cap at 12 so the slide
            never grows beyond one screen; past that the garden page
            is the right place to browse the full list. */}
        <div className="flex flex-wrap gap-2 justify-center max-w-md">
          {suggestedFriends.slice(0, 12).map((f) => (
            <button
              key={f.email}
              type="button"
              onClick={() => onPrayForFriend(f.email)}
              className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 transition-opacity hover:opacity-90"
              style={{
                background: "rgba(46,107,64,0.18)",
                border: "1px solid rgba(46,107,64,0.3)",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {f.avatarUrl ? (
                <img
                  src={f.avatarUrl}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
                  style={{ background: "rgba(168,197,160,0.2)", color: "#A8C5A0" }}
                >
                  {(f.name || f.email || "?").trim().charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-foreground whitespace-nowrap">
                {f.name || f.email.split("@")[0]}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={onAdvance}
          className="text-sm transition-opacity hover:opacity-80 mt-2"
          style={{ color: "rgba(143,175,150,0.55)" }}
        >
          Skip
        </button>
      </div>
    );
  }

  // ── "How can the community pray for you?" — final slide when the viewer
  // has no active prayer request. A gentle ask, skippable.
  if (slide.kind === "ask-request") {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Before we close
        </p>
        <p
          className="text-[22px] leading-[1.5] font-medium italic"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          How can the community pray for you?
        </p>
        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
        >
          A short note; your garden will hold it for 3 days.
        </p>

        <textarea
          value={askBody}
          onChange={(e) => setAskBody(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder="What's on your heart?"
          className="w-full rounded-2xl px-5 py-4 text-[15px] outline-none resize-none"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.3)",
            color: "#F0EDE6",
            fontFamily: "Playfair Display, Georgia, serif",
            fontStyle: "italic",
            lineHeight: 1.65,
          }}
        />

        <div className="flex flex-col gap-3 w-full max-w-xs mt-1">
          <button
            onClick={() => askBody.trim() && onAskSubmit(askBody.trim())}
            disabled={askBody.trim().length === 0 || askSubmitting}
            className="px-6 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            {askSubmitting ? "Sharing…" : "Share with my garden →"}
          </button>
          <button
            onClick={onAdvance}
            className="text-sm transition-opacity hover:opacity-80"
            style={{ color: "rgba(143,175,150,0.55)" }}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // ── Expired-prayer renewal prompt — shown instead of a normal slide ──────
  if (slide.kind === "prayer-for-expired" && slide.prayerForId != null) {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Prayer ended
        </p>
        <p
          className="text-[22px] leading-[1.5] font-medium italic"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          Your prayer for {slide.recipientName} has ended.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
          <button
            onClick={() => onRenew(slide.prayerForId!, 7)}
            className="px-6 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Pray for another 7 days
          </button>
          <button
            onClick={() => onEnd(slide.prayerForId!)}
            className="px-6 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              background: "rgba(200,212,192,0.06)",
              border: "1px solid rgba(46,107,64,0.25)",
              color: "#8FAF96",
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Active "prayer for someone" slide ───────────────────────────────────
  if (slide.kind === "prayer-for") {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Praying for
        </p>
        {slide.recipientAvatarUrl ? (
          <img
            src={slide.recipientAvatarUrl}
            alt={slide.recipientName}
            className="w-16 h-16 rounded-full object-cover"
            style={{ border: "1px solid rgba(46,107,64,0.3)" }}
          />
        ) : (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold"
            style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            {(slide.recipientName ?? "")
              .split(" ")
              .slice(0, 2)
              .map(w => w[0]?.toUpperCase() ?? "")
              .join("")}
          </div>
        )}
        <p
          className="text-[22px] leading-[1.4] font-medium"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          {slide.recipientName}
        </p>

        {slide.fullText && (
          <div
            className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
            style={{
              background: "rgba(46,107,64,0.12)",
              border: "1px solid rgba(46,107,64,0.15)",
            }}
          >
            {(() => {
              const fit = fitPrayerText(slide.fullText);
              return (
                <p
                  className="italic whitespace-pre-wrap"
                  style={{
                    color: "#C8D4C0",
                    fontFamily: "Playfair Display, Georgia, serif",
                    fontSize: `${fit.size}px`,
                    lineHeight: fit.leading,
                  }}
                >
                  {slide.fullText}
                </p>
              );
            })()}
          </div>
        )}

        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)" }}
        >
          Hold {slide.recipientName?.split(" ")[0]} in prayer today.
        </p>

        {slide.dayLabel && (
          <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "rgba(143,175,150,0.35)" }}>
            {slide.dayLabel}
          </p>
        )}

        <button
          onClick={onAdvance}
          className="mt-2 px-8 py-3 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-80 active:scale-[0.98]"
          style={{
            background: "rgba(46,107,64,0.28)",
            border: "1px solid rgba(46,107,64,0.5)",
            color: "#C8D4C0",
          }}
        >
          Amen →
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center text-center gap-5">
      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ color: "rgba(143,175,150,0.45)" }}
      >
        {slide.kind === "intercession"
          ? "Community Intercession"
          : slide.kind === "circle-intention"
            ? "Circle Intention"
            : "Prayer Request"}
      </p>

      <p
        className="text-[22px] leading-[1.5] font-medium italic"
        style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
      >
        {slide.text}
      </p>

      {slide.intention && (
        <p
          className="text-sm italic"
          style={{ color: "#8FAF96", marginTop: "-4px" }}
        >
          {slide.intention}
        </p>
      )}

      {slide.attribution && (
        <p className="text-sm" style={{ color: "#8FAF96" }}>
          {slide.attribution}
        </p>
      )}

      {slide.kind === "intercession" && (
        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
        >
          {slide.weekPrayCount && slide.weekPrayCount > 0
            ? slide.weekPrayCount === 1
              ? "1 person has prayed this this week."
              : `${slide.weekPrayCount} people have prayed this this week.`
            : "Your community is holding this."}
        </p>
      )}

      {/* Circle intention — attribute to the circle by name. Different voice
          from a solo intercession: this is the shared prayer of the whole
          circle, held together. */}
      {slide.kind === "circle-intention" && slide.groupName && (
        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
        >
          {slide.groupEmoji ? `${slide.groupEmoji} ` : ""}The {slide.groupName} circle is praying this together.
        </p>
      )}

      {/* BCP enrichment — show the formal prayer text from the Book of Common Prayer */}
      {bcpPrayer && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          {(() => {
            const fit = fitPrayerText(bcpPrayer.text);
            return (
              <p
                className="italic"
                style={{
                  color: "#C8D4C0",
                  fontFamily: "Playfair Display, Georgia, serif",
                  fontSize: `${fit.size}px`,
                  lineHeight: fit.leading,
                }}
              >
                {bcpPrayer.text}
              </p>
            );
          })()}
          <p
            className="text-[9px] uppercase tracking-[0.14em] mt-3"
            style={{ color: "rgba(143,175,150,0.3)" }}
          >
            From the Book of Common Prayer
          </p>
        </div>
      )}

      {/* Custom intercession — show the user's own prayer text */}
      {!bcpPrayer && slide.fullText && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          {(() => {
            const fit = fitPrayerText(slide.fullText);
            return (
              <p
                className="italic"
                style={{
                  color: "#C8D4C0",
                  fontFamily: "Playfair Display, Georgia, serif",
                  fontSize: `${fit.size}px`,
                  lineHeight: fit.leading,
                }}
              >
                {slide.fullText}
              </p>
            );
          })()}
        </div>
      )}

      <button
        onClick={onAdvance}
        className="mt-4 px-8 py-3 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-80 active:scale-[0.98]"
        style={{
          background: "rgba(46,107,64,0.28)",
          border: "1px solid rgba(46,107,64,0.5)",
          color: "#C8D4C0",
        }}
      >
        Amen →
      </button>
    </div>
  );
}

// ─── Streak celebration ────────────────────────────────────────────────────
// Duolingo-style: big streak number scales in with a bounce, label and
// "you've held with your community" fade in underneath, and a ring of
// leaf/sparkle emoji flies outward from the number. Fires once per
// local-TZ day (gated by the server's firstToday check).
function StreakCelebration({ streak }: { streak: number }) {
  // 12 particles in a circle, staggered so the ring bursts outward.
  const particles = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const distance = 140;
    return {
      i,
      emoji: i % 3 === 0 ? "🌿" : i % 3 === 1 ? "✨" : "🌱",
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  });

  return (
    <div className="w-full flex flex-col items-center text-center gap-3 relative" style={{ minHeight: 260 }}>
      {/* Radial burst — emoji particles scaling from 0 outward */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {particles.map((p) => (
          <motion.div
            key={p.i}
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [0, 1.2, 1, 0.6],
              x: [0, p.x * 0.3, p.x * 0.7, p.x],
              y: [0, p.y * 0.3, p.y * 0.7, p.y],
            }}
            transition={{
              duration: 1.8,
              delay: 0.2 + (p.i * 0.035),
              ease: "easeOut",
            }}
            style={{
              position: "absolute",
              fontSize: 22,
            }}
          >
            {p.emoji}
          </motion.div>
        ))}
      </div>

      {/* Streak number — spring scale-in */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.15 }}
        className="flex items-baseline justify-center gap-2 relative z-10"
      >
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 96,
            fontWeight: 700,
            color: "#F0EDE6",
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          {streak}
        </span>
        <motion.span
          initial={{ rotate: -20, scale: 0.8 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 10, delay: 0.35 }}
          style={{ fontSize: 56 }}
        >
          🔥
        </motion.span>
      </motion.div>

      {/* Streak label */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 13,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#8FAF96",
          marginTop: 8,
        }}
      >
        {streak === 1 ? "Day one" : `${streak}-day streak`}
      </motion.p>

      {/* Primary copy */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="text-base leading-relaxed"
        style={{
          color: "#F0EDE6",
          fontFamily: "'Space Grotesk', sans-serif",
          maxWidth: 360,
          marginTop: 8,
        }}
      >
        You have carried what your community is carrying. 🌿
      </motion.p>
    </div>
  );
}

export default function PrayerModePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: momentsData } = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
  });

  const { data: prayerRequests = [] } = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled: !!user,
  });

  const { data: myPrayersFor = [] } = useQuery<MyActivePrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    enabled: !!user,
  });

  // Friends list — used by the "pray for someone" final slide that
  // appears after the main list when the viewer already has an active
  // prayer request of their own. We filter out anyone they're already
  // praying for so the pill row is an actionable "start a prayer for X"
  // menu, not a duplicate of their existing prayers-for.
  const { data: friends = [] } = usePeople(user?.id);

  // Every active intention from every prayer circle this user belongs to.
  // Surfaced as its own slide-kind so members carry the circle's shared
  // intentions alongside their own intercessions and others' requests.
  const { data: circleIntentionsData } = useQuery<{ intentions: CircleIntention[] }>({
    queryKey: ["/api/groups/me/circle-intentions"],
    queryFn: () => apiRequest("GET", "/api/groups/me/circle-intentions"),
    enabled: !!user,
  });

  const renewMutation = useMutation({
    mutationFn: ({ id, days }: { id: number; days: 3 | 7 }) =>
      apiRequest("POST", `/api/prayers-for/${id}/renew`, { durationDays: days }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] }),
  });
  const endMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/prayers-for/${id}/end`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] }),
  });

  // Creating a prayer request from the final slide ("How can the community
  // pray for you?"). On success we advance past the ask slide — the
  // slideshow then ends naturally.
  const createRequestMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", "/api/prayer-requests", { body, isAnonymous: false, durationDays: 3 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] }),
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // Include every active intercession the user participates in, regardless
  // of the current window state. The slideshow is a "today's prayer list"
  // experience — a daily intercession is prayable all day, not only during
  // its 2-hour bloom window.
  const intercessions = (momentsData?.moments ?? []).filter(
    (m) => m.templateType === "intercession",
  );

  // "Pray for someone" records, filtered to match the People-page CTA:
  // we drop server-expired prayers AND prayers on their final day (0 days
  // left). A prayer on Day N of N already reads "done" on /people — we
  // don't want the slideshow to keep showing it, or to tack on a renewal
  // prompt for something that was meant to quietly reset.
  const prayerForCutoff = (() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  })();
  const activePrayersFor = myPrayersFor.filter(p => {
    if (p.expired) return false;
    const expires = new Date(p.expiresAt);
    const expiresDay = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate());
    const daysLeft = Math.max(0, Math.round((expiresDay.getTime() - prayerForCutoff.getTime()) / 86400000));
    return daysLeft > 0;
  });

  const slides: PrayerSlide[] = [
    ...intercessions.map((m) => {
      const title = m.intercessionTopic || m.name;
      // For custom intercessions the user-entered `intention` often duplicates
      // `name` / `intercessionTopic` — hide it when it's the same text.
      const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
      const intentionSub =
        m.intention && norm(m.intention) !== norm(title) ? m.intention : null;
      // Prefer the group name over listing individual members when the practice
      // is attached to a group.
      const attributionLabel = m.group?.name
        ? m.group.name
        : m.members
            .filter((p) => p.email !== user?.email)
            .map((p) => p.name || p.email.split("@")[0])
            .slice(0, 3)
            .join(", ");
      return {
        kind: "intercession" as const,
        text: title,
        intention: intentionSub,
        fullText: m.intercessionFullText?.trim() || null,
        attribution: attributionLabel ? `with ${attributionLabel}` : "",
        weekPrayCount: m.weekPostCount ?? 0,
        momentToken: m.momentToken,
        myUserToken: m.myUserToken,
      };
    }),
    // Circle intentions — one slide per active intention in every prayer
    // circle the viewer belongs to. Placed right after intercessions because
    // they read in the same voice (the thing being prayed) and before
    // prayer requests so shared communal intentions come before individual
    // asks. Falls back silently to [] if the endpoint is missing or empty.
    ...((circleIntentionsData?.intentions ?? []).map((intn): PrayerSlide => ({
      kind: "circle-intention",
      text: intn.title,
      attribution: "",
      intention: intn.description,
      groupName: intn.groupName,
      groupEmoji: intn.groupEmoji,
      groupSlug: intn.groupSlug,
    }))),
    // Other people's prayer requests come before the user's own private
    // prayers-for — hearing others first, then turning inward. We
    // deliberately exclude the viewer's own requests; they don't need to
    // be shown their own ask as a slide to pray for.
    ...prayerRequests
      .filter((r) => !r.isAnswered && !r.isOwnRequest)
      .map((r): PrayerSlide => ({
        kind: "request",
        text: r.body,
        attribution: r.ownerName ? `from ${r.ownerName}` : "from someone",
        requestId: r.id,
      })),
    ...activePrayersFor.map((p): PrayerSlide => {
      // Calendar-day diff so a prayer started yesterday evening reads "Day 2"
      // this morning rather than still "Day 1".
      const started = new Date(p.startedAt);
      const nowD = new Date();
      const todayStart = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate());
      const startedStart = new Date(started.getFullYear(), started.getMonth(), started.getDate());
      const daysElapsed = Math.round((todayStart.getTime() - startedStart.getTime()) / 86400000);
      const day = Math.max(1, Math.min(p.durationDays, daysElapsed + 1));
      return {
        kind: "prayer-for",
        text: p.recipientName,
        attribution: "",
        fullText: p.prayerText,
        prayerForId: p.id,
        recipientName: p.recipientName,
        recipientAvatarUrl: p.recipientAvatarUrl,
        dayLabel: `Day ${day} of ${p.durationDays}`,
      };
    }),
    // Expired "pray-for" entries deliberately don't surface here anymore.
    // Earlier we showed a renewal-prompt slide; the quieter, expected
    // behaviour (and what /people does) is to just let the prayer end.
    // The user can renew from the profile page if they want to continue.
  ];

  // Final slide logic:
  //   - No active own request → "How can the community pray for you?"
  //     (the existing ask-request slide).
  //   - Has an active own request → offer to start a prayer for a
  //     friend they're not already praying for. Only shown when we
  //     actually have suggestions; an empty pill row would be noise.
  const hasActiveOwnRequest = prayerRequests.some(
    (r) => r.isOwnRequest === true && !r.isAnswered && !r.closedAt,
  );
  // Use the same stricter filter we used for slides above — someone on
  // their prayer's final day is effectively done, so they're fair game
  // as a suggestion again.
  const prayingForEmails = new Set(
    activePrayersFor.map(p => p.recipientEmail.toLowerCase())
  );
  const viewerEmail = (user?.email ?? "").toLowerCase();
  const suggestedFriends = friends.filter(f =>
    f.email.toLowerCase() !== viewerEmail &&
    !prayingForEmails.has(f.email.toLowerCase())
  );

  if (hasActiveOwnRequest && suggestedFriends.length > 0) {
    slides.push({
      kind: "pray-for-suggest",
      text: "",
      attribution: "",
    });
  } else if (!hasActiveOwnRequest) {
    slides.push({
      kind: "ask-request",
      text: "",
      attribution: "",
    });
  }

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"prayer" | "closing">("prayer");
  const [visible, setVisible] = useState(false);
  const [slideVisible, setSlideVisible] = useState(true);
  // Track which intercessions the viewer has already "amened" this
  // session, keyed by momentToken. We POST a check-in the moment the
  // viewer advances past a community intercession so it lands on the
  // detail page + streak immediately; this set keeps `handleDone` from
  // double-counting the same moment at the end of the slideshow.
  const loggedIntercessionsRef = useRef<Set<string>>(new Set());
  // Streak celebration state — set when the server tells us this is the
  // user's first prayer-list completion today. Null outside that window
  // so the closing slide falls back to the normal "you have carried…" copy.
  const [celebration, setCelebration] = useState<{ streak: number } | null>(null);

  // Initialise phase once slides are loaded
  useEffect(() => {
    if (slides.length === 0 && momentsData && prayerRequests && myPrayersFor) {
      setPhase("closing");
    }
  }, [slides.length, momentsData, prayerRequests, myPrayersFor]);

  // When the user lands on the closing slide, log the prayer-list streak.
  // The server is idempotent per TZ-local day — calling twice doesn't
  // double-count. If this is the first completion today, we pop the
  // Duolingo-style celebration with the new streak count.
  useEffect(() => {
    if (phase !== "closing") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/prayer-streak/log");
        if (cancelled) return;
        const body = res as { streak: number; firstToday: boolean };
        // Refresh the header pill regardless of firstToday — the count
        // might have changed from a stale cache value to the real one.
        queryClient.invalidateQueries({ queryKey: ["/api/prayer-streak"] });
        if (body.firstToday) {
          setCelebration({ streak: body.streak });
          // Success haptic on the celebration entrance.
          try {
            window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "success" } }));
          } catch { /* ignore */ }
        }
      } catch {
        /* non-fatal — celebration just won't fire */
      }
    })();
    return () => { cancelled = true; };
  }, [phase]);

  // Fade in on mount; prevent body scroll; match Safari chrome to slide bg
  // so the top status-bar area and the bottom home-indicator area both
  // paint `#0C1F12` instead of flashing the app's default green/black.
  useEffect(() => {
    const SLIDE_BG = "#0C1F12";
    const html = document.documentElement;
    const body = document.body;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyBg = body.style.backgroundColor;
    const prevHtmlBg = html.style.backgroundColor;
    body.style.overflow = "hidden";
    body.style.backgroundColor = SLIDE_BG;
    html.style.backgroundColor = SLIDE_BG;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevMeta = meta?.getAttribute("content") ?? "#091A10";
    meta?.setAttribute("content", SLIDE_BG);
    const t = setTimeout(() => setVisible(true), 30);
    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.backgroundColor = prevBodyBg;
      html.style.backgroundColor = prevHtmlBg;
      meta?.setAttribute("content", prevMeta);
      clearTimeout(t);
    };
  }, []);

  const advance = () => {
    // Record the "Amen" side effect as the viewer leaves the slide.
    // Fire-and-forget — we don't want a slow network call to gate the fade.
    // - request slide → POST /amen (the existing behaviour)
    // - intercession slide → POST /moment/:momentToken/:userToken/post
    //   with isCheckin=true, so a community intercession amen counts
    //   on the intercession detail page and in the streak even if the
    //   viewer bails out of the slideshow before the closing slide.
    const current = slides[index];
    if (current && current.kind === "request" && typeof current.requestId === "number") {
      const rid = current.requestId;
      apiRequest("POST", `/api/prayer-requests/${rid}/amen`).catch(() => {
        /* swallow — amen logging is best-effort, never blocks prayer flow */
      });
    }
    if (current && current.kind === "intercession" && current.momentToken && current.myUserToken) {
      const mt = current.momentToken;
      const ut = current.myUserToken;
      if (!loggedIntercessionsRef.current.has(mt)) {
        loggedIntercessionsRef.current.add(mt);
        apiRequest("POST", `/api/moment/${mt}/${ut}/post`, { isCheckin: true })
          .then(() => {
            // Keep the detail page + dashboard fresh so the new amen shows
            // up the moment the viewer lands there.
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
          })
          .catch(() => {
            /* swallow — best-effort, handleDone will retry if still pending */
          });
      }
    }
    setSlideVisible(false);
    setTimeout(() => {
      if (index < slides.length - 1) {
        setIndex((i) => i + 1);
      } else {
        setPhase("closing");
      }
      setSlideVisible(true);
    }, 220);
  };

  const handleDone = async () => {
    // Log a check-in for every intercession the user has just prayed
    // through — skipping ones we already logged per-slide in `advance`.
    // Server-side check-ins are idempotent per day anyway, but avoiding
    // the re-POST trims tail latency on the closing slide.
    const toLog = intercessions.filter(
      (m) =>
        m.momentToken &&
        m.myUserToken &&
        !loggedIntercessionsRef.current.has(m.momentToken),
    );
    await Promise.allSettled(
      toLog.map((m) =>
        apiRequest("POST", `/api/moment/${m.momentToken}/${m.myUserToken}/post`, {
          isCheckin: true,
        }),
      ),
    );
    queryClient.invalidateQueries({ queryKey: ["/api/moments"] });

    // Native haptic on finish — a quiet "success" buzz so the user's
    // body knows the list is complete even before they look back at
    // the screen. Silently no-ops on the web build (native-shell
    // listens for this event only on iOS).
    try {
      window.dispatchEvent(
        new CustomEvent("phoebe:haptic", { detail: { style: "success" } })
      );
    } catch {
      /* non-fatal */
    }

    // Fade out then navigate. The CTA flow now reads: dashboard card →
    // slideshow (/prayer-mode) → prayer-list overview (/prayer-list). The
    // overview page is the natural landing after the session — it shows
    // the completed state, the streak, and anything else the user might
    // want to peek at before returning home.
    setSlideVisible(false);
    setTimeout(() => {
      setVisible(false);
      setTimeout(() => setLocation("/prayer-list"), 500);
    }, 300);
  };

  if (authLoading || !user) return null;

  const slide = slides[index];

  return (
    <div
      style={{
        background: "#0C1F12",
        minHeight: "100dvh",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
        position: "relative",
      }}
    >
      {/* Exit button */}
      <button
        onClick={() => setLocation("/prayer-list")}
        aria-label="Exit prayer mode"
        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full z-10 text-xl"
        style={{ color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
      >
        ×
      </button>

      {/* Content — flex column centered vertically */}
      <div
        className="flex flex-col items-center text-center px-6 py-10 w-full"
        style={{ maxWidth: 560, margin: "0 auto", minHeight: "100dvh", justifyContent: "center" }}
      >
        {phase === "prayer" && slide && (
          <div
            className="w-full"
            style={{ opacity: slideVisible ? 1 : 0, transition: "opacity 0.22s ease" }}
          >
            <SlideContent
              slide={slide}
              onAdvance={advance}
              onRenew={(id, days) => {
                renewMutation.mutate({ id, days });
                advance();
              }}
              onEnd={(id) => {
                endMutation.mutate(id);
                advance();
              }}
              onAskSubmit={(body) => {
                createRequestMutation.mutate(body, { onSuccess: () => advance() });
              }}
              askSubmitting={createRequestMutation.isPending}
              suggestedFriends={suggestedFriends.map(f => ({
                name: f.name,
                email: f.email,
                avatarUrl: f.avatarUrl ?? null,
              }))}
              onPrayForFriend={(email) => {
                setLocation(`/pray-for/new/${encodeURIComponent(email)}`);
              }}
            />
          </div>
        )}

        {phase === "closing" && (
          <div
            className="w-full flex flex-col items-center text-center gap-8"
            style={{ opacity: slideVisible ? 1 : 0, transition: "opacity 0.4s ease" }}
          >
            {celebration ? (
              <StreakCelebration streak={celebration.streak} />
            ) : (
              <p
                className="text-base leading-relaxed"
                style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                You have carried what your community is carrying. 🌿
              </p>
            )}
            <button
              onClick={handleDone}
              className="mt-2 px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* Progress */}
      {phase === "prayer" && slides.length > 0 && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.32)", letterSpacing: "0.06em" }}>
            {index + 1} of {slides.length}
          </p>
        </div>
      )}
    </div>
  );
}
