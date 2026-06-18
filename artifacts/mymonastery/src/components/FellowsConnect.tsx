/**
 * FellowsConnect — the manual add / request-accept / search / contacts surface
 * for Fellows, embedded at the top of the People page. Backed by the existing
 * fellows + fellow_invites tables via /api/fellows/* (accepted fellows already
 * flow into the garden → prayer-request visibility). Beta capability; the host
 * gates rendering on beta. Raw phone numbers never leave the device — contact
 * matching hashes client-side, same as find-friends.
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Plus, Link2 as LinkIcon, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { isNativeShell } from "@/lib/isNativeShell";
import { FellowSettingsSheet, type FellowLite } from "@/components/FellowSettingsSheet";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_BG = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.3)";

type Fellow = { userId: number; name: string | null; avatarUrl: string | null; streak: number };
type Request = { id: number; userId: number; name: string | null; avatarUrl: string | null };
type SearchUser = { id: number; name: string | null; avatarUrl: string | null; status: "none" | "fellows" | "requested" | "incoming" };

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size, border: "1px solid rgba(46,107,64,0.3)" }} />;
  return <div className="rounded-full flex items-center justify-center font-semibold shrink-0" style={{ width: size, height: size, background: "#1A4A2E", color: "#A8C5A0", fontSize: size * 0.32, fontFamily: FONT }}>{initials(name)}</div>;
}
function Pill({ label, onClick, kind = "solid", disabled }: { label: string; onClick?: () => void; kind?: "solid" | "ghost" | "muted"; disabled?: boolean }) {
  const styles = {
    solid: { background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)" },
    ghost: { background: "rgba(200,212,192,0.08)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.4)" },
    muted: { background: "transparent", color: "rgba(182,210,188,0.5)", border: "1px solid rgba(143,175,150,0.22)" },
  }[kind];
  return <button type="button" onClick={onClick} disabled={disabled} className="shrink-0 rounded-full text-[12.5px] font-semibold px-3.5 py-1.5 transition-opacity active:scale-[0.97]" style={{ ...styles, fontFamily: FONT, opacity: disabled ? 0.6 : 1 }}>{label}</button>;
}
// Walking-together progress, folded into the fellow card. A companion is a
// fellow you've both opted to walk with; their today-only rhythm dots + a
// status line ride the second line of their fellow card.
const DOT_ON = "rgba(110,180,130,0.95)";
type WalkAnchorLite = { key: string; done: boolean };
type WalkCompanionLite = { userId: number; progress: { keptCount: number; totalCount: number; allKept: boolean; anchors: WalkAnchorLite[] } | null; progressLocked?: boolean };
function Dots({ anchors }: { anchors: WalkAnchorLite[] }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden>
      {anchors.map((d) => (
        <span key={d.key} style={{ width: 6, height: 6, borderRadius: 999, display: "inline-block", background: d.done ? DOT_ON : "transparent", border: d.done ? "none" : "1px solid rgba(143,175,150,0.5)" }} />
      ))}
    </span>
  );
}

function normalizePhoneClient(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (hasPlus) return digits.length >= 8 && digits.length <= 15 ? "+" + digits : null;
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return null;
}
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// `canManage` (beta) gates the add / search / contacts / requests surface;
// the fellows list itself is read-only and shown to everyone (fellows can be
// created via shared-prayer signup for non-beta users too).
//
// `variant` splits the surface in two:
//   • "people"  (default) — just your fellows + an "Add a fellow" pill that
//     routes to the manage page. Keeps the People page clean (no big add card).
//   • "manage"  — the full add surface (search + contacts + requests + your
//     fellows with remove), shown on the dedicated /fellows page.
export function FellowsConnect({ canManage = false, variant = "people" }: { canManage?: boolean; variant?: "people" | "manage" }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const fellowsQ = useQuery<{ fellows: Fellow[] }>({ queryKey: ["/api/fellows"], queryFn: () => apiRequest("GET", "/api/fellows") });
  const requestsQ = useQuery<{ requests: Request[] }>({ queryKey: ["/api/fellows/requests"], queryFn: () => apiRequest("GET", "/api/fellows/requests"), enabled: canManage });
  const searchQ = useQuery<{ users: SearchUser[] }>({
    queryKey: ["/api/fellows/search", q.trim()],
    queryFn: () => apiRequest("GET", `/api/fellows/search?q=${encodeURIComponent(q.trim())}`),
    enabled: canManage && q.trim().length >= 2,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/fellows"] });
    qc.invalidateQueries({ queryKey: ["/api/fellows/requests"] });
    qc.invalidateQueries({ queryKey: ["/api/fellows/requests/count"] });
    qc.invalidateQueries({ queryKey: ["/api/fellows/search"] });
  };
  const sendReq = useMutation({ mutationFn: (userId: number) => apiRequest("POST", "/api/fellows/request", { userId }), onSuccess: invalidate });
  const accept = useMutation({ mutationFn: (id: number) => apiRequest("POST", `/api/fellows/requests/${id}/accept`), onSuccess: invalidate });
  const decline = useMutation({ mutationFn: (id: number) => apiRequest("POST", `/api/fellows/requests/${id}/decline`), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (userId: number) => apiRequest("DELETE", `/api/fellows/${userId}`), onSuccess: invalidate });

  const requests = requestsQ.data?.requests ?? [];
  const fellows = fellowsQ.data?.fellows ?? [];
  const results = searchQ.data?.users ?? [];

  // Walking-together progress, keyed by fellow userId — converged onto the
  // fellow card (dots + status on the second line). Beta-only.
  const walkQ = useQuery<{ companions: WalkCompanionLite[] }>({ queryKey: ["/api/walk"], queryFn: () => apiRequest("GET", "/api/walk"), enabled: canManage, staleTime: 30_000 });
  const walkByUser = new Map((walkQ.data?.companions ?? []).map((c) => [c.userId, c]));

  const [optReq, setOptReq] = useState<Set<number>>(() => new Set());
  const addFellow = (id: number) => { sendReq.mutate(id); setOptReq((s) => new Set(s).add(id)); };

  // One-tap 🙌 encouragement — direct, no opt-in. Sends "{You} encouraged you —
  // keep growing with Phoebe." to any fellow. Optimistic: the pill flips to
  // "Encouraged" the instant you tap, server dedupes a double-send within an hour.
  const [encouraged, setEncouraged] = useState<Set<number>>(() => new Set());
  // Per-fellow sharing settings sheet (daily progress + plans/same-place).
  const [settingsFellow, setSettingsFellow] = useState<FellowLite | null>(null);
  const openSettings = (f: { userId: number; name: string | null; avatarUrl: string | null }) =>
    setSettingsFellow({ userId: f.userId, name: f.name, avatarUrl: f.avatarUrl });
  const encourage = useMutation({ mutationFn: (userId: number) => apiRequest("POST", "/api/encouragements", { toUserId: userId }) });
  const sendEncourage = (id: number) => { encourage.mutate(id); setEncouraged((s) => new Set(s).add(id)); };

  // Share a personal invite link — mint/fetch the caller's token, then open the
  // best share surface (native sheet, Web Share, or clipboard). Whoever opens it
  // and accepts becomes a Fellow (the link rides the Heart to Hearts join flow,
  // and accepting a Heart to Heart creates the Fellow link).
  const [linkCopied, setLinkCopied] = useState(false);
  const shareInviteLink = async () => {
    try {
      const { url } = await apiRequest<{ token: string; url: string }>("POST", "/api/prayer-partner/invite-link");
      const detail = {
        title: t("fellows_c.invite_share_title", { defaultValue: "Connect with me on Phoebe" }),
        text: t("fellows_c.invite_share_text", { defaultValue: "Join me on Phoebe — we can pray together and hold each other in prayer. Tap to connect:" }),
        url,
      };
      if (isNativeShell()) { window.dispatchEvent(new CustomEvent("phoebe:share", { detail })); return; }
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (typeof nav.share === "function") { try { await nav.share(detail); return; } catch { /* cancelled → clipboard */ } }
      try { await navigator.clipboard.writeText(url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }
      catch { window.prompt("Copy this link", url); }
    } catch { /* best-effort */ }
  };

  const row = (name: string, url: string | null, right: React.ReactNode, key: string | number) => (
    <div key={key} className="relative flex items-center gap-3 rounded-2xl px-4 py-3 mb-2" style={{ background: CARD_BG, border: `1px solid ${CARD_B}` }}>
      <Avatar name={name} url={url} />
      <p className="flex-1 min-w-0 truncate text-[15px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{name}</p>
      {right}
    </div>
  );
  const renderUserRow = (u: SearchUser, keyPrefix: string) => {
    const status = optReq.has(u.id) ? "requested" : u.status;
    const pill =
      status === "fellows" ? <Pill label={t("fellows_c.fellows", { defaultValue: "Fellows" })} kind="muted" disabled />
      : status === "requested" ? <Pill label={t("fellows_c.requested", { defaultValue: "Requested" })} kind="muted" disabled />
      : status === "incoming" ? <Pill label={t("fellows_c.accept", { defaultValue: "Accept" })} kind="solid" onClick={() => { const r = requests.find((x) => x.userId === u.id); if (r) accept.mutate(r.id); else addFellow(u.id); }} />
      : <Pill label={t("fellows_c.add", { defaultValue: "Add" })} kind="solid" onClick={() => addFellow(u.id)} />;
    return row(u.name ?? "Someone", u.avatarUrl, pill, `${keyPrefix}-${u.id}`);
  };

  // Contacts discovery (native only)
  const native = isNativeShell();
  const [contactsStage, setContactsStage] = useState<"idle" | "working" | "done" | "denied" | "error">("idle");
  const [contactMatches, setContactMatches] = useState<SearchUser[]>([]);
  useEffect(() => {
    async function onReady(e: Event) {
      const contacts = (((e as CustomEvent).detail?.contacts ?? []) as Array<{ phones?: string[] }>);
      setContactsStage("working");
      try {
        const phones = new Set<string>();
        for (const c of contacts) for (const p of c.phones ?? []) { const n = normalizePhoneClient(p); if (n) phones.add(n); }
        if (phones.size === 0) { setContactMatches([]); setContactsStage("done"); return; }
        const hashes = await Promise.all(Array.from(phones).map(sha256Hex));
        const m = (await apiRequest("POST", "/api/contacts/match", { hashes })) as { matches: Array<{ userId: number; name: string | null; avatarUrl: string | null }> };
        const seen = new Set<number>();
        const uniq = m.matches.filter((x) => { if (seen.has(x.userId)) return false; seen.add(x.userId); return true; });
        if (uniq.length === 0) { setContactMatches([]); setContactsStage("done"); return; }
        const s = (await apiRequest("POST", "/api/fellows/status", { userIds: uniq.map((x) => x.userId) })) as { statuses: Record<number, SearchUser["status"]> };
        setContactMatches(uniq.map((x) => ({ id: x.userId, name: x.name, avatarUrl: x.avatarUrl, status: s.statuses[x.userId] ?? "none" })));
        setContactsStage("done");
      } catch { setContactsStage("error"); }
    }
    const onDenied = () => setContactsStage("denied");
    const onError = () => setContactsStage("error");
    window.addEventListener("phoebe:contacts-ready", onReady as EventListener);
    window.addEventListener("phoebe:contacts-denied", onDenied);
    window.addEventListener("phoebe:contacts-error", onError as EventListener);
    return () => {
      window.removeEventListener("phoebe:contacts-ready", onReady as EventListener);
      window.removeEventListener("phoebe:contacts-denied", onDenied);
      window.removeEventListener("phoebe:contacts-error", onError as EventListener);
    };
  }, []);
  const startContacts = () => { setContactsStage("working"); window.dispatchEvent(new Event("phoebe:request-contacts")); };

  const sectionHeader = (label: string) => (
    <div className="flex items-center gap-3 mb-2 mt-6">
      <h3 className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{label}</h3>
      <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
    </div>
  );

  const fellowRow = (f: Fellow) => {
    // Walking-together state folded onto the card.
    const w = walkByUser.get(f.userId);
    const p = w?.progress ?? null;
    const locked = !!w?.progressLocked;
    const keptWholeDay = !!p?.allKept;
    // Second line: dots + a status line, mirroring the Walking-together copy.
    const statusLine = !w ? null
      : locked ? t("fellows_c.walk_locked", { defaultValue: "💚 Pray 1:1 to see today" })
      : !p || p.totalCount === 0 ? t("fellows_c.walk_walking", { defaultValue: "Walking with you" })
      : keptWholeDay ? t("fellows_c.walk_all_kept", { defaultValue: "Kept the whole rhythm today 🌿" })
      : t("fellows_c.walk_kept_count", { kept: p.keptCount, total: p.totalCount, defaultValue: `${p.keptCount}/${p.totalCount} kept today` });
    return (
      <div key={`f-${f.userId}`} className="relative flex items-center gap-3 rounded-2xl px-4 py-3 mb-2" style={{ background: CARD_BG, border: `1px solid ${CARD_B}` }}>
        <Avatar name={f.name ?? "Someone"} url={f.avatarUrl} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-[15px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{f.name ?? "Someone"}</p>
          {statusLine && (
            <div className="flex items-center gap-2 mt-0.5">
              {!locked && p && p.anchors.length > 0 && <Dots anchors={p.anchors} />}
              <span className="text-[12px] truncate" style={{ color: SAGE, fontFamily: FONT }}>{statusLine}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {f.streak > 0 && <span className="text-[13px] font-semibold" style={{ color: "#E8B45E", fontFamily: FONT }} title={t("fellows_c.streak_title", { defaultValue: "Prayer rhythm" })}>🔥 {f.streak}</span>}
          {/* Encourage only once they've kept their whole day today. */}
          {keptWholeDay && (encouraged.has(f.userId)
            ? <Pill label={t("fellows_c.encouraged", { defaultValue: "Encouraged 🙌" })} kind="muted" disabled />
            : <Pill label={t("fellows_c.encourage", { defaultValue: "🙌 Encourage" })} kind="solid" onClick={() => sendEncourage(f.userId)} />)}
          {canManage && (
            <button type="button" aria-label={t("fellows_c.settings", { defaultValue: "Sharing settings" })}
              onClick={() => openSettings(f)}
              className="shrink-0 rounded-full flex items-center justify-center transition-opacity active:scale-[0.95]"
              style={{ width: 30, height: 30, background: "rgba(200,212,192,0.08)", border: "1px solid rgba(46,107,64,0.4)", color: "#C8D4C0" }}>
              <Settings2 size={15} />
            </button>
          )}
          <Pill label={t("fellows_c.remove", { defaultValue: "Remove" })} kind="muted" onClick={() => { if (window.confirm(t("fellows_c.remove_confirm", { defaultValue: "Remove this fellow?" }))) remove.mutate(f.userId); }} />
        </div>
      </div>
    );
  };

  // People page: just your fellows, then an "Add a fellow" pill → /fellows
  // (where the full add card lives). The outer section header ("Fellows") is
  // supplied by the People page, so we don't repeat it here.
  if (variant === "people") {
    return (
      <div className="mb-2">
        {fellows.map(fellowRow)}
        {canManage && (
          <Link
            href="/fellows"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 mt-1 text-[13px] font-semibold transition-opacity active:scale-[0.98]"
            style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
          >
            <Plus size={15} /> {t("fellows_c.add_a_fellow", { defaultValue: "Add a fellow" })}
            {requests.length > 0 && (
              <span className="rounded-full px-1.5" style={{ background: "#E8B45E", color: "#0C1F12", fontSize: 11, fontWeight: 700, lineHeight: "16px", minWidth: 16, textAlign: "center" }}>{requests.length}</span>
            )}
          </Link>
        )}
        <FellowSettingsSheet fellow={settingsFellow} onClose={() => setSettingsFellow(null)} />
      </div>
    );
  }

  return (
    <div className="mb-2">
      {/* Share an invite link — send it to anyone (iMessage, etc.); opening it
          and accepting connects you as Fellows. */}
      {canManage && (
        <button
          type="button"
          onClick={shareInviteLink}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 mb-3 text-[14px] font-semibold transition-opacity active:scale-[0.99]"
          style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
        >
          <LinkIcon size={16} /> {linkCopied ? t("fellows_c.invite_copied", { defaultValue: "Link copied!" }) : t("fellows_c.invite_link", { defaultValue: "Share your invite link" })}
        </button>
      )}

      {/* Add a fellow — search + contacts (beta only) */}
      {canManage && (
      <div className="rounded-2xl p-3" style={{ background: CARD_BG, border: `1px solid ${CARD_B}` }}>
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2" color="rgba(143,175,150,0.6)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("fellows_c.search_placeholder", { defaultValue: "Add a fellow — search by name or email…" })}
            className="w-full rounded-full pl-10 pr-4 py-2.5 text-[15px] outline-none"
            style={{ background: "rgba(9,26,16,0.45)", border: `1px solid ${CARD_B}`, color: WARM, fontFamily: FONT }}
          />
        </div>
        {q.trim().length >= 2 && (
          <div className="mt-2.5">
            {searchQ.isLoading ? <p className="text-[13px] px-1 py-1.5" style={{ color: SAGE, fontFamily: FONT }}>{t("fellows_c.searching", { defaultValue: "Searching…" })}</p>
            : results.length === 0 ? <p className="text-[13px] px-1 py-1.5" style={{ color: SAGE, fontFamily: FONT }}>{t("fellows_c.no_results", { defaultValue: "No one found." })}</p>
            : results.map((u) => renderUserRow(u, "s"))}
          </div>
        )}
        {native && q.trim().length < 2 && (
          contactsStage === "idle" ? (
            <>
              <button type="button" onClick={startContacts} className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full py-2.5 text-[13.5px] font-semibold transition-opacity active:scale-[0.99]" style={{ color: "#A8C5A0", fontFamily: FONT }}>
                <Users size={15} /> {t("fellows_c.from_contacts", { defaultValue: "Find from your contacts" })}
              </button>
              {/* Reassure before asking for contacts — matches the Find Friends copy. */}
              <p className="text-[11px] text-center px-3 mt-0.5" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
                {t("fellows_c.contacts_privacy", { defaultValue: "Your contacts stay on your device — we only check encrypted matches, then delete them." })}
              </p>
            </>
          ) : contactsStage === "working" ? <p className="text-[13px] px-1 py-2 mt-1" style={{ color: SAGE, fontFamily: FONT }}>{t("fellows_c.contacts_working", { defaultValue: "Looking through your contacts…" })}</p>
          : contactsStage === "denied" ? <p className="text-[13px] px-1 py-2 mt-1" style={{ color: "#C47A65", fontFamily: FONT }}>{t("fellows_c.contacts_denied", { defaultValue: "Contacts access is off — enable it in Settings to find fellows this way." })}</p>
          : contactsStage === "error" ? <p className="text-[13px] px-1 py-2 mt-1" style={{ color: "#C47A65", fontFamily: FONT }}>{t("fellows_c.contacts_error", { defaultValue: "Couldn't read your contacts. Try again." })}</p>
          : contactMatches.length === 0 ? <p className="text-[13px] px-1 py-2 mt-1" style={{ color: SAGE, fontFamily: FONT }}>{t("fellows_c.contacts_none", { defaultValue: "None of your contacts are on Phoebe yet." })}</p>
          : (
            <div className="mt-2.5">
              <p className="text-[10px] uppercase tracking-[0.14em] mb-1.5 px-1" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>{t("fellows_c.from_contacts_header", { defaultValue: "From your contacts" })}</p>
              {contactMatches.map((u) => renderUserRow(u, "c"))}
            </div>
          )
        )}
      </div>
      )}

      {/* Incoming requests */}
      {canManage && requests.length > 0 && (
        <>
          {sectionHeader(t("fellows_c.requests", { defaultValue: "Requests" }))}
          {requests.map((r) => row(r.name ?? "Someone", r.avatarUrl,
            <div className="flex items-center gap-2 shrink-0">
              <Pill label={t("fellows_c.accept", { defaultValue: "Accept" })} kind="solid" onClick={() => accept.mutate(r.id)} disabled={accept.isPending} />
              <Pill label={t("fellows_c.decline", { defaultValue: "Decline" })} kind="muted" onClick={() => decline.mutate(r.id)} disabled={decline.isPending} />
            </div>, `r-${r.id}`))}
        </>
      )}

      {/* Your fellows */}
      {fellows.length > 0 && (
        <>
          {sectionHeader(t("fellows_c.your_fellows", { defaultValue: "Your fellows" }))}
          {fellows.map((f) => row(f.name ?? "Someone", f.avatarUrl,
            <div className="flex items-center gap-2.5 shrink-0">
              {f.streak > 0 && <span className="text-[13px] font-semibold" style={{ color: "#E8B45E", fontFamily: FONT }} title={t("fellows_c.streak_title", { defaultValue: "Prayer rhythm" })}>🔥 {f.streak}</span>}
              {encouraged.has(f.userId)
                ? <Pill label={t("fellows_c.encouraged", { defaultValue: "Encouraged 🙌" })} kind="muted" disabled />
                : <Pill label={t("fellows_c.encourage", { defaultValue: "🙌 Encourage" })} kind="solid" onClick={() => sendEncourage(f.userId)} />}
              {canManage && (
                <button type="button" aria-label={t("fellows_c.settings", { defaultValue: "Sharing settings" })}
                  onClick={() => openSettings(f)}
                  className="shrink-0 rounded-full flex items-center justify-center transition-opacity active:scale-[0.95]"
                  style={{ width: 30, height: 30, background: "rgba(200,212,192,0.08)", border: "1px solid rgba(46,107,64,0.4)", color: "#C8D4C0" }}>
                  <Settings2 size={15} />
                </button>
              )}
              <Pill label={t("fellows_c.remove", { defaultValue: "Remove" })} kind="muted" onClick={() => { if (window.confirm(t("fellows_c.remove_confirm", { defaultValue: "Remove this fellow?" }))) remove.mutate(f.userId); }} />
            </div>, `f-${f.userId}`))}
        </>
      )}
      <FellowSettingsSheet fellow={settingsFellow} onClose={() => setSettingsFellow(null)} />
    </div>
  );
}
