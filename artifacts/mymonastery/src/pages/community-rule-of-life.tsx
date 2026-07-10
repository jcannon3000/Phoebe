/**
 * Community → Rule of Life requests (BETA, admin/clergy view).
 *
 * Members of a community can ask their leaders for help building a daily prayer
 * routine. This is where the leaders see those asks and respond. The app is the
 * THREAD — the actual discernment is a real conversation with a real person.
 */
import { useMemo } from "react";
import { useParams, useLocation, Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { WEEKLY_PLAN_ENABLED } from "@/lib/weeklyPlanFlag";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Request = {
  id: number;
  status: "requested" | "accepted" | "completed" | "declined";
  note: string | null;
  requestedAt: string;
  userId: number;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CommunityRuleOfLifePage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const { data, isLoading, isError } = useQuery<{ requests: Request[] }>({
    queryKey: [`/api/groups/${slug}/rule-of-life`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/rule-of-life`),
  });
  const respond = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Request["status"] }) =>
      apiRequest("PATCH", `/api/groups/${slug}/rule-of-life/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/rule-of-life`] }); },
  });

  const requests = data?.requests ?? [];
  const open = requests.filter((r) => r.status === "requested" || r.status === "accepted");
  const closed = requests.filter((r) => r.status === "completed" || r.status === "declined");

  const pill = (label: string, onClick: () => void, kind: "solid" | "muted") => (
    <button type="button" onClick={onClick} disabled={respond.isPending}
      className="shrink-0 rounded-full text-[12px] font-semibold px-3 py-1.5 transition-opacity active:scale-[0.97] disabled:opacity-60"
      style={kind === "solid"
        ? { background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }
        : { background: "transparent", color: "rgba(182,210,188,0.6)", border: "1px solid rgba(143,175,150,0.25)", fontFamily: FONT }}>
      {label}
    </button>
  );

  const card = (r: Request) => (
    <div key={r.id} className="rounded-2xl px-4 py-3.5 mb-2" style={{ background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(46,107,64,0.3)" }}>
      <div className="flex items-start gap-3">
        {r.avatarUrl
          ? <img src={r.avatarUrl} alt={r.name ?? ""} className="w-9 h-9 rounded-full object-cover shrink-0" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
          : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>{initials(r.name ?? "?")}</div>}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>{r.name ?? "Someone"}</p>
          <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
            {r.status === "accepted" ? "You said you'd reach out" : r.status === "completed" ? "Completed" : r.status === "declined" ? "Declined" : `Asked ${when(r.requestedAt)}`}
          </p>
          {r.note?.trim() ? <p className="text-[13px] mt-1.5 leading-snug" style={{ color: "rgba(240,237,230,0.82)", fontFamily: FONT }}>{r.note.trim()}</p> : null}
        </div>
      </div>
      {(r.status === "requested" || r.status === "accepted") && (
        <div className="flex items-center gap-2 mt-3 justify-end">
          {r.status === "requested" && pill("We'll help", () => respond.mutate({ id: r.id, status: "accepted" }), "solid")}
          {pill("Mark done", () => respond.mutate({ id: r.id, status: "completed" }), "muted")}
          {pill("Decline", () => respond.mutate({ id: r.id, status: "declined" }), "muted")}
        </div>
      )}
    </div>
  );

  return (
    <Layout bgPhoto={leafBg}>
      <div className="max-w-2xl mx-auto w-full pb-20">
        <button onClick={() => setLocation(`/communities/${slug}`)} className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> Community
        </button>
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>🧭</span>
            <h1 style={{ color: WARM, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", fontFamily: FONT }}>Rule of life</h1>
          </div>
          <p className="text-[13px] mt-1" style={{ color: SAGE, fontFamily: FONT }}>
            Members asking for help building their daily prayer. Reach out and shape a rhythm with them — the app just carries the ask.
          </p>
        </div>

        {/* Design a routine FOR someone and share it as a link (clergy → member). */}
        <button
          type="button"
          onClick={() => setLocation(`/communities/${slug}/prescribe`)}
          className="w-full rounded-2xl mb-3 flex items-center justify-center gap-2 transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{ background: "rgba(46,107,64,0.85)", color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: 15, padding: "14px 20px", border: "1px solid rgba(46,107,64,0.6)" }}
        >
          🧭 Design a routine to share →
        </button>

        {/* The community's SHARED rule of life — one rhythm every member can
            adopt in one tap from the community page (praying WITH each other). */}
        <button
          type="button"
          onClick={() => setLocation(`/communities/${slug}/rule-of-life/set`)}
          className="w-full rounded-2xl mb-3 flex items-center justify-center gap-2 transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{ background: "rgba(46,107,64,0.16)", color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: 15, padding: "14px 20px", border: "1px solid rgba(46,107,64,0.3)" }}
        >
          📿 Set our community's rule of life →
        </button>

        {/* NOT YET PUBLIC (WEEKLY_PLAN_ENABLED) — a checklist of practices the
            whole community keeps between Sundays. */}
        {WEEKLY_PLAN_ENABLED && (
          <button
            type="button"
            onClick={() => setLocation(`/communities/${slug}/weekly-plan`)}
            className="w-full rounded-2xl mb-6 flex items-center justify-center gap-2 transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: "rgba(46,107,64,0.16)", color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: 15, padding: "14px 20px", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            📋 This week's plan →
          </button>
        )}

        {isError ? (
          <p className="text-[13px]" style={{ color: "#C47A65", fontFamily: FONT }}>You need to be a leader of this community to see this.</p>
        ) : isLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "rgba(9,26,16,0.42)" }} />)}</div>
        ) : requests.length === 0 ? (
          <p className="text-[14px] leading-relaxed mt-8 text-center" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
            No one's asked yet. When a member asks for help with their rule of life, they'll appear here.
          </p>
        ) : (
          <>
            {open.map(card)}
            {closed.length > 0 && (
              <>
                <p className="text-[11px] uppercase tracking-[0.16em] font-semibold mt-6 mb-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}>Past</p>
                {closed.map(card)}
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
