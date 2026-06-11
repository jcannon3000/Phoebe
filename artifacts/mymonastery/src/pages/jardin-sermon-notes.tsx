import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CTA = "#2D5E3F";
const CARD = "rgba(46,107,64,0.10)";
const CARD_B = "rgba(46,107,64,0.22)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Note = {
  id: number; sermon_date: string; preacher: string; title: string;
  scripture: string; content: string; updated_at: string;
};

const empty = (): Omit<Note, "id" | "updated_at"> => ({
  sermon_date: new Date().toISOString().slice(0, 10),
  preacher: "", title: "", scripture: "", content: "",
});

function fmtDate(d: string, locale: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function JardinSermonNotesPage() {
  const [, setLocation] = useLocation();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState<Note | "new" | null>(null);
  const [form, setForm] = useState(empty());
  const [confirm, setConfirm] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ notes: Note[] }>({
    queryKey: ["/api/jardin/sermon-notes"],
    queryFn: () => apiRequest("GET", "/api/jardin/sermon-notes"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/jardin/sermon-notes"] });

  const create = useMutation({
    mutationFn: (v: typeof form) => apiRequest("POST", "/api/jardin/sermon-notes", v),
    onSuccess: () => { invalidate(); setOpen(null); setForm(empty()); },
  });
  const update = useMutation({
    mutationFn: ({ id, ...v }: typeof form & { id: number }) =>
      apiRequest("PUT", `/api/jardin/sermon-notes/${id}`, v),
    onSuccess: () => { invalidate(); setOpen(null); },
  });
  const del = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/jardin/sermon-notes/${id}`),
    onSuccess: () => { invalidate(); setConfirm(null); },
  });

  const openNew = () => { setForm(empty()); setOpen("new"); };
  const openEdit = (n: Note) => {
    setForm({ sermon_date: n.sermon_date, preacher: n.preacher, title: n.title, scripture: n.scripture, content: n.content });
    setOpen(n);
  };

  const save = () => {
    if (open === "new") create.mutate(form);
    else if (open) update.mutate({ ...form, id: open.id });
  };

  const eyebrow = { color: SAGE_DIM, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT };
  const field = (label: string, key: keyof typeof form, multiline?: boolean, placeholder?: string) => (
    <div style={{ marginBottom: 14 }}>
      <p style={{ ...eyebrow, margin: "0 0 5px" }}>{label}</p>
      {multiline
        ? <textarea value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} rows={5}
            placeholder={placeholder}
            style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
              padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, lineHeight: 1.5, resize: "vertical", outline: "none" }} />
        : key === "sermon_date"
          ? <input type="date" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12,
                padding: "10px 13px", color: WARM, fontFamily: FONT, fontSize: 14, outline: "none", colorScheme: "dark" }} />
          : <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
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
            ← {t("jardin.back_notes")}
          </button>
          <h1 style={{ color: WARM, fontSize: 21, fontWeight: 700, margin: "0 0 18px" }}>
            {open === "new" ? t("jardin.sn_new") : t("jardin.sn_edit")}
          </h1>
          {field(t("jardin.sn_date"), "sermon_date")}
          {field(t("jardin.sn_preacher"), "preacher", false, t("jardin.sn_ph_preacher"))}
          {field(t("jardin.sn_title"), "title", false, t("jardin.sn_ph_title"))}
          {field(t("jardin.scripture"), "scripture", false, t("jardin.sn_ph_scripture"))}
          {field(t("jardin.sn_notes"), "content", true, t("jardin.sn_ph_notes"))}
          <button type="button" onClick={save} disabled={create.isPending || update.isPending}
            style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: CTA, color: WARM,
              border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer",
              opacity: (create.isPending || update.isPending) ? 0.6 : 1 }}>
            {t("common.save")}
          </button>
        </div>
      </Layout>
    );
  }

  const notes = data?.notes ?? [];

  return (
    <Layout>
      <div style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "4px 2px 28px", fontFamily: FONT }}>
        <button type="button" onClick={() => setLocation("/menu/jardin")}
          style={{ background: "none", border: "none", color: SAGE_DIM, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: "0 0 12px" }}>
          ← El Jardín
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h1 style={{ color: WARM, fontSize: 22, fontWeight: 700, margin: 0 }}>{t("jardin.sermon_notes")}</h1>
          <button type="button" onClick={openNew}
            style={{ padding: "8px 18px", borderRadius: 12, background: CTA, color: WARM,
              border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {t("jardin.new_btn")}
          </button>
        </div>

        {isLoading && <p style={{ color: SAGE_DIM, fontFamily: FONT }}>{t("common.loading")}</p>}
        {!isLoading && notes.length === 0 && (
          <p style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 14 }}>{t("jardin.sn_empty")}</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "13px 15px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: WARM, fontSize: 15, fontWeight: 700, margin: "0 0 2px", fontFamily: FONT }}>
                    {n.title || t("jardin.sn_untitled")}
                  </p>
                  <p style={{ color: SAGE, fontSize: 13, margin: 0, fontFamily: FONT }}>
                    {[n.preacher, n.scripture, fmtDate(n.sermon_date, i18n.language)].filter(Boolean).join(" · ")}
                  </p>
                  {n.content && (
                    <p style={{ color: WARM, fontSize: 13, opacity: 0.7, margin: "6px 0 0", fontFamily: "Georgia, serif", fontStyle: "italic",
                      overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                      {n.content}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, marginLeft: 10, flexShrink: 0 }}>
                  <button type="button" onClick={() => openEdit(n)}
                    style={{ background: "none", border: "none", color: SAGE, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>{t("jardin.edit")}</button>
                  {confirm === n.id
                    ? <><button type="button" onClick={() => del.mutate(n.id)}
                          style={{ background: "none", border: "none", color: "#E07070", fontSize: 13, cursor: "pointer", fontFamily: FONT }}>{t("jardin.delete_q")}</button>
                        <button type="button" onClick={() => setConfirm(null)}
                          style={{ background: "none", border: "none", color: SAGE_DIM, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>{t("common.cancel")}</button></>
                    : <button type="button" onClick={() => setConfirm(n.id)}
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
