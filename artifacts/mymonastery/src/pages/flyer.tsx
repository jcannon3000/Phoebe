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

/** The QR code is drawn at exactly this many pixels: 12 per module for the
 *  33-module grid https://withphoebe.app makes at level Q with a 2-module quiet
 *  zone. A non-integer scale leaves modules of uneven width, and on a printed
 *  page that is the difference between a code that scans and one that doesn't. */
const QR_PX = 396;

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

/** A phone: a dark bezel round a real screenshot, tilted a little, with a soft
 *  shadow. `w` is the whole phone; the screenshot is 560 × 1151. */
function drawPhone(ctx: CanvasRenderingContext2D, shot: HTMLImageElement | null, x: number, y: number, w: number, tiltDeg: number) {
  if (!shot) return;
  const pad = 12;
  const sw = w - pad * 2;
  const sh = Math.round(sw * (1151 / 560));
  const h = sh + pad * 2;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((tiltDeg * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = "rgba(9,26,16,0.38)";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#0E1B14";
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, 50); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.beginPath(); ctx.roundRect(pad, pad, sw, sh, 38); ctx.clip();
  ctx.drawImage(shot, pad, pad, sw, sh);
  ctx.restore();
}

/** Draw the flyer: the title on plain paper, the app itself in two phones
 *  beside what it holds, and the QR code in a card of its own.
 *
 *  WHITE PAPER, GREEN INK (a home printer can't print to the edge): the only
 *  dark areas are the two framed phones, inside the margins. */
async function drawFlyer(canvas: HTMLCanvasElement, qr: HTMLCanvasElement | null, note: string) {
  /**
   * SPACE GROTESK, PROVEN RATHER THAN ASSUMED (owner: "space grotesk").
   *
   * Neither `fonts.ready` nor `fonts.load` is a promise that the canvas will use
   * the face: both resolve early when the stylesheet declaring it has not been
   * parsed yet (load() finds no declared face and returns at once), and a canvas
   * given a face that is declared but not yet loaded draws in the fallback for
   * that pass. The flyer then came out in the system sans, and a redraw on
   * `loadingdone` did not always repair it.
   *
   * So measure. The same string is set in Space Grotesk over a serif fallback
   * and in the serif alone; the widths are equal exactly when the fallback is
   * what the canvas is using. Poll, asking for each weight as we go, until they
   * differ - at most four seconds, after which it prints in whatever it has.
   */
  const probe = document.createElement("canvas").getContext("2d");
  const sample = "Find stability in our turbulent world";
  const applied = (): boolean => {
    if (!probe) return true;
    return ["400", "600", "700"].every((w) => {
      probe.font = `${w} 100px "Space Grotesk", serif`;
      const withFace = probe.measureText(sample).width;
      probe.font = `${w} 100px serif`;
      return Math.abs(withFace - probe.measureText(sample).width) > 0.5;
    });
  };
  try {
    const fonts = (document as unknown as { fonts?: { load: (f: string) => Promise<unknown> } }).fonts;
    for (let tries = 0; tries < 40 && !applied(); tries++) {
      await Promise.all(["400", "500", "600", "700"].map((w) => fonts?.load(`${w} 40px "Space Grotesk"`)));
      if (applied()) break;
      await new Promise((r) => window.setTimeout(r, 100));
    }
  } catch { /* fallback font */ }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = W; canvas.height = H;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  const M = 150; // margin
  const col = W - 2 * M;
  ctx.textBaseline = "alphabetic";

  const [icon, shotA, shotB] = await Promise.all([
    loadImage("/phoebe-app-icon.png"),
    loadImage("/landing/office-slide1.jpg"),
    loadImage("/landing/reflections.jpg"),
  ]);

  /**
   * LEFT-ALIGNED, as the owner liked it (2026-10-01: "I did like the left
   * aligned format of before"). A centred redesign was tried for balance and
   * put back: the headline, the list and the QR card hang off the left margin,
   * and the two phones sit in a column of their own on the right.
   */
  ctx.textAlign = "left";

  // ── Masthead: the app icon and the name, then a hairline.
  const mastY = 190;
  if (icon) {
    const sz = 96;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(M, mastY - 76, sz, sz, 22);
    ctx.clip();
    ctx.drawImage(icon, M, mastY - 76, sz, sz);
    ctx.restore();
  }
  ctx.fillStyle = INK;
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText("Phoebe", M + (icon ? 124 : 0), mastY);
  ctx.fillStyle = "rgba(16,35,26,0.14)";
  ctx.fillRect(M, mastY + 70, col, 3);

  // ── The title, on the paper itself: a short green bar, the headline, and who
  // it is for. (No photograph behind it - the owner: "we dont need the backround
  // image on the title".)
  const titleTop = 300;
  ctx.fillStyle = GREEN;
  ctx.beginPath(); ctx.roundRect(M, titleTop, 112, 10, 5); ctx.fill();

  // As large as it will go while staying on three lines.
  ctx.fillStyle = INK;
  let size = 116, head: string[] = [];
  for (; size >= 84; size -= 4) {
    ctx.font = `700 ${size}px ${FONT}`;
    head = wrap(ctx, "Find stability in our turbulent world through monastic wisdom.", col);
    if (head.length <= 3) break;
  }
  const lead = Math.round(size * 1.12);
  let hy = titleTop + 40 + Math.round(size * 0.95);
  for (const line of head) { ctx.fillText(line, M, hy); hy += lead; }

  // WHAT IT IS FOR (owner: "it should talk about finding a routine that fits
  // your busy life") - who it is for: not a monk's day, a busy one.
  ctx.fillStyle = GREEN;
  ctx.font = `600 54px ${FONT}`;
  let sy = hy - lead + 92;
  for (const line of wrap(ctx, "Find a daily routine of prayer that fits your busy life.", col)) {
    ctx.fillText(line, M, sy);
    sy += 66;
  }

  // ── Beside the screens: the categories.
  // THREE, in the owner's words (2026-10-01: "ways to pray, daily reflections
  // from many sources, and contemplation"), with the offices IN the list ("include
  // in the list the offices") and Henri Nouwen named under reflections ("put
  // hendri nouwn for reflection").
  const midY = 900;
  ctx.fillStyle = GREEN;
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText("WHAT YOU'LL FIND", M, midY + 36);
  const items: Array<[string, string]> = [
    ["Ways to pray", "The offices, guided prayer, the Examen, Pray As You Go, and more."],
    ["Daily reflections", "A few minutes with the day's word from many sources, including Henri Nouwen."],
    ["Contemplation", "Silence with bells, lectio divina, and breathing together with creation."],
  ];

  /**
   * THE LIST FITS ITS SPACE, rather than being sized by eye. Space Grotesk is
   * wider than the fallback these were first drawn in, so the same words wrap
   * to more lines and the last one ran down under the QR card. The text steps
   * down a size until all three items end clear of it.
   */
  const itemsTop = midY + 130;
  const itemsBottom = 1570 - 36; // the QR card starts at 1570
  const itemW = 690;
  let dSize = 34, layout: string[][] = [];
  for (; dSize >= 26; dSize -= 2) {
    ctx.font = `400 ${dSize}px ${FONT}`;
    layout = items.map(([, body]) => wrap(ctx, body, itemW));
    const used = layout.reduce((h, ls) => h + 52 + ls.length * (dSize + 12) + 34, 0) - 34;
    if (itemsTop + used <= itemsBottom) break;
  }
  let iy = itemsTop;
  items.forEach(([title], i) => {
    ctx.fillStyle = GREEN;
    ctx.beginPath(); ctx.arc(M + 12, iy - 14, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `700 44px ${FONT}`;
    ctx.fillText(title, M + 48, iy);
    ctx.fillStyle = "rgba(16,35,26,0.78)";
    ctx.font = `400 ${dSize}px ${FONT}`;
    let by = iy + 52;
    for (const line of layout[i]!) { ctx.fillText(line, M + 48, by); by += dSize + 12; }
    iy = by + 34 - 12;
  });

  // ── The app itself: two phones, STRAIGHT and level (owner: "make the mocks
  // straight and aligned"), the same size, side by side, their tops on the
  // list's heading. The Office on the left (a way to pray), the reflections
  // on the right.
  const phoneW = 286;
  const phoneGap = 32;
  const phonesX = M + col - (phoneW * 2 + phoneGap);
  drawPhone(ctx, shotA, phonesX, midY, phoneW, 0);
  drawPhone(ctx, shotB, phonesX + phoneW + phoneGap, midY, phoneW, 0);

  // ── The QR code, in a card of its own, at the foot of the page.
  const cardY = 1570, cardH = H - 150 - cardY;
  ctx.fillStyle = "#EEF4EE";
  ctx.beginPath(); ctx.roundRect(M, cardY, col, cardH, 36); ctx.fill();
  ctx.strokeStyle = "rgba(46,107,64,0.4)";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(M, cardY, col, cardH, 36); ctx.stroke();

  // Drawn at its own size, never scaled, so every module stays a whole pixel.
  const qrSize = QR_PX;
  const padQ = (cardH - qrSize) / 2;
  const qrX = M + padQ, qrTop = cardY + padQ;
  if (qr) ctx.drawImage(qr, qrX, qrTop, qrSize, qrSize);

  const tx = qrX + qrSize + 52;
  const tw = M + col - 36 - tx;
  ctx.fillStyle = INK;
  ctx.font = `700 60px ${FONT}`;
  ctx.fillText("Scan to begin", tx, cardY + 132);
  ctx.fillStyle = GREEN;
  ctx.font = `600 46px ${FONT}`;
  ctx.fillText("withphoebe.app", tx, cardY + 200);

  let ny = cardY + 280;
  if (note.trim()) {
    // The parish's own words, set off in italic, shrunk until they fit the card.
    const room = cardY + cardH - 40 - ny;
    let nsize = 40, lines: string[] = [];
    for (; nsize >= 28; nsize -= 2) {
      ctx.font = `italic 400 ${nsize}px Georgia, 'Times New Roman', serif`;
      lines = wrap(ctx, note.trim(), tw - 36);
      if (lines.length * (nsize + 14) <= room) break;
    }
    ctx.fillStyle = GREEN;
    ctx.fillRect(tx, ny - nsize + 6, 6, lines.length * (nsize + 14) - 6);
    ctx.fillStyle = INK;
    for (const line of lines) { ctx.fillText(line, tx + 30, ny); ny += nsize + 14; }
  } else {
    ctx.fillStyle = "rgba(16,35,26,0.78)";
    ctx.font = `400 38px ${FONT}`;
    for (const line of wrap(ctx, "Start with a few minutes and shape a rhythm around your own day, on your phone or on the web.", tw)) {
      ctx.fillText(line, tx, ny); ny += 54;
    }
  }
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

export default function FlyerPage() {
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const qrWrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Bumped when the page's fonts finish loading: a first draw can beat the
  // stylesheet that declares Space Grotesk and come out in the fallback face, and
  // the preview should correct itself rather than stay that way.
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    const fonts = (document as unknown as { fonts?: EventTarget }).fonts;
    if (!fonts) return;
    const bump = () => setFontTick((n) => n + 1);
    fonts.addEventListener("loadingdone", bump);
    return () => fonts.removeEventListener("loadingdone", bump);
  }, []);

  // Redraw the preview as they type (lightly debounced).
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const qr = qrWrap.current?.querySelector("canvas") ?? null;
      await drawFlyer(canvas, qr, note);
      if (!cancelled) setPreview(canvas.toDataURL("image/jpeg", 0.8));
    }, 200);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [note, fontTick]);

  async function makePdf() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setStatus(null);
    try {
      const qr = qrWrap.current?.querySelector("canvas") ?? null;
      await drawFlyer(canvas, qr, note);
      const jpegBlob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      if (!jpegBlob) throw new Error("render");
      const pdf = jpegToPdf(new Uint8Array(await jpegBlob.arrayBuffer()), W, H);
      const name = "phoebe-flyer.pdf";
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
        <Link href="/invite/share" className="text-[14px]" style={{ color: SAGE, textDecoration: "none" }}>← Share Phoebe</Link>
        <h1 className="mt-3" style={{ fontSize: 28, fontWeight: 700, color: WARM, letterSpacing: "-0.01em", margin: "12px 0 6px" }}>
          A flyer for your parish
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: SAGE, margin: "0 0 22px" }}>
          A printable page that explains Phoebe and invites people to a daily habit of prayer, with a QR code that opens it.
        </p>

        <div className="flex flex-col gap-3">
          <label htmlFor="flyer-note" style={{ fontSize: 13, color: SAGE }}>A note from you (optional)</label>
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
          <QRCodeCanvas value={APP_URL} size={QR_PX} level="Q" marginSize={2} bgColor="#FFFFFF" fgColor="#091A10" />
        </div>
      </div>
    </Layout>
  );
}
