/**
 * SlideDeckEditor — the leader's slideshow creator for a weekly-plan "deck"
 * item (behind WEEKLY_PLAN_ENABLED). A full-screen overlay opened from the
 * composer's "Edit slides" button: a vertical list of slide cards, each with a
 * type-chip row (Teaching · Scripture · Question · Prompt · Song · Reflection),
 * the type's fields, a live word counter, and up/down/remove. "Preview" plays
 * the real member deck with the draft slides. Authoring budget: a leader on a
 * phone should finish a deck in under 3 minutes.
 */
import { useState } from "react";
import { ChevronLeft, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { WeeklyPlanDeck } from "@/components/WeeklyPlanDeck";
import {
  SLIDE_TYPES,
  DECK_MAX_SLIDES,
  emptySlide,
  slideMainText,
  slideTypeMeta,
  slideIsKeepable,
  wordCount,
  type WeeklyDeckSlide,
  type WeeklySlideType,
} from "@/lib/weeklyDeck";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const CARD = "rgba(9,26,16,0.6)";
const CARD_B = "rgba(46,107,64,0.3)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const AMBER = "#C4A265";
const RED = "#C47A65";

// 16px inputs — anything smaller makes iOS zoom the page on focus.
const fieldStyle: React.CSSProperties = {
  width: "100%", background: "rgba(9,26,16,0.5)", border: "1px solid rgba(46,107,64,0.25)",
  borderRadius: 10, padding: "10px 12px", color: WARM, fontFamily: FONT, fontSize: 16, outline: "none",
};

function AutoArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ ...fieldStyle, resize: "none", lineHeight: 1.45 }}
      onInput={(e) => {
        const el = e.currentTarget;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }}
    />
  );
}

function SlideFields({ slide, onChange }: { slide: WeeklyDeckSlide; onChange: (s: WeeklyDeckSlide) => void }) {
  switch (slide.type) {
    case "teaching":
      return (
        <>
          <input value={slide.heading ?? ""} maxLength={48} onChange={(e) => onChange({ ...slide, heading: e.target.value || undefined })} placeholder="Heading (optional)" style={fieldStyle} />
          <AutoArea value={slide.body} onChange={(v) => onChange({ ...slide, body: v })} placeholder="A short paragraph of teaching or framing…" />
        </>
      );
    case "scripture":
      return (
        <>
          <AutoArea value={slide.passage} onChange={(v) => onChange({ ...slide, passage: v })} placeholder="The passage, written out…" />
          <input value={slide.citation} maxLength={40} onChange={(e) => onChange({ ...slide, citation: e.target.value })} placeholder="John 15:4 (NRSV)" style={fieldStyle} />
        </>
      );
    case "question":
      return (
        <AutoArea value={slide.question} onChange={(v) => onChange({ ...slide, question: v.slice(0, 140) })} placeholder="One question to carry through the week…" rows={2} />
      );
    case "prompt":
      return (
        <>
          <AutoArea value={slide.action} onChange={(v) => onChange({ ...slide, action: v })} placeholder="Something to do — call someone, take a walk, fast a meal…" />
          <input value={slide.hint ?? ""} maxLength={60} onChange={(e) => onChange({ ...slide, hint: e.target.value || undefined })} placeholder="When? (optional — 'before Thursday', 'on your commute')" style={fieldStyle} />
        </>
      );
    case "song":
      return (
        <>
          <input value={slide.title} maxLength={80} onChange={(e) => onChange({ ...slide, title: e.target.value })} placeholder="Song title" style={fieldStyle} />
          <input value={slide.artist ?? ""} maxLength={60} onChange={(e) => onChange({ ...slide, artist: e.target.value || undefined })} placeholder="Artist or composer (optional)" style={fieldStyle} />
          <input value={slide.link ?? ""} maxLength={500} onChange={(e) => onChange({ ...slide, link: e.target.value || undefined })} placeholder="Link to listen (optional)" style={fieldStyle} inputMode="url" />
          <AutoArea value={slide.note ?? ""} onChange={(v) => onChange({ ...slide, note: v || undefined })} placeholder="A word about it (optional — 'we'll sing this Sunday')" rows={2} />
          <p style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 11.5, margin: 0 }}>
            Link to the song rather than pasting lyrics — most hymn texts are under copyright.
          </p>
        </>
      );
    case "reflection":
      return (
        <AutoArea value={slide.body} onChange={(v) => onChange({ ...slide, body: v })} placeholder="A thought to rest in…" />
      );
  }
}

export function SlideDeckEditor({
  title,
  groupName,
  initialSlides,
  onDone,
}: {
  title: string;
  groupName: string | null;
  initialSlides: WeeklyDeckSlide[];
  /** Hands the (possibly empty) draft back to the composer and closes. */
  onDone: (slides: WeeklyDeckSlide[]) => void;
}) {
  const [slides, setSlides] = useState<WeeklyDeckSlide[]>(
    initialSlides.length > 0 ? initialSlides : [emptySlide("teaching")],
  );
  const [previewing, setPreviewing] = useState(false);

  const update = (idx: number, s: WeeklyDeckSlide) => setSlides(slides.map((x, i) => (i === idx ? s : x)));
  const retype = (idx: number, t: WeeklySlideType) => {
    // Keep the main text across a type change where it makes sense.
    const prevText = slideMainText(slides[idx]!);
    const fresh = emptySlide(t);
    const carried: WeeklyDeckSlide =
      t === "teaching" ? { ...fresh as { type: "teaching"; body: string }, body: prevText }
      : t === "reflection" ? { ...fresh as { type: "reflection"; body: string }, body: prevText }
      : t === "question" ? { type: "question", question: prevText.slice(0, 140) }
      : t === "prompt" ? { type: "prompt", action: prevText }
      : t === "scripture" ? { type: "scripture", passage: prevText, citation: "" }
      : fresh;
    setSlides(slides.map((x, i) => (i === idx ? carried : x)));
  };
  const move = (idx: number, d: -1 | 1) => {
    const j = idx + d;
    if (j < 0 || j >= slides.length) return;
    const copy = [...slides];
    [copy[idx], copy[j]] = [copy[j]!, copy[idx]!];
    setSlides(copy);
  };
  const remove = (idx: number) => setSlides(slides.filter((_, i) => i !== idx));

  const keepable = slides.filter(slideIsKeepable);

  if (previewing) {
    return (
      <WeeklyPlanDeck
        title={title || "This week"}
        groupName={groupName}
        slides={keepable.length > 0 ? keepable : [{ type: "teaching", body: "Your slides will appear here as you write them." }]}
        onAmen={() => setPreviewing(false)}
        onClose={() => setPreviewing(false)}
        amenLabel="Back to editing"
      />
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#091A10", overflowY: "auto" }}>
      <div className="max-w-2xl mx-auto w-full px-5 pb-28" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
        {/* Header — Done (saves the draft back) · title · Preview. */}
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => onDone(keepable)}
            className="inline-flex items-center gap-1 text-[15px] font-semibold"
            style={{ color: SAGE, fontFamily: FONT, background: "none", border: "none", cursor: "pointer", padding: "6px 0" }}
          >
            <ChevronLeft size={16} /> Done
          </button>
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            className="text-[14px] font-semibold rounded-full px-4 py-1.5"
            style={{ color: WARM, fontFamily: FONT, background: "rgba(46,107,64,0.25)", border: `1px solid ${CARD_B}`, cursor: "pointer" }}
          >
            Preview
          </button>
        </div>
        <h1 style={{ color: WARM, fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", fontFamily: FONT, marginBottom: 2 }}>
          {title || "Slides"}
        </h1>
        <p className="text-[12.5px] mb-5" style={{ color: SAGE_DIM, fontFamily: FONT }}>
          Up to {DECK_MAX_SLIDES} slides — members see them as a full-screen slideshow, like the office.
        </p>

        <div className="space-y-3">
          {slides.map((slide, idx) => {
            const meta = slideTypeMeta(slide.type);
            const w = wordCount(slideMainText(slide));
            const over = meta.hardWords != null && w > meta.hardWords;
            const warm = !over && meta.suggested != null && w > meta.suggested;
            return (
              <div key={idx} className="rounded-2xl px-4 py-3.5" style={{ background: CARD, border: `1px solid ${over ? "rgba(196,122,101,0.5)" : CARD_B}` }}>
                {/* Type chips. */}
                <div className="flex items-center gap-2 mb-2.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  <span className="shrink-0 rounded-full text-[11px] font-bold w-5 h-5 inline-flex items-center justify-center" style={{ background: "rgba(46,107,64,0.3)", color: SAGE, fontFamily: FONT }}>{idx + 1}</span>
                  {SLIDE_TYPES.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => retype(idx, t.type)}
                      className="shrink-0 rounded-full text-[12px] font-medium px-2.5 py-1"
                      style={{
                        background: slide.type === t.type ? "rgba(143,175,150,0.85)" : "rgba(46,107,64,0.14)",
                        color: slide.type === t.type ? "#0C1F12" : SAGE,
                        border: "none", cursor: "pointer", fontFamily: FONT,
                      }}
                    >
                      {t.chip}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <SlideFields slide={slide} onChange={(s) => update(idx, s)} />
                </div>

                {/* Footer — counter + reorder + remove. */}
                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move up" style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", opacity: idx === 0 ? 0.3 : 1, padding: 4 }}><ChevronUp size={16} /></button>
                    <button type="button" onClick={() => move(idx, 1)} disabled={idx === slides.length - 1} aria-label="Move down" style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", opacity: idx === slides.length - 1 ? 0.3 : 1, padding: 4 }}><ChevronDown size={16} /></button>
                    <button type="button" onClick={() => remove(idx)} aria-label="Remove slide" style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: 4 }}><Trash2 size={15} /></button>
                  </div>
                  {meta.hardWords != null ? (
                    <p className="text-[11.5px]" style={{ color: over ? RED : warm ? AMBER : SAGE_DIM, fontFamily: FONT, margin: 0 }}>
                      {over ? `Too long for one screen — trim to under ${meta.hardWords} words.` : `${w} / ${meta.suggested} words`}
                    </p>
                  ) : slide.type === "question" ? (
                    <p className="text-[11.5px]" style={{ color: SAGE_DIM, fontFamily: FONT, margin: 0 }}>
                      {slide.question.length} / 140
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setSlides([...slides, emptySlide("teaching")])}
          disabled={slides.length >= DECK_MAX_SLIDES}
          className="w-full rounded-2xl mt-3 py-3.5 text-[14px] font-semibold disabled:opacity-50"
          style={{ background: "rgba(46,107,64,0.16)", color: WARM, border: `1px dashed ${CARD_B}`, fontFamily: FONT, cursor: "pointer" }}
        >
          + Add slide
        </button>
        {slides.length >= DECK_MAX_SLIDES && (
          <p className="text-[11.5px] text-center mt-1.5" style={{ color: SAGE_DIM, fontFamily: FONT }}>
            Seven slides is the limit — short is kind.
          </p>
        )}
      </div>
    </div>
  );
}
