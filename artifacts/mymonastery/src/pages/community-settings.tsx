import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { ExternalLink } from "lucide-react";

const FONT = "'Space Grotesk', sans-serif";

const EMOJI_OPTIONS = ["🏘️","⛪","✝️","🕊️","🙏🏽","🌿","🌱","🕯️","📖","🫂","💒","🌾","🔔","🫙","🌻","🍃","🏔️","🌊","☀️","🌙"];

type Group = {
  id: number; name: string; description: string | null; slug: string;
  emoji: string | null; calendarUrl: string | null;
};

export default function CommunitySettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🏘️");
  const [calendarUrl, setCalendarUrl] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data: groupData } = useQuery<{ group: Group; myRole: string }>({
    queryKey: ["/api/groups", slug],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: !!user && !!slug,
  });

  const group = groupData?.group;
  const isAdmin = groupData?.myRole === "admin";

  // Redirect non-admins
  useEffect(() => {
    if (groupData && !isAdmin) setLocation(`/communities/${slug}`);
  }, [groupData, isAdmin, slug, setLocation]);

  // Populate form when group loads
  useEffect(() => {
    if (group) {
      setName(group.name);
      setDescription(group.description ?? "");
      setEmoji(group.emoji ?? "🏘️");
      setCalendarUrl(group.calendarUrl ?? "");
    }
  }, [group]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/groups/${slug}`, {
      name,
      description: description || undefined,
      emoji,
      calendarUrl: calendarUrl || "",
    }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    },
  });

  if (!group) return null;

  return (
    <Layout>
      <div className="max-w-lg mx-auto w-full">
        <button
          onClick={() => setLocation(`/communities/${slug}`)}
          className="text-xs mb-4 flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "#8FAF96" }}
        >
          ← {group.name}
        </button>

        <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: FONT }}>
          Community Settings
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>Edit details for {group.name}.</p>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* Emoji */}
        <div className="mb-4">
          <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            Icon
          </label>
          <div className="flex items-center gap-3 mb-2">
            <div className="text-4xl w-14 h-14 flex items-center justify-center rounded-2xl flex-shrink-0"
              style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}>
              {emoji}
            </div>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => setEmoji(e)}
                  className="text-xl w-9 h-9 flex items-center justify-center rounded-xl transition-all"
                  style={{
                    background: emoji === e ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                    border: `1px solid ${emoji === e ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.15)"}`,
                  }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
          />
        </div>

        {/* Description */}
        <div className="mb-6">
          <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            Description <span style={{ opacity: 0.5 }}>(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
          />
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* Calendar URL */}
        <div className="mb-2">
          <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            Parish Calendar URL <span style={{ opacity: 0.5 }}>(optional)</span>
          </label>
          <input
            type="url"
            value={calendarUrl}
            onChange={e => setCalendarUrl(e.target.value)}
            placeholder="https://calendar.google.com/calendar/ical/..."
            className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
          />
        </div>
        <div className="rounded-xl px-4 py-3 mb-6 text-xs space-y-1" style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.12)", color: "#8FAF96" }}>
          <p className="font-semibold" style={{ color: "#A8C5A0" }}>How to find your Google Calendar link:</p>
          <p>1. Open Google Calendar → Settings → select your calendar</p>
          <p>2. Scroll to "Integrate calendar"</p>
          <p>3. Copy the <strong>Public address in iCal format</strong></p>
          {calendarUrl && (
            <a href={calendarUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 pt-1 font-semibold"
              style={{ color: "#6FAF85" }}>
              <ExternalLink size={11} /> Test this link
            </a>
          )}
        </div>

        <button
          onClick={() => saveMutation.mutate()}
          disabled={!name.trim() || saveMutation.isPending}
          className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
          style={{ background: saved ? "rgba(46,107,64,0.5)" : "#2D5E3F", color: "#F0EDE6" }}
        >
          {saveMutation.isPending ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>
    </Layout>
  );
}
