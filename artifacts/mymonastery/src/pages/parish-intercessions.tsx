/**
 * Phoebe Parish — admin page for the parish's STANDING intercessions.
 *
 * Unlike a general prayer feed (which rotates a few slots per day), a
 * parish carries a STANDING list of up to 7 intercessions: the priest
 * programs them once and the same set is carried every day — in the
 * parishioner's Office and on /parish — until the priest edits it. So
 * these live in prayer_feed_recurring_entries (dateless "daily"
 * templates), NOT the date-pinned prayer_feed_entries.
 *
 * A slot can either be free text or a prayer chosen from the Book of
 * Common Prayer. A BCP slot stores the prayer's full text; when a
 * parishioner reaches it in their Office, the whole prayer is shown in
 * a frosted card the way Co-Breathe closes on its prayer.
 *
 * Powered by the recurring prayer-feeds endpoints:
 *   • GET    /api/prayer-feeds/:slug/recurring
 *   • POST   /api/prayer-feeds/:slug/recurring        (create — server picks slot)
 *   • PUT    /api/prayer-feeds/:slug/recurring/:id    (edit)
 *   • DELETE /api/prayer-feeds/:slug/recurring/:id    (remove)
 */

import { useMemo, useState } from "react";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { ChevronLeft, BookOpen, Plus, Trash2, X, Search } from "lucide-react";
import { BCP_PRAYERS, localizeBcpPrayer } from "@/lib/bcp-prayers";
import i18n from "@/i18n";

const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const CARD_BG = "rgba(9,26,16, 0.297)";
const CARD_BORDER = "1px solid rgba(46,107,64,0.22)";

const MAX_SLOTS = 7;

type AdminParish = {
  id: number;
  slug: string;
  title: string;
  timezone: string;
};

type RecurringEntry = {
  id: number;
  slot: number;
  title: string;
  body: string;
  source: "custom" | "action" | "bcp";
  state: "draft" | "live";
};

export default function ParishIntercessionsPage() {
  const { user, isLoading } = useAuth();
  const bgPhoto = LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[0]! : null;
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

  const recurringQuery = useQuery<{ recurring: RecurringEntry[] }>({
    queryKey: ["/api/prayer-feeds", selectedParish?.slug, "recurring"],
    queryFn: () =>
      apiRequest("GET", `/api/prayer-feeds/${selectedParish!.slug}/recurring`),
    enabled: !!selectedParish,
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);

  if (isLoading) return null;
  if (!user) { setLocation("/"); return null; }

  const entries = (recurringQuery.data?.recurring ?? [])
    .slice()
    .sort((a, b) => a.slot - b.slot);
  const atCapacity = entries.length >= MAX_SLOTS;

  return (
    <Layout bgPhoto={bgPhoto}>
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
          Your parish's intercessions
        </h1>
        <p
          className="text-sm mb-6"
          style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
        >
          The prayers your parish carries together — every day, until you change them. Up to seven.
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

        {selectedParish && (
          <>
            <div className="flex flex-col gap-4">
              {entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  slug={selectedParish.slug}
                  entry={entry}
                />
              ))}

              {addingCustom && (
                <NewCustomCard
                  slug={selectedParish.slug}
                  onDone={() => setAddingCustom(false)}
                />
              )}

              {entries.length === 0 && !addingCustom && (
                <p
                  className="text-sm italic py-2"
                  style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}
                >
                  No intercessions yet. Add the prayers your parish carries together.
                </p>
              )}
            </div>

            {!atCapacity && !addingCustom && (
              <div className="flex flex-col sm:flex-row gap-2 mt-5">
                <button
                  onClick={() => setAddingCustom(true)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{
                    background: "#2D5E3F",
                    color: WARM_TEXT,
                    border: "none",
                    fontFamily: SPACE_GROTESK,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={15} />
                  Write an intercession
                </button>
                <button
                  onClick={() => setPickerOpen(true)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{
                    background: "rgba(143,175,150,0.12)",
                    color: SAGE,
                    border: "1px solid rgba(46,107,64,0.3)",
                    fontFamily: SPACE_GROTESK,
                    cursor: "pointer",
                  }}
                >
                  <BookOpen size={15} />
                  From the Book of Common Prayer
                </button>
              </div>
            )}

            {atCapacity && (
              <p
                className="text-xs italic mt-4"
                style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}
              >
                Seven intercessions is the most a parish carries at once. Remove one to add another.
              </p>
            )}
          </>
        )}
      </div>

      {pickerOpen && selectedParish && (
        <BcpPickerModal
          slug={selectedParish.slug}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </Layout>
  );
}

// ─── An existing standing intercession ────────────────────────────────────

function EntryCard({ slug, entry }: { slug: string; entry: RecurringEntry }) {
  const qc = useQueryClient();
  const isBcp = entry.source === "bcp";
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.body);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["/api/prayer-feeds", slug, "recurring"] });

  const save = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/prayer-feeds/${slug}/recurring/${entry.id}`, {
        recurrenceKind: "daily",
        title: title.trim(),
        body: body.trim(),
        source: entry.source,
        state: "live",
      }),
    onSuccess: () => { setError(null); invalidate(); },
    onError: (err: Error) => setError(err.message || "Couldn't save. Try again?"),
  });

  const remove = useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/prayer-feeds/${slug}/recurring/${entry.id}`),
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message || "Couldn't remove. Try again?"),
  });

  const dirty = title.trim() !== entry.title || body.trim() !== entry.body;
  const canSave = title.trim().length > 0 && body.trim().length > 0 && dirty;

  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{ background: CARD_BG, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: CARD_BORDER }}
    >
      <div className="flex items-center justify-between mb-3">
        {isBcp ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full"
            style={{ background: "rgba(46,107,64,0.2)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.4)", fontFamily: SPACE_GROTESK }}
          >
            <BookOpen size={11} />
            Book of Common Prayer
          </span>
        ) : (
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}
          >
            Intercession
          </span>
        )}
        <button
          onClick={() => { if (confirm("Remove this intercession?")) remove.mutate(); }}
          disabled={remove.isPending}
          aria-label="Remove"
          className="p-1 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ color: FAINT_GREEN, background: "transparent", border: "none", cursor: "pointer" }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {isBcp ? (
        // The prayer text is canonical — shown, not edited. The priest
        // can remove it and pick a different one.
        <>
          <p style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
            {entry.title}
          </p>
          <p style={{ color: "rgba(200,212,192,0.85)", fontFamily: SPACE_GROTESK, fontSize: 14, fontStyle: "italic", lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" }}>
            {entry.body}
          </p>
        </>
      ) : (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Title — e.g. For those grieving"
            style={{ width: "100%", background: "transparent", color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600, padding: "6px 0", marginBottom: 8, border: "none", outline: "none" }}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="The prayer itself…"
            style={{ width: "100%", background: "transparent", color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 14, lineHeight: 1.55, border: "none", outline: "none", resize: "none", padding: "4px 0" }}
          />
        </>
      )}

      {error && (
        <p className="text-xs mt-2" style={{ color: "#F87171", fontFamily: SPACE_GROTESK }}>{error}</p>
      )}

      {!isBcp && (
        <div className="flex justify-end mt-3">
          <button
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
            className="px-4 py-1.5 rounded-full text-xs font-semibold transition-opacity disabled:opacity-40"
            style={{ background: "#2D5E3F", color: WARM_TEXT, border: "none", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── A brand-new free-text intercession ───────────────────────────────────

function NewCustomCard({ slug, onDone }: { slug: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/recurring`, {
        recurrenceKind: "daily",
        title: title.trim(),
        body: body.trim(),
        source: "custom",
        state: "live",
      }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["/api/prayer-feeds", slug, "recurring"] });
      onDone();
    },
    onError: (err: Error) => setError(err.message || "Couldn't add. Try again?"),
  });

  const canSave = title.trim().length > 0 && body.trim().length > 0;

  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{ background: CARD_BG, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: CARD_BORDER }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-3"
        style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}
      >
        New intercession
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        autoFocus
        placeholder="Title — e.g. For those grieving"
        style={{ width: "100%", background: "transparent", color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600, padding: "6px 0", marginBottom: 8, border: "none", outline: "none" }}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="The prayer itself…"
        style={{ width: "100%", background: "transparent", color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 14, lineHeight: 1.55, border: "none", outline: "none", resize: "none", padding: "4px 0" }}
      />
      {error && (
        <p className="text-xs mt-2" style={{ color: "#F87171", fontFamily: SPACE_GROTESK }}>{error}</p>
      )}
      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={onDone}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity"
          style={{ background: "rgba(143,175,150,0.12)", color: SAGE, border: "1px solid rgba(46,107,64,0.25)", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          onClick={() => create.mutate()}
          disabled={!canSave || create.isPending}
          className="px-4 py-1.5 rounded-full text-xs font-semibold transition-opacity disabled:opacity-40"
          style={{ background: "#2D5E3F", color: WARM_TEXT, border: "none", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
        >
          {create.isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// ─── Book of Common Prayer picker ─────────────────────────────────────────

function BcpPickerModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isEs = !!i18n.language?.startsWith("es");

  // Group the (locale-aware) prayers by category, filtered by the search.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = new Map<string, Array<{ index: number; title: string; text: string }>>();
    BCP_PRAYERS.forEach((p, index) => {
      const loc = localizeBcpPrayer(p, isEs ? "es" : "en");
      if (q && !loc.title.toLowerCase().includes(q) && !loc.category.toLowerCase().includes(q)) return;
      const list = out.get(loc.category) ?? [];
      list.push({ index, title: loc.title, text: loc.text });
      out.set(loc.category, list);
    });
    return out;
  }, [query, isEs]);

  const add = useMutation({
    mutationFn: (index: number) => {
      const p = BCP_PRAYERS[index]!;
      const loc = localizeBcpPrayer(p, isEs ? "es" : "en");
      return apiRequest("POST", `/api/prayer-feeds/${slug}/recurring`, {
        recurrenceKind: "daily",
        title: loc.title,
        body: loc.text,
        source: "bcp",
        state: "live",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/prayer-feeds", slug, "recurring"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message || "Couldn't add. Try again?"),
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(4,12,7,0.6)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col"
        style={{ background: "#0C1F12", border: "1px solid rgba(46,107,64,0.3)", maxHeight: "82vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(46,107,64,0.2)" }}>
          <p className="text-sm font-bold" style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK }}>
            {isEs ? "Del Libro de Oración Común" : "From the Book of Common Prayer"}
          </p>
          <button onClick={onClose} aria-label="Close" style={{ color: SAGE, background: "transparent", border: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-full" style={{ background: "rgba(143,175,150,0.1)" }}>
            <Search size={15} style={{ color: FAINT_GREEN }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isEs ? "Buscar una oración…" : "Search prayers…"}
              style={{ flex: 1, background: "transparent", color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 14, border: "none", outline: "none" }}
            />
          </div>
        </div>

        {error && (
          <p className="px-5 pt-2 text-xs" style={{ color: "#F87171", fontFamily: SPACE_GROTESK }}>{error}</p>
        )}

        <div className="overflow-y-auto px-5 py-3 flex flex-col gap-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {[...grouped.entries()].map(([category, prayers]) => (
            <div key={category}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}>
                {category}
              </p>
              <div className="flex flex-col gap-1.5">
                {prayers.map((p) => (
                  <button
                    key={p.index}
                    onClick={() => { if (!add.isPending) add.mutate(p.index); }}
                    disabled={add.isPending}
                    className="text-left px-3 py-2.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ background: "rgba(143,175,150,0.08)", border: "1px solid rgba(46,107,64,0.18)", color: WARM_TEXT, fontFamily: SPACE_GROTESK, cursor: "pointer" }}
                  >
                    <span className="text-sm font-semibold" style={{ display: "block" }}>{p.title}</span>
                    <span className="text-xs" style={{ color: FAINT_GREEN, display: "block", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {grouped.size === 0 && (
            <p className="text-sm italic py-4 text-center" style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}>
              {isEs ? "Ninguna oración coincide." : "No prayers match your search."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
