import { useState, useEffect, useRef } from "react";

interface Connection {
  name: string;
  email: string;
}

interface InviteStepProps {
  type: "practice" | "tradition";
  onPeopleChange: (people: { name: string; email: string }[]) => void;
}

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export function InviteStep({ type: _type, onPeopleChange }: InviteStepProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [manualPeople, setManualPeople] = useState([{ name: "", email: "" }]);
  const [showAllConnections, setShowAllConnections] = useState(false);
  const [activeField, setActiveField] = useState<{ row: number; field: "name" | "email" } | null>(null);
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/connections", { credentials: "include" })
      .then(r => r.ok ? r.json() : { connections: [] })
      .then(d => { setConnections(d.connections ?? []); setConnectionsLoading(false); })
      .catch(() => { setConnections([]); setConnectionsLoading(false); });
  }, []);

  const selectedConnections = connections.filter(c => selectedEmails.has(c.email.toLowerCase()));
  const validManual = manualPeople.filter(p => isValidEmail(p.email));
  const deduped = validManual.filter(p => !selectedEmails.has(p.email.toLowerCase()));
  const allInvited = [...selectedConnections, ...deduped];

  useEffect(() => {
    onPeopleChange(allInvited);
  }, [selectedEmails, manualPeople]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setActiveField(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggleConnection = (email: string) => {
    const key = email.toLowerCase();
    setSelectedEmails(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const removePill = (email: string) => {
    const key = email.toLowerCase();
    setSelectedEmails(prev => { const n = new Set(prev); n.delete(key); return n; });
    setManualPeople(prev => {
      const next = prev.filter(p => p.email.toLowerCase() !== key);
      return next.length === 0 ? [{ name: "", email: "" }] : next;
    });
  };

  const updateManual = (i: number, field: "name" | "email", val: string) => {
    setManualPeople(prev => { const n = [...prev]; n[i] = { ...n[i], [field]: val }; return n; });
    setSuggestionQuery(val);
    setActiveField({ row: i, field });
  };

  const addManualRow = () => {
    if (manualPeople.length < 8) setManualPeople(prev => [...prev, { name: "", email: "" }]);
  };

  const removeManualRow = (i: number) => {
    if (manualPeople.length <= 1) setManualPeople([{ name: "", email: "" }]);
    else setManualPeople(prev => prev.filter((_, j) => j !== i));
  };

  const selectSuggestion = (c: Connection, rowIdx: number) => {
    setManualPeople(prev => {
      const n = [...prev];
      n[rowIdx] = { name: c.name, email: c.email };
      return n;
    });
    setActiveField(null);
  };

  // Filter suggestions based on current typing
  const getSuggestions = (rowIdx: number): Connection[] => {
    if (!activeField || activeField.row !== rowIdx) return [];
    const q = suggestionQuery.toLowerCase().trim();
    if (!q || q.length < 1) return [];
    const alreadyUsed = new Set([
      ...Array.from(selectedEmails),
      ...manualPeople.filter((_, i) => i !== rowIdx).map(p => p.email.toLowerCase()).filter(Boolean),
    ]);
    return connections
      .filter(c => !alreadyUsed.has(c.email.toLowerCase()))
      .filter(c =>
        c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
      )
      .slice(0, 5);
  };

  return (
    <div className="space-y-4 flex-1">
      {/* Section 1 — Manual entry with autocomplete */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Invite someone new
        </p>
        <div className="space-y-2">
          {manualPeople.map((p, i) => {
            const suggestions = getSuggestions(i);
            return (
              <div key={i} className="relative">
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={p.name}
                    onChange={e => updateManual(i, "name", e.target.value)}
                    onFocus={() => { setActiveField({ row: i, field: "name" }); setSuggestionQuery(p.name); }}
                    placeholder="Name"
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-background text-sm"
                  />
                  <input
                    type="email"
                    value={p.email}
                    onChange={e => {
                      const val = e.target.value;
                      updateManual(i, "email", val);
                      if (isValidEmail(val)) {
                        const match = connections.find(
                          c => c.email.toLowerCase() === val.trim().toLowerCase()
                        );
                        if (match && !p.name) {
                          setManualPeople(prev => {
                            const n = [...prev];
                            n[i] = { ...n[i], name: match.name };
                            return n;
                          });
                        }
                      }
                    }}
                    onFocus={() => { setActiveField({ row: i, field: "email" }); setSuggestionQuery(p.email); }}
                    placeholder="Email"
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-background text-sm"
                  />
                  {manualPeople.length > 1 && (
                    <button
                      onClick={() => removeManualRow(i)}
                      className="text-muted-foreground/50 hover:text-muted-foreground px-1 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
                {/* Autocomplete suggestions */}
                {activeField?.row === i && suggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-[#2E6B40]/40 overflow-hidden z-20"
                    style={{ background: "#0F2818" }}
                  >
                    {suggestions.map(c => (
                      <button
                        key={c.email}
                        onClick={() => selectSuggestion(c, i)}
                        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#2E6B40]/20 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {manualPeople.length < 8 && (
          <button
            onClick={addManualRow}
            className="mt-3 text-sm text-[#8FAF96] hover:text-[#8FAF96] transition-colors flex items-center gap-1"
          >
            + Add another person
          </button>
        )}
      </div>

      {/* Section 2 — Existing connections (3 visible + fade) */}
      {!connectionsLoading && connections.length > 0 && (() => {
        const VISIBLE = 3;
        const hasMore = connections.length > VISIBLE;
        return (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              From your practices and traditions 🌿
            </p>
            <div className="relative">
              <div className="space-y-1.5">
                {(showAllConnections ? connections : connections.slice(0, VISIBLE + (hasMore ? 1 : 0))).map((c, i) => {
                  const sel = selectedEmails.has(c.email.toLowerCase());
                  const isFaded = !showAllConnections && hasMore && i === VISIBLE;
                  return (
                    <button
                      key={c.email}
                      onClick={() => isFaded ? setShowAllConnections(true) : toggleConnection(c.email)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        sel ? "bg-[#2D5E3F] border-[#2E6B40]" : "bg-transparent border-[#2E6B40]/30 hover:border-[#2E6B40]/60"
                      }`}
                      style={isFaded ? { opacity: 0.35, maskImage: "linear-gradient(to bottom, black 0%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 100%)" } : undefined}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${sel ? "text-white" : "text-foreground"}`}>
                          {c.name || c.email.split("@")[0]}
                        </p>
                        <p className={`text-[11px] truncate ${sel ? "text-white/60" : "text-muted-foreground"}`}>
                          {c.email}
                        </p>
                      </div>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg shrink-0 ${
                        sel
                          ? "bg-white/20 text-white"
                          : "border border-[#2E6B40] text-[#8FAF96]"
                      }`}>
                        {sel ? "Added ✓" : "+ Add"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!showAllConnections && hasMore && (
                <button
                  onClick={() => setShowAllConnections(true)}
                  className="w-full text-center text-xs font-medium mt-2 py-1.5 transition-colors"
                  style={{ color: "#8FAF96" }}
                >
                  Show all {connections.length} connections
                </button>
              )}
            </div>
            {selectedEmails.size > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {selectedEmails.size} {selectedEmails.size === 1 ? "person" : "people"} added from your connections
              </p>
            )}
          </div>
        );
      })()}

      {/* Section 3 — Summary pills */}
      {allInvited.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Inviting:</p>
          <div className="flex flex-wrap gap-2">
            {allInvited.map((p, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2E6B40]/10 text-[#8FAF96] text-sm font-medium"
              >
                {p.name || p.email.split("@")[0]}
                <button
                  onClick={() => removePill(p.email)}
                  className="text-[#8FAF96]/60 hover:text-[#8FAF96] text-base leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
