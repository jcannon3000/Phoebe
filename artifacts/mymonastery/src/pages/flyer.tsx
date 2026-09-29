import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { isNativeShell } from "@/lib/isNativeShell";

// ── A flyer for the parish ──────────────────────────────────────────────────
//
// Owner, 2026-09-28: "we will also want a way where parishes could generate a
// pdf with the QR code that is a page that explains phoebe and invites people
// to cultivate a daily habit of prayer".
//
// One letter-size page: the parish's name (optional), the invitation, a short
// word on what Phoebe is, a note of their own (optional), and a large QR code
// to withphoebe.app. It is DRAWN on a canvas at print resolution and wrapped in
// a one-page PDF written here (a single JPEG on a 612×792 pt page), so there
// is no PDF library to ship and what is previewed is exactly what prints.
//
// White paper, green ink: a home printer can't print to the edge, and a dark
// full-bleed page empties the cartridge.

const APP_URL = "https://withphoebe.app";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const INK = "#10231A";
const GREEN = "#2E6B40";

// Letter at 200 dpi: crisp in print, a few hundred KB as a JPEG.
const W = 1700;
const H = 2200;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draw the flyer. Everything is laid out top to bottom from `y`. */
async function drawFlyer(canvas: HTMLCanvasElement, qr: HTMLCanvasElement | null, parish: string, note: string) {
  try { await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* fallback font */ }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = W; canvas.height = H;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  const M = 150; // margin
  const col = W - 2 * M;
  ctx.textBaseline = "alphabetic";

  // Masthead: the app icon and the name.
  const icon = await loadImage("/phoebe-app-icon.png");
  let y = 190;
  if (icon) {
    const s = 96;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(M, y - 76, s, s, 22);
    ctx.clip();
    ctx.drawImage(icon, M, y - 76, s, s);
    ctx.restore();
  }
  ctx.fillStyle = INK;
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText("Phoebe", M + (icon ? 124 : 0), y);
  y += 70;
  ctx.fillStyle = "rgba(16,35,26,0.14)";
  ctx.fillRect(M, y, col, 3);
  y += 130;

  // Who is inviting.
  if (parish.trim()) {
    ctx.fillStyle = GREEN;
    ctx.font = `600 40px ${FONT}`;
    for (const line of wrap(ctx, `${parish.trim().toUpperCase()} INVITES YOU`, col)) {
      ctx.fillText(line, M, y);
      y += 56;
    }
    // The headline's cap height sits ~95px above its baseline: clear it.
    y += 110;
  }

  // The invitation.
  ctx.fillStyle = INK;
  ctx.font = `700 118px ${FONT}`;
  for (const line of wrap(ctx, "Cultivate a daily habit of prayer.", col)) {
    ctx.fillText(line, M, y);
    y += 128;
  }
  y += 18;
  ctx.fillStyle = GREEN;
  ctx.font = `500 50px ${FONT}`;
  for (const line of wrap(ctx, "Find stability in our turbulent world through monastic wisdom.", col)) {
    ctx.fillText(line, M, y);
    y += 66;
  }
  y += 46;

  // What Phoebe is.
  ctx.fillStyle = "rgba(16,35,26,0.8)";
  ctx.font = `400 40px ${FONT}`;
  const about = "Phoebe walks you through a daily rhythm of prayer, one step at a time: the Daily Office from the Book of Common Prayer, the day's readings, silence, and many other ways to pray, on your phone or on the web.";
  for (const line of wrap(ctx, about, col)) {
    ctx.fillText(line, M, y);
    y += 58;
  }

  // The parish's own note, set off in italic.
  if (note.trim()) {
    y += 40;
    ctx.fillStyle = GREEN;
    const lines = (() => { ctx.font = `italic 400 42px Georgia, 'Times New Roman', serif`; return wrap(ctx, note.trim(), col - 40); })();
    ctx.fillRect(M, y - 40, 6, lines.length * 60 + 4);
    ctx.fillStyle = INK;
    for (const line of lines) {
      ctx.fillText(line, M + 40, y);
      y += 60;
    }
  }

  // The QR code, large, with where it goes. Anchored to the foot of the page.
  const qrSize = 560;
  const qrTop = H - 150 - qrSize;
  const qrX = (W - qrSize) / 2;
  if (qr) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, qrX, qrTop, qrSize, qrSize);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText("Scan to begin", W / 2, qrTop - 36);
  ctx.fillStyle = GREEN;
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText("withphoebe.app", W / 2, qrTop + qrSize + 64);
  ctx.textAlign = "left";
}

/** A one-page PDF holding one JPEG, the page letter-size (612 × 792 pt). */
function jpegToPdf(jpeg: Uint8Array, w: number, h: number): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: Uint8Array | string) => {
    const bytes = typeof p === "string" ? enc.encode(p) : p;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push("\nendstream\nendobj\n");
  const content = "q 612 0 0 792 0 0 cm /Im0 Do Q";
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  let table = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

function fileName(parish: string): string {
  const slug = parish.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `phoebe-flyer-${slug}.pdf` : "phoebe-flyer.pdf";
}

export default function FlyerPage() {
  const [parish, setParish] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const qrWrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Redraw the preview as they type (lightly debounced).
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const qr = qrWrap.current?.querySelector("canvas") ?? null;
      await drawFlyer(canvas, qr, parish, note);
      if (!cancelled) setPreview(canvas.toDataURL("image/jpeg", 0.8));
    }, 200);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [parish, note]);

  async function makePdf() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setStatus(null);
    try {
      const qr = qrWrap.current?.querySelector("canvas") ?? null;
      await drawFlyer(canvas, qr, parish, note);
      const jpegBlob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      if (!jpegBlob) throw new Error("render");
      const pdf = jpegToPdf(new Uint8Array(await jpegBlob.arrayBuffer()), W, H);
      const name = fileName(parish);
      const file = new File([pdf], name, { type: "application/pdf" });
      // On the phone: the share sheet (Print, Save to Files, AirDrop, Mail).
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (isNativeShell() && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "Phoebe flyer" });
        return;
      }
      // On the web: download it.
      const url = URL.createObjectURL(pdf);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus("Downloaded. Open it to print.");
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return; // share sheet dismissed
      setStatus("That didn't work. Try again, or try on a computer.");
    } finally {
      setBusy(false);
    }
  }

  const field = {
    width: "100%", borderRadius: 14, padding: "12px 14px", fontSize: 16, fontFamily: FONT,
    color: WARM, background: "rgba(9,26,16,0.55)", border: "1px solid rgba(46,107,64,0.45)", outline: "none",
  } as const;

  return (
    <Layout>
      <div className="w-full max-w-2xl mx-auto pb-24" style={{ fontFamily: FONT }}>
        <Link href="/invite" className="text-[14px]" style={{ color: SAGE, textDecoration: "none" }}>← Invite</Link>
        <h1 className="mt-3" style={{ fontSize: 28, fontWeight: 700, color: WARM, letterSpacing: "-0.01em", margin: "12px 0 6px" }}>
          A flyer for your parish
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: SAGE, margin: "0 0 22px" }}>
          A printable page that explains Phoebe and invites people to a daily habit of prayer, with a QR code that opens it.
        </p>

        <div className="flex flex-col gap-3">
          <label htmlFor="flyer-parish" style={{ fontSize: 13, color: SAGE }}>Your parish (optional)</label>
          <input id="flyer-parish" value={parish} onChange={(e) => setParish(e.target.value)} placeholder="St. Mark's Episcopal Church" maxLength={80} style={field} />
          <label htmlFor="flyer-note" style={{ fontSize: 13, color: SAGE, marginTop: 6 }}>A note from you (optional)</label>
          <textarea id="flyer-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={220}
            placeholder="Join us in praying Morning Prayer together this Advent." style={{ ...field, resize: "vertical" }} />
        </div>

        <button type="button" onClick={makePdf} disabled={busy || !preview}
          className="w-full rounded-full mt-5 active:scale-[0.99]"
          style={{ padding: "14px 18px", fontSize: 16, fontWeight: 700, fontFamily: FONT, color: WARM, background: "rgba(46,107,64,0.85)", border: "1px solid rgba(168,197,160,0.45)", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Making the PDF…" : isNativeShell() ? "Share or print the PDF" : "Download the PDF"}
        </button>
        {status && <p style={{ fontSize: 13.5, color: SAGE, textAlign: "center", marginTop: 10 }}>{status}</p>}

        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(143,175,150,0.6)", margin: "28px 0 10px" }}>Preview</p>
        <div style={{ background: "#FFFFFF", borderRadius: 6, boxShadow: "0 18px 50px rgba(0,0,0,0.5)", overflow: "hidden", aspectRatio: "8.5 / 11" }}>
          {preview && <img src={preview} alt="The flyer as it will print" style={{ width: "100%", height: "100%", display: "block" }} />}
        </div>

        {/* The QR code the flyer draws from: rendered off-screen at print size.
            Level Q survives a crease or a thumb over a corner. */}
        <div ref={qrWrap} aria-hidden style={{ position: "absolute", left: -9999, top: 0 }}>
          <QRCodeCanvas value={APP_URL} size={560} level="Q" marginSize={2} bgColor="#FFFFFF" fgColor="#091A10" />
        </div>
      </div>
    </Layout>
  );
}
