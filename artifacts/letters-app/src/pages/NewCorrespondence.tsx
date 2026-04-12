import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { X, Plus } from "lucide-react";
import { api } from "@/lib/api";

const BG = "#F8F3EC";
const DARK = "#2C1810";
const MUTED = "#9a9390";
const GREEN = "#5C7A5F";

interface NewCorrespondenceResponse { id: number }

export default function NewCorrespondence() {
  const [, setLocation] = useLocation();
  const [groupType, setGroupType] = useState<"one_to_one" | "small_group">("one_to_one");
  const [name, setName] = useState("");
  const [invitees, setInvitees] = useState<Array<{ name: string; email: string }>>([{ name: "", email: "" }]);

  const mutation = useMutation({
    mutationFn: () => {
      const validMembers = invitees.filter(i => i.email.trim());
      // Auto-generate name for one-to-one; use provided name (or fallback) for group
      const autoName = isOTO
        ? `Letters with ${validMembers[0]?.name?.trim() || validMembers[0]?.email?.split("@")[0] || "them"}`
        : name.trim() || `Circle with ${validMembers.map(i => i.name?.split(" ")[0] || i.email.split("@")[0]).join(", ")}`;

      // Try the letters route (uses groupType + "small_group")
      return api<NewCorrespondenceResponse>("POST", "/api/letters/correspondences", {
        name: autoName,
        groupType: isOTO ? "one_to_one" : "small_group",
        members: validMembers,
      });
    },
    onSuccess: (data) => setLocation(`/letters/${data.id}`),
  });

  const isOTO = groupType === "one_to_one";
  const canSubmit = invitees.some(i => i.email.trim());

  function updateInvitee(idx: number, field: "name" | "email", val: string) {
    setInvitees(prev => prev.map((inv, i) => i === idx ? { ...inv, [field]: val } : inv));
  }

  return (
    <div className="min-h-screen" style={{ background: BG, fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="px-6 pt-8 pb-4 max-w-lg mx-auto flex items-center justify-between">
        <button onClick={() => setLocation("/letters")} style={{ color: MUTED }}>←</button>
        <p className="text-sm font-semibold" style={{ color: MUTED }}>New correspondence</p>
        <div className="w-6" />
      </div>

      <div className="px-6 max-w-lg mx-auto pb-16">
        {/* Type selector */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Type</p>
          <div className="grid grid-cols-2 gap-3">
            {(["one_to_one", "small_group"] as const).map(type => (
              <button
                key={type}
                onClick={() => setGroupType(type)}
                className="rounded-2xl px-4 py-4 text-left transition-all"
                style={{
                  background: groupType === type ? "#2D5E3F" : "rgba(92,122,95,0.08)",
                  border: `1px solid ${groupType === type ? "#2D5E3F" : "rgba(92,122,95,0.2)"}`,
                  color: groupType === type ? "#F0EDE6" : DARK,
                }}
              >
                <p className="font-semibold text-sm">{type === "one_to_one" ? "One-to-one" : "Small circle"}</p>
                <p className="text-[12px] mt-0.5 opacity-70">
                  {type === "one_to_one" ? "Take turns. Every 2 weeks." : "Everyone writes. Every 2 weeks."}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Name (optional) */}
        {!isOTO && (
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: MUTED }}>
              Circle name <span style={{ color: "rgba(154,147,144,0.6)" }}>(optional)</span>
            </p>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Seminary friends"
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{
                background: "rgba(92,122,95,0.07)",
                border: "1px solid rgba(92,122,95,0.2)",
                color: DARK,
              }}
            />
          </div>
        )}

        {/* Invitees */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
            {isOTO ? "Invite someone" : "Invite people"}
          </p>
          <div className="space-y-3">
            {invitees.map((inv, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={inv.name}
                  onChange={e => updateInvitee(idx, "name", e.target.value)}
                  placeholder="Name"
                  className="flex-1 px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{ background: "rgba(92,122,95,0.07)", border: "1px solid rgba(92,122,95,0.2)", color: DARK, minWidth: 0 }}
                />
                <input
                  type="email"
                  value={inv.email}
                  onChange={e => updateInvitee(idx, "email", e.target.value)}
                  placeholder="Email"
                  className="flex-[2] px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{ background: "rgba(92,122,95,0.07)", border: "1px solid rgba(92,122,95,0.2)", color: DARK, minWidth: 0 }}
                />
                {invitees.length > 1 && (
                  <button
                    onClick={() => setInvitees(prev => prev.filter((_, i) => i !== idx))}
                    className="shrink-0 rounded-xl px-2 flex items-center"
                    style={{ color: MUTED }}
                  >
                    <X size={14} />
                  </button>
                )}
              </motion.div>
            ))}
          </div>

          {!isOTO && invitees.length < 6 && (
            <button
              onClick={() => setInvitees(prev => [...prev, { name: "", email: "" }])}
              className="flex items-center gap-1.5 mt-3 text-sm"
              style={{ color: GREEN }}
            >
              <Plus size={14} /> Add another
            </button>
          )}
        </div>

        {/* How it works */}
        <div
          className="rounded-2xl px-5 py-4 mb-8"
          style={{ background: "rgba(92,122,95,0.07)", border: "1px solid rgba(92,122,95,0.15)" }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: MUTED }}>How it works</p>
          {isOTO ? (
            <ul className="space-y-1 text-xs" style={{ color: DARK }}>
              <li>📮 You write first. They write back.</li>
              <li>⏳ You each have two weeks per letter.</li>
              <li>✉️ 100–1000 words. No threads. No noise.</li>
            </ul>
          ) : (
            <ul className="space-y-1 text-xs" style={{ color: DARK }}>
              <li>📮 Everyone writes once per two-week period.</li>
              <li>👁️ Read each other's letters anytime.</li>
              <li>✉️ 50–1000 words. Quiet. Intentional.</li>
            </ul>
          )}
        </div>

        {/* Send */}
        <button
          onClick={() => mutation.mutate()}
          disabled={!canSubmit || mutation.isPending}
          className="w-full py-4 rounded-2xl font-semibold text-[15px] disabled:opacity-40 transition-opacity"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          {mutation.isPending ? "Sending invitations…" : "Start correspondence ✉️"}
        </button>

        {mutation.isError && (
          <p className="text-xs text-center mt-3" style={{ color: "#C47A65" }}>
            Something went wrong. Try again.
          </p>
        )}
      </div>
    </div>
  );
}
