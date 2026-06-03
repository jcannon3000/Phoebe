import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

export default function GatheringNewPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { t } = useTranslation();

  const CADENCE_OPTIONS = [
    { value: "weekly", label: t("gathering_new.cadence.weekly") },
    { value: "fortnightly", label: t("gathering_new.cadence.fortnightly") },
    { value: "monthly", label: t("gathering_new.cadence.monthly") },
    { value: "seasonal", label: t("gathering_new.cadence.seasonal") },
  ];
  const DURATION_OPTIONS = [
    { value: 30, label: t("gathering_new.duration.d30") },
    { value: 60, label: t("gathering_new.duration.d60") },
    { value: 90, label: t("gathering_new.duration.d90") },
    { value: 120, label: t("gathering_new.duration.d120") },
    { value: 180, label: t("gathering_new.duration.d180") },
  ];
  const VISIBILITY_OPTIONS = [
    { value: "community", label: t("gathering_new.visibility.community"), description: t("gathering_new.visibility.community_desc") },
    { value: "private", label: t("gathering_new.visibility.private"), description: t("gathering_new.visibility.private_desc") },
    { value: "public", label: t("gathering_new.visibility.public"), description: t("gathering_new.visibility.public_desc") },
  ];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [durationMin, setDurationMin] = useState(60);
  const [expectedSize, setExpectedSize] = useState("");
  const [needsRoom, setNeedsRoom] = useState(false);
  const [needsClergy, setNeedsClergy] = useState(false);
  const [visibility, setVisibility] = useState("community");
  const [communityId, setCommunityId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const { data: groupsData } = useQuery<{ groups: Array<{ id: number; name: string | null; slug: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });
  const groups = groupsData?.groups ?? [];

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gatherings", {
      title: title.trim(),
      description: description.trim() || undefined,
      cadence,
      durationMin,
      expectedSize: expectedSize ? parseInt(expectedSize, 10) : undefined,
      needsRoom,
      needsClergy,
      visibility,
      communityId: communityId ?? undefined,
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/gatherings"] });
      setLocation(`/gatherings/${data.id}`);
    },
    onError: (err: any) => {
      setError(err?.message ?? t("gathering_new.error_generic"));
    },
  });

  if (!user) { setLocation("/"); return null; }

  return (
    <Layout>
      <div className="max-w-lg mx-auto w-full pb-28">

        <div className="mb-6">
          <button
            onClick={() => setLocation("/gatherings")}
            className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "#8FAF96" }}
          >
            <ChevronLeft size={14} /> {t("gathering_new.back")}
          </button>
          <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            {t("gathering_new.title")}
          </h1>
          <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
            {t("gathering_new.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
              {t("gathering_new.f_name")}
            </label>
            <input
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); setError(""); }}
              placeholder={t("gathering_new.name_ph")}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)", color: "#F0EDE6" }}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
              {t("gathering_new.f_description")} <span style={{ opacity: 0.5 }}>{t("gathering_new.optional")}</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t("gathering_new.description_ph")}
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
              style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)", color: "#F0EDE6" }}
            />
          </div>

          {/* Cadence */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(143,175,150,0.6)" }}>
              {t("gathering_new.f_cadence")}
            </label>
            <div className="flex flex-wrap gap-2">
              {CADENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCadence(opt.value)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: cadence === opt.value ? "#2D5E3F" : "rgba(46,107,64,0.08)",
                    color: cadence === opt.value ? "#F0EDE6" : "#8FAF96",
                    border: `1px solid ${cadence === opt.value ? "rgba(46,107,64,0.5)" : "rgba(46,107,64,0.15)"}`,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(143,175,150,0.6)" }}>
              {t("gathering_new.f_duration")}
            </label>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDurationMin(opt.value)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: durationMin === opt.value ? "#2D5E3F" : "rgba(46,107,64,0.08)",
                    color: durationMin === opt.value ? "#F0EDE6" : "#8FAF96",
                    border: `1px solid ${durationMin === opt.value ? "rgba(46,107,64,0.5)" : "rgba(46,107,64,0.15)"}`,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Expected size */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
              {t("gathering_new.f_expected")} <span style={{ opacity: 0.5 }}>{t("gathering_new.optional")}</span>
            </label>
            <input
              type="number"
              value={expectedSize}
              onChange={e => setExpectedSize(e.target.value)}
              placeholder={t("gathering_new.expected_ph")}
              min={2}
              max={500}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)", color: "#F0EDE6" }}
            />
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            {([
              { key: "needsRoom", label: t("gathering_new.needs_room"), value: needsRoom, set: setNeedsRoom },
              { key: "needsClergy", label: t("gathering_new.needs_clergy"), value: needsClergy, set: setNeedsClergy },
            ] as const).map(({ key, label, value, set }) => (
              <div
                key={key}
                className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.12)" }}
              >
                <span className="text-sm" style={{ color: "#C8D4C0" }}>{label}</span>
                <button
                  onClick={() => set(!value)}
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    background: value ? "#2D5E3F" : "rgba(46,107,64,0.2)",
                    border: "none",
                    padding: 0,
                    position: "relative",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 3,
                      left: value ? 20 : 4,
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      background: "#F0EDE6",
                      transition: "left 0.15s",
                    }}
                  />
                </button>
              </div>
            ))}
          </div>

          {/* Visibility */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(143,175,150,0.6)" }}>
              {t("gathering_new.f_visibility")}
            </label>
            <div className="space-y-2">
              {VISIBILITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setVisibility(opt.value)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    background: visibility === opt.value ? "rgba(46,107,64,0.14)" : "rgba(46,107,64,0.06)",
                    border: `1px solid ${visibility === opt.value ? "rgba(46,107,64,0.4)" : "rgba(46,107,64,0.12)"}`,
                  }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{opt.label}</p>
                    <p className="text-xs" style={{ color: "#8FAF96" }}>{opt.description}</p>
                  </div>
                  {visibility === opt.value && (
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#6FAF85" }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Community link */}
          {groups.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                {t("gathering_new.f_community")} <span style={{ opacity: 0.5 }}>{t("gathering_new.optional")}</span>
              </label>
              <select
                value={communityId ?? ""}
                onChange={e => setCommunityId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{
                  background: "rgba(46,107,64,0.08)",
                  border: "1px solid rgba(46,107,64,0.2)",
                  color: communityId ? "#F0EDE6" : "#8FAF96",
                }}
              >
                <option value="">{t("gathering_new.community_none")}</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name ?? g.slug}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-xs" style={{ color: "#C47A65" }}>{error}</p>
          )}

          <button
            onClick={() => createMutation.mutate()}
            disabled={!title.trim() || createMutation.isPending}
            className="w-full py-4 rounded-2xl font-semibold text-base disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            {createMutation.isPending ? t("gathering_new.creating") : t("gathering_new.create")}
          </button>
        </div>
      </div>
    </Layout>
  );
}
