import { useState } from "react";
import { createPortal } from "react-dom";
import {
  getReadingBook, startReadingBook, logReadingPage,
  type ReadingBook,
} from "@/lib/readingBook";
import { todayLocalISO } from "@/lib/practiceCompletion";

/**
 * The Reading popup — set the book up once, then log a page each day.
 *
 * Owner: "the log can be a pop up … just the simple manual, like, done, and the
 * two things. And there can be a Not today. But in that pop up, instead of
 * Done, it just says what page did you read to? And then they put in … and it
 * has to be limited to numbers."
 *
 * TWO STATES, ONE SHEET:
 *   • no book yet → title / author / how many pages, then Start.
 *   • a book → "What page did you read to?", a number, Log it, Not today.
 *
 * It deliberately does NOT reuse LogSheet's stepper. That stepper logs an
 * AMOUNT ("3 chapters today") and sums it; this asks for an absolute page, and
 * the two cannot share a control without one of them lying about what the
 * number means. See lib/readingBook.ts.
 *
 * NUMBERS ONLY, enforced on the value rather than by trusting the keyboard:
 * inputMode="numeric" only ASKS iOS for a numeric pad — a hardware keyboard, a
 * paste, or a dictated "thirty two" all still deliver text. Stripping
 * non-digits on change is what actually holds the rule the owner set.
 */
export function ReadingBookSheet({
  onClose, onLogged, onSkip, t,
}: {
  onClose: () => void;
  /** Called after a page is logged, so the card can flip to done. */
  onLogged: (book: ReadingBook) => void;
  /** "Not today" — same meaning as every other practice's skip. */
  onSkip: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const existing = getReadingBook();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");
  const [page, setPage] = useState(existing ? String(existing.currentPage || "") : "");

  /** Digits only. See the note above on why the keyboard hint isn't enough. */
  const digits = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 6);

  const FONT = "'Space Grotesk', sans-serif";
  const WARM = "#F0EDE6";
  const SAGE = "#8FAF96";
  const BORDER = "rgba(46,107,64,0.45)";

  const field: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "13px 15px", borderRadius: 14,
    background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
    color: WARM, fontFamily: FONT, fontSize: 16, outline: "none", marginBottom: 10,
  };
  const primary: React.CSSProperties = {
    width: "100%", background: "rgba(46,107,64,0.62)", border: `1px solid rgba(143,175,150,0.6)`,
    color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 15.5, fontWeight: 700,
    fontFamily: FONT, cursor: "pointer", WebkitTapHighlightColor: "transparent",
  };
  const quiet: React.CSSProperties = {
    width: "100%", background: "none", border: "none", color: SAGE, padding: "12px 8px",
    fontSize: 13.5, fontFamily: FONT, cursor: "pointer", WebkitTapHighlightColor: "transparent",
  };

  const startBook = () => {
    const n = parseInt(pages, 10);
    if (!title.trim() || !Number.isFinite(n) || n <= 0) return;
    startReadingBook(title, author, n, todayLocalISO());
    // Straight to the page prompt rather than closing: someone setting the
    // book up has almost certainly just read some of it.
    setPage("");
  };

  const logPage = () => {
    const n = parseInt(page, 10);
    if (!Number.isFinite(n)) return;
    const updated = logReadingPage(n, todayLocalISO());
    if (updated) onLogged(updated);
    onClose();
  };

  const book = existing ?? getReadingBook();

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 120, display: "flex",
        alignItems: "flex-end", justifyContent: "center",
        background: "rgba(4,13,6,0.62)", backdropFilter: "blur(3px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "#0B1E11",
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          border: `1px solid ${BORDER}`, borderBottom: "none",
          padding: "20px 18px calc(env(safe-area-inset-bottom) + 18px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span aria-hidden style={{ fontSize: 22 }}>📚</span>
          <span style={{ color: WARM, fontFamily: FONT, fontSize: 17, fontWeight: 700 }}>
            {book
              ? book.title
              : t("reading.setup_title", { defaultValue: "What are you reading?" })}
          </span>
        </div>

        {!book ? (
          <>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={t("reading.field_title", { defaultValue: "Title" })}
              style={field} autoFocus
            />
            <input
              value={author} onChange={(e) => setAuthor(e.target.value)}
              placeholder={t("reading.field_author", { defaultValue: "Author" })}
              style={field}
            />
            <input
              value={pages} onChange={(e) => setPages(digits(e.target.value))}
              inputMode="numeric" pattern="[0-9]*"
              placeholder={t("reading.field_pages", { defaultValue: "How many pages?" })}
              style={field}
            />
            <button type="button" onClick={startBook} style={{ ...primary, opacity: title.trim() && pages ? 1 : 0.45 }}>
              {t("reading.start", { defaultValue: "Start reading" })}
            </button>
          </>
        ) : (
          <>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14.5, margin: "0 0 12px" }}>
              {t("reading.page_prompt", { defaultValue: "What page did you read to?" })}
            </p>
            <input
              value={page} onChange={(e) => setPage(digits(e.target.value))}
              inputMode="numeric" pattern="[0-9]*"
              placeholder={String(book.currentPage || 1)}
              style={{ ...field, fontSize: 22, fontVariantNumeric: "tabular-nums" }}
              autoFocus
            />
            <p style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT, fontSize: 12, margin: "0 0 14px" }}>
              {t("reading.of_total", { defaultValue: "of {{total}} pages", total: book.totalPages })}
            </p>
            <button type="button" onClick={logPage} style={{ ...primary, opacity: page ? 1 : 0.45 }}>
              {t("reading.log", { defaultValue: "Log it" })}
            </button>
            <button type="button" onClick={() => { onSkip(); onClose(); }} style={quiet}>
              {t("rhythm.not_today", { defaultValue: "Not today" })}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
