/**
 * "Your community keeps a rule of life — would you like to take it up?"
 *
 * Owner: joining a group through its INVITE LINK already offers the rule
 * (community-join.tsx shows CommunityRuleCard on the welcome screen). But
 * every OTHER way into a group — found in the directory, a request-to-join
 * accepted, added by an admin, or the group adopting a rule long after you
 * joined — offered it nowhere. The rule sat on the community page, passive,
 * where nobody thinks to look. This is the missing prompt.
 *
 * Shown once per (group, rule): the key carries the rule's id, so a community
 * that later CHANGES its rule asks again — that's a genuinely new thing to
 * offer, not the same one nagging.
 *
 * It only ever OFFERS. Silently reprogramming someone's rhythm because they
 * joined a group would be the wrong shape entirely — a rule of life is taken
 * up, not assigned.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { CommunityRuleCard } from "@/components/CommunityRuleCard";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Group = {
  slug: string;
  name: string;
  emoji: string | null;
  ruleRoutineId?: number | null;
};

/** Seen-key for one group's CURRENT rule. Changing the rule re-offers it. */
const seenKey = (slug: string, ruleId: number) => `phoebe:group-rule-seen:${slug}:${ruleId}`;

function alreadySeen(slug: string, ruleId: number): boolean {
  try { return localStorage.getItem(seenKey(slug, ruleId)) === "1"; } catch { return false; }
}

/** Mark a group's rule as offered — exported so the JOIN screen, which shows
 *  the same card on its welcome step, can stamp it and stop this prompt from
 *  asking a second time about something already declined there. */
export function markGroupRuleSeen(slug: string, ruleId: number | null | undefined): void {
  if (!ruleId) return;
  try { localStorage.setItem(seenKey(slug, ruleId), "1"); } catch { /* private mode */ }
}

export function GroupRulePrompt() {
  const { data } = useQuery<{ groups: Group[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    staleTime: 5 * 60_000,
  });

  // The first group I'm in that keeps a rule I haven't been offered yet.
  // Resolved once and held: recomputing as the card adopts (which invalidates
  // queries) would swap the sheet's subject mid-interaction.
  const [target, setTarget] = useState<{ slug: string; name: string; emoji: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (target) return;
    const hit = (data?.groups ?? []).find((g) => g.ruleRoutineId && !alreadySeen(g.slug, g.ruleRoutineId));
    if (!hit?.ruleRoutineId) return;
    // Stamped on SHOW, not on dismiss: whichever way this sheet is closed —
    // adopted, "not now", or the app killed mid-look — it has been offered,
    // and an offer that reappears every launch is a nag.
    markGroupRuleSeen(hit.slug, hit.ruleRoutineId);
    setTarget({ slug: hit.slug, name: hit.name, emoji: hit.emoji });
    setOpen(true);
  }, [data, target]);

  if (!target) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 flex items-end sm:items-center justify-center"
          style={{ zIndex: 120, background: "rgba(6,16,10,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl px-5 pt-6"
            style={{
              background: "rgba(12,31,18,0.96)",
              border: "1px solid rgba(200,212,192,0.22)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
              fontFamily: FONT,
            }}
          >
            <div className="text-center mb-4">
              <div className="text-4xl mb-3" aria-hidden>{target.emoji ?? "🏘️"}</div>
              <h2 className="text-xl font-bold" style={{ color: WARM }}>
                {target.name} keeps a rule of life
              </h2>
              <p className="text-[13.5px] mt-2 leading-relaxed" style={{ color: SAGE }}>
                One daily rhythm, prayed together. Take it up if you'd like — you can always shape your own.
              </p>
            </div>

            {/* The same card the community page and the join screen use, so
                "what the rule actually is" and the one-tap adopt are described
                in exactly one place. */}
            <CommunityRuleCard slug={target.slug} />

            <button
              onClick={() => setOpen(false)}
              className="w-full mt-3 py-3 rounded-2xl text-[14px] font-semibold"
              style={{ background: "transparent", color: SAGE, border: "1px solid rgba(200,212,192,0.2)", cursor: "pointer", fontFamily: FONT }}
            >
              Not now
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
