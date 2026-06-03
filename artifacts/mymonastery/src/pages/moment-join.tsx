import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Sprout } from "lucide-react";

const SPIRITUAL_TEMPLATES = new Set(["morning-prayer", "evening-prayer", "intercession", "breath", "contemplative", "walk"]);
const TIME_OF_DAY_EMOJI: Record<string, string> = {
  morning:   "🌅",
  midday:    "☀️",
  afternoon: "🌤",
  night:     "🌙",
};

interface PracticeInfo {
  id: number;
  name: string;
  intention: string;
  templateType: string | null;
  timeOfDay: string | null;
  frequency: string;
  dayOfWeek: string | null;
  goalDays: number;
  loggingType: string;
  intercessionTopic: string | null;
  memberCount: number;
}

export default function MomentJoin() {
  const { t } = useTranslation();
  const { momentToken } = useParams<{ momentToken: string }>();
  const { user, isLoading: authLoading } = useAuth();

  const [phase, setPhase] = useState<"info" | "time" | "done">("info");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [personalHour, setPersonalHour] = useState(8);
  const [personalMinute, setPersonalMinute] = useState(0);
  const [personalAmPm, setPersonalAmPm] = useState<"AM" | "PM">("AM");
  const [personalTimezone, setPersonalTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [personalLink, setPersonalLink] = useState("");

  const { data, isLoading, isError } = useQuery<PracticeInfo>({
    queryKey: ["moment-info", momentToken],
    queryFn: async () => {
      const res = await fetch(`/api/moments/${momentToken}/info`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!momentToken,
  });

  const joinMutation = useMutation({
    mutationFn: async (payload: object) => {
      const res = await fetch(`/api/moments/${momentToken}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Join failed");
      return res.json() as Promise<{ userToken: string; personalLink: string; momentName: string }>;
    },
    onSuccess: (result) => {
      setPersonalLink(result.personalLink);
      setPhase("done");
    },
  });

  function handleJoinStep1() {
    if (!name.trim() || !email.trim()) return;
    const isSpiritual = SPIRITUAL_TEMPLATES.has(data?.templateType ?? "");
    if (isSpiritual && data?.timeOfDay) {
      setPhase("time");
    } else {
      joinMutation.mutate({ name: name.trim(), email: email.trim() });
    }
  }

  function handleJoinWithTime() {
    let h = personalHour % 12;
    if (personalAmPm === "PM") h += 12;
    if (h === 12 && personalAmPm === "AM") h = 0;
    const ptStr = `${String(h).padStart(2, "0")}:${String(personalMinute).padStart(2, "0")}`;
    joinMutation.mutate({
      name: name.trim(),
      email: email.trim(),
      personalTime: ptStr,
      personalTimezone,
    });
  }

  // Auto-populate from logged-in user
  useEffect(() => {
    if (user) {
      if (!name) setName(user.name);
      if (!email) setEmail(user.email);
    }
  }, [user]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-[#2C1A0E] flex items-center justify-center">
        <div className="text-[#F5EDD8] text-xl">🌿</div>
      </div>
    );
  }

  // Auth gate — require account
  if (!user) {
    const currentPath = `/moment/join/${momentToken}`;
    return (
      <div className="min-h-screen bg-[#2C1A0E] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-[#5C7A5F]/20 flex items-center justify-center mx-auto mb-5">
            <Sprout size={28} strokeWidth={1.5} className="text-[#9ecc9f]" />
          </div>
          <p className="text-xl font-semibold text-[#F5EDD8] mb-2">{t("moment_join.gate_title")}</p>
          {data && <p className="text-[#c9b99a] text-sm mb-1">{data.name}</p>}
          {data?.intention && <p className="text-[#c9b99a]/70 text-xs italic mb-6">"{data.intention}"</p>}
          {!data && <p className="text-[#c9b99a] text-sm mb-6">{t("moment_join.gate_create_to_join")}</p>}
          <a
            href={`/?redirect=${encodeURIComponent(currentPath)}`}
            className="inline-flex items-center justify-center w-full px-6 py-3.5 rounded-xl bg-[#5C7A5F] text-white font-medium text-sm transition-opacity hover:opacity-90 mb-3"
          >
            {t("moment_join.gate_create_account")}
          </a>
          <a
            href={`/?redirect=${encodeURIComponent(currentPath)}`}
            className="text-sm text-[#c9b99a] hover:text-[#F5EDD8] transition-colors"
          >
            {t("moment_join.gate_already_have_account")}
          </a>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-[#2C1A0E] flex items-center justify-center px-4">
        <div className="text-center text-[#F5EDD8]">
          <div className="text-5xl mb-4">🍂</div>
          <p className="text-lg">{t("moment_join.not_found")}</p>
        </div>
      </div>
    );
  }

  const todEmoji = data.timeOfDay ? TIME_OF_DAY_EMOJI[data.timeOfDay] : null;
  const todLabel = data.timeOfDay ? t(`moment_join.tod_${data.timeOfDay}`) : null;
  const isSpiritual = SPIRITUAL_TEMPLATES.has(data.templateType ?? "");
  const freqLabel = data.frequency === "daily" ? t("moment_join.freq_daily") : data.frequency === "weekly" ? t("moment_join.freq_weekly") : t("moment_join.freq_monthly");

  // ── Done screen ──────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="min-h-screen bg-[#2C1A0E] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full text-center text-[#F5EDD8]"
        >
          <div className="text-6xl mb-4">🌿</div>
          <h2 className="text-2xl font-semibold mb-2">{t("moment_join.done_title")}</h2>
          <p className="text-[#c9b99a] mb-6 text-sm leading-relaxed">
            {t("moment_join.done_yours_to_tend", { name: data.name })}<br />
            {t("moment_join.done_calendar_invite")}
          </p>

          <a
            href="/dashboard"
            className="inline-block px-8 py-3 bg-[#5C7A5F] text-white rounded-full font-medium hover:bg-[#5a7a60] transition-colors"
          >
            {t("moment_join.done_go_dashboard")}
          </a>
        </motion.div>
      </div>
    );
  }

  // ── Personal time screen ─────────────────────────────────────────────────
  if (phase === "time") {
    const todLabelLower = (todLabel ?? t("moment_join.tod_morning")).toLowerCase();
    return (
      <div className="min-h-screen bg-[#2C1A0E] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="max-w-sm w-full text-[#F5EDD8]"
        >
          <div className="text-5xl mb-4 text-center">{todEmoji}</div>
          <h2 className="text-2xl font-semibold text-center mb-2">{t("moment_join.time_heading", { name: data.name, tod: todLabelLower })}</h2>
          <p className="text-[#c9b99a] text-center text-sm mb-8">
            {t("moment_join.time_question", { tod: todLabelLower })}
          </p>

          <div className="bg-[#3a2410] rounded-2xl p-6 space-y-5">
            {/* Hour */}
            <div>
              <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">{t("moment_join.label_hour")}</label>
              <div className="grid grid-cols-6 gap-1.5">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(hv => (
                  <button key={hv} onClick={() => setPersonalHour(hv)}
                    className={`py-2 rounded-lg border text-sm font-medium transition-all ${personalHour === hv ? "border-[#5C7A5F] bg-[#5C7A5F]/20 text-[#9ecc9f]" : "border-[#5a3d28] text-[#c9b99a] hover:border-[#5C7A5F]/40"}`}>
                    {hv}
                  </button>
                ))}
              </div>
            </div>
            {/* Minute */}
            <div>
              <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">{t("moment_join.label_minute")}</label>
              <div className="flex gap-2">
                {[0, 15, 30, 45].map(mv => (
                  <button key={mv} onClick={() => setPersonalMinute(mv)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${personalMinute === mv ? "border-[#5C7A5F] bg-[#5C7A5F]/20 text-[#9ecc9f]" : "border-[#5a3d28] text-[#c9b99a] hover:border-[#5C7A5F]/40"}`}>
                    :{String(mv).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
            {/* AM/PM */}
            <div className="flex gap-3">
              {(["AM", "PM"] as const).map(p => (
                <button key={p} onClick={() => setPersonalAmPm(p)}
                  className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${personalAmPm === p ? "border-[#5C7A5F] bg-[#5C7A5F]/20 text-[#9ecc9f]" : "border-[#5a3d28] text-[#c9b99a] hover:border-[#5C7A5F]/40"}`}>
                  {p}
                </button>
              ))}
            </div>
            {/* Timezone */}
            <div>
              <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">{t("moment_join.label_timezone")}</label>
              <select value={personalTimezone} onChange={e => setPersonalTimezone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#2C1A0E] border border-[#5a3d28] text-[#F5EDD8] focus:border-[#5C7A5F] focus:outline-none text-sm">
                {Intl.supportedValuesOf("timeZone").map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-[#c9b99a]/60 italic text-center">
              {t("moment_join.time_calendar_note")}<br />
              {t("moment_join.time_own_time_note")}
            </p>
          </div>

          <button
            onClick={handleJoinWithTime}
            disabled={joinMutation.isPending}
            className="w-full mt-6 py-4 rounded-2xl bg-[#5C7A5F] text-white text-base font-semibold hover:bg-[#5a7a60] transition-colors disabled:opacity-40"
          >
            {joinMutation.isPending ? t("moment_join.joining") : t("moment_join.set_my_time")}
          </button>
          {joinMutation.isError && (
            <p className="text-xs text-red-400 text-center mt-2">{t("moment_join.error_generic")}</p>
          )}
        </motion.div>
      </div>
    );
  }

  // ── Info / join screen ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#2C1A0E] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-sm w-full text-[#F5EDD8]"
      >
        {/* Practice info */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌿</div>
          <h1 className="text-2xl font-semibold mb-1">{data.name}</h1>
          <p className="text-[#c9b99a] text-sm italic mb-4 leading-relaxed">"{data.intention}"</p>
          <div className="flex justify-center gap-3 flex-wrap text-xs text-[#c9b99a]/80">
            {todEmoji && todLabel && (
              <span className="px-3 py-1 bg-[#3a2410] rounded-full">
                {todEmoji} {t("moment_join.tod_practice_badge", { tod: todLabel })}
              </span>
            )}
            <span className="px-3 py-1 bg-[#3a2410] rounded-full">
              {freqLabel}
            </span>
            {data.memberCount > 0 && (
              <span className="px-3 py-1 bg-[#3a2410] rounded-full">
                {t("moment_join.members_tending", { count: data.memberCount })}
              </span>
            )}
          </div>
          {data.intercessionTopic && (
            <p className="text-[#c9b99a]/70 text-xs mt-3 italic">{t("moment_join.holding_in_prayer", { topic: data.intercessionTopic })}</p>
          )}
        </div>

        {/* Join form */}
        <div className="bg-[#3a2410] rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">{t("moment_join.label_name")}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("moment_join.placeholder_name")}
              className="w-full px-4 py-3 rounded-xl bg-[#2C1A0E] border border-[#5a3d28] text-[#F5EDD8] placeholder-[#7a5a42] focus:border-[#5C7A5F] focus:outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">{t("moment_join.label_email")}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t("moment_join.placeholder_email")}
              className="w-full px-4 py-3 rounded-xl bg-[#2C1A0E] border border-[#5a3d28] text-[#F5EDD8] placeholder-[#7a5a42] focus:border-[#5C7A5F] focus:outline-none text-sm"
            />
          </div>
          <p className="text-xs text-[#c9b99a]/60 italic">{t("moment_join.email_invite_note")}</p>
        </div>

        <button
          onClick={handleJoinStep1}
          disabled={!name.trim() || !email.trim() || joinMutation.isPending}
          className="w-full mt-5 py-4 rounded-2xl bg-[#5C7A5F] text-white text-base font-semibold hover:bg-[#5a7a60] transition-colors disabled:opacity-40"
        >
          {joinMutation.isPending ? t("moment_join.joining") : t("moment_join.join_button")}
        </button>
        {joinMutation.isError && (
          <p className="text-xs text-red-400 text-center mt-2">{t("moment_join.error_generic")}</p>
        )}
      </motion.div>
    </div>
  );
}
