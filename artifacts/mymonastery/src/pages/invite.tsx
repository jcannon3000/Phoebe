import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { isNativeShell } from "@/lib/isNativeShell";
import { EARTH_PHOTOS } from "@/lib/earthPhotos";

// ── /invite ───────────────────────────────────────────────────────────────
//
// Where the menu's "Invite" row (shareInvite.ts) points.
//
// On iOS Safari, "the website" isn't the useful thing to show — the App Store
// listing is — so we skip straight there instead of making the visitor find a
// download link themselves. Android/desktop see the page itself, since
// there's no Play Store listing yet to redirect to.
//
// NOTE: this does NOT currently skip people who already have Phoebe. That
// would need /invite in the Universal Links association file
// (phoebe-mobile/assets/apple-app-site-association), which today lists only
// /communities/join/*, /m/*, /lectio/*, /moments/*, /prayer-requests/* and
// /dashboard — and still carries the literal TEAM_ID placeholder, so
// Universal Links don't resolve at all yet. Until that's filled in, an
// existing user who taps an invite link lands on the App Store listing,
// which shows OPEN rather than GET — acceptable, but not the ideal path.
//
// The page NEVER renders blank: we keep the full content mounted under the
// redirect rather than returning null, so a blocked/failed navigation (a
// content blocker, offline, a restrictive in-app WebView) leaves a usable
// page with a tappable App Store link instead of a black screen. See the
// "never return null while gating" invariant in the project's memory.

const APP_STORE_URL = "https://apps.apple.com/us/app/phoebe-prayer-together/id6763552921";
/**
 * WHAT THE QR POINTS AT — the app's own front door, never a store listing.
 *
 * An iPhone scanning this lands on the web app and is offered the App Store
 * from there; an Android phone, which has no listing yet, simply has Phoebe.
 * One code that works for whoever is standing in front of you is worth more
 * than two that each work for half the room.
 */
const APP_ORIGIN = "https://withphoebe.app";
const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

function isIOSWeb(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  if (isNativeShell()) return false; // already have the app — never redirect our own shell
  return true;
}

/**
 * An Android browser. There is no Play listing to send this person to yet
 * (the app is in closed testing; testers join through Play's own opt-in
 * link), so the invitation's first door is the web app, and the App Store
 * is named only as where the iPhone version lives. Once the listing is
 * public, the button can point at
 * https://play.google.com/store/apps/details?id=app.withphoebe.mobile.
 */
function isAndroidWeb(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isNativeShell()) return false;
  return /Android/i.test(navigator.userAgent);
}

export default function InvitePage() {
  const { t } = useTranslation();
  /** The QR sheet — closed until somebody wants to show the code. */
  const [qrOpen, setQrOpen] = useState(false);
  // Redirect immediately, not on a delay — this page's whole job on iOS is
  // to be a way-station, not a landing experience.
  useState(() => {
    if (isIOSWeb()) window.location.replace(APP_STORE_URL);
    return null;
  });
  useEffect(() => {
    document.title = "You're invited — Phoebe";
  }, []);
  const bgPhoto = useState(() => (EARTH_PHOTOS.length > 0 ? EARTH_PHOTOS[Math.floor(Math.random() * EARTH_PHOTOS.length)]! : null))[0];

  // Deliberately NO `if (redirecting) return null` here. On iOS the navigation
  // above wins long before this paints, so rendering the page costs nothing —
  // but if the redirect is ever blocked (content blocker, offline, a locked-down
  // in-app WebView), the visitor gets this usable page with a tappable App
  // Store link instead of a permanently black screen.
  return (
    <div className="relative min-h-[100dvh] flex flex-col" style={{ background: BG, color: WARM, fontFamily: FONT, isolation: "isolate" }}>
      {bgPhoto && (
        <>
          <img src={bgPhoto} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.28, zIndex: -1 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,18,12,0.55) 0%, rgba(8,18,12,0.75) 60%, rgba(8,18,12,0.9) 100%)" }} />
        </>
      )}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div
          className="flex flex-col items-center text-center px-8 py-9 max-w-md w-full"
          style={{
            borderRadius: 24,
            background: "rgba(22,46,32,0.42)",
            backdropFilter: "blur(11px)",
            WebkitBackdropFilter: "blur(11px)",
            border: "1px solid rgba(46,107,64,0.30)",
          }}
        >
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-4" style={{ color: "rgba(143,175,150,0.7)" }}>
            {t("invite.eyebrow", { defaultValue: "You're invited" })}
          </p>
          <h1 className="text-[28px] font-semibold leading-tight mb-5">
            {t("invite.title", { defaultValue: "Someone thought you'd want to pray with them" })}
          </h1>
          <p className="text-[15px] leading-relaxed mb-8" style={{ color: SAGE, fontFamily: "Georgia, serif" }}>
            {t("invite.body", {
              defaultValue:
                "Phoebe is a quiet way to keep a daily prayer rhythm — the Book of Common Prayer, contemplation, the Examen — and to share that rhythm with your church community. Someone invited you into their prayer life; Phoebe is how they keep it, and how you can join them in it.",
            })}
          </p>
          {isAndroidWeb() ? (
            <>
              <Link
                href="/"
                className="rounded-full px-8 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98] mb-4"
                style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)" }}
              >
                {t("invite.open_web", { defaultValue: "Open Phoebe on the web" })}
              </Link>
              <p className="text-[13px]" style={{ color: "rgba(143,175,150,0.75)" }}>
                {t("invite.iphone_note", { defaultValue: "On an iPhone, Phoebe is on the App Store." })}
              </p>
            </>
          ) : (
            <>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-full px-8 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98] mb-4"
                style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)" }}
              >
                {t("invite.get_the_app", { defaultValue: "Get Phoebe on the App Store" })}
              </a>
              <Link href="/" className="text-[13px] underline" style={{ color: "rgba(143,175,150,0.75)" }}>
                {t("invite.continue_web", { defaultValue: "Continue on the web instead" })}
              </Link>
            </>
          )}

          {/* IN PERSON (owner, 2026-09-26: "make a button on invite page which
              would bring this up"). Inviting somebody standing next to you is
              not a link — it is holding up your phone and letting them scan
              it. The code is drawn here rather than shipped as an image so it
              is sharp at any size and needs no network. */}
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="mt-5 text-[13px] underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: "rgba(143,175,150,0.75)", background: "none", border: "none", cursor: "pointer" }}
          >
            {t("invite.show_qr", { defaultValue: "Show a QR code to scan" })}
          </button>
        </div>
      </div>

      {/* ON WHITE, ALWAYS. A scanner needs dark on light and a quiet border,
          so the code keeps its own card rather than sitting on the leaf
          ground — the one place in the app where the palette gives way to
          what actually works. Above everything (the drawer sits at 85). */}
      {qrOpen && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("invite.qr_label", { defaultValue: "QR code for withphoebe.app" })}
          onClick={() => setQrOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 120, display: "flex",
            alignItems: "center", justifyContent: "center", padding: 24,
            background: "rgba(4,14,8,0.78)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FFFFFF", borderRadius: 22, padding: "26px 26px 20px",
              maxWidth: 360, width: "100%", textAlign: "center",
            }}
          >
            {/* Level Q keeps it readable with about a quarter of it creased or
                covered — a phone screen held at arm's length, a printed card
                left by a door. marginSize is the quiet zone the scanner needs. */}
            <QRCodeSVG
              value={APP_ORIGIN}
              size={244}
              level="Q"
              marginSize={2}
              bgColor="#FFFFFF"
              fgColor="#091A10"
              style={{ width: "100%", height: "auto", maxWidth: 244, margin: "0 auto", display: "block" }}
            />
            <p className="mt-4 text-[15px] font-semibold" style={{ color: "#091A10", fontFamily: FONT }}>
              withphoebe.app
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "rgba(9,26,16,0.62)", fontFamily: FONT }}>
              {t("invite.qr_note", { defaultValue: "Point a camera at this to open Phoebe." })}
            </p>
            <button
              type="button"
              onClick={() => setQrOpen(false)}
              className="mt-5 w-full rounded-full py-3 text-[14px] font-semibold"
              style={{ background: "#2D5E3F", color: WARM, border: "none", cursor: "pointer", fontFamily: FONT }}
            >
              {t("common.close", { defaultValue: "Close" })}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
