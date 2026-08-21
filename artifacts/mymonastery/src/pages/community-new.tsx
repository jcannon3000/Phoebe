import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

export default function CommunityNewPage() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const { rawIsAdmin: isBuilder } = useBetaStatus();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🏘️");
  // Owner: the Prayer Circle and Contemplation Community options are out of
  // the creation flow — there's no group type to choose. What's left is an
  // OPTIONAL first intention, which every community can hold and which leads
  // its main page. Leaving it blank creates a perfectly normal community; an
  // admin can add intentions later from settings.
  const [intention, setIntention] = useState("");
  const [circleDescription, setCircleDescription] = useState("");

  const EMOJI_OPTIONS = ["🏘️","⛪","✝️","🕊️","🙏🏽","🌿","🌱","🕯️","📖","🫂","💒","🌾","🔔","🫙","🌻","🍃","🏔️","🌊","☀️","🌙"];
  // Localized example intentions for the prayer-circle composer.
  // Kept as a t()-pulled array so each language can riff on what
  // feels natural (the gun-violence framing reads as US-specific in
  // English — Spanish-speaking communities may want different
  // examples eventually).
  const INTENTION_EXAMPLES = [
    t("community_new.intention_example_sick"),
    t("community_new.intention_example_gun_violence"),
    t("community_new.intention_example_neighbors"),
    t("community_new.intention_example_left_church"),
  ];

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
    if (!isLoading && user && !isBuilder) setLocation("/communities");
  }, [user, isLoading, isBuilder, setLocation]);

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/groups", {
      name,
      description: description || undefined,
      emoji,
      intention: intention.trim() || undefined,
      circleDescription: circleDescription.trim() || undefined,
    }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setLocation(`/communities/${data.group.slug}`);
    },
  });

  // Only the name is required now — the intention is optional, so a plain
  // community can be created in one field.
  const canSubmit = name.trim().length > 0 && !createMutation.isPending;

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="max-w-lg mx-auto w-full">
        <button
          onClick={() => setLocation("/communities")}
          className="text-xs mb-4 flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "#8FAF96" }}
        >
          {t("community_new.back")}
        </button>

        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {t("community_new.title")}
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
          {t("community_new.subtitle")}
        </p>

        <div className="space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
              {t("community_new.icon_label")}
            </label>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-4xl w-14 h-14 flex items-center justify-center rounded-2xl flex-shrink-0"
                style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}>
                {emoji}
              </div>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map(e => (
                  <button key={e} onClick={() => setEmoji(e)}
                    className="text-xl w-9 h-9 flex items-center justify-center rounded-xl transition-all"
                    style={{
                      background: emoji === e ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                      border: `1px solid ${emoji === e ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.15)"}`,
                    }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
              {t("community_new.name_label")}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("community_new.name_placeholder")}
              maxLength={100}
              className="w-full px-4 py-3 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
              style={{ color: "#F0EDE6" }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
              {t("community_new.description_label")}
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t("community_new.description_placeholder")}
              maxLength={500}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm resize-none"
              style={{ color: "#F0EDE6" }}
            />
          </div>


          {/* Optional first intention — no longer behind a group-type toggle.
              Blank is fine; it just means the community starts without one. */}
          {(
            <>
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
                  {t("community_new.intention_label")}
                </label>
                <input
                  type="text"
                  value={intention}
                  onChange={e => setIntention(e.target.value)}
                  placeholder={t("community_new.intention_placeholder")}
                  maxLength={500}
                  className="w-full px-4 py-3 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
                  style={{
                    color: "#F0EDE6",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {INTENTION_EXAMPLES.map(ex => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setIntention(ex)}
                      className="text-[11px] italic px-2.5 py-1 rounded-full transition-opacity hover:opacity-80"
                      style={{
                        background: "rgba(46,107,64,0.12)",
                        border: "1px solid rgba(46,107,64,0.25)",
                        color: "rgba(200,212,192,0.8)",
                        fontFamily: "Georgia, 'Times New Roman', serif",
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
                  {t("community_new.about_circle_label")}
                </label>
                <textarea
                  value={circleDescription}
                  onChange={e => setCircleDescription(e.target.value)}
                  placeholder={t("community_new.about_circle_placeholder")}
                  maxLength={2000}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm resize-none"
                  style={{ color: "#F0EDE6" }}
                />
              </div>

            </>
          )}

          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{
              background: "#2D5E3F",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {createMutation.isPending
              ? t("community_new.creating")
              : t("community_new.create_community_button")}
          </button>

          {createMutation.isError && (
            <p className="text-sm text-center" style={{ color: "#E57373" }}>
              {t("community_new.generic_error")}
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
