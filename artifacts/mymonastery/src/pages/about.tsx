import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";

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
        <div className="mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            About Phoebe
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Inspired by Monastic Wisdom
          </p>
        </div>

        <div className="space-y-6">
          <div
            className="rounded-xl px-5 py-5"
            style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(200,212,192,0.12)" }}
          >
            <p className="text-sm leading-relaxed" style={{ color: "#C8D4C0" }}>
              Phoebe is a sanctuary for fellowship — letters, practices, and gatherings for the people who matter most.
            </p>
            <p className="text-sm leading-relaxed mt-3" style={{ color: "#C8D4C0" }}>
              Named after Phoebe of Cenchreae, a deaconess commended by Paul in Romans 16 — a woman who carried the letter, held the community, and made connection possible.
            </p>
            <p className="text-sm leading-relaxed mt-3" style={{ color: "#C8D4C0" }}>
              That's what this app does: it carries what matters between people who care about each other. Letters written at a slower pace. Practices held together across distance. Gatherings tended with rhythm and intention.
            </p>
          </div>

          <div
            className="rounded-xl px-5 py-4 text-center"
            style={{ background: "rgba(200,212,192,0.04)", border: "1px dashed rgba(200,212,192,0.15)" }}
          >
            <p className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>
              Built with care for the Church and her people. 🌿
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
