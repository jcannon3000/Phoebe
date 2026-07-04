import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Boot i18next (the shared Phoebe singleton) before mounting, exactly like the
// Phoebe app — react-i18next reads from it with no provider.
import "@/i18n";

createRoot(document.getElementById("root")!).render(<App />);
