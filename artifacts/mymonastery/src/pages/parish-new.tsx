import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";

// Self-serve parish creation. Any beta user lands here, names their
// parish, and becomes its first admin (POST /api/parishes wires the
// rest — auto-subscribes them, sets users.parish_feed_id, mints a
// unique slug). On success we drop them straight into /parish/admin
// where they can author today's intercessions + add co-admins.

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const BUTTON_BG = "#2D5E3F";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

export default function ParishNewPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [coverEmoji, setCoverEmoji] = useState("⛪");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!authLoading && !betaLoading && user && !rawIsBeta) setLocation("/dashboard");
  }, [user, authLoading, rawIsBeta, betaLoading, setLocation]);

  if (authLoading || betaLoading || !user || !rawIsBeta) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Your parish needs a name.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/parishes", {
        title: title.trim(),
        tagline: tagline.trim() || undefined,
        coverEmoji: coverEmoji.trim() || undefined,
        timezone: timezone.trim() || undefined,
      });
      // /api/auth/me derives accessTier — refresh so the app picks up
      // the new parish_feed_id immediately. The creator is auto-
      // subscribed on the server, so they're now a parishioner of
      // their own parish too.
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/parish/admin/parishes"] });
      setLocation("/parish/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your parish.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto w-full px-4 pb-24">
        <button
          onClick={() => setLocation("/dashboard")}
          className="text-xs mb-6 inline-flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
        >
          ← Back
        </button>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="text-center mb-7">
            <div className="text-5xl mb-4">⛪</div>
            <h1
              className="text-3xl font-bold mb-2"
              style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, letterSpacing: "-0.02em" }}
            >
              Create your parish
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
              Name your congregation and you're the first admin. You'll publish today's intercessions, see who prays with you each week, and add co-pastors as admins.
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Parish name">
              <input
                type="text"
                placeholder="St. Mary's Episcopal"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(""); }}
                maxLength={80}
                disabled={submitting}
                className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                style={{
                  background: "#0F2818",
                  color: WARM_TEXT,
                  border: "1px solid rgba(46,107,64,0.25)",
                  fontFamily: SPACE_GROTESK,
                }}
              />
            </Field>

            <div className="flex gap-3">
              <Field label="Cover" className="w-20 flex-shrink-0">
                <input
                  type="text"
                  value={coverEmoji}
                  onChange={(e) => setCoverEmoji(e.target.value)}
                  maxLength={8}
                  disabled={submitting}
                  className="w-full px-3 py-3.5 rounded-xl text-base text-center focus:outline-none"
                  style={{
                    background: "#0F2818",
                    color: WARM_TEXT,
                    border: "1px solid rgba(46,107,64,0.25)",
                  }}
                />
              </Field>
              <Field label="Tagline (optional)" className="flex-1">
                <input
                  type="text"
                  placeholder="An Episcopal community in Brooklyn"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  maxLength={200}
                  disabled={submitting}
                  className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                  style={{
                    background: "#0F2818",
                    color: WARM_TEXT,
                    border: "1px solid rgba(46,107,64,0.25)",
                    fontFamily: SPACE_GROTESK,
                  }}
                />
              </Field>
            </div>

            <Field label="Timezone">
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                maxLength={60}
                disabled={submitting}
                className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
                style={{
                  background: "#0F2818",
                  color: WARM_TEXT,
                  border: "1px solid rgba(46,107,64,0.25)",
                  fontFamily: SPACE_GROTESK,
                }}
              />
              <p className="text-[11px] mt-1.5" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
                Sets when "today's intercessions" rolls over and when the Saturday-evening recap fires. Pre-filled from your browser.
              </p>
            </Field>

            {error && (
              <p className="text-sm px-1" style={{ color: "#C47A65", fontFamily: SPACE_GROTESK }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-6 py-3.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 mt-2 flex items-center justify-center"
              style={{ background: BUTTON_BG, color: WARM_TEXT, fontFamily: SPACE_GROTESK }}
            >
              {submitting ? (
                <span className="w-4 h-4 rounded-full border-2 border-[#F0EDE6] border-t-transparent animate-spin" />
              ) : (
                "Create parish"
              )}
            </button>

            <p
              className="text-[12px] text-center mt-3 leading-relaxed"
              style={{ color: FAINT, fontFamily: SPACE_GROTESK }}
            >
              Your parish starts private — share its public link from the manage page when it's ready.
            </p>
          </form>
        </motion.div>
      </div>
    </Layout>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
