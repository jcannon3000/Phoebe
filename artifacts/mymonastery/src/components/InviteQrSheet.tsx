import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";

// ── The QR code you hold up ──────────────────────────────────────────────────
//
// Inviting somebody standing next to you is not a link — it is holding up your
// phone and letting them scan it (owner, 2026-09-26: "make a button on invite
// page which would bring this up"; and 2026-09-30, of the share page: "put a
// button on the bottom that says qr code that would bring up the QR code").
//
// ONE sheet, used by BOTH invite pages. It was written inline on /invite, and
// the second caller is exactly how two copies of a thing start disagreeing
// about what it says (reference_second_renderer_drift) — a code that pointed
// somewhere else on one of the two pages would be a quiet, hard-to-spot wrong.

/**
 * WHAT THE QR POINTS AT — the app's own front door, never a store listing.
 *
 * An iPhone scanning this lands on the web app and is offered the App Store
 * from there; an Android phone, which has no listing yet, simply has Phoebe.
 * One code that works for whoever is standing in front of you is worth more
 * than two that each work for half the room.
 */
export const INVITE_QR_URL = "https://withphoebe.app";

const WARM = "#F0EDE6";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export function InviteQrSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  if (!open || typeof document === "undefined") return null;
  // ON WHITE, ALWAYS. A scanner needs dark on light and a quiet border, so the
  // code keeps its own card rather than sitting on the leaf ground — the one
  // place in the app where the palette gives way to what actually works.
  // Portalled above everything (the drawer sits at 85).
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("invite.qr_label", { defaultValue: "QR code for withphoebe.app" })}
      onClick={onClose}
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
            covered — a phone screen held at arm's length, a printed card left
            by a door. marginSize is the quiet zone the scanner needs. */}
        <QRCodeSVG
          value={INVITE_QR_URL}
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
          onClick={onClose}
          className="mt-5 w-full rounded-full py-3 text-[14px] font-semibold"
          style={{ background: "#2D5E3F", color: WARM, border: "none", cursor: "pointer", fontFamily: FONT }}
        >
          {t("common.close", { defaultValue: "Close" })}
        </button>
      </div>
    </div>,
    document.body,
  );
}
