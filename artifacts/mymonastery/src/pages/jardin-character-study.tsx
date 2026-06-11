import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { ShareStudyToGroup } from "@/components/ShareStudyToGroup";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CTA = "#2D5E3F";
const CARD = "rgba(46,107,64,0.10)";
const CARD_B = "rgba(46,107,64,0.22)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Study = {
  id: number; name: string; name_meaning: string; origin: string; time_period: string;
  strengths: string; weaknesses: string; key_events: string; lessons_learned: string; updated_at: string;
};

const empty = (): Omit<Study, "id" | "updated_at"> => ({
  name: "", name_meaning: "", origin: "", time_period: "",
  strengths: "", weaknesses: "", key_events: "", lessons_learned: "",
});

export default function JardinCharacterStudyPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState<Study | "new" | null>(null);
  const [form, setForm] = useState(empty());
  const [confirm, setConfirm] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ studies: Study[] }>({
    queryKey: ["/api/jardin/character-studies"],
    queryFn: () => apiRequest("GET", "/api/jardin/character-studies"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/jardin/character-studies"] });

  const create = useMutation({
    mutationFn: (v: typeof form) => apiRequest("POST", "/api/jardin/character-studies", v),
    onSuccess: () => { invalidate(); setOpen(null); setForm(empty()); },
  });
  const update = useMutation({
    mutationFn: ({ id, ...v }: typeof form & { id: number }) =>
      apiRequest("PUT", `/api/jardin/character-studies/${id}`, v),
    onSuccess: () => { invalidate(); setOpen(null); },
  });
  const del = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/jardin/character-studies/${id}`),
    onSuccess: () => { invalidate(); setConfirm(null); },
  });

  const openNew = () => { setForm(empty()); setOpen("new"); };
  const openEdit = (s: Study) => {
    setForm({ name: s.name, name_meaning: s.name_meaning, origin: s.origin, time_period: s.time_period,
      strengths: s.strengths, weaknesses: s.weaknesses, key_events: s.key_events, lessons_learned: s.lessons_learned });
    setOpen(s);
  };
  const save = () => {
    if (open === "new") create.mutate(form);
    else if (open) update.mutate({ ...form, id: open.id });
  };

  const eyebrow = { color: SAGE_DIM, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const fieldRow = (label: string, placeholder: string, k: keyof typeof form, multi?: boolean) => (
    <div style={{ marginBottom: 14 }}>
      <p style={{ ...eyebrow, margin: "0 0 5px" }}>{label}</p>
      {multi
        ? <textarea value={form[k]} onChange={set(k)} placeholder={placeholder} rows={3}
            style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
              padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, lineHeight: 1.5, resize: "vertical", outline: "none" }} />
        : <input value={form[k]} onChange={set(k)} placeholder={placeholder}
            style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
              padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none" }} />}
    </div>
  );

  if (open !== null) {
    return (
      <Layout>
        <div style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "4px 2px 28px", fontFamily: FONT }}>
          <button type="button" onClick={() => setOpen(null)}
            style={{ background: "none", border: "none", color: SAGE_DIM, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: "0 0 12px" }}>
            ← {t("jardin.back_studies")}
          </button>
          <h1 style={{ color: WARM, fontSize: 21, fontWeight: 700, margin: "0 0 18px" }}>
            {open === "new" ? t("jardin.cs_new") : ((open as Study).name || t("jardin.cs_edit_fallback"))}
          </h1>

          {/* Identity */}
          <p style={{ ...eyebrow, margin: "0 0 10px" }}>{t("jardin.cs_identity")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <p style={{ ...eyebrow, fontSize: 10, margin: "0 0 4px" }}>{t("jardin.cs_name")}</p>
              <input value={form.name} onChange={set("name")} placeholder={t("jardin.cs_ph_name")}
                style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
                  padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none" }} />
            </div>
            <div>
              <p style={{ ...eyebrow, fontSize: 10, margin: "0 0 4px" }}>{t("jardin.cs_name_meaning")}</p>
              <input value={form.name_meaning} onChange={set("name_meaning")} placeholder={t("jardin.cs_ph_name_meaning")}
                style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
                  padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none" }} />
            </div>
            <div>
              <p style={{ ...eyebrow, fontSize: 10, margin: "0 0 4px" }}>{t("jardin.cs_origin")}</p>
              <input value={form.origin} onChange={set("origin")} placeholder={t("jardin.cs_ph_origin")}
                style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
                  padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none" }} />
            </div>
            <div>
              <p style={{ ...eyebrow, fontSize: 10, margin: "0 0 4px" }}>{t("jardin.cs_time_period")}</p>
              <input value={form.time_period} onChange={set("time_period")} placeholder={t("jardin.cs_ph_time_period")}
                style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
                  padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none" }} />
            </div>
          </div>

          {/* Traits */}
          <p style={{ ...eyebrow, margin: "4px 0 10px" }}>{t("jardin.cs_traits")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <p style={{ ...eyebrow, fontSize: 10, margin: "0 0 4px", color: "rgba(143,175,150,0.8)" }}>{t("jardin.cs_strengths")}</p>
              <textarea value={form.strengths} onChange={set("strengths")} placeholder={t("jardin.cs_ph_strengths")} rows={3}
                style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
                  padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, resize: "vertical", outline: "none" }} />
            </div>
            <div>
              <p style={{ ...eyebrow, fontSize: 10, margin: "0 0 4px", color: "rgba(143,175,150,0.8)" }}>{t("jardin.cs_weaknesses")}</p>
              <textarea value={form.weaknesses} onChange={set("weaknesses")} placeholder={t("jardin.cs_ph_weaknesses")} rows={3}
                style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
                  padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, resize: "vertical", outline: "none" }} />
            </div>
          </div>

          {fieldRow(t("jardin.cs_key_events"), t("jardin.cs_ph_key_events"), "key_events", true)}
          {fieldRow(t("jardin.cs_lessons"), t("jardin.cs_ph_lessons"), "lessons_learned", true)}

          <button type="button" onClick={save} disabled={create.isPending || update.isPending}
            style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: CTA, color: WARM,
              border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer",
              opacity: (create.isPending || update.isPending) ? 0.6 : 1 }}>
            {t("common.save")}
          </button>
          <ShareStudyToGroup
            title={form.name || t("jardin.character_study")}
            body={[
              form.name_meaning && `${t("jardin.cs_name_meaning")}: ${form.name_meaning}`,
              form.origin && `${t("jardin.cs_origin")}: ${form.origin}`,
              form.time_period && `${t("jardin.cs_time_period")}: ${form.time_period}`,
              form.strengths && `${t("jardin.cs_strengths")}: ${form.strengths}`,
              form.weaknesses && `${t("jardin.cs_weaknesses")}: ${form.weaknesses}`,
              form.key_events && `${t("jardin.cs_key_events")}: ${form.key_events}`,
              form.lessons_learned && `${t("jardin.cs_lessons")}: ${form.lessons_learned}`,
            ].filter(Boolean).join("\n\n")}
          />
        </div>
      </Layout>
    );
  }

  const studies = data?.studies ?? [];

  return (
    <Layout>
      <div style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "4px 2px 28px", fontFamily: FONT }}>
        <button type="button" onClick={() => setLocation("/menu/jardin")}
          style={{ background: "none", border: "none", color: SAGE_DIM, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: "0 0 12px" }}>
          ← El Jardín
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h1 style={{ color: WARM, fontSize: 22, fontWeight: 700, margin: 0 }}>{t("jardin.character_studies")}</h1>
          <button type="button" onClick={openNew}
            style={{ padding: "8px 18px", borderRadius: 12, background: CTA, color: WARM,
              border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {t("jardin.new_btn")}
          </button>
        </div>

        {isLoading && <p style={{ color: SAGE_DIM, fontFamily: FONT }}>{t("common.loading")}</p>}
        {!isLoading && studies.length === 0 && (
          <p style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 14 }}>{t("jardin.cs_empty")}</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {studies.map((s) => (
            <div key={s.id} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "13px 15px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: WARM, fontSize: 15, fontWeight: 700, margin: "0 0 2px", fontFamily: FONT }}>
                    {s.name || t("jardin.cs_unnamed")}
                    {s.time_period && <span style={{ color: SAGE_DIM, fontWeight: 400, fontSize: 13 }}> · {s.time_period}</span>}
                  </p>
                  {s.name_meaning && <p style={{ color: SAGE, fontSize: 13, margin: "0 0 2px", fontFamily: FONT }}>{s.name_meaning}</p>}
                  {s.lessons_learned && (
                    <p style={{ color: WARM, fontSize: 13, opacity: 0.7, margin: "4px 0 0",
                      fontFamily: "Georgia, serif", fontStyle: "italic",
                      overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                      {s.lessons_learned}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, marginLeft: 10, flexShrink: 0 }}>
                  <button type="button" onClick={() => openEdit(s)}
                    style={{ background: "none", border: "none", color: SAGE, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>{t("jardin.edit")}</button>
                  {confirm === s.id
                    ? <><button type="button" onClick={() => del.mutate(s.id)}
                          style={{ background: "none", border: "none", color: "#E07070", fontSize: 13, cursor: "pointer", fontFamily: FONT }}>{t("jardin.delete_q")}</button>
                        <button type="button" onClick={() => setConfirm(null)}
                          style={{ background: "none", border: "none", color: SAGE_DIM, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>{t("common.cancel")}</button></>
                    : <button type="button" onClick={() => setConfirm(s.id)}
                        style={{ background: "none", border: "none", color: SAGE_DIM, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>×</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
