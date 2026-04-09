import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Menu, X, Users, Mail, Flame, HeartHandshake, HandHeart,
  Bell, User, Lock, Info, LogOut, ChevronRight,
} from "lucide-react";

// ─── Color palette (all greens) ───────────────────────────────────────────────
const SECTION_COLORS = {
  letters:    "#8E9E42",   // warm olive-green
  practices:  "#2E6B40",   // deep forest-green
  gatherings: "#6FAF85",   // light sage-green
  people:     "#4A9E84",   // muted teal-green
  prayer:     "#5A8C72",   // mid-sage
};

// ─── Hamburger Drawer ─────────────────────────────────────────────────────────

function DrawerMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const presenceToggle = useMutation({
    mutationFn: (showPresence: boolean) =>
      apiRequest("PATCH", "/api/auth/me/presence", { showPresence }),
    onSuccess: (_data, showPresence) => {
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, showPresence } : prev
      );
    },
  });

  function navigate(path: string) {
    onClose();
    setLocation(path);
  }

  const navItems = [
    { icon: Mail,           label: "Letters",     path: "/letters",     color: SECTION_COLORS.letters },
    { icon: Flame,          label: "Practices",   path: "/practices",   color: SECTION_COLORS.practices },
    { icon: HeartHandshake, label: "Gatherings",  path: "/gatherings",  color: SECTION_COLORS.gatherings },
    { icon: Users,          label: "People",      path: "/people",      color: SECTION_COLORS.people },
    { icon: HandHeart,      label: "Prayer List", path: "/prayer-list", color: SECTION_COLORS.prayer },
  ];

  const settingsItems = [
    { icon: Bell,  label: "Notification preferences", onClick: () => {} },
    { icon: User,  label: "Account settings",          onClick: () => {} },
    { icon: Lock,  label: "Privacy settings",          onClick: () => {} },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Invisible tap-to-close area */}
          <div className="fixed inset-0 z-40" onClick={onClose} />

          {/* Drawer panel */}
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col overflow-y-auto"
            style={{ width: "min(340px, 90vw)", background: "#040D06", borderLeft: "1px solid rgba(200,212,192,0.12)" }}
          >
            {/* Close button */}
            <div className="flex justify-end p-4 pb-2">
              <button onClick={onClose} className="p-2 rounded-xl transition-colors" style={{ color: "#8FAF96" }}>
                <X size={20} />
              </button>
            </div>

            {/* ── Profile ── */}
            <div className="px-5 pb-5" style={{ borderBottom: "1px solid rgba(200,212,192,0.1)" }}>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                  style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1px solid rgba(200,212,192,0.2)" }}
                >
                  {user?.name?.charAt(0).toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {user?.name}
                  </p>
                  <p className="text-xs truncate" style={{ color: "#8FAF96" }}>{user?.email}</p>
                </div>
              </div>

              {/* Presence toggle */}
              <button
                onClick={() => presenceToggle.mutate(!user?.showPresence)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors"
                style={{ background: "rgba(200,212,192,0.05)", border: "1px solid rgba(200,212,192,0.1)" }}
              >
                <div className="text-left">
                  <p className="text-sm" style={{ color: "#8FAF96" }}>Show when I'm here 🌿</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
                    Let your people know you're present.
                  </p>
                </div>
                <div className={`w-8 h-[18px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${user?.showPresence ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}>
                  <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full shadow-sm transition-transform ${user?.showPresence ? "left-[16px]" : "left-[2px]"}`} style={{ background: "#F0EDE6" }} />
                </div>
              </button>
            </div>

            {/* ── My Communities ── */}
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(200,212,192,0.1)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(200,212,192,0.4)" }}>
                My Communities
              </p>
              <div className="rounded-xl px-4 py-3 text-center" style={{ background: "rgba(200,212,192,0.04)", border: "1px dashed rgba(200,212,192,0.15)" }}>
                <p className="text-sm mb-1" style={{ color: "#8FAF96" }}>Communities are coming soon 🌱</p>
                <p className="text-xs" style={{ color: "rgba(200,212,192,0.4)" }}>
                  Shared prayer, gatherings, and letters for your parish or group.
                </p>
              </div>
            </div>

            {/* ── Navigation ── */}
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(200,212,192,0.1)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(200,212,192,0.4)" }}>
                Navigate
              </p>
              <nav className="space-y-1">
                {navItems.map(({ icon: Icon, label, path, color }) => (
                  <button
                    key={path}
                    onClick={() => navigate(path)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors"
                    onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.06)"; }}
                    onMouseLeave={e => { (e.currentTarget).style.background = "transparent"; }}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={16} style={{ color }} />
                      <span className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{label}</span>
                    </div>
                    <ChevronRight size={14} style={{ color: "rgba(200,212,192,0.3)" }} />
                  </button>
                ))}
              </nav>
            </div>

            {/* ── Settings ── */}
            <div className="px-5 py-4 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(200,212,192,0.4)" }}>
                Settings
              </p>
              <div className="space-y-1">
                {settingsItems.map(({ icon: Icon, label, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm"
                    style={{ color: "#8FAF96" }}
                    onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.06)"; }}
                    onMouseLeave={e => { (e.currentTarget).style.background = "transparent"; }}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}

                <button
                  onClick={() => { onClose(); logout(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm"
                  style={{ color: "#8FAF96" }}
                  onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.06)"; }}
                  onMouseLeave={e => { (e.currentTarget).style.background = "transparent"; }}
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>

              {/* About */}
              <div
                className="mt-5 rounded-xl px-4 py-3"
                style={{ background: "rgba(200,212,192,0.04)", border: "1px solid rgba(200,212,192,0.08)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Info size={12} style={{ color: "rgba(143,175,150,0.5)" }} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.4)" }}>About</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(143,175,150,0.55)" }}>
                  Phoebe is a sanctuary for fellowship — letters, practices, and gatherings for the people who matter most.
                </p>
                <p className="text-[10px] mt-2 tracking-wide" style={{ color: "rgba(143,175,150,0.35)" }}>
                  Inspired by Monastic Wisdom
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden" style={{ background: "#091A10" }}>
      <header className="sticky top-0 z-10 px-4 sm:px-6 md:px-8 pt-5 pb-2 md:pt-6 md:pb-5 flex justify-between items-center" style={{ background: "#091A10" }}>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
            <span className="text-3xl font-bold transition-colors" style={{ letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
              Phoebe
            </span>
          </Link>

          <Link href="/people" className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary mt-2" style={{ color: "#8FAF96" }}>
            <Users size={15} />
            People
          </Link>
        </div>

        {user && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
            style={{ color: "#F0EDE6" }}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
        )}
      </header>

      <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />

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
