import type { CallAndResponseLine } from "./types";

interface CallAndResponseProps {
  lines: CallAndResponseLine[];
  theme?: "morning" | "evening";
}

const MORNING_STYLES: Record<CallAndResponseLine["speaker"], React.CSSProperties> = {
  officiant: { color: "#2C1810", fontWeight: 400, paddingLeft: 0 },
  people: { color: "#D4896A", fontWeight: 400, paddingLeft: 0 },
  both: { color: "#2C1810", fontWeight: 500 },
};

const EVENING_STYLES: Record<CallAndResponseLine["speaker"], React.CSSProperties> = {
  officiant: { color: "#E8E4D8", fontWeight: 400, paddingLeft: 0 },
  people: { color: "#8FAF96", fontWeight: 400, paddingLeft: 0 },
  both: { color: "#E8E4D8", fontWeight: 500 },
};

const SPEAKER_LABEL: Record<CallAndResponseLine["speaker"], string | null> = {
  officiant: "V.",
  people: "R.",
  both: null,
};

export function CallAndResponse({ lines, theme = "morning" }: CallAndResponseProps) {
  const styles = theme === "evening" ? EVENING_STYLES : MORNING_STYLES;
  const labelColor = theme === "evening" ? "rgba(143,175,150,0.6)" : "#9B8577";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {lines.map((line, i) => {
        const label = SPEAKER_LABEL[line.speaker];
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            {label && (
              <span
                style={{
                  fontSize: 11,
                  color: labelColor,
                  fontFamily: "Space Grotesk, sans-serif",
                  letterSpacing: "0.05em",
                  minWidth: 18,
                  paddingTop: 3,
                  flexShrink: 0,
                }}
              >
                {label}
              </span>
            )}
            <p
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.85,
                fontFamily: "Space Grotesk, sans-serif",
                ...styles[line.speaker],
                paddingLeft: !label ? 26 : 0,
              }}
            >
              {line.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
