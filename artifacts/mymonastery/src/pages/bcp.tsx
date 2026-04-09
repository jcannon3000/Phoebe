import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";

const OPTIONS = [
  {
    id: "intercessions",
    emoji: "🙏",
    title: "Intercessions",
    desc: "Prayers of the People from the Book of Common Prayer",
    href: "/bcp/intercessions",
  },
  {
    id: "daily-office",
    emoji: "📖",
    title: "Daily Offices",
    desc: "Morning Prayer and Evening Prayer for today",
    href: "/bcp/daily-office",
  },
  {
    id: "feasts",
    emoji: "🕯️",
    title: "Feast Days",
    desc: "Upcoming feasts, commemorations, and their collects",
    href: "/bcp/feasts",
  },
];

export default function BcpPage() {
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
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "rgba(143,175,150,0.5)" }}>
            The Book of Common Prayer
          </p>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Book of Common Prayer 📖
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Ancient prayers for a modern community.
          </p>
        </div>

        <div className="space-y-3">
          {OPTIONS.map(opt => (
            <Link key={opt.id} href={opt.href} className="block">
              <div
                className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
                style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(200,212,192,0.15)" }}
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{opt.emoji}</span>
                  <div>
                    <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {opt.title}
                    </p>
                    <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
                      {opt.desc}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
