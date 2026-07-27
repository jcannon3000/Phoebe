// The office's "Up next" closing card (prayer-mode.tsx's PrayerCompletedSlide),
// pulled out so every practice's closing screen hands off to the next thing in
// the rhythm the SAME way, instead of each slideshow inventing its own look.
// Falls back to the office's own colors via CSS var() defaults, so it reads
// right even outside the office's themed (paper/font) wrapper.
export function WhatsNextCard({
  emoji,
  title,
  blurb,
  cta = "Begin",
  eyebrow = "Up next",
  onGo,
}: {
  emoji: string;
  title: string;
  blurb?: string;
  cta?: string;
  eyebrow?: string;
  onGo: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onGo}
      className="w-full relative flex rounded-2xl overflow-hidden text-left transition-opacity hover:opacity-90 active:scale-[0.98]"
      style={{
        maxWidth: 360,
        cursor: "pointer",
        background: "linear-gradient(180deg, rgba(var(--ot-green, 46,107,64),0.08) 0%, rgba(var(--ot-green, 46,107,64),0.14) 100%)",
        border: "1px solid rgba(var(--ot-green, 46,107,64),0.16)",
      }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: "rgba(110,180,130,0.7)" }} />
      <div className="flex-1 min-w-0 px-4 py-3.5 flex items-center gap-3">
        <span className="text-xl flex-shrink-0" aria-hidden>{emoji}</span>
        <div className="flex-1 min-w-0">
          <p
            className="text-[9.5px] font-semibold leading-none mb-1"
            style={{ color: "var(--oh-sage, #8FAF96)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)", letterSpacing: "0.16em", textTransform: "uppercase" }}
          >
            {eyebrow}
          </p>
          <p className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: "var(--oh-ink, #F0EDE6)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)" }}>
            {title}
          </p>
          {blurb && (
            <p className="text-[12px] mt-0.5 leading-snug truncate" style={{ color: "var(--oh-sage, #8FAF96)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)" }}>
              {blurb}
            </p>
          )}
        </div>
        <span
          className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5 text-center"
          style={{ minWidth: 84, background: "rgba(var(--ot-green, 46,107,64),0.85)", color: "var(--oh-ink, #F0EDE6)", fontFamily: "var(--office-font, 'Space Grotesk', sans-serif)" }}
        >
          {cta} <span aria-hidden>→</span>
        </span>
      </div>
    </button>
  );
}
