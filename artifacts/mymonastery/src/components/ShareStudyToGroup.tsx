/**
 * Share a Jardín study (Bible study, character study, sermon note) to the
 * forum of one of the user's El Jardín groups. Reuses the forum — the study
 * is posted as a thread the group can read and reply to. Renders nothing if
 * the user isn't in any Jardín group, so it's safe to drop into any study page.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const CARD = "rgba(46,107,64,0.10)";
const CARD_B = "rgba(46,107,64,0.30)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type JGroup = { id: number; slug: string; name: string; emoji: string | null; focus: string | null };

export function ShareStudyToGroup({ title, body }: { title: string; body: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  const { data } = useQuery<{ groups: JGroup[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    staleTime: 60_000,
  });
  const jardinGroups = (data?.groups ?? []).filter((g) => g.focus === "jardin");

  const share = useMutation({
    mutationFn: (slug: string) => apiRequest("POST", `/api/groups/${slug}/forum`, { title: title.trim() || undefined, body: body.trim() }),
    onSuccess: () => { setDone(true); setOpen(false); },
  });

  // The study is empty — nothing to share yet.
  if (!body.trim()) return null;

  // No Jardín group to share into — show a disabled affordance that explains
  // how to unlock sharing, instead of silently rendering nothing (which left
  // users with no idea the feature existed).
  if (jardinGroups.length === 0) {
    return (
      <div className="mt-3">
        <button
          type="button"
          disabled
          className="w-full rounded-xl py-2.5 text-sm font-semibold"
          style={{ background: "transparent", color: "rgba(143,175,150,0.5)", border: "1px solid rgba(46,107,64,0.2)", fontFamily: FONT, cursor: "not-allowed" }}
        >
          📤 {t("jardin.share_to_group")}
        </button>
        <p className="text-center text-[12px] mt-1.5" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
          {t("jardin.share_needs_group", { defaultValue: "Join or create a Jardín group to share your studies." })}
        </p>
      </div>
    );
  }

  if (done) {
    return <p className="text-center text-[13px] mt-3" style={{ color: SAGE, fontFamily: FONT }}>{t("jardin.shared_ok")}</p>;
  }

  const trigger = () => {
    if (jardinGroups.length === 1) share.mutate(jardinGroups[0]!.slug);
    else setOpen((o) => !o);
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={trigger}
        disabled={share.isPending}
        className="w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
        style={{ background: "transparent", color: SAGE, border: `1px solid ${CARD_B}`, fontFamily: FONT, cursor: "pointer" }}
      >
        {share.isPending ? t("jardin.sharing") : `📤 ${t("jardin.share_to_group")}`}
      </button>

      {open && jardinGroups.length > 1 && (
        <div className="mt-2 rounded-xl p-2" style={{ background: CARD, border: `1px solid ${CARD_B}` }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest px-2 py-1" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
            {t("jardin.pick_group")}
          </p>
          {jardinGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => share.mutate(g.slug)}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-opacity hover:opacity-80"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              <span className="text-base">{g.emoji ?? "🌿"}</span>
              <span className="text-sm" style={{ color: WARM, fontFamily: FONT }}>{g.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
