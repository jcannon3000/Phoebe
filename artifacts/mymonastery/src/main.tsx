import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Boot i18next before mounting the tree so the very first render
// reads from the resource tables. Fallback to English if Spanish
// hasn't been activated. Runs as a side-effect import — there's no
// React provider needed; react-i18next reads from the singleton.
import "./i18n";

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker in production. Dev mode deliberately
// skips it so Vite's HMR stays the source of truth for assets.
// Rationale for the SW at all: captive-portal / flaky Wi-Fi commonly
// drops the first TLS handshake of the day; a cached shell lets the
// user still load the UI and see a helpful NetworkBanner instead of
// Safari's unactionable "Can't establish secure connection" page.
if (
  "serviceWorker" in navigator &&
  import.meta.env.PROD &&
  window.location.protocol === "https:"
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/service-worker.js`)
      .catch((err) => {
        // Non-fatal — the app still works without the SW, it just
        // won't survive a dropped network.
        console.warn("[sw] registration failed:", err);
      });
  });
}
