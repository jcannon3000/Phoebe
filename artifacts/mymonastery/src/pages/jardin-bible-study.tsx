import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CTA = "#2D5E3F";
const CARD = "rgba(46,107,64,0.10)";
const CARD_B = "rgba(46,107,64,0.22)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Study = {
  id: number; book_chapter: string; main_theme: string; key_verses: string;
  symbols_keywords: string; application: string; takeaways: string; updated_at: string;
};

const empty = (): Omit<Study, "id" | "updated_at"> => ({
  book_chapter: "", main_theme: "", key_verses: "", symbols_keywords: "", application: "", takeaways: "",
});

export default function JardinBibleStudyPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState<Study | "new" | null>(null);
  const [form, setForm] = useState(empty());
  const [confirm, setConfirm] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ studies: Study[] }>({
    queryKey: ["/api/jardin/bible-studies"],
    queryFn: () => apiRequest("GET", "/api/jardin/bible-studies"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/jardin/bible-studies"] });

  const create = useMutation({
    mutationFn: (v: typeof form) => apiRequest("POST", "/api/jardin/bible-studies", v),
    onSuccess: () => { invalidate(); setOpen(null); setForm(empty()); },
  });
  const update = useMutation({
    mutationFn: ({ id, ...v }: typeof form & { id: number }) =>
      apiRequest("PUT", `/api/jardin/bible-studies/${id}`, v),
    onSuccess: () => { invalidate(); setOpen(null); },
  });
  const del = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/jardin/bible-studies/${id}`),
    onSuccess: () => { invalidate(); setConfirm(null); },
  });

  const openNew = () => { setForm(empty()); setOpen("new"); };
  const openEdit = (s: Study) => {
    setForm({ book_chapter: s.book_chapter, main_theme: s.main_theme, key_verses: s.key_verses,
      symbols_keywords: s.symbols_keywords, application: s.application, takeaways: s.takeaways });
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
            ← Studies
          </button>
          <h1 style={{ color: WARM, fontSize: 21, fontWeight: 700, margin: "0 0 18px" }}>
            {open === "new" ? "New Bible study" : "Edit study"}
          </h1>
          {fieldRow("Book & chapter", "e.g. John 6 or Romans 8", "book_chapter")}
          {fieldRow("Main theme", "What is the central message?", "main_theme")}
          {fieldRow("Key verses", "Which verses stand out? Why?", "key_verses", true)}
          {fieldRow("Symbols & keywords", "Words or images worth digging into", "symbols_keywords", true)}
          {fieldRow("Application", "How does this apply to your life now?", "application", true)}
          {fieldRow("Takeaways", "What are you walking away with?", "takeaways", true)}
          <button type="button" onClick={save} disabled={create.isPending || update.isPending}
            style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: CTA, color: WARM,
              border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer",
              opacity: (create.isPending || update.isPending) ? 0.6 : 1 }}>
            Save
          </button>
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
          <h1 style={{ color: WARM, fontSize: 22, fontWeight: 700, margin: 0 }}>Bible Studies</h1>
          <button type="button" onClick={openNew}
            style={{ padding: "8px 18px", borderRadius: 12, background: CTA, color: WARM,
              border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            + New
          </button>
        </div>

        {isLoading && <p style={{ color: SAGE_DIM, fontFamily: FONT }}>Loading…</p>}
        {!isLoading && studies.length === 0 && (
          <p style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 14 }}>No studies yet — tap + New to begin your first passage study.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {studies.map((s) => (
            <div key={s.id} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "13px 15px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: WARM, fontSize: 15, fontWeight: 700, margin: "0 0 2px", fontFamily: FONT }}>
                    {s.book_chapter || "(no passage)"}
                  </p>
                  {s.main_theme && (
                    <p style={{ color: SAGE, fontSize: 13, margin: 0, fontFamily: FONT }}>{s.main_theme}</p>
                  )}
                  {s.takeaways && (
                    <p style={{ color: WARM, fontSize: 13, opacity: 0.7, margin: "6px 0 0",
                      fontFamily: "Georgia, serif", fontStyle: "italic",
                      overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                      {s.takeaways}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, marginLeft: 10, flexShrink: 0 }}>
                  <button type="button" onClick={() => openEdit(s)}
                    style={{ background: "none", border: "none", color: SAGE, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>Edit</button>
                  {confirm === s.id
                    ? <><button type="button" onClick={() => del.mutate(s.id)}
                          style={{ background: "none", border: "none", color: "#E07070", fontSize: 13, cursor: "pointer", fontFamily: FONT }}>Delete?</button>
                        <button type="button" onClick={() => setConfirm(null)}
                          style={{ background: "none", border: "none", color: SAGE_DIM, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>Cancel</button></>
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
