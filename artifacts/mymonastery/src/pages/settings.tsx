import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LogOut } from "lucide-react";

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
    </div>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-5 py-4 mb-3"
      style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.18)" }}
    >
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
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

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">

        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Settings ⚙️
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Your account, notifications, and preferences.
          </p>
        </div>

        {/* ── Account ── */}
        <SectionHeader label="Account" />
        <SettingsCard>
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
              style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
            >
              {user.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {user.name}
              </p>
              <p className="text-sm truncate" style={{ color: "#8FAF96" }}>
                {user.email}
              </p>
            </div>
          </div>
        </SettingsCard>

        {/* ── Presence ── */}
        <div className="mb-8">
          <SettingsCard>
            <button
              onClick={() => presenceToggle.mutate(!user.showPresence)}
              className="w-full flex items-center justify-between"
            >
              <div className="text-left">
                <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>Show when I'm here 🌿</p>
                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                  Let your people know you're present.
                </p>
              </div>
              <div className={`w-10 h-[22px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${user.showPresence ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}>
                <div className={`absolute top-[3px] w-[16px] h-[16px] rounded-full shadow-sm transition-transform ${user.showPresence ? "left-[21px]" : "left-[3px]"}`} style={{ background: "#F0EDE6" }} />
              </div>
            </button>
          </SettingsCard>
        </div>

        {/* ── Notifications ── */}
        <SectionHeader label="Notifications" />
        <SettingsCard>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Notification preferences coming soon. 🌱
          </p>
        </SettingsCard>
        <div className="mb-8" />

        {/* ── Privacy ── */}
        <SectionHeader label="Privacy" />
        <SettingsCard>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Privacy settings coming soon. 🌱
          </p>
        </SettingsCard>
        <div className="mb-8" />

        {/* ── Sign out ── */}
        <button
          onClick={() => { logout(); setLocation("/"); }}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: "rgba(200,212,192,0.06)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.18)" }}
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </Layout>
  );
}
