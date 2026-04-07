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
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <header className="sticky top-0 z-10 px-4 sm:px-6 md:px-8 py-5 md:py-6 flex justify-between items-center" style={{ background: "rgba(240,235,224,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
            <span className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors" style={{ letterSpacing: "-0.025em", fontFamily: "'Space Grotesk', sans-serif" }}>
              Phoebe ✨
            </span>
          </Link>

          <Link href="/people" className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary" style={{ color: "#8C7B6B" }}>
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
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:block text-sm font-medium text-foreground">{user.name}</span>
              <ChevronDown size={14} className="text-muted-foreground" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl z-20 overflow-hidden" style={{ background: "#E8E2D5", boxShadow: "0 4px 24px rgba(44,24,16,0.10), 0 1px 6px rgba(44,24,16,0.04)" }}>
                  <div className="px-4 py-3 border-b border-border/50">
                    <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => presenceToggle.mutate(!user.showPresence)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    <span>Show when I'm here 🌿</span>
                    <div className={`w-8 h-[18px] rounded-full transition-colors relative ${user.showPresence ? "bg-[#5C7A5F]" : "bg-border"}`}>
                      <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${user.showPresence ? "left-[16px]" : "left-[2px]"}`} />
                    </div>
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors border-t border-border/30"
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

      <main className="flex-1 flex flex-col pt-4 pb-12 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
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
