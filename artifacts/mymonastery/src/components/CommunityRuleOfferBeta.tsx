/**
 * CommunityRuleOfferBeta — the one-time "your community keeps a rule of life"
 * offer on the HOME (beta).
 *
 * Closes the signup loop: someone who registered through a community invite
 * routes through onboarding and never sees the join-time rule offer. This
 * surfaces it the first time they land on the home instead — the same
 * CommunityRuleCard (one-tap adopt), wrapped with a quiet eyebrow and a
 * "Not now" that dismisses it for good (per community, device-local).
 * Self-gating: nothing renders unless a joined community actually has a rule.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { CommunityRuleCard } from "@/components/CommunityRuleCard";

type Offer = { slug: string; name: string; label: string | null };

const DISMISS_PREFIX = "phoebe:rule-offer-dismissed:";

function isDismissed(slug: string): boolean {
  try { return localStorage.getItem(`${DISMISS_PREFIX}${slug}`) === "1"; } catch { return false; }
}
function dismiss(slug: string): void {
  try { localStorage.setItem(`${DISMISS_PREFIX}${slug}`, "1"); } catch { /* ignore */ }
}

export function CommunityRuleOfferBeta() {
  const { user } = useAuth();
  const guest = isDeviceLocalGuest(user);
  const [, bump] = useState(0);

  const { data } = useQuery<{ offers: Offer[] }>({
    queryKey: ["/api/me/rule-offers"],
    queryFn: () => apiRequest("GET", "/api/me/rule-offers"),
    enabled: !!user && !guest,
    staleTime: 5 * 60_000,
  });

  if (!user || guest) return null;
  const offer = (data?.offers ?? []).find((o) => !isDismissed(o.slug));
  if (!offer) return null;

  return (
    <div className="mb-4">
      <p
        className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-2 px-0.5"
        style={{ color: "rgba(143,175,150,0.65)", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        From {offer.name}
      </p>
      {/* The card handles the summary + one-tap adopt itself; adopting keeps
          the card (now showing "This is your rhythm now ✓") until dismissed. */}
      <CommunityRuleCard slug={offer.slug} />
      <div className="flex justify-end -mt-1">
        <button
          type="button"
          onClick={() => { dismiss(offer.slug); bump((n) => n + 1); }}
          className="text-[12px] px-1 py-1 transition-opacity active:opacity-60"
          style={{ color: "rgba(143,175,150,0.6)", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
