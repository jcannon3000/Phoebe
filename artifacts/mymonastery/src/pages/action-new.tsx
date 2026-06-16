import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useBetaStatus } from "@/hooks/useDemo";

// ── New action ───────────────────────────────────────────────────────────────
// Admin-only form for creating a community "action" (an advocacy /
// community-action event). Reached from the dashboard's admin compose
// menu. On submit the server fans out an on-creation push to the whole
// community and schedules the week-before / day-before reminders.

const FONT = "'Space Grotesk', sans-serif";

const INPUT_STYLE: React.CSSProperties = {
  background: "#0F2818",
  border: "1px solid rgba(46,107,64,0.4)",
  color: "#F0EDE6",
  fontFamily: FONT,
};

type Group = {
  id: number;
  name: string;
  emoji: string | null;
  slug: string;
  myRole: string;
};

type Intercession = { id: number; name: string; intention: string };

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
      style={{ color: "rgba(143,175,150,0.7)" }}
    >
      {children}
    </label>
  );
}

export default function ActionNewPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const { data: groupsData } = useQuery<{ groups: Group[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
  });

  // Only communities the user actually administers can host an action.
  const adminGroups = useMemo(
    () =>
      (groupsData?.groups ?? []).filter(
        (g) => g.myRole === "admin" || g.myRole === "hidden_admin",
      ),
    [groupsData],
  );

  const [groupId, setGroupId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [eventAt, setEventAt] = useState(""); // datetime-local string
  const [location, setLocationField] = useState("");
  const [description, setDescription] = useState("");
  const [learnMoreUrl, setLearnMoreUrl] = useState("");
  const [attachedMomentId, setAttachedMomentId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // "Email your officials" — beta only. The creator names the
  // officials members should email about this action.
  const { isBeta } = useBetaStatus();
  const [emailSubject, setEmailSubject] = useState("");
  const [officials, setOfficials] = useState<
    Array<{ name: string; title: string; email: string }>
  >([]);
  const addOfficial = () =>
    setOfficials((o) => [...o, { name: "", title: "", email: "" }]);
  const updateOfficial = (i: number, field: "name" | "title" | "email", value: string) =>
    setOfficials((o) => o.map((x, j) => (j === i ? { ...x, [field]: value } : x)));
  const removeOfficial = (i: number) =>
    setOfficials((o) => o.filter((_, j) => j !== i));

  // Default the community to the only one the user administers.
  const effectiveGroupId = groupId ?? (adminGroups.length === 1 ? adminGroups[0].id : null);

  // Intercessions belonging to the chosen community — offered as the
  // optional "attach a prayer" link.
  const { data: intercessionData } = useQuery<{ intercessions: Intercession[] }>({
    queryKey: [`/api/actions/intercession-options?groupId=${effectiveGroupId}`],
    queryFn: () =>
      apiRequest("GET", `/api/actions/intercession-options?groupId=${effectiveGroupId}`),
    enabled: effectiveGroupId != null,
  });
  const intercessions = intercessionData?.intercessions ?? [];

  const createMutation = useMutation({
    mutationFn: () => {
      const iso = new Date(eventAt).toISOString();
      const cleanOfficials = officials
        .map((o) => ({
          name: o.name.trim(),
          title: o.title.trim(),
          email: o.email.trim(),
        }))
        .filter((o) => o.name && o.email)
        .map((o) => ({ name: o.name, title: o.title || undefined, email: o.email }));
      return apiRequest("POST", "/api/actions", {
        groupId: effectiveGroupId,
        title: title.trim(),
        description: description.trim(),
        eventAt: iso,
        location: location.trim() || undefined,
        learnMoreUrl: learnMoreUrl.trim() || undefined,
        attachedMomentId: attachedMomentId ?? undefined,
        officials: isBeta && cleanOfficials.length > 0 ? cleanOfficials : undefined,
        emailSubject:
          isBeta && cleanOfficials.length > 0 && emailSubject.trim()
            ? emailSubject.trim()
            : undefined,
      }) as Promise<{ action: { id: number } }>;
    },
    onSuccess: (res) => {
      setLocation(`/actions/${res.action.id}`);
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError
          ? err.message
          : t("action_new.error_create_failed", {
              defaultValue: "Couldn't create the action.",
            }),
      );
    },
  });

  const submit = () => {
    setFormError(null);
    if (effectiveGroupId == null) {
      setFormError(
        t("action_new.error_choose_community", {
          defaultValue: "Choose a community.",
        }),
      );
      return;
    }
    if (!title.trim()) {
      setFormError(
        t("action_new.error_missing_title", {
          defaultValue: "Give the action a title.",
        }),
      );
      return;
    }
    if (!description.trim()) {
      setFormError(
        t("action_new.error_missing_description", {
          defaultValue:
            "Add a description so people know what they're showing up for.",
        }),
      );
      return;
    }
    if (!eventAt) {
      setFormError(
        t("action_new.error_missing_datetime", {
          defaultValue: "Set the date and time.",
        }),
      );
      return;
    }
    if (isNaN(new Date(eventAt).getTime())) {
      setFormError(
        t("action_new.error_invalid_datetime", {
          defaultValue: "That date and time looks off.",
        }),
      );
      return;
    }
    if (isBeta) {
      const halfFilled = officials.some((o) => {
        const filled = o.name.trim() || o.title.trim() || o.email.trim();
        return filled && !(o.name.trim() && o.email.trim());
      });
      if (halfFilled) {
        setFormError(
          t("action_new.error_official_incomplete", {
            defaultValue: "Each official needs both a name and an email.",
          }),
        );
        return;
      }
    }
    createMutation.mutate();
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0C1F12", color: "#F0EDE6", fontFamily: FONT }}
    >
      <header
        className="px-5 pb-2"
        style={{ paddingTop: "max(1.25rem, calc(var(--safe-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="text-sm"
          style={{
            color: "rgba(143,175,150,0.8)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          ← {t("action_new.back", { defaultValue: "Back" })}
        </button>
      </header>

      <main className="flex-1 px-5 pb-16">
        <div className="w-full max-w-md mx-auto">
          <h1
            className="text-2xl font-semibold leading-tight mt-2 mb-1"
            style={{ color: "#F0EDE6" }}
          >
            {t("action_new.heading", {
              defaultValue: "Call your community to action",
            })}
          </h1>
          <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
            {t("action_new.subheading", {
              defaultValue:
                "Everyone in the community gets a heads-up now, a week before, and the day before.",
            })}
          </p>

          {adminGroups.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(200,212,192,0.7)" }}>
              {t("action_new.admin_required", {
                defaultValue:
                  "You need to be an admin of a community to create an action.",
              })}
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Community — only shown as a picker when the admin runs
                  more than one community. */}
              {adminGroups.length > 1 && (
                <div>
                  <Label>
                    {t("action_new.field_community", {
                      defaultValue: "Community",
                    })}
                  </Label>
                  <select
                    value={effectiveGroupId ?? ""}
                    onChange={(e) => {
                      setGroupId(Number(e.target.value) || null);
                      setAttachedMomentId(null);
                    }}
                    className="w-full rounded-xl px-3 py-3 text-sm"
                    style={INPUT_STYLE}
                  >
                    <option value="">
                      {t("action_new.community_placeholder", {
                        defaultValue: "Choose a community…",
                      })}
                    </option>
                    {adminGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.emoji ? `${g.emoji} ` : ""}
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label>
                  {t("action_new.field_title", { defaultValue: "Title" })}
                </Label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("action_new.title_placeholder", {
                    defaultValue: "Show up for the city council vote",
                  })}
                  maxLength={200}
                  className="w-full rounded-xl px-3 py-3 text-sm"
                  style={INPUT_STYLE}
                />
              </div>

              <div>
                <Label>
                  {t("action_new.field_datetime", { defaultValue: "Date & time" })}
                </Label>
                <input
                  type="datetime-local"
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                  className="w-full rounded-xl px-3 py-3 text-sm"
                  style={INPUT_STYLE}
                />
              </div>

              <div>
                <Label>
                  {t("action_new.field_location", {
                    defaultValue: "Location (optional)",
                  })}
                </Label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocationField(e.target.value)}
                  placeholder={t("action_new.location_placeholder", {
                    defaultValue: "City Hall, 100 Main St",
                  })}
                  maxLength={500}
                  className="w-full rounded-xl px-3 py-3 text-sm"
                  style={INPUT_STYLE}
                />
              </div>

              <div>
                <Label>
                  {t("action_new.field_description", {
                    defaultValue: "Description",
                  })}
                </Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("action_new.description_placeholder", {
                    defaultValue:
                      "What's happening, why it matters, and what to expect.",
                  })}
                  rows={5}
                  maxLength={8000}
                  className="w-full rounded-xl px-3 py-3 text-sm leading-relaxed"
                  style={{ ...INPUT_STYLE, resize: "vertical" }}
                />
              </div>

              <div>
                <Label>
                  {t("action_new.field_learn_more", {
                    defaultValue: "Learn more link (optional)",
                  })}
                </Label>
                <input
                  type="url"
                  value={learnMoreUrl}
                  onChange={(e) => setLearnMoreUrl(e.target.value)}
                  placeholder="https://…"
                  maxLength={2000}
                  className="w-full rounded-xl px-3 py-3 text-sm"
                  style={INPUT_STYLE}
                />
              </div>

              {/* Attach a prayer — links one of the community's existing
                  intercessions so members can pray toward the action. */}
              {intercessions.length > 0 && (
                <div>
                  <Label>
                    {t("action_new.field_attach_prayer", {
                      defaultValue: "Attach a prayer (optional)",
                    })}
                  </Label>
                  <select
                    value={attachedMomentId ?? ""}
                    onChange={(e) =>
                      setAttachedMomentId(Number(e.target.value) || null)
                    }
                    className="w-full rounded-xl px-3 py-3 text-sm"
                    style={INPUT_STYLE}
                  >
                    <option value="">
                      {t("action_new.no_attached_prayer", {
                        defaultValue: "No attached prayer",
                      })}
                    </option>
                    {intercessions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <p
                    className="text-[12px] mt-1.5"
                    style={{ color: "rgba(143,175,150,0.7)" }}
                  >
                    {t("action_new.attach_prayer_help", {
                      defaultValue:
                        "Links a community intercession to this action.",
                    })}
                  </p>
                </div>
              )}

              {/* Email your officials — beta only. The creator names
                  the officials members should email about this; each
                  becomes an "Email …" button on the detail page that
                  opens the device mail app pre-filled. */}
              {isBeta && (
                <div>
                  <Label>
                    {t("action_new.field_email_officials", {
                      defaultValue: "Email your officials (optional)",
                    })}
                  </Label>
                  <p
                    className="text-[12px] mb-2.5"
                    style={{ color: "rgba(143,175,150,0.7)" }}
                  >
                    {t("action_new.email_officials_help", {
                      defaultValue:
                        "Add officials members can email about this — name, role, and their public email address. State & local officials publish these; members of Congress don't.",
                    })}
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {officials.map((o, i) => (
                      <div
                        key={i}
                        className="rounded-xl p-3 flex flex-col gap-2"
                        style={{
                          background: "rgba(46,107,64,0.08)",
                          border: "1px solid rgba(46,107,64,0.25)",
                        }}
                      >
                        <input
                          type="text"
                          value={o.name}
                          onChange={(e) => updateOfficial(i, "name", e.target.value)}
                          placeholder={t("action_new.official_name_placeholder", {
                            defaultValue: "Name (e.g. Jane Doe)",
                          })}
                          maxLength={160}
                          className="w-full rounded-lg px-3 py-2.5 text-sm"
                          style={INPUT_STYLE}
                        />
                        <input
                          type="text"
                          value={o.title}
                          onChange={(e) => updateOfficial(i, "title", e.target.value)}
                          placeholder={t("action_new.official_role_placeholder", {
                            defaultValue: "Role (e.g. State Senator, District 5)",
                          })}
                          maxLength={160}
                          className="w-full rounded-lg px-3 py-2.5 text-sm"
                          style={INPUT_STYLE}
                        />
                        <input
                          type="email"
                          value={o.email}
                          onChange={(e) => updateOfficial(i, "email", e.target.value)}
                          placeholder="email@…"
                          maxLength={320}
                          className="w-full rounded-lg px-3 py-2.5 text-sm"
                          style={INPUT_STYLE}
                        />
                        <button
                          type="button"
                          onClick={() => removeOfficial(i)}
                          className="self-start text-[12px] transition-opacity hover:opacity-80"
                          style={{
                            color: "rgba(200,150,150,0.8)",
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            fontFamily: FONT,
                          }}
                        >
                          {t("action_new.remove_official", {
                            defaultValue: "Remove",
                          })}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addOfficial}
                    className="mt-2.5 text-[13px] font-semibold rounded-full px-3.5 py-2 transition-opacity hover:opacity-90"
                    style={{
                      background: "rgba(46,107,64,0.18)",
                      border: "1px solid rgba(46,107,64,0.4)",
                      color: "#A8C5A0",
                      fontFamily: FONT,
                      cursor: "pointer",
                    }}
                  >
                    {t("action_new.add_official", {
                      defaultValue: "+ Add an official",
                    })}
                  </button>
                  {officials.length > 0 && (
                    <div className="mt-3">
                      <Label>
                        {t("action_new.field_email_subject", {
                          defaultValue: "Email subject",
                        })}
                      </Label>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder={
                          title.trim() ||
                          t("action_new.email_subject_placeholder", {
                            defaultValue: "Subject line for the email",
                          })
                        }
                        maxLength={200}
                        className="w-full rounded-xl px-3 py-3 text-sm"
                        style={INPUT_STYLE}
                      />
                      <p
                        className="text-[12px] mt-1.5"
                        style={{ color: "rgba(143,175,150,0.7)" }}
                      >
                        {t("action_new.email_subject_help", {
                          defaultValue:
                            "Members write their own note; this is just the subject line. Defaults to the action title.",
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {formError && (
                <p className="text-sm" style={{ color: "rgba(220,150,150,0.95)" }}>
                  {formError}
                </p>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={createMutation.isPending}
                className="w-full rounded-xl px-4 py-3.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{
                  background: "#2D5E3F",
                  border: "1px solid rgba(46,107,64,0.7)",
                  color: "#F0EDE6",
                  fontFamily: FONT,
                  cursor: createMutation.isPending ? "default" : "pointer",
                }}
              >
                {createMutation.isPending
                  ? t("action_new.submit_pending", { defaultValue: "Posting…" })
                  : t("action_new.submit", { defaultValue: "Post action" })}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
