import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { openExternal } from "@/lib/openExternal";
import { isNativeIOS } from "@/lib/spotify";
import { appleMusicAvailable, playAppleItem, useAppleMusicPlayback } from "@/lib/appleMusic";
import {
  getSacredLibrary, addToSacredLibrary, removeFromSacredLibrary, parseMusicLink,
  searchCatalog, catalogSearchAvailable, KIND_EMOJI, SERVICE_LABEL,
  SACRED_LIBRARY_EVENT, type SacredItem, type SearchResult,
} from "@/lib/sacredLibrary";

// Your Sacred Library — the streaming experience for Audio Divina. NOT a fixed
// playlist: it's the music YOU choose. Search your Apple Music catalogue (native
// MusicKit), save songs / albums / playlists, and play them IN-APP (their own
// sacred music). Anything we can't play in-app deep-links to the music app.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(46,107,64,0.10)";
const CARD_B = "rgba(46,107,64,0.20)";

function browse(service: "apple" | "spotify"): void {
  try { window.open(service === "apple" ? "music://" : "https://open.spotify.com/search", "_system"); } catch { /* ignore */ }
}

export function SacredLibrary() {
  const [items, setItems] = useState<SacredItem[]>(getSacredLibrary);
  const [adding, setAdding] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<SacredItem | null>(null);
  const apple = useAppleMusicPlayback();

  useEffect(() => {
    const refresh = () => setItems(getSacredLibrary());
    window.addEventListener(SACRED_LIBRARY_EVENT, refresh);
    return () => window.removeEventListener(SACRED_LIBRARY_EVENT, refresh);
  }, []);

  const playItem = async (it: SacredItem) => {
    // In-app for Apple items we have a catalog id for; otherwise open the app.
    if (it.appleId && appleMusicAvailable()) {
      setNowPlaying(it);
      const ok = await playAppleItem(it.appleId, it.kind);
      if (!ok) { setNowPlaying(null); openExternal(it.url); }
      return;
    }
    openExternal(it.url);
  };

  const playing = apple.status === "playing";
  const paused = apple.status === "paused";
  const inAppActive = !!nowPlaying && (playing || paused || apple.status === "connecting");

  return (
    <div className="mb-3 rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${CARD_B}` }}>
      {/* In-app now-playing — the listener's own pick */}
      {inAppActive && nowPlaying && (
        <div className="flex items-center gap-3.5 mb-3.5 pb-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {nowPlaying.artworkUrl ? (
            <img src={nowPlaying.artworkUrl} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(46,107,64,0.35)" }}>
              <span className="text-[24px]" aria-hidden>{playing ? "♪" : "🎧"}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[14.5px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>{nowPlaying.title}</p>
            <p className="text-[12px] mt-0.5 truncate" style={{ color: SAGE, fontFamily: FONT }}>
              {apple.status === "connecting" ? "Starting…" : nowPlaying.subtitle || "Apple Music"}
            </p>
          </div>
          <button onClick={() => (playing ? apple.pause() : apple.resume())} aria-label={playing ? "Pause" : "Play"} className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform" style={{ background: "rgba(46,107,64,0.95)", color: WARM }}>
            <span className="text-[18px]" aria-hidden>{playing ? "❚❚" : "▶"}</span>
          </button>
          <button onClick={() => { apple.disconnect(); setNowPlaying(null); }} aria-label="Stop" className="text-[15px] px-1 flex-shrink-0 active:scale-90" style={{ color: "rgba(143,175,150,0.6)" }}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: SAGE, fontFamily: FONT }}>Your sacred library</p>
        <button onClick={() => setAdding(true)} className="text-[13px] font-medium px-3 py-1 rounded-full active:scale-95 transition-transform" style={{ background: "rgba(46,107,64,0.85)", color: WARM, fontFamily: FONT }}>
          ＋ Add
        </button>
      </div>

      {items.length === 0 ? (
        <div className="py-1">
          <p className="text-[13px] leading-snug mb-3" style={{ color: "rgba(143,175,150,0.85)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
            The music that draws you toward God — find it in Apple Music and save it here.
          </p>
          <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-semibold active:scale-[0.99] transition-transform" style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: FONT }}>
            🔍 Search Apple Music
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const isLive = nowPlaying?.id === it.id && (playing || paused);
            return (
              <div key={it.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: isLive ? "rgba(46,107,64,0.22)" : "rgba(255,255,255,0.04)", border: `1px solid ${isLive ? "rgba(110,180,130,0.4)" : "rgba(255,255,255,0.08)"}` }}>
                <button onClick={() => playItem(it)} className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-80">
                  {it.artworkUrl ? (
                    <img src={it.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-[18px]" style={{ background: "rgba(46,107,64,0.3)" }} aria-hidden>{KIND_EMOJI[it.kind]}</span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: FONT }}>{it.title}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: SAGE, fontFamily: FONT }}>{it.subtitle ? `${it.subtitle} · ` : ""}{SERVICE_LABEL[it.service]}</span>
                  </span>
                  <span className="text-[15px] flex-shrink-0" style={{ color: SAGE }} aria-hidden>{isLive && playing ? "♪" : "▶"}</span>
                </button>
                <button onClick={() => { if (nowPlaying?.id === it.id) { apple.disconnect(); setNowPlaying(null); } removeFromSacredLibrary(it.id); }} aria-label="Remove" className="text-[16px] px-1 flex-shrink-0 active:scale-90" style={{ color: "rgba(143,175,150,0.5)" }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Browse the catalogue in the music app, then come back and save */}
      {isNativeIOS() && (
        <button onClick={() => browse("apple")} className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 mt-3 text-[13px] font-medium active:scale-[0.99] transition-transform" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: WARM, fontFamily: FONT }}>
          Browse Apple Music <span aria-hidden style={{ color: SAGE }}>↗</span>
        </button>
      )}

      <AnimatePresence>{adding && <AddSheet onClose={() => setAdding(false)} />}</AnimatePresence>
    </div>
  );
}

// Add to the library — one input that's both a catalogue search (your Apple
// Music catalogue via MusicKit, or Spotify) and a share-link paste.
function AddSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [canSearch, setCanSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseMusicLink(text), [text]);

  useEffect(() => { catalogSearchAvailable().then(setCanSearch); }, []);
  useEffect(() => { if (parsed) setTitle(parsed.title); }, [parsed]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (parsed || !text.trim()) { setResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const h = window.setTimeout(async () => {
      const r = await searchCatalog(text);
      if (!cancelled) { setResults(r); setSearching(false); }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(h); };
  }, [text, parsed]);

  const savePasted = () => {
    if (!parsed) return;
    addToSacredLibrary({ kind: parsed.kind, title: title || parsed.title, service: parsed.service, url: parsed.url, appleId: parsed.appleId });
    onClose();
  };
  const saveResult = (r: SearchResult) => {
    addToSacredLibrary({ kind: r.kind, title: r.title, subtitle: r.subtitle, service: r.service, url: r.url, artworkUrl: r.artworkUrl, appleId: r.appleId });
    onClose();
  };

  return (
    <motion.div className="fixed inset-0 z-[80] flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ background: "rgba(6,18,12,0.6)" }}>
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="w-full max-w-xl rounded-t-3xl p-5"
        style={{ background: "radial-gradient(120% 90% at 50% 0%, #143524 0%, #0C2417 70%)", border: "1px solid rgba(110,180,130,0.18)", paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "rgba(143,175,150,0.4)" }} />
        <h2 className="text-[18px] font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>Add to your sacred library</h2>
        <p className="text-[12.5px] mb-3.5" style={{ color: SAGE, fontFamily: FONT }}>
          {canSearch ? "Search Apple Music, or paste a link." : "Paste an Apple Music or Spotify link (Share → Copy Link)."}
        </p>

        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={canSearch ? "Search Apple Music, or paste a link…" : "Paste a link…"}
          className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: WARM, fontFamily: "Georgia, serif" }}
        />

        {parsed && (
          <div className="mt-3 rounded-2xl p-3.5" style={{ background: CARD, border: `1px solid ${CARD_B}` }}>
            <p className="text-[11px] uppercase tracking-[0.14em] mb-2" style={{ color: SAGE, fontFamily: FONT }}>
              {KIND_EMOJI[parsed.kind]} {parsed.kind} · {SERVICE_LABEL[parsed.service]}
            </p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name it"
              className="w-full rounded-xl px-3 py-2.5 mb-2.5 text-[14px] outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: WARM, fontFamily: FONT }}
            />
            <button onClick={savePasted} disabled={!title.trim()} className="w-full py-3 rounded-2xl text-[15px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-50" style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: FONT }}>
              Save to library
            </button>
          </div>
        )}

        {!parsed && searching && <p className="mt-3 text-[13px] text-center" style={{ color: SAGE, fontFamily: FONT }}>Searching…</p>}
        {!parsed && !searching && results.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
            {results.map((r, i) => (
              <button key={i} onClick={() => saveResult(r)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left active:scale-[0.99]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {r.artworkUrl ? <img src={r.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" /> : <span className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-[18px]" style={{ background: "rgba(46,107,64,0.3)" }} aria-hidden>{KIND_EMOJI[r.kind]}</span>}
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: FONT }}>{r.title}</span>
                  <span className="block text-[11.5px] truncate" style={{ color: SAGE, fontFamily: FONT }}>{r.subtitle ? `${r.subtitle} · ` : ""}{r.kind}</span>
                </span>
                <span className="text-[18px] flex-shrink-0" style={{ color: SAGE }} aria-hidden>＋</span>
              </button>
            ))}
          </div>
        )}
        {!parsed && !searching && !!text.trim() && results.length === 0 && (
          <p className="mt-3 text-[12.5px] leading-snug text-center" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
            {canSearch ? "Nothing found — try a link instead." : "Open Apple Music, copy a link, and paste it here."}
          </p>
        )}

        <div className="flex gap-2 mt-4">
          {isNativeIOS() && (
            <button onClick={() => browse("apple")} className="flex-1 py-2.5 rounded-2xl text-[13px] font-medium active:scale-[0.98]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: WARM, fontFamily: FONT }}>Apple Music ↗</button>
          )}
          <button onClick={() => browse("spotify")} className="flex-1 py-2.5 rounded-2xl text-[13px] font-medium active:scale-[0.98]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: WARM, fontFamily: FONT }}>Spotify ↗</button>
        </div>
        <button onClick={onClose} className="w-full mt-3 py-2 text-[13px]" style={{ color: SAGE, fontFamily: FONT }}>Done</button>
      </motion.div>
    </motion.div>
  );
}
