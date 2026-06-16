import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// Landing page for a 1:1 prayer-dialogue invite link (/prayer-dialogue/join/:token).
// A friend shared their personal link; opening it shows who invited you and,
// once you're signed in, a one-tap Accept that starts the Heart to Heart.
//
// Logged-out visitors get the inviter card + a prompt to sign in / create an
// account; we stash the token so they can finish after. (The link also lives in
// their messages, so re-opening it once signed in lands them straight on Accept.)

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const G = "46,107,64";

const PENDING_KEY = "phoebe:pending-prayer-invite";

type InviteLookup = { inviter: { id: number; name: string | null; avatarUrl: string | null } | null; viewerIsOwner: boolean };

export default function PrayerDialogueJoinPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data, isLoading, isError } = useQuery<InviteLookup>({
    queryKey: ["/api/prayer-partner/invite-link", token],
    queryFn: () => apiRequest("GET", `/api/prayer-partner/invite-link/${token}`),
    enabled: /^[a-f0-9]{32}$/i.test(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => apiRequest("POST", `/api/prayer-partner/invite-link/${token}/accept`, {}),
    onSuccess: () => {
      try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
      setLocation("/prayer-partner");
    },
  });

  // Stash the token for a logged-out visitor so the flow can be finished after
  // they create an account / sign in.
  useEffect(() => {
    if (!authLoading && !user && /^[a-f0-9]{32}$/i.test(token)) {
      try { localStorage.setItem(PENDING_KEY, token); } catch { /* ignore */ }
    }
  }, [authLoading, user, token]);

  const inviterName = (data?.inviter?.name ?? "").trim().split(/\s+/)[0] || "A friend";
  const initial = (data?.inviter?.name ?? "?").trim()[0]?.toUpperCase() ?? "?";

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen flex flex-col items-center justify-center px-7 text-center" style={{ background: BG, paddingTop: "calc(var(--safe-top) + 24px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
      <div className="w-full" style={{ maxWidth: 420 }}>{children}</div>
    </div>
  );

  if (!/^[a-f0-9]{32}$/i.test(token) || (isError) || (!isLoading && data && !data.inviter)) {
    return (
      <Shell>
        <p className="text-[40px] mb-3">🕊️</p>
        <p className="text-[17px]" style={{ color: SAGE, fontFamily: FONT }}>
          {t("prayer_dialogue_join.invalid", { defaultValue: "This invite link isn't valid anymore." })}
        </p>
        <button type="button" onClick={() => setLocation(user ? "/dashboard" : "/")} className="mt-6 rounded-full px-7 py-3 text-[15px] font-semibold" style={{ background: `rgba(${G},0.9)`, color: WARM, fontFamily: FONT }}>
          {t("common.home", { defaultValue: "Home" })}
        </button>
      </Shell>
    );
  }

  if (isLoading || authLoading) {
    return <Shell><p className="text-[15px]" style={{ color: SAGE, fontFamily: FONT }}>{t("common.loading", { defaultValue: "Loading…" })}</p></Shell>;
  }

  return (
    <Shell>
      {data?.inviter?.avatarUrl ? (
        <img src={data.inviter.avatarUrl} alt={inviterName} className="w-20 h-20 rounded-full object-cover mx-auto" style={{ border: "2px solid #1A4A2E" }} />
      ) : (
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto text-2xl font-semibold" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>{initial}</div>
      )}
      <h1 className="mt-5 text-[24px] font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
        {t("prayer_dialogue_join.title", { name: inviterName, defaultValue: `${inviterName} invited you to pray together` })}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
        {t("prayer_dialogue_join.subtitle", { defaultValue: "A Heart to Heart — a daily back-and-forth of prayer, just the two of you." })}
      </p>

      {data?.viewerIsOwner ? (
        <p className="mt-7 text-[14px]" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
          {t("prayer_dialogue_join.own_link", { defaultValue: "This is your own invite link — share it with someone to start a Heart to Heart." })}
        </p>
      ) : user ? (
        <>
          <button
            type="button"
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
            className="mt-7 w-full rounded-full px-8 py-3.5 text-[16px] font-semibold active:scale-[0.99] disabled:opacity-60"
            style={{ background: `rgba(${G},0.95)`, color: WARM, border: `1px solid rgba(${G},0.6)`, fontFamily: FONT }}
          >
            {accept.isPending ? t("prayer_dialogue_join.accepting", { defaultValue: "Starting…" }) : t("prayer_dialogue_join.accept", { defaultValue: "Pray together" })}
          </button>
          {accept.isError && (
            <p className="mt-3 text-[13px]" style={{ color: "#E8B872", fontFamily: FONT }}>
              {t("prayer_dialogue_join.accept_failed", { defaultValue: "Couldn't start the dialogue. Please try again." })}
            </p>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="mt-7 w-full rounded-full px-8 py-3.5 text-[16px] font-semibold active:scale-[0.99]"
          style={{ background: `rgba(${G},0.95)`, color: WARM, border: `1px solid rgba(${G},0.6)`, fontFamily: FONT }}
        >
          {t("prayer_dialogue_join.signin", { defaultValue: "Sign in to accept" })} →
        </button>
      )}
    </Shell>
  );
}
