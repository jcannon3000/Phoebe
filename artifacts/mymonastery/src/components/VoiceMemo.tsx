/**
 * VoiceMemo — record + send an ephemeral, end-to-end-encrypted voice prayer to
 * a fellow (VoiceMemoButton), and listen to ones sent to you (VoiceMemoInbox).
 * Audio is encrypted on-device before upload and deleted the moment you hear it.
 *
 * Recording is a calm 10-second beat: tap once to begin, a ring counts the ten
 * seconds down, and it sends itself at zero (tap again to send early). The mic
 * is captured with the platform's built-in enhancement — echo cancellation,
 * noise suppression, and auto gain — and, off iOS, lightly compressed so a
 * quiet prayer still carries.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Play } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { encryptVoice, decryptVoice, voiceSupported, type EncryptedMemo } from "@/lib/voiceCrypto";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const CLAY = "#C47A65";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const MAX_MS = 10_000; // a ten-second voice prayer
const MAX_SECS = MAX_MS / 1000;

function isNativeIOS(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return !!cap && typeof cap.getPlatform === "function" && cap.getPlatform() === "ios";
  } catch { return false; }
}

function pickMime(): string | undefined {
  const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  for (const t of types) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* ignore */ } }
  return undefined;
}

// Open the mic with platform audio-enhancement on, and — everywhere the graph
// is reliable (i.e. not iOS native, where a processed MediaStream can record
// silence) — run it through a gentle high-pass + compressor so the level is
// even and warm. Returns the stream to record and a cleanup that frees both
// the raw tracks and the audio graph.
async function openMic(): Promise<{ stream: MediaStream; cleanup: () => void }> {
  const raw = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const stopRaw = () => { try { raw.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ } };

  if (isNativeIOS()) return { stream: raw, cleanup: stopRaw };

  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return { stream: raw, cleanup: stopRaw };
    const ctx = new AC();
    const source = ctx.createMediaStreamSource(raw);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 85; // shed room rumble
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -28; comp.knee.value = 24; comp.ratio.value = 3.5;
    comp.attack.value = 0.005; comp.release.value = 0.25;
    const gain = ctx.createGain();
    gain.gain.value = 1.2; // makeup
    const dest = ctx.createMediaStreamDestination();
    source.connect(hp); hp.connect(comp); comp.connect(gain); gain.connect(dest);
    return {
      stream: dest.stream,
      cleanup: () => { stopRaw(); try { void ctx.close(); } catch { /* ignore */ } },
    };
  } catch {
    return { stream: raw, cleanup: stopRaw };
  }
}

// ── Record + send to one fellow ──────────────────────────────────────────────
export function VoiceMemoButton({ recipientId, recipientName }: { recipientId: number; recipientName: string }) {
  const first = (recipientName ?? "them").trim().split(/\s+/)[0] || "them";
  const [state, setState] = useState<"idle" | "rec" | "sending" | "sent" | "nokey" | "error">("idle");
  const [remaining, setRemaining] = useState(MAX_SECS);
  const recRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const startedRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  if (!voiceSupported()) return null;

  const send = async (blob: Blob, durationMs: number) => {
    setState("sending");
    try {
      let pub: { publicKeyJwk: string };
      try {
        pub = await apiRequest("GET", `/api/keys/public/${recipientId}`);
      } catch { setState("nokey"); setTimeout(() => setState("idle"), 3500); return; }
      const enc: EncryptedMemo = await encryptVoice(pub.publicKeyJwk, await blob.arrayBuffer());
      await apiRequest("POST", "/api/voice-memos", { recipientId, ...enc, mimeType: blob.type || "audio/mp4", durationMs });
      setState("sent");
      setTimeout(() => setState("idle"), 2500);
    } catch { setState("error"); setTimeout(() => setState("idle"), 3000); }
  };

  const stop = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    try { recRef.current?.stop(); } catch { /* ignore */ }
  };

  const start = async () => {
    try {
      const { stream, cleanup } = await openMic();
      cleanupRef.current = cleanup;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        cleanupRef.current?.(); cleanupRef.current = null;
        const durationMs = Math.min(MAX_MS, Date.now() - startedRef.current);
        const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/mp4" });
        if (blob.size > 0) void send(blob, durationMs); else setState("idle");
      };
      recRef.current = rec;
      startedRef.current = Date.now();
      setRemaining(MAX_SECS);
      rec.start();
      setState("rec");
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedRef.current;
        setRemaining(Math.max(0, (MAX_MS - elapsed) / 1000));
        if (elapsed >= MAX_MS) stop();
      }, 80);
    } catch { setState("error"); setTimeout(() => setState("idle"), 3000); }
  };

  if (state === "sent") return <span className="text-[12px] font-semibold" style={{ color: "#A8C5A0", fontFamily: FONT }}>Sent 🌿</span>;
  if (state === "nokey") return <span className="text-[11.5px]" style={{ color: SAGE, fontFamily: FONT }}>Ask {first} to open Phoebe once</span>;
  if (state === "sending") return <span className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>Sending…</span>;

  if (state === "rec") {
    const r = 14;
    const C = 2 * Math.PI * r;
    const frac = remaining / MAX_SECS; // 1 → 0 over the ten seconds
    return (
      <button type="button" onClick={stop} aria-label="Send now" title="Send now"
        className="shrink-0 inline-flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 active:scale-[0.97]"
        style={{ background: "rgba(196,122,101,0.18)", border: "1px solid rgba(196,122,101,0.45)", fontFamily: FONT }}>
        <span className="relative inline-flex items-center justify-center" style={{ width: 34, height: 34 }}>
          <svg width="34" height="34" viewBox="0 0 34 34" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="17" cy="17" r={r} fill="none" stroke="rgba(196,122,101,0.25)" strokeWidth="2.5" />
            <circle cx="17" cy="17" r={r} fill="none" stroke={CLAY} strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: "stroke-dashoffset 80ms linear" }} />
          </svg>
          <motion.span className="absolute" style={{ width: 7, height: 7, borderRadius: 999, background: CLAY }}
            animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 1, repeat: Infinity }} />
        </span>
        <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: WARM }}>{Math.ceil(remaining)}s · send</span>
      </button>
    );
  }

  return (
    <button type="button" onClick={start} aria-label={`Send ${first} a voice prayer`}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-opacity active:scale-[0.97]"
      style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}>
      <Mic size={13} /> Voice
    </button>
  );
}

// ── Inbox: voice prayers sent to me ──────────────────────────────────────────
type InMemo = { id: number; senderId: number; name: string | null; avatarUrl: string | null; mimeType: string; durationMs: number; createdAt: string } & EncryptedMemo;

export function VoiceMemoInbox() {
  const qc = useQueryClient();
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0); // 0..1 for the playing memo
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { data } = useQuery<{ memos: InMemo[] }>({
    queryKey: ["/api/voice-memos"],
    queryFn: () => apiRequest("GET", "/api/voice-memos"),
    staleTime: 20_000,
    enabled: voiceSupported(),
  });
  const memos = data?.memos ?? [];

  useEffect(() => () => { try { audioRef.current?.pause(); } catch { /* ignore */ } }, []);

  if (memos.length === 0) return null;

  const play = async (m: InMemo) => {
    if (playingId) return; // one at a time
    setPlayingId(m.id);
    setProgress(0);
    try {
      const buf = await decryptVoice({ ciphertext: m.ciphertext, iv: m.iv, ephemeralPublicJwk: m.ephemeralPublicJwk });
      const url = URL.createObjectURL(new Blob([buf], { type: m.mimeType || "audio/mp4" }));
      const audio = new Audio(url);
      audioRef.current = audio;
      const cleanup = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setPlayingId(null);
        setProgress(0);
        // Heard it → delete from the server, then drop from the list.
        apiRequest("POST", `/api/voice-memos/${m.id}/listened`).catch(() => undefined)
          .finally(() => qc.invalidateQueries({ queryKey: ["/api/voice-memos"] }));
      };
      audio.ontimeupdate = () => {
        const d = audio.duration && isFinite(audio.duration) ? audio.duration : (m.durationMs || 1) / 1000;
        if (d > 0) setProgress(Math.min(1, audio.currentTime / d));
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch { audioRef.current = null; setPlayingId(null); setProgress(0); }
  };

  return (
    <div className="mb-5 flex flex-col gap-2">
      <AnimatePresence>
        {memos.map((m) => {
          const first = (m.name ?? "A fellow").trim().split(/\s+/)[0] || "A fellow";
          const sec = Math.max(1, Math.round((m.durationMs || 0) / 1000));
          const isPlaying = playingId === m.id;
          return (
            <motion.button key={m.id} type="button" onClick={() => play(m)} disabled={playingId !== null && !isPlaying}
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="relative w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left overflow-hidden active:scale-[0.99]"
              style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(111,175,133,0.4)" }}>
              {/* playback progress wash */}
              {isPlaying && (
                <span aria-hidden className="absolute inset-y-0 left-0 pointer-events-none"
                  style={{ width: `${progress * 100}%`, background: "rgba(46,107,64,0.35)", transition: "width 120ms linear" }} />
              )}
              <span className="relative z-10 shrink-0">
                {m.avatarUrl
                  ? <img src={m.avatarUrl} alt={first} className="rounded-full object-cover" style={{ width: 34, height: 34 }} />
                  : <div className="rounded-full flex items-center justify-center font-semibold" style={{ width: 34, height: 34, background: "#1A4A2E", color: "#A8C5A0", fontSize: 13, fontFamily: FONT }}>{first[0]?.toUpperCase() ?? "?"}</div>}
              </span>
              <div className="relative z-10 flex-1 min-w-0">
                <p className="text-[14px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{first} sent a voice prayer</p>
                <p className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>{isPlaying ? "Playing… it fades after this" : `Tap to listen · ${sec}s · then it's gone`}</p>
              </div>
              <span className="relative z-10 shrink-0 rounded-full flex items-center justify-center" style={{ width: 34, height: 34, background: "rgba(46,107,64,0.85)", color: WARM }}>
                {isPlaying
                  ? <span className="inline-flex items-end gap-[2px]" style={{ height: 14 }}>
                      {[0, 1, 2].map((i) => (
                        <motion.span key={i} style={{ width: 3, background: WARM, borderRadius: 2 }}
                          animate={{ height: [4, 13, 4] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }} />
                      ))}
                    </span>
                  : <Play size={15} />}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
