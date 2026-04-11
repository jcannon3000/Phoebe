import { useEffect } from "react";

const STATE_ABBR: Record<string, string> = { "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC" };

function parsePostmark(raw: string) {
  const parts = raw.split(", ");
  if (parts.length >= 2) {
    const city = parts[0];
    const stateZip = parts.slice(1).join(", ");
    const tokens = stateZip.split(" ");
    const last = tokens[tokens.length - 1];
    if (/^\d{5}(-\d{4})?$/.test(last)) {
      const fullState = tokens.slice(0, -1).join(" ");
      return { city, state: STATE_ABBR[fullState] || fullState, zip: last };
    }
    return { city, state: STATE_ABBR[stateZip] || stateZip, zip: "" };
  }
  return { city: raw, state: "", zip: "" };
}
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface LetterData {
  id: number;
  correspondenceId: number;
  authorUserId: number | null;
  authorEmail: string;
  authorName: string;
  content: string;
  letterNumber: number;
  periodNumber: number;
  periodStartDate: string;
  postmarkCity: string | null;
  postmarkCountry: string | null;
  sentAt: string;
  readBy: Array<string | number>;
}

interface CorrespondenceDetail {
  id: number;
  name: string;
  groupType: string;
  members: Array<{
    id: number;
    name: string | null;
    email: string;
  }>;
  letters: LetterData[];
  myTurn: boolean;
  currentPeriod: {
    hasWrittenThisPeriod: boolean;
    periodNumber: number;
    periodLabel: string;
  };
}

function formatLetterDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export default function ReadLetter() {
  const [, params] = useRoute("/letters/:id/read/:letterId");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const correspondenceId = params?.id;
  const letterId = params?.letterId;
  const token = new URLSearchParams(window.location.search).get("token");
  const tokenParam = token ? `?token=${token}` : "";

  const { data } = useQuery<CorrespondenceDetail>({
    queryKey: [`/api/phoebe/correspondences/${correspondenceId}`],
    queryFn: async () => {
      try {
        return await apiRequest("GET", `/api/phoebe/correspondences/${correspondenceId}${tokenParam}`);
      } catch {
        return await apiRequest("GET", `/api/letters/correspondences/${correspondenceId}${tokenParam}`);
      }
    },
    enabled: !!correspondenceId && (!!user || !!token),
  });

  const letter = data?.letters?.find((l) => l.id === Number(letterId));
  const userEmail = user?.email || "";
  const isOwnLetter = letter?.authorEmail === userEmail;
  const isOneToOne = data?.groupType === "one_to_one";
  const hasWrittenThisPeriod = data?.currentPeriod?.hasWrittenThisPeriod ?? false;
  const myTurn = data?.myTurn ?? false;

  const otherMembers = data?.members
    .filter((m) => m.email !== userEmail)
    .map((m) => m.name || m.email.split("@")[0])
    .join(", ") ?? "";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Override dark page background for paper theme
  useEffect(() => {
    const root = document.getElementById("root");
    const prevRoot = root?.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    const prevHtml = document.documentElement.style.backgroundColor;
    if (root) root.style.backgroundColor = "#FAF6F0";
    document.body.style.backgroundColor = "#FAF6F0";
    document.documentElement.style.backgroundColor = "#FAF6F0";
    return () => {
      if (root) root.style.backgroundColor = prevRoot || "";
      document.body.style.backgroundColor = prevBody || "";
      document.documentElement.style.backgroundColor = prevHtml || "";
    };
  }, []);

  if (!letter) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF6F0" }}>
        <p style={{ color: "#9a9390" }}>Loading...</p>
      </div>
    );
  }

  const backUrl = `/letters/${correspondenceId}${tokenParam}`;
  const writeUrl = `/letters/${correspondenceId}/write${tokenParam}`;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF6F0" }}>
      {/* Header */}
      <div className="px-6 pt-8 pb-4 max-w-3xl mx-auto">
        <button
          onClick={() => setLocation(backUrl)}
          className="text-sm"
          style={{ color: "#9a9390" }}
        >
          ← Back
        </button>
      </div>

      {/* Letter paper */}
      <div
        className="max-w-3xl mx-auto relative"
        style={{
          backgroundColor: "#FAF6F0",
          boxShadow: "inset 0 0 0 1px rgba(46,107,64,0.1), 0 4px 24px rgba(44,24,16,0.08)",
          padding: "48px 32px",
          borderRadius: "2px",
          marginTop: "16px",
        }}
      >
        {/* Letter metadata */}
        <p
          className="text-[11px] font-semibold uppercase mb-8"
          style={{ color: "#9a9390", letterSpacing: "0.1em" }}
        >
          {letter.authorName}
          {" · "}
          {isOneToOne ? `Letter ${letter.letterNumber}` : `Update ${letter.letterNumber}`}
          {letter.postmarkCity && isOneToOne && (() => {
            const { city, state } = parsePostmark(letter.postmarkCity!);
            return ` · ${city}, ${state} · ${formatLetterDate(letter.sentAt)}`;
          })()}
        </p>


        {/* Letter body */}
        <div
          className="whitespace-pre-wrap"
          style={{
            color: "#2C1810",
            fontFamily: isOneToOne ? "Georgia, serif" : "'Space Grotesk', sans-serif",
            fontSize: "19px",
            lineHeight: "2.1",
          }}
        >
          {letter.content}
        </div>

        {/* Signature */}
        {isOneToOne && (
          <p className="text-base italic mt-6" style={{ color: "#9a9390", fontFamily: "Georgia, serif" }}>
            — {letter.authorName}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-[560px] mx-auto px-6 pt-8 pb-16 text-center">
        <p className="text-[13px]" style={{ color: "#9a9390" }}>
          {formatLetterDate(letter.sentAt)}
          {letter.postmarkCity ? ` · ${letter.postmarkCity}` : ""}
        </p>

        {/* Write back prompt */}
        {!isOwnLetter && myTurn && !hasWrittenThisPeriod && (
          <div className="mt-8">
            <p className="text-[15px] italic mb-4" style={{ color: "#5C7A5F" }}>
              {isOneToOne ? "Your turn to write. 🖋️" : "Share your update. 📮"}
            </p>
            <button
              onClick={() => setLocation(writeUrl)}
              className="px-6 py-3 rounded-xl font-semibold text-sm"
              style={{ backgroundColor: "#5C7A5F", color: "#fff" }}
            >
              {isOneToOne ? "Write your letter 🖋️" : "Share your update 📮"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
