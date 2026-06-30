import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";

// The About page — a short description of Phoebe. English only by design.

const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

export default function AboutPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <header className="mb-7">
          <p style={{ fontFamily: FONT, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#7E9A85", margin: 0 }}>
            About
          </p>
          <h1 className="mt-1.5" style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: "#F0EDE6" }}>
            Phoebe
          </h1>
        </header>

        <div className="space-y-4">
          <p style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.72, color: "#E4EADD" }}>
            Phoebe is an app for cultivating a daily practice of prayer. It brings together resources from across the Episcopal Church and beyond into one seamless routine — with the modern tools to help guide you through building it, and holding it.
          </p>
          <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD" }}>
            You can shape your own rhythm — from simply praying the Psalms to the full Daily Office — and pray it however meets you that day: from your own Book of Common Prayer, on the app, by audio, or alongside a cathedral broadcast. Whatever pieces your practice already has — the offices, a daily reflection, a few minutes of silence — Phoebe gathers them into one place. It keeps the depth of the tradition intact and simply changes how it reaches you, meeting you in the busy, dispersed life you actually live. It takes its name from the deacon Phoebe, who carried Paul’s letter to the Romans — entrusted to bring the word to where it needed to go.
          </p>
        </div>
      </div>
    </Layout>
  );
}
