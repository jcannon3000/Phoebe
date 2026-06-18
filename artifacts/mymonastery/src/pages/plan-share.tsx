import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// Landing page for a shared plan link (/plans/:token). A fellow texted you a
// plan ("How About St Marks Meditation Night, Mon 7:15"); opening it shows the
// plan card and — once you're signed in and a fellow of the host — a one-tap
// RSVP. Logged-out / non-fellow visitors see the card + the right next step.

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const G = "46,107,64";

type Lookup = {
  plan: {
    id: number; title: string; emoji: string | null; location: string | null;
    startsAt: string | null; whenText: string | null;
    host: { name: string | null; avatarUrl: string | null }; comingCount: number;
  };
  viewerIsHost: boolean;
  viewerCanRsvp: boolean;
};

function whenLabel(startsAt: string | null, whenText: string | null): string | null {
  if (startsAt) {
    const d = new Date(startsAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
  }
  return whenText?.trim() || null;
}

export default function PlanSharePage() {
  const { token = "" } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [rsvped, setRsvped] = useState<"coming" | "maybe" | null>(null);

  const valid = /^[a-f0-9]{32}$/i.test(token);
  const { data, isLoading, isError } = useQuery<Lookup>({
    queryKey: ["/api/fellow-plans/share", token],
    queryFn: () => apiRequest("GET", `/api/fellow-plans/share/${token}`),
    enabled: valid,
    retry: false,
  });

  const rsvp = useMutation({
    mutationFn: (status: "coming" | "maybe") => apiRequest("PUT", `/api/fellow-plans/${data!.plan.id}/rsvp`, { status }),
    onSuccess: (_r, status) => setRsvped(status),
  });

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center" style={{ background: BG }}>
      <div className="w-full" style={{ maxWidth: 420 }}>{children}</div>
    </div>
  );

  if (!valid || isError) {
    return <Shell>
      <div style={{ fontSize: 34 }}>🕯️</div>
      <p className="mt-3 text-[16px]" style={{ color: WARM, fontFamily: FONT }}>This plan link isn't available anymore.</p>
      <button onClick={() => setLocation("/dashboard")} className="mt-5 rounded-full px-6 py-2.5 text-[14px] font-semibold" style={{ background: `rgba(${G},0.9)`, color: WARM, border: `1px solid rgba(${G},0.6)`, fontFamily: FONT }}>Open Phoebe</button>
    </Shell>;
  }

  if (isLoading || !data) {
    return <Shell><div className="animate-spin" style={{ width: 26, height: 26, border: "2px solid rgba(143,175,150,0.3)", borderTopColor: "#8FAF96", borderRadius: "50%", margin: "0 auto" }} /></Shell>;
  }

  const p = data.plan;
  const host = (p.host.name ?? "A fellow").trim();
  const hostFirst = host.split(/\s+/)[0];
  const when = whenLabel(p.startsAt, p.whenText);

  return (
    <Shell>
      {/* Host */}
      <div className="flex flex-col items-center mb-5">
        {p.host.avatarUrl
          ? <img src={p.host.avatarUrl} alt={host} className="rounded-full object-cover" style={{ width: 56, height: 56, border: `1px solid rgba(${G},0.4)` }} />
          : <div className="rounded-full flex items-center justify-center font-semibold" style={{ width: 56, height: 56, background: "#1A4A2E", color: "#A8C5A0", fontSize: 22, fontFamily: FONT }}>{host[0]?.toUpperCase() ?? "?"}</div>}
        <p className="text-[13px] mt-3" style={{ color: SAGE, fontFamily: FONT }}>{data.viewerIsHost ? "Your plan" : `${hostFirst} is going to`}</p>
      </div>

      {/* Plan */}
      <p className="text-[22px] font-bold leading-snug" style={{ color: WARM, fontFamily: FONT }}>
        {p.emoji ? p.emoji + " " : ""}{p.title}
      </p>
      {(when || p.location) && (
        <p className="text-[14px] mt-2" style={{ color: "#C8D4C0", fontFamily: FONT }}>
          {[when ? `🗓 ${when}` : null, p.location].filter(Boolean).join("  ·  ")}
        </p>
      )}
      {p.comingCount > 0 && (
        <p className="text-[12.5px] mt-1.5" style={{ color: SAGE, fontFamily: FONT }}>{p.comingCount} {p.comingCount === 1 ? "fellow" : "fellows"} coming</p>
      )}

      {/* Action */}
      <div className="mt-7">
        {data.viewerIsHost ? (
          <button onClick={() => setLocation("/events")} className="w-full rounded-full py-3 text-[15px] font-semibold" style={{ background: `rgba(${G},0.9)`, color: WARM, border: `1px solid rgba(${G},0.6)`, fontFamily: FONT }}>Manage in Phoebe</button>
        ) : rsvped ? (
          <p className="text-[16px] font-semibold" style={{ color: "#A8C5A0", fontFamily: FONT }}>{rsvped === "coming" ? "You're going 🌿" : "Marked maybe"} — <button onClick={() => setLocation("/events")} className="underline" style={{ color: SAGE }}>see your plans</button></p>
        ) : data.viewerCanRsvp ? (
          <div className="flex gap-2.5">
            <button disabled={rsvp.isPending} onClick={() => rsvp.mutate("coming")} className="flex-1 rounded-full py-3 text-[15px] font-semibold disabled:opacity-50" style={{ background: `rgba(${G},0.9)`, color: WARM, border: `1px solid rgba(${G},0.6)`, fontFamily: FONT }}>I'm coming</button>
            <button disabled={rsvp.isPending} onClick={() => rsvp.mutate("maybe")} className="flex-1 rounded-full py-3 text-[15px] font-semibold disabled:opacity-50" style={{ background: "rgba(200,212,192,0.08)", color: "#C8D4C0", border: `1px solid rgba(${G},0.4)`, fontFamily: FONT }}>Maybe</button>
          </div>
        ) : !authLoading && !user ? (
          <>
            <button onClick={() => setLocation("/")} className="w-full rounded-full py-3 text-[15px] font-semibold" style={{ background: `rgba(${G},0.9)`, color: WARM, border: `1px solid rgba(${G},0.6)`, fontFamily: FONT }}>Sign in to join</button>
            <p className="text-[12.5px] mt-2.5" style={{ color: SAGE, fontFamily: FONT }}>Then RSVP and it shows on your calendar.</p>
          </>
        ) : (
          <>
            <button onClick={() => setLocation("/people")} className="w-full rounded-full py-3 text-[15px] font-semibold" style={{ background: `rgba(${G},0.9)`, color: WARM, border: `1px solid rgba(${G},0.6)`, fontFamily: FONT }}>Connect with {hostFirst}</button>
            <p className="text-[12.5px] mt-2.5" style={{ color: SAGE, fontFamily: FONT }}>Become a fellow of {hostFirst} on Phoebe to join their plans.</p>
          </>
        )}
      </div>
    </Shell>
  );
}
