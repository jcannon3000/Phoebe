import { ReactNode, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LogOut, ChevronDown, Users } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);


  const presenceToggle = useMutation({
    mutationFn: (showPresence: boolean) =>
      apiRequest("PATCH", "/api/auth/me/presence", { showPresence }),
    onSuccess: (_data, showPresence) => {
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, showPresence } : prev
      );
    },
  });

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden" style={{ background: "#091A10" }}>
      <header className="sticky top-0 z-10 px-4 sm:px-6 md:px-8 pt-5 pb-2 md:pt-6 md:pb-5 flex justify-between items-center" style={{ background: "#091A10" }}>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
            <span className="text-3xl font-bold transition-colors" style={{ letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
              Phoebe ✨
            </span>
          </Link>

          <Link href="/people" className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary mt-2" style={{ color: "#8FAF96" }}>
            <Users size={15} />
            People
          </Link>
        </div>

        {user && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-card transition-colors focus:outline-none"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-8 h-8 rounded-full border-2 border-primary/20"
                />
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: "#0F2818", color: "#8FAF96", border: "1px solid rgba(200,212,192,0.2)" }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:block text-sm font-medium text-foreground">{user.name}</span>
              <ChevronDown size={14} className="text-muted-foreground" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl z-20 overflow-hidden" style={{ background: "#0F2818", border: "1px solid rgba(200,212,192,0.15)", boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 1px 6px rgba(0,0,0,0.3)" }}>
                  <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(200,212,192,0.15)" }}>
                    <p className="text-sm font-medium truncate" style={{ color: "#F0EDE6" }}>{user.name}</p>
                    <p className="text-xs truncate" style={{ color: "#8FAF96" }}>{user.email}</p>
                  </div>
                  <button
                    onClick={() => presenceToggle.mutate(!user.showPresence)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm transition-colors"
                    style={{ color: "#8FAF96" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1F4A33"; (e.currentTarget as HTMLButtonElement).style.color = "#F0EDE6"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#8FAF96"; }}
                  >
                    <span>Show when I'm here 🌿</span>
                    <div className={`w-8 h-[18px] rounded-full transition-colors relative ${user.showPresence ? "bg-[#2D5E3F]" : "bg-border"}`}>
                      <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full shadow-sm transition-transform ${user.showPresence ? "left-[16px]" : "left-[2px]"}`} style={{ background: "#F0EDE6" }} />
                    </div>
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors"
                    style={{ color: "#8FAF96", borderTop: "1px solid rgba(200,212,192,0.15)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1F4A33"; (e.currentTarget as HTMLButtonElement).style.color = "#F0EDE6"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#8FAF96"; }}
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col pt-2 pb-12 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 flex flex-col w-full h-full"
        >
          {children}
        </motion.div>
      </main>

    </div>
  );
}
