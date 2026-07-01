import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import WayOfLoveRuleFlow from "@/components/WayOfLoveRuleFlow";

// ── Pilot rhythm builder ────────────────────────────────────────────────────
// "Create your daily habit of prayer" — the trimmed customizer (morning/evening
// → reflections → silence → one custom anchor). Two audiences:
//   • Signed-in pilot user → builds + saves to their account (WayOfLoveRuleFlow's
//     commit writes office prefs + home layout), then lands on the pilot home.
//   • Logged-out GUEST → builds it too. The flow writes the rhythm to this
//     device's local store as they go (the server PUTs 401 silently). We then
//     send them to sign up "to save it"; the app's existing routine sync
//     (lib/routineSync + homeLayoutCache) migrates the local rhythm up to the
//     brand-new account on first authenticated load. So nothing is lost, and
//     signup is only ever asked FOR SAVING — exactly the intended funnel.
export default function PilotBuildPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const backHref = user ? "/pilot/home" : "/";

  const handleDone = () => {
    if (user) {
      setLocation("/pilot/home");
      return;
    }
    // Guest: the rhythm is already saved on this device — sign up to keep it.
    setLocation("/signin?mode=signup&next=%2Fpilot%2Fhome");
  };

  if (isLoading) return null;

  return (
    <Layout chromeless onClose={() => setLocation(backHref)}>
      <WayOfLoveRuleFlow
        pilot
        onBack={() => setLocation(backHref)}
        onDone={handleDone}
      />
    </Layout>
  );
}
