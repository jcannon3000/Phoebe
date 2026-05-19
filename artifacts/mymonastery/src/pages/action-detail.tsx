import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { useBetaStatus } from "@/hooks/useDemo";

// ── Action detail page ───────────────────────────────────────────────────────
// Landing page for a community "action" — an advocacy / community-action
// event. Reached from the dashboard ActionCard and the action pushes
// (on-creation, week-before, day-before). Shows the description, an
// optional "Learn more" link, an optional attached intercession, the two
// RSVP options (I'm coming / I might come), and the community-visible
// roster of who has RSVP'd.

const FONT = "'Space Grotesk', sans-serif";

type RsvpPerson = { userId: number; name: string; avatarUrl: string | null };
type RsvpStatus = "coming" | "maybe";

type ActionOfficial = {
  id: number;
  name: string;
  title: string | null;
  email: string;
};

type ActionDetail = {
  action: {
    id: number;
    groupId: number;
    title: string;
    description: string;
    learnMoreUrl: string | null;
    location: string | null;
    eventAt: string;
    emailSubject: string | null;
    state: string;
    createdAt: string;
  };
  group: { id: number; name: string; emoji: string | null; slug: string } | null;
  creator: { id: number; name: string } | null;
  attachedIntercession: { id: number; name: string; intention: string } | null;
  officials: ActionOfficial[];
  emailSendCount: number;
  rsvps: { coming: RsvpPerson[]; maybe: RsvpPerson[] };
  myRsvp: RsvpStatus | null;
  canManage: boolean;
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// Small round avatar — image when available, initials fallback.
function Avatar({ person, size }: { person: RsvpPerson; size: number }) {
  if (person.avatarUrl) {
    return (
      <img
        src={person.avatarUrl}
        alt={person.name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: "1px solid rgba(46,107,64,0.3)" }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        background: "#1A4A2E",
        color: "#A8C5A0",
        fontSize: Math.round(size * 0.36),
      }}
    >
      {initials(person.name)}
    </div>
  );
}

export default function ActionDetailPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/actions/:id");
  const id = params?.id ? Number(params.id) : NaN;
  const queryClient = useQueryClient();
  const queryKey = [`/api/actions/${id}`];

  const { data, isLoading, error } = useQuery<ActionDetail>({
    queryKey,
    queryFn: () => apiRequest("GET", `/api/actions/${id}`) as Promise<ActionDetail>,
    enabled: Number.isFinite(id),
  });

  // Clear the lingering push banner for this action once the user has
  // tapped through and is looking at it. Native shell removes any
  // delivered notification whose APN thread-id matches. No-op on web.
  useEffect(() => {
    if (!Number.isFinite(id)) return;
    try {
      window.dispatchEvent(
        new CustomEvent("phoebe:clear-notifications", {
          detail: { threadId: `action-${id}` },
        }),
      );
    } catch {
      /* non-fatal */
    }
  }, [id]);

  // RSVP toggle. Tapping the already-selected status clears it (sends
  // null); the server upserts or deletes the row accordingly. The
  // response carries the refreshed roster so we update the cache in
  // place without a refetch.
  const rsvpMutation = useMutation({
    mutationFn: (next: RsvpStatus | null) =>
      apiRequest("PUT", `/api/actions/${id}/rsvp`, { status: next }) as Promise<{
        myRsvp: RsvpStatus | null;
        rsvps: { coming: RsvpPerson[]; maybe: RsvpPerson[] };
      }>,
    onSuccess: (res) => {
      try {
        window.dispatchEvent(
          new CustomEvent("phoebe:haptic", { detail: { style: "light" } }),
        );
      } catch {
        /* non-fatal */
      }
      queryClient.setQueryData<ActionDetail>(queryKey, (prev) =>
        prev ? { ...prev, myRsvp: res.myRsvp, rsvps: res.rsvps } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/me/actions"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/actions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/actions"] });
      setLocation("/dashboard");
    },
  });

  const setRsvp = (status: RsvpStatus) => {
    if (rsvpMutation.isPending) return;
    const next = data?.myRsvp === status ? null : status;
    rsvpMutation.mutate(next);
  };

  // "Email your officials" — beta only. The note the user writes is
  // shared across every official (one paragraph, sent to each).
  const { isBeta } = useBetaStatus();
  const [note, setNote] = useState("");

  // Logs an email "started" so the action can show how many went out.
  // Best-effort — a failure here shouldn't block the mail app opening.
  const emailSentMutation = useMutation({
    mutationFn: (officialId: number) =>
      apiRequest("POST", `/api/actions/${id}/email-sent`, { officialId }) as Promise<{
        emailSendCount: number;
      }>,
    onSuccess: (res) => {
      queryClient.setQueryData<ActionDetail>(queryKey, (prev) =>
        prev ? { ...prev, emailSendCount: res.emailSendCount } : prev,
      );
    },
  });

  // Build the mailto + hand off to the device mail app, then log it.
  const emailOfficial = (official: ActionOfficial) => {
    if (!data) return;
    const subject = data.action.emailSubject?.trim() || data.action.title;
    const url =
      `mailto:${encodeURIComponent(official.email)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(note)}`;
    // mailto is a non-http scheme — hand it straight to the OS rather
    // than the in-app browser.
    window.location.href = url;
    emailSentMutation.mutate(official.id);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0C1F12", color: "#F0EDE6", fontFamily: FONT }}
    >
      {/* Top bar — back to dashboard. Same affordance + placement as
          every other Phoebe sub-screen. */}
      <header
        className="px-5 pb-2"
        style={{ paddingTop: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="text-sm"
          style={{
            color: "rgba(143,175,150,0.8)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          ← Back
        </button>
      </header>

      <main className="flex-1 px-5 pb-16">
        <div className="w-full max-w-md mx-auto">
          {isLoading && (
            <p className="text-sm mt-8" style={{ color: "rgba(143,175,150,0.55)" }}>
              Loading…
            </p>
          )}

          {!isLoading && (error || !data) && (
            <p className="text-sm mt-8" style={{ color: "rgba(200,212,192,0.6)" }}>
              We couldn't load this action.
            </p>
          )}

          {data && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {/* Host community eyebrow */}
              {data.group && (
                <Link
                  href={`/communities/${data.group.slug}`}
                  className="text-[11px] font-semibold uppercase tracking-widest transition-opacity hover:opacity-80"
                  style={{ color: "rgba(143,175,150,0.6)" }}
                >
                  {data.group.emoji ? `${data.group.emoji} ` : ""}
                  {data.group.name}
                </Link>
              )}

              {/* Title */}
              <h1
                className="text-2xl font-semibold leading-tight mt-1.5 mb-3"
                style={{ color: "#F0EDE6", fontFamily: FONT }}
              >
                {data.action.title}
              </h1>

              {/* When + where */}
              <div className="flex flex-col gap-1.5 mb-5">
                <p className="text-sm" style={{ color: "#C8D4C0", margin: 0 }}>
                  🗓️ {format(new Date(data.action.eventAt), "EEEE, MMMM d")}
                  {"  ·  "}
                  {format(new Date(data.action.eventAt), "h:mm a")}
                </p>
                {data.action.location && (
                  <p className="text-sm" style={{ color: "#C8D4C0", margin: 0 }}>
                    📍 {data.action.location}
                  </p>
                )}
              </div>

              {/* Description */}
              <p
                className="text-[15px] leading-relaxed mb-5"
                style={{ color: "#E8E4D8", whiteSpace: "pre-wrap" }}
              >
                {data.action.description}
              </p>

              {/* Learn more — opens in the in-app browser (SFSafariView
                  on iOS) rather than bouncing out to mobile Safari. */}
              {data.action.learnMoreUrl && (
                <button
                  type="button"
                  onClick={() => openExternal(data.action.learnMoreUrl as string)}
                  className="w-full rounded-xl px-4 py-3 mb-6 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{
                    background: "rgba(46,107,64,0.18)",
                    border: "1px solid rgba(46,107,64,0.45)",
                    color: "#F0EDE6",
                    fontFamily: FONT,
                    cursor: "pointer",
                  }}
                >
                  Learn more →
                </button>
              )}

              {/* Attached intercession — links to the moment so the
                  community can pray toward this action. */}
              {data.attachedIntercession && (
                <Link href={`/moments/${data.attachedIntercession.id}`}>
                  <div
                    className="rounded-2xl p-4 mb-6 cursor-pointer transition-opacity hover:opacity-90"
                    style={{
                      background: "rgba(46,107,64,0.14)",
                      border: "1px solid rgba(46,107,64,0.35)",
                    }}
                  >
                    <p
                      className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                      style={{ color: "rgba(143,175,150,0.55)" }}
                    >
                      🕯️ Pray toward this
                    </p>
                    <p
                      className="text-base font-semibold"
                      style={{ color: "#F0EDE6", margin: 0, lineHeight: 1.2 }}
                    >
                      {data.attachedIntercession.name}
                    </p>
                    <p
                      className="text-[12px] mt-1"
                      style={{ color: "rgba(143,175,150,0.85)", margin: 0 }}
                    >
                      {data.attachedIntercession.intention}
                    </p>
                  </div>
                </Link>
              )}

              {/* Email your officials — beta only. Each button opens
                  the device mail app pre-filled with the official's
                  address, the subject, and the note the member writes
                  here, then logs it toward the "emails sent" count. */}
              {isBeta && data.officials.length > 0 && (
                <div className="mb-6">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                    style={{ color: "rgba(143,175,150,0.55)" }}
                  >
                    Email your officials
                  </p>
                  <p className="text-[13px] mb-3" style={{ color: "#8FAF96" }}>
                    Write a short note in your own words, then send — it opens
                    your mail app, ready to go.
                  </p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Dear ___, I'm a constituent, and I'm writing because…"
                    rows={5}
                    maxLength={4000}
                    className="w-full rounded-xl px-3 py-3 text-sm leading-relaxed mb-3"
                    style={{
                      background: "#0F2818",
                      border: "1px solid rgba(46,107,64,0.4)",
                      color: "#F0EDE6",
                      fontFamily: FONT,
                      resize: "vertical",
                    }}
                  />
                  <div className="flex flex-col gap-2">
                    {data.officials.map((o) => (
                      <div
                        key={o.id}
                        className="rounded-xl p-3 flex items-center justify-between gap-3"
                        style={{
                          background: "rgba(46,107,64,0.1)",
                          border: "1px solid rgba(46,107,64,0.3)",
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-semibold"
                            style={{ color: "#F0EDE6", margin: 0 }}
                          >
                            {o.name}
                          </p>
                          {o.title && (
                            <p
                              className="text-[12px] mt-0.5"
                              style={{ color: "rgba(143,175,150,0.8)", margin: 0 }}
                            >
                              {o.title}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => emailOfficial(o)}
                          disabled={!note.trim()}
                          className="text-[12px] font-semibold px-3 py-2 rounded-full shrink-0 transition-opacity hover:opacity-90 disabled:opacity-45"
                          style={{
                            background: "#2D5E3F",
                            border: "1px solid rgba(46,107,64,0.7)",
                            color: "#F0EDE6",
                            fontFamily: FONT,
                            cursor: note.trim() ? "pointer" : "default",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ✉️ Email
                        </button>
                      </div>
                    ))}
                  </div>
                  {!note.trim() && (
                    <p
                      className="text-[12px] mt-2"
                      style={{ color: "rgba(143,175,150,0.6)" }}
                    >
                      Write your note above to send.
                    </p>
                  )}
                  {data.emailSendCount > 0 && (
                    <p
                      className="text-[12px] mt-2.5"
                      style={{ color: "rgba(143,175,150,0.85)" }}
                    >
                      🕊️ {data.emailSendCount}{" "}
                      {data.emailSendCount === 1 ? "email" : "emails"} sent from
                      your community.
                    </p>
                  )}
                </div>
              )}

              {/* RSVP — two options. The selected one is filled; tapping
                  it again clears the RSVP. */}
              <p
                className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: "rgba(143,175,150,0.55)" }}
              >
                Will you be there?
              </p>
              <div className="flex gap-3 mb-6">
                {(["coming", "maybe"] as const).map((status) => {
                  const selected = data.myRsvp === status;
                  const label = status === "coming" ? "I'm coming" : "I might come";
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setRsvp(status)}
                      disabled={rsvpMutation.isPending}
                      className="flex-1 rounded-xl px-3 py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
                      style={{
                        background: selected
                          ? "#2D5E3F"
                          : "rgba(46,107,64,0.14)",
                        border: `1px solid ${
                          selected ? "rgba(46,107,64,0.7)" : "rgba(46,107,64,0.35)"
                        }`,
                        color: selected ? "#F0EDE6" : "#C8D4C0",
                        fontFamily: FONT,
                        cursor: rsvpMutation.isPending ? "default" : "pointer",
                      }}
                    >
                      {selected ? "✓ " : ""}
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* RSVP roster — visible to the whole community. */}
              <RsvpRoster title="Coming" people={data.rsvps.coming} />
              <RsvpRoster title="Maybe" people={data.rsvps.maybe} />

              {data.rsvps.coming.length === 0 && data.rsvps.maybe.length === 0 && (
                <p
                  className="text-[13px] italic mt-1"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  No RSVPs yet — be the first to let your community know.
                </p>
              )}

              {/* Manager-only: cancel the action (soft archive). */}
              {data.canManage && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancel this action? It will be removed from everyone's dashboard.",
                      )
                    ) {
                      cancelMutation.mutate();
                    }
                  }}
                  disabled={cancelMutation.isPending}
                  className="mt-8 text-[13px] transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{
                    color: "rgba(200,150,150,0.75)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontFamily: FONT,
                  }}
                >
                  {cancelMutation.isPending ? "Cancelling…" : "Cancel this action"}
                </button>
              )}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}

// One labelled roster section ("Coming" / "Maybe"). Renders nothing when
// the group is empty so the page stays quiet until people RSVP.
function RsvpRoster({ title, people }: { title: string; people: RsvpPerson[] }) {
  if (people.length === 0) return null;
  return (
    <div className="mb-4">
      <p
        className="text-[11px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "rgba(143,175,150,0.55)" }}
      >
        {title} · {people.length}
      </p>
      <div className="flex flex-col gap-2">
        {people.map((p) => (
          <div key={p.userId} className="flex items-center gap-2.5">
            <Avatar person={p} size={28} />
            <span className="text-sm" style={{ color: "#E8E4D8" }}>
              {p.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
