/**
 * VoiceMemo — record + send an end-to-end-encrypted voice prayer to a fellow
 * (VoiceMemoButton), and listen to ones sent to you (VoiceMemoInbox). Audio is
 * encrypted on-device before upload; the server only ever holds ciphertext, and
 * memos are kept for up to three days so they can be replayed and scrubbed.
 *
 * Flow: tap "Voice" → a calm sheet records up to 144s → Phoebe Studio
 * polishes it ON-DEVICE (studioVoice.ts: warmth, presence, even loudness — like
 * a podcast mic) → the sender A/B's "As recorded" vs "Polished" and picks a
 * voicing → the chosen take is encrypted and sent. The polish runs on the
 * finished recording, before encryption, so the server still only ever sees
 * ciphertext; any polish failure falls back to sending the raw take.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Play, Pause, Square, X, RotateCcw, Circle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { encryptVoice, decryptVoice, voiceSupported, type EncryptedMemo } from "@/lib/voiceCrypto";
import { enhancePcm, decodeToMono48k, pcmToMp3, STUDIO_RATE, studioSupported, type StudioPreset, type EnhanceResult } from "@/lib/studioVoice";
import { saveVoiceDraft, listVoiceDrafts, deleteVoiceDraft, VOICE_DRAFTS_EVENT, type VoiceDraft } from "@/lib/voiceDrafts";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const CLAY = "#C47A65";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const MAX_MS = 144_000; // up to 2 min 24 s
const MAX_SECS = MAX_MS / 1000;
function fmt(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function pickMime(): string | undefined {
  const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  for (const t of types) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* ignore */ } }
  return undefined;
}

// Open the mic for a TRUE/RAW mono capture. We deliberately turn OFF the
// browser's voice processing (noise-suppression, auto-gain, echo-cancellation):
// those make a phone recording sound MUFFLED/under-water, and stacking the
// browser's noise-suppression on top of our own RNNoise double-processed the
// voice into mush. Phoebe Studio does all the cleanup offline (RNNoise + EQ +
// compression + loudness), so it wants the cleanest, brightest signal possible.
// (iOS WKWebView may ignore these and force its own processing — the true fix
// there is a native capture path; this still helps on web/desktop.)
async function openMic(): Promise<{ stream: MediaStream; cleanup: () => void }> {
  const raw = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });
  const cleanup = () => { try { raw.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ } };
  return { stream: raw, cleanup };
}

// ── Phoebe Studio: presets ────────────────────────────────────────────────────
const PRESET_KEY = "phoebe:voice-preset";
const PRESETS: { id: Exclude<StudioPreset, "off">; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "warm", label: "Warm" },
  { id: "radio", label: "Radio" },
  { id: "intimate", label: "Intimate" },
];
function loadPreset(): Exclude<StudioPreset, "off"> {
  try {
    const p = localStorage.getItem(PRESET_KEY);
    if (p && PRESETS.some((x) => x.id === p)) return p as Exclude<StudioPreset, "off">;
  } catch { /* ignore */ }
  return "studio";
}

type Phase = "rec" | "polishing" | "preview" | "sending" | "sent" | "nokey" | "error";

// ── Record + Studio-polish + send to one fellow ──────────────────────────────
// The trigger is the small "Voice" pill; tapping it opens a calm bottom sheet:
// record (up to 144s) → Phoebe Studio polishes ON-DEVICE → a tape-style editor:
// scrub/listen back, A/B "Polished" vs "As recorded", pick a voicing, RECORD
// OVER from any point (punch-in, splices the take), START OVER, SAVE FOR LATER,
// or send. Editing happens on the decoded PCM so a re-take never re-decodes a
// lossy file. Best-effort: any failure falls back to sending the raw take.
export function VoiceMemoButton({ recipientId, recipientName }: { recipientId: number; recipientName: string }) {
  const first = (recipientName ?? "them").trim().split(/\s+/)[0] || "them";
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("rec");
  const [remaining, setRemaining] = useState(MAX_SECS);
  const [budget, setBudget] = useState(MAX_SECS);
  const [preset, setPreset] = useState<Exclude<StudioPreset, "off">>(loadPreset);
  const [polished, setPolished] = useState<EnhanceResult | null>(null);
  const [rePolishing, setRePolishing] = useState(false);
  const [source, setSource] = useState<"polished" | "raw">("polished");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [saved, setSaved] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const micCleanupRef = useRef<(() => void) | null>(null);
  const startedRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const punchRef = useRef(false);     // is the in-flight recording a punch-in?
  const punchAtRef = useRef(0);       // seconds into the take to record over from
  const rawPcmRef = useRef<Float32Array | null>(null); // editable raw take @48k
  const rawMp3Ref = useRef<Blob | null>(null);         // "as recorded" (compact)
  const fallbackBlobRef = useRef<Blob | null>(null);   // no-studio path
  const rawDurRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const srcUrlRef = useRef<{ which: "polished" | "raw"; url: string } | null>(null);

  const revokeSrc = () => { if (srcUrlRef.current) { try { URL.revokeObjectURL(srcUrlRef.current.url); } catch { /* ignore */ } srcUrlRef.current = null; } };
  const teardown = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    try { recRef.current?.stop(); } catch { /* ignore */ } recRef.current = null;
    micCleanupRef.current?.(); micCleanupRef.current = null;
    try { audioRef.current?.pause(); } catch { /* ignore */ } audioRef.current = null;
    revokeSrc();
    busyRef.current = false; punchRef.current = false;
  };
  useEffect(() => () => teardown(), []); // unmount safety

  if (!voiceSupported()) return null;

  const close = () => {
    teardown();
    setOpen(false); setPhase("rec"); setPolished(null); setSource("polished");
    setPlaying(false); setPos(0); setDur(0); setSaved(false);
    rawPcmRef.current = null; rawMp3Ref.current = null; fallbackBlobRef.current = null;
  };

  const sourceBlob = (which: "polished" | "raw"): Blob | null => {
    if (which === "polished") return polished?.blob ?? null;
    return rawMp3Ref.current ?? fallbackBlobRef.current;
  };

  const doSend = async () => {
    const blob = sourceBlob(source) ?? fallbackBlobRef.current;
    if (!blob) { close(); return; }
    setPhase("sending");
    try {
      let pub: { publicKeyJwk: string };
      try { pub = await apiRequest("GET", `/api/keys/public/${recipientId}`); } catch { setPhase("nokey"); return; }
      const enc: EncryptedMemo = await encryptVoice(pub.publicKeyJwk, await blob.arrayBuffer());
      await apiRequest("POST", "/api/voice-memos", { recipientId, ...enc, mimeType: blob.type || "audio/mpeg", durationMs: rawDurRef.current });
      setPhase("sent");
      setTimeout(close, 1400);
    } catch { setPhase("error"); }
  };

  const saveForLater = async () => {
    const blob = sourceBlob(source) ?? polished?.blob ?? fallbackBlobRef.current;
    if (!blob) { close(); return; }
    try { await saveVoiceDraft({ recipientId, recipientName, blob, mimeType: blob.type || "audio/mpeg", durationMs: rawDurRef.current, preset }); } catch { /* ignore */ }
    setSaved(true);
    setTimeout(close, 1100);
  };

  // Studio-polish the editable PCM take for a voicing.
  const polish = async (p: Exclude<StudioPreset, "off">, toPreview: boolean) => {
    if (!rawPcmRef.current) return;
    setRePolishing(true);
    try {
      const res = await enhancePcm(rawPcmRef.current, p, rawDurRef.current);
      setPolished(res);
      if (srcUrlRef.current?.which === "polished") revokeSrc();
      if (toPreview) { setSource("polished"); setPlaying(false); setPos(0); setPhase("preview"); }
    } catch {
      if (toPreview) { setSource("raw"); setPlaying(false); setPos(0); setPhase("preview"); }
    } finally { setRePolishing(false); }
  };

  // Decode the just-recorded blob → editable PCM; on a punch-in, splice it onto
  // the head of the existing take at punchAtRef. Then encode the compact "as
  // recorded" MP3 and run the polish.
  const ingest = async (blob: Blob, durMs: number) => {
    try {
      const newPcm = await decodeToMono48k(blob);
      if (punchRef.current && rawPcmRef.current) {
        const cut = Math.max(0, Math.min(rawPcmRef.current.length, Math.round(punchAtRef.current * STUDIO_RATE)));
        const head = rawPcmRef.current.subarray(0, cut);
        const merged = new Float32Array(head.length + newPcm.length);
        merged.set(head, 0); merged.set(newPcm, head.length);
        rawPcmRef.current = merged;
      } else {
        rawPcmRef.current = newPcm;
      }
      punchRef.current = false;
      rawDurRef.current = Math.round((rawPcmRef.current.length / STUDIO_RATE) * 1000);
      setPhase("polishing");
      try { rawMp3Ref.current = await pcmToMp3(rawPcmRef.current); } catch { rawMp3Ref.current = null; }
      void polish(preset, true);
    } catch {
      // Couldn't decode (e.g. WebAudio hiccup): keep the prior take if any, else
      // fall back to sending the raw recorded blob untouched.
      punchRef.current = false;
      if (rawPcmRef.current) { setPhase("preview"); }
      else { fallbackBlobRef.current = blob; rawDurRef.current = durMs; setSource("raw"); setPhase("preview"); }
    }
  };

  const stopRec = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    try { recRef.current?.stop(); } catch { /* ignore */ }
  };

  const beginRecording = async (punch: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true; punchRef.current = punch;
    try { audioRef.current?.pause(); } catch { /* ignore */ } setPlaying(false);
    setOpen(true); setSaved(false);
    if (!punch) { setPolished(null); rawPcmRef.current = null; rawMp3Ref.current = null; fallbackBlobRef.current = null; punchAtRef.current = 0; }
    const b = punch ? Math.max(2, MAX_SECS - Math.floor(punchAtRef.current)) : MAX_SECS;
    setBudget(b); setRemaining(b); setPhase("rec");
    try {
      const { stream, cleanup } = await openMic();
      micCleanupRef.current = cleanup;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        micCleanupRef.current?.(); micCleanupRef.current = null;
        busyRef.current = false;
        const durMs = Math.min(MAX_MS, Date.now() - startedRef.current);
        const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/mp4" });
        if (blob.size === 0) { punchRef.current = false; if (rawPcmRef.current || fallbackBlobRef.current) setPhase("preview"); else close(); return; }
        if (!studioSupported()) { punchRef.current = false; fallbackBlobRef.current = blob; rawDurRef.current = durMs; void doSend(); return; }
        void ingest(blob, durMs);
      };
      recRef.current = rec; startedRef.current = Date.now(); rec.start();
      tickRef.current = setInterval(() => {
        const sec = (Date.now() - startedRef.current) / 1000;
        setRemaining(Math.max(0, b - sec));
        if (sec >= b) stopRec();
      }, 80);
    } catch {
      busyRef.current = false; punchRef.current = false;
      micCleanupRef.current?.(); micCleanupRef.current = null;
      setPhase(rawPcmRef.current ? "preview" : "error");
    }
  };

  const choosePreset = (p: Exclude<StudioPreset, "off">) => {
    setPreset(p);
    try { localStorage.setItem(PRESET_KEY, p); } catch { /* ignore */ }
    if (p === preset && source === "polished") return;
    setSource("polished");
    void polish(p, false);
  };

  // ── preview player (scrub/listen back, switch take) ──
  const getAudio = (): HTMLAudioElement => {
    if (!audioRef.current) {
      const a = new Audio();
      a.ontimeupdate = () => setPos(a.currentTime);
      a.onloadedmetadata = () => { if (isFinite(a.duration)) setDur(a.duration); };
      a.onplay = () => setPlaying(true);
      a.onpause = () => setPlaying(false);
      a.onended = () => { setPlaying(false); setPos(a.duration || 0); };
      audioRef.current = a;
    }
    return audioRef.current;
  };
  const ensureSrc = (which: "polished" | "raw"): boolean => {
    const a = getAudio();
    if (srcUrlRef.current?.which === which) return true;
    const blob = sourceBlob(which);
    if (!blob) return false;
    revokeSrc();
    const url = URL.createObjectURL(blob);
    srcUrlRef.current = { which, url };
    a.src = url; setPos(0); setDur((rawDurRef.current || 0) / 1000);
    return true;
  };
  const togglePlay = () => {
    const a = getAudio();
    if (!ensureSrc(source)) return;
    if (a.paused) void a.play().catch(() => undefined); else a.pause();
  };
  const seek = (frac: number) => {
    const a = getAudio();
    if (!ensureSrc(source)) return;
    const total = a.duration && isFinite(a.duration) ? a.duration : (rawDurRef.current || 0) / 1000;
    if (total > 0) { a.currentTime = frac * total; setPos(a.currentTime); }
  };
  const switchSource = (which: "polished" | "raw") => {
    if (which === source || !sourceBlob(which)) return;
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    revokeSrc();
    setSource(which); setPlaying(false); setPos(0);
  };
  const recordOver = () => { punchAtRef.current = pos; void beginRecording(true); };

  const r = 32;
  const C = 2 * Math.PI * r;
  const elapsed = budget - remaining;
  const frac = budget > 0 ? elapsed / budget : 0; // ring fills as the time is used

  return (
    <>
      <button type="button" onClick={() => void beginRecording(false)} aria-label={`Send ${first} a voice prayer`}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-opacity active:scale-[0.97]"
        style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}>
        <Mic size={13} /> Voice
      </button>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[60]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: "rgba(6,18,11,0.6)", backdropFilter: "blur(2px)" }}
            onClick={() => { if (phase === "rec" || phase === "preview") close(); }}>
            <motion.div role="dialog" aria-label="Voice prayer"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="z-[61] overflow-y-auto"
              style={{ position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "86vh", background: "#0C2417", borderTop: "1px solid rgba(46,107,64,0.4)", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "10px 20px calc(env(safe-area-inset-bottom) + 22px)", fontFamily: FONT, boxShadow: "0 -8px 40px rgba(0,0,0,0.4)" }}>
              {/* grabber */}
              <div style={{ width: 38, height: 4, borderRadius: 999, background: "rgba(143,175,150,0.4)", margin: "0 auto 16px" }} />
              {/* header */}
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0">
                  <p className="text-[18px] font-semibold" style={{ color: WARM }}>Voice prayer</p>
                  <p className="text-[13px] mt-0.5 truncate" style={{ color: SAGE }}>for {first}</p>
                </div>
                <button type="button" onClick={close} aria-label="Close" className="shrink-0 rounded-full p-1 active:scale-90" style={{ color: "rgba(143,175,150,0.7)" }}>
                  <X size={18} />
                </button>
              </div>

              {phase === "rec" && (
                <div className="flex flex-col items-center py-2">
                  <button type="button" onClick={stopRec} aria-label="Finish recording" className="relative inline-flex items-center justify-center active:scale-95" style={{ width: 92, height: 92 }}>
                    <svg width="92" height="92" viewBox="0 0 92 92" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(196,122,101,0.22)" strokeWidth="4" />
                      <circle cx="46" cy="46" r={r} fill="none" stroke={CLAY} strokeWidth="4" strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: "stroke-dashoffset 80ms linear" }} />
                    </svg>
                    <span className="absolute inline-flex items-center justify-center rounded-full" style={{ width: 54, height: 54, background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)" }}>
                      <Square size={20} fill={WARM} />
                    </span>
                  </button>
                  <p className="mt-4 text-[15px] font-semibold tabular-nums" style={{ color: WARM }}>{fmt(elapsed)} / {fmt(budget)}</p>
                  <p className="mt-1 text-[12px]" style={{ color: SAGE }}>{punchRef.current ? "Recording over — tap to finish" : "Speak from the heart — tap to finish"}</p>
                </div>
              )}

              {phase === "polishing" && (
                <div className="flex flex-col items-center py-8">
                  <motion.span style={{ width: 14, height: 14, borderRadius: 999, background: "#6FAF85" }}
                    animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }} transition={{ duration: 1.1, repeat: Infinity }} />
                  <p className="mt-4 text-[14px] font-semibold" style={{ color: WARM }}>Polishing your prayer…</p>
                  <p className="mt-1 text-[12px]" style={{ color: SAGE }}>Warming it up like a studio mic</p>
                </div>
              )}

              {phase === "preview" && (() => {
                const total = dur > 0 ? dur : (rawDurRef.current || 0) / 1000;
                const pfrac = total > 0 ? Math.min(1, pos / total) : 0;
                return (
                <div className="flex flex-col gap-3.5">
                  {/* player */}
                  <div className="flex items-center gap-2.5">
                    <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}
                      className="shrink-0 rounded-full flex items-center justify-center active:scale-95" style={{ width: 38, height: 38, background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)" }}>
                      {playing ? <Pause size={16} fill={WARM} /> : <Play size={16} fill={WARM} />}
                    </button>
                    <input type="range" min={0} max={1000} value={Math.round(pfrac * 1000)} aria-label="Scrub"
                      onChange={(e) => seek(Number(e.target.value) / 1000)}
                      className="voice-scrub flex-1 cursor-pointer"
                      style={{ background: `linear-gradient(to right, rgba(110,180,130,0.95) ${pfrac * 100}%, rgba(46,107,64,0.22) ${pfrac * 100}%)` }} />
                    <span className="shrink-0 text-[11px] tabular-nums" style={{ color: SAGE, minWidth: 74, textAlign: "right" }}>{clock(pos)} / {clock(total)}</span>
                  </div>
                  {/* A/B source toggle */}
                  <div className="grid grid-cols-2 gap-2">
                    {(["polished", "raw"] as const).map((id) => {
                      const on = source === id;
                      const disabled = id === "polished" && !polished;
                      const label = id === "polished" ? (rePolishing ? "Polishing…" : "Polished 🌿") : "As recorded";
                      return (
                        <button key={id} type="button" disabled={disabled} onClick={() => switchSource(id)}
                          className="rounded-full py-2 text-[12.5px] font-semibold transition-colors active:scale-[0.98]"
                          style={{ background: on ? "rgba(46,107,64,0.85)" : "rgba(46,107,64,0.08)", color: on ? WARM : SAGE, border: `1px solid ${on ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.2)"}`, opacity: disabled ? 0.5 : 1 }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {/* voicing */}
                  <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                    {PRESETS.map((p) => {
                      const on = p.id === preset;
                      return (
                        <button key={p.id} type="button" onClick={() => choosePreset(p.id)}
                          className="shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors active:scale-95"
                          style={{ background: on ? "rgba(46,107,64,0.85)" : "rgba(46,107,64,0.08)", color: on ? WARM : SAGE, border: `1px solid ${on ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.2)"}` }}>
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  {/* tape edits: record over (punch-in) / start over */}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={recordOver}
                      className="flex items-center justify-center gap-1.5 rounded-full py-2 text-[12.5px] font-semibold active:scale-[0.98]"
                      style={{ background: "rgba(200,212,192,0.08)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.4)" }}>
                      <Circle size={10} fill={CLAY} stroke="none" /> {pos > 0.4 ? `Over from ${clock(pos)}` : "Record over"}
                    </button>
                    <button type="button" onClick={() => void beginRecording(false)}
                      className="flex items-center justify-center gap-1.5 rounded-full py-2 text-[12.5px] font-semibold active:scale-[0.98]"
                      style={{ background: "rgba(200,212,192,0.08)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.4)" }}>
                      <RotateCcw size={13} /> Start over
                    </button>
                  </div>
                  {/* send */}
                  <button type="button" onClick={() => void doSend()} disabled={rePolishing}
                    className="w-full rounded-2xl py-3 text-[15px] font-semibold transition-opacity active:scale-[0.99]"
                    style={{ background: "rgba(46,107,64,0.95)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", opacity: rePolishing ? 0.6 : 1 }}>
                    Send 🌿
                  </button>
                  <button type="button" onClick={() => void saveForLater()} className="text-[12px] -mt-1.5 text-center" style={{ color: saved ? "#A8C5A0" : "rgba(143,175,150,0.7)" }}>
                    {saved ? "Saved for later 🌿" : "Save for later"}
                  </button>
                </div>
                );
              })()}

              {phase === "sending" && <p className="text-center py-8 text-[14px]" style={{ color: SAGE }}>Sending…</p>}
              {phase === "sent" && <p className="text-center py-8 text-[15px] font-semibold" style={{ color: WARM }}>It's on its way 🌿</p>}
              {phase === "nokey" && <p className="text-center py-7 text-[13px]" style={{ color: SAGE }}>Ask {first} to open Phoebe once so they can receive it.</p>}
              {phase === "error" && <p className="text-center py-7 text-[13px]" style={{ color: CLAY }}>Something went off — please try again.</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Inbox: voice prayers sent to me — replayable + scrubbable for 3 days ──────
type InMemo = { id: number; senderId: number; name: string | null; avatarUrl: string | null; mimeType: string; durationMs: number; createdAt: string; listenedAt: string | null; expiresAt: string } & EncryptedMemo;

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VoiceMemoInbox() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [failedId, setFailedId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlCache = useRef<Map<number, string>>(new Map());

  const { data } = useQuery<{ memos: InMemo[] }>({
    queryKey: ["/api/voice-memos"],
    queryFn: () => apiRequest("GET", "/api/voice-memos"),
    staleTime: 20_000,
    enabled: voiceSupported(),
  });
  const memos = data?.memos ?? [];

  useEffect(() => () => {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    urlCache.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } });
    urlCache.current.clear();
  }, []);

  if (memos.length === 0) return null;

  const getAudio = (): HTMLAudioElement => {
    if (!audioRef.current) {
      const a = new Audio();
      a.ontimeupdate = () => setPos(a.currentTime);
      a.onloadedmetadata = () => { if (isFinite(a.duration)) setDur(a.duration); };
      a.onplay = () => setPlaying(true);
      a.onpause = () => setPlaying(false);
      a.onended = () => { setPlaying(false); setPos(a.duration || 0); };
      audioRef.current = a;
    }
    return audioRef.current;
  };

  // Decrypt once, cache the object URL so replay + scrub never re-decrypt.
  const ensureUrl = async (m: InMemo): Promise<string> => {
    const hit = urlCache.current.get(m.id);
    if (hit) return hit;
    const buf = await decryptVoice({ ciphertext: m.ciphertext, iv: m.iv, ephemeralPublicJwk: m.ephemeralPublicJwk });
    const url = URL.createObjectURL(new Blob([buf], { type: m.mimeType || "audio/mpeg" }));
    urlCache.current.set(m.id, url);
    return url;
  };

  const markHeard = (m: InMemo) => {
    if (m.listenedAt) return;
    apiRequest("POST", `/api/voice-memos/${m.id}/listened`).catch(() => undefined);
    qc.setQueryData<{ memos: InMemo[] }>(["/api/voice-memos"], (old) =>
      old ? { memos: old.memos.map((x) => (x.id === m.id ? { ...x, listenedAt: new Date().toISOString() } : x)) } : old);
  };

  const load = async (m: InMemo, atFrac = 0): Promise<void> => {
    const a = getAudio();
    setFailedId(null);
    try {
      if (activeId !== m.id) {
        const url = await ensureUrl(m);
        a.src = url;
        setActiveId(m.id);
        setDur((m.durationMs || 0) / 1000);
        setPos(0);
      }
      const total = a.duration && isFinite(a.duration) ? a.duration : (m.durationMs || 0) / 1000;
      if (atFrac > 0 && total > 0) { a.currentTime = atFrac * total; setPos(a.currentTime); }
      await a.play();
      markHeard(m);
    } catch { setFailedId(m.id); }
  };

  const toggle = (m: InMemo) => {
    const a = getAudio();
    if (activeId === m.id) {
      if (a.paused) { void a.play().catch(() => setFailedId(m.id)); }
      else { a.pause(); }
      return;
    }
    void load(m);
  };

  const remove = (m: InMemo) => {
    const a = audioRef.current;
    if (activeId === m.id && a) { try { a.pause(); } catch { /* ignore */ } setActiveId(null); setPlaying(false); }
    const u = urlCache.current.get(m.id);
    if (u) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } urlCache.current.delete(m.id); }
    apiRequest("DELETE", `/api/voice-memos/${m.id}`).catch(() => undefined);
    qc.setQueryData<{ memos: InMemo[] }>(["/api/voice-memos"], (old) =>
      old ? { memos: old.memos.filter((x) => x.id !== m.id) } : old);
  };

  return (
    <div className="mb-5 flex flex-col gap-2">
      <AnimatePresence>
        {memos.map((m) => {
          const first = (m.name ?? "A fellow").trim().split(/\s+/)[0] || "A fellow";
          const active = activeId === m.id;
          const total = active && dur > 0 ? dur : (m.durationMs || 0) / 1000;
          const cur = active ? pos : 0;
          const frac = total > 0 ? Math.min(1, cur / total) : 0;
          const isNew = !m.listenedAt;
          return (
            <motion.div key={m.id}
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="rounded-2xl px-3.5 py-3"
              style={{ background: active ? "rgba(46,107,64,0.22)" : "rgba(46,107,64,0.12)", border: `1px solid ${active ? "rgba(168,197,160,0.7)" : "rgba(46,107,64,0.3)"}` }}>
              <div className="flex items-center gap-3">
                <span className="shrink-0 relative">
                  {m.avatarUrl
                    ? <img src={m.avatarUrl} alt={first} className="rounded-full object-cover" style={{ width: 40, height: 40, border: "1px solid rgba(46,107,64,0.3)" }} />
                    : <div className="rounded-full flex items-center justify-center font-semibold" style={{ width: 40, height: 40, background: "#1A4A2E", color: "#A8C5A0", fontSize: 13, fontFamily: FONT, border: "1px solid rgba(46,107,64,0.3)" }}>{first[0]?.toUpperCase() ?? "?"}</div>}
                  {isNew && <span className="absolute -top-0.5 -right-0.5 rounded-full" style={{ width: 10, height: 10, background: "#6FAF85", border: "2px solid #091A10" }} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{first} sent a voice prayer</p>
                  <p className="text-[12px]" style={{ color: failedId === m.id ? CLAY : SAGE, fontFamily: FONT }}>
                    {failedId === m.id ? "Couldn't open this one" : isNew ? "New · tap to listen" : "Tap to listen back"}
                  </p>
                </div>
                <button type="button" onClick={() => remove(m)} aria-label="Remove" className="shrink-0 rounded-full flex items-center justify-center active:scale-90" style={{ width: 30, height: 30, color: "rgba(143,175,150,0.6)", background: "rgba(200,212,192,0.06)" }}>
                  <X size={15} />
                </button>
              </div>
              {/* player row */}
              <div className="flex items-center gap-2.5 mt-2.5">
                <button type="button" onClick={() => toggle(m)} aria-label={active && playing ? "Pause" : "Play"}
                  className="shrink-0 rounded-full flex items-center justify-center active:scale-95" style={{ width: 34, height: 34, background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)" }}>
                  {active && playing ? <Pause size={15} fill={WARM} /> : <Play size={15} fill={WARM} />}
                </button>
                <input type="range" min={0} max={1000} value={Math.round(frac * 1000)} aria-label="Scrub"
                  onChange={(e) => void load(m, Number(e.target.value) / 1000)}
                  className="voice-scrub flex-1 cursor-pointer"
                  style={{ background: `linear-gradient(to right, rgba(110,180,130,0.95) ${frac * 100}%, rgba(46,107,64,0.22) ${frac * 100}%)` }} />
                <span className="shrink-0 text-[11px] tabular-nums" style={{ color: SAGE, fontFamily: FONT, minWidth: 74, textAlign: "right" }}>
                  {clock(cur)} / {clock(total)}
                </span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ── Saved prayers — drafts kept on-device, ready to send later ────────────────
export function VoiceDraftsShelf() {
  const [drafts, setDrafts] = useState<VoiceDraft[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const reload = () => { listVoiceDrafts().then(setDrafts).catch(() => undefined); };
    reload();
    window.addEventListener(VOICE_DRAFTS_EVENT, reload);
    return () => {
      window.removeEventListener(VOICE_DRAFTS_EVENT, reload);
      try { audioRef.current?.pause(); } catch { /* ignore */ }
      if (urlRef.current) { try { URL.revokeObjectURL(urlRef.current); } catch { /* ignore */ } }
    };
  }, []);

  if (!voiceSupported() || drafts.length === 0) return null;

  const play = (d: VoiceDraft) => {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    if (urlRef.current) { try { URL.revokeObjectURL(urlRef.current); } catch { /* ignore */ } urlRef.current = null; }
    if (playingId === d.id) { setPlayingId(null); return; }
    const url = URL.createObjectURL(d.blob);
    urlRef.current = url;
    const a = new Audio(url);
    audioRef.current = a;
    setPlayingId(d.id);
    const done = () => { if (urlRef.current === url) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } urlRef.current = null; } setPlayingId(null); };
    a.onended = done; a.onerror = done;
    a.play().catch(done);
  };

  const send = async (d: VoiceDraft) => {
    setBusyId(d.id);
    try {
      const pub: { publicKeyJwk: string } = await apiRequest("GET", `/api/keys/public/${d.recipientId}`);
      const enc: EncryptedMemo = await encryptVoice(pub.publicKeyJwk, await d.blob.arrayBuffer());
      await apiRequest("POST", "/api/voice-memos", { recipientId: d.recipientId, ...enc, mimeType: d.mimeType || "audio/mpeg", durationMs: d.durationMs });
      await deleteVoiceDraft(d.id);
    } catch { /* keep the draft so it can be retried */ } finally { setBusyId(null); }
  };

  const remove = (d: VoiceDraft) => {
    if (playingId === d.id) { try { audioRef.current?.pause(); } catch { /* ignore */ } setPlayingId(null); }
    void deleteVoiceDraft(d.id);
  };

  return (
    <div className="mb-5">
      <p className="mb-2" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>Saved prayers</p>
      <div className="flex flex-col gap-2">
        {drafts.map((d) => {
          const first = (d.recipientName ?? "someone").trim().split(/\s+/)[0] || "someone";
          const sec = Math.max(1, Math.round((d.durationMs || 0) / 1000));
          const isPlaying = playingId === d.id;
          return (
            <div key={d.id} className="rounded-2xl px-3.5 py-3 flex items-center gap-3" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)" }}>
              <button type="button" onClick={() => play(d)} aria-label={isPlaying ? "Pause" : "Play"}
                className="shrink-0 rounded-full flex items-center justify-center active:scale-95" style={{ width: 34, height: 34, background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)" }}>
                {isPlaying ? <Pause size={14} fill={WARM} /> : <Play size={14} fill={WARM} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium" style={{ color: WARM, fontFamily: FONT }}>For {first}</p>
                <p className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>Saved · {sec}s · tap to play</p>
              </div>
              <button type="button" onClick={() => void send(d)} disabled={busyId === d.id}
                className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold active:scale-[0.97]"
                style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", opacity: busyId === d.id ? 0.6 : 1 }}>
                {busyId === d.id ? "Sending…" : "Send"}
              </button>
              <button type="button" onClick={() => remove(d)} aria-label="Discard" className="shrink-0 rounded-full flex items-center justify-center active:scale-90" style={{ width: 30, height: 30, color: "rgba(143,175,150,0.6)", background: "rgba(200,212,192,0.06)" }}>
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
