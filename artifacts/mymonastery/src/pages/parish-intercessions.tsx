/**
 * Phoebe Parish — admin page for publishing today's community
 * intercessions.
 *
 * A parish carries up to 3 published intercession slots per day on
 * /parish (the parishioner-facing dashboard). This admin page lets
 * the priest/pastor write + publish those three slots. Editors
 * see drafts too; non-admins can only see published rows via the
 * regular parishioner endpoints.
 *
 * Powered by the existing prayer-feeds entry endpoints:
 *   • GET  /api/prayer-feeds/:slug/entries?from=&to=  (list)
 *   • POST /api/prayer-feeds/:slug/entries            (upsert)
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { todayInZone } from "@/lib/tz";
import { Layout } from "@/components/layout";
import { ChevronLeft } from "lucide-react";

const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";

type AdminParish = {
  id: number;
  slug: string;
  title: string;
  timezone: string;
};

type FeedEntry = {
  id: number;
  entryDate: string;
  slot: number;
  title: string;
  body: string;
  scriptureRef: string | null;
  state: "draft" | "scheduled" | "published";
  prayCount: number;
};

// todayInZone (today's YYYY-MM-DD in an IANA zone) lives in @/lib/tz.

const SLOT_LABEL: Record<number, string> = {
  1: "First intercession",
  2: "Second intercession",
  3: "Third intercession",
};

export default function ParishIntercessionsPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const parishesQuery = useQuery<{ parishes: AdminParish[]; isStaffAdmin: boolean }>({
    queryKey: ["/api/parish/admin/parishes"],
    queryFn: () => apiRequest("GET", "/api/parish/admin/parishes"),
    enabled: !!user,
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const parishes = parishesQuery.data?.parishes ?? [];
  const selectedParish =
    parishes.find((p) => p.id === selectedId) ?? parishes[0] ?? null;

  // Today, in the selected parish's timezone — so an admin in a
  // different zone still publishes against the parishioners' "today".
  const today = useMemo(
    () => (selectedParish ? todayInZone(selectedParish.timezone) : null),
    [selectedParish],
  );

  const entriesQuery = useQuery<{ entries: FeedEntry[] }>({
    queryKey: ["/api/prayer-feeds", selectedParish?.slug, "entries", today],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/prayer-feeds/${selectedParish!.slug}/entries?from=${today}&to=${today}`,
      ),
    enabled: !!selectedParish && !!today,
  });

  if (isLoading) return null;
  if (!user) { setLocation("/"); return null; }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full px-5 pb-24">
        <Link
          href="/parish/admin"
          className="inline-flex items-center gap-1.5 text-xs font-medium mb-4 transition-opacity hover:opacity-80"
          style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
        >
          <ChevronLeft size={14} />
          Back
        </Link>

        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK }}
        >
          Today's intercessions
        </h1>
        <p
          className="text-sm mb-6"
          style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
        >
          Up to three prayers your parish carries together today. Publish or save as a draft.
        </p>

        {parishes.length > 1 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            {parishes.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity"
                style={{
                  background: selectedParish?.id === p.id ? "#2D5E3F" : "rgba(46,107,64,0.15)",
                  color: selectedParish?.id === p.id ? WARM_TEXT : SAGE,
                  border: `1px solid ${selectedParish?.id === p.id ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.25)"}`,
                  fontFamily: SPACE_GROTESK,
                  cursor: "pointer",
                }}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        {!selectedParish && !parishesQuery.isLoading && (
          <p className="text-sm italic" style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}>
            You don't have admin access to any parish.
          </p>
        )}

        {selectedParish && today && (
          <>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-3"
              style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}
            >
              {new Date(today).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>

            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((slot) => {
                const existing =
                  entriesQuery.data?.entries.find((e) => e.slot === slot) ?? null;
                return (
                  <SlotComposer
                    key={`${selectedParish.slug}-${today}-${slot}`}
                    slug={selectedParish.slug}
                    entryDate={today}
                    slot={slot}
                    existing={existing}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function SlotComposer({
  slug,
  entryDate,
  slot,
  existing,
}: {
  slug: string;
  entryDate: string;
  slot: number;
  existing: FeedEntry | null;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [scriptureRef, setScriptureRef] = useState(existing?.scriptureRef ?? "");
  const [error, setError] = useState<string | null>(null);

  // If the cached entry arrives after the first render (timing race
  // between the parish list and the entries fetch), backfill the form
  // once. We deliberately don't keep this in sync after that — if the
  // admin starts editing we shouldn't yank their text back to the
  // server value mid-keystroke.
  useEffect(() => {
    if (existing && !title && !body) {
      setTitle(existing.title);
      setBody(existing.body);
      setScriptureRef(existing.scriptureRef ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  const save = useMutation({
    mutationFn: (state: "draft" | "published") =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/entries`, {
        entryDate,
        slot,
        title: title.trim(),
        body: body.trim(),
        scriptureRef: scriptureRef.trim() || null,
        state,
      }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["/api/prayer-feeds", slug, "entries", entryDate] });
    },
    onError: (err: Error) => {
      setError(err.message || "Couldn't save. Try again?");
    },
  });

  const canSave = title.trim().length > 0 && body.trim().length > 0;
  const isPublished = existing?.state === "published";

  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{
        background: "rgba(46,107,64,0.08)",
        border: "1px solid rgba(46,107,64,0.22)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}
        >
          {SLOT_LABEL[slot]}
        </p>
        {existing && (
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full"
            style={{
              background: isPublished ? "rgba(46,107,64,0.25)" : "rgba(143,175,150,0.12)",
              color: isPublished ? "#A8C5A0" : SAGE,
              border: `1px solid ${isPublished ? "rgba(46,107,64,0.45)" : "rgba(46,107,64,0.22)"}`,
              fontFamily: SPACE_GROTESK,
            }}
          >
            {existing.state}
          </span>
        )}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Title — e.g. For those grieving"
        style={{
          width: "100%",
          background: "transparent",
          color: WARM_TEXT,
          fontFamily: SPACE_GROTESK,
          fontSize: 16,
          fontWeight: 600,
          padding: "6px 0",
          marginBottom: 8,
          border: "none",
          outline: "none",
        }}
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="The prayer itself…"
        style={{
          width: "100%",
          background: "transparent",
          color: WARM_TEXT,
          fontFamily: SPACE_GROTESK,
          fontSize: 14,
          lineHeight: 1.55,
          border: "none",
          outline: "none",
          resize: "none",
          padding: "4px 0",
        }}
      />

      <input
        value={scriptureRef}
        onChange={(e) => setScriptureRef(e.target.value)}
        maxLength={120}
        placeholder="Scripture reference (optional) — e.g. Romans 8:38–39"
        style={{
          width: "100%",
          background: "transparent",
          color: SAGE,
          fontFamily: SPACE_GROTESK,
          fontSize: 13,
          fontStyle: "italic",
          padding: "4px 0",
          marginTop: 4,
          border: "none",
          outline: "none",
        }}
      />

      {existing?.state === "published" && (
        <p
          className="text-[12px] mt-2"
          style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}
        >
          🌿 {existing.prayCount} {existing.prayCount === 1 ? "person has prayed" : "people have prayed"} this today.
        </p>
      )}

      {error && (
        <p className="text-xs mt-2" style={{ color: "#F87171", fontFamily: SPACE_GROTESK }}>
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={() => save.mutate("draft")}
          disabled={!canSave || save.isPending}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity disabled:opacity-40"
          style={{
            background: "rgba(143,175,150,0.12)",
            color: SAGE,
            border: "1px solid rgba(46,107,64,0.25)",
            fontFamily: SPACE_GROTESK,
            cursor: "pointer",
          }}
        >
          Save draft
        </button>
        <button
          onClick={() => save.mutate("published")}
          disabled={!canSave || save.isPending}
          className="px-4 py-1.5 rounded-full text-xs font-semibold transition-opacity disabled:opacity-40"
          style={{
            background: "#2D5E3F",
            color: WARM_TEXT,
            border: "none",
            fontFamily: SPACE_GROTESK,
            cursor: "pointer",
          }}
        >
          {save.isPending ? "Saving…" : isPublished ? "Update" : "Publish"}
        </button>
      </div>
    </div>
  );
}
