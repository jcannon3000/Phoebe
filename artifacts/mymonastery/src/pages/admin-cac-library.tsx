import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ToggleRow } from "@/components/ToggleRow";
import { apiRequest } from "@/lib/queryClient";
import { useBetaStatus } from "@/hooks/useDemo";

/**
 * /admin/cac-library — which communities may open the CAC audio library.
 *
 * Owner (2026-09-05): "a pilot community that is able to access the Center
 * for Action and Contemplation audio content." The grant has been per-group
 * on the server all along (groups.cacLibraryEnabled; PATCH
 * /api/groups/:slug/cac-library; useCacLibrary reads a member's grant) — this
 * is the switchboard it never had. A member of any enabled group sees the
 * shows on Courses and can open them.
 */

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type GroupRow = { id: number; slug: string; name: string };

export default function AdminCacLibraryPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { rawIsAdmin: isAdmin } = useBetaStatus();
  const groups = useQuery<{ groups: GroupRow[] }>({
    queryKey: ["/api/groups"],
    enabled: isAdmin,
    queryFn: () => apiRequest("GET", "/api/groups") as Promise<{ groups: GroupRow[] }>,
  });
  const enabled = useQuery<{ groups: GroupRow[] }>({
    queryKey: ["/api/admin/cac-library"],
    enabled: isAdmin,
    queryFn: () => apiRequest("GET", "/api/admin/cac-library") as Promise<{ groups: GroupRow[] }>,
  });
  const on = new Set((enabled.data?.groups ?? []).map((g) => g.slug));

  const setEnabled = async (slug: string, value: boolean) => {
    // Optimistic on the enabled list; the PATCH is the truth, then refetch.
    qc.setQueryData<{ groups: GroupRow[] }>(["/api/admin/cac-library"], (cur) => {
      const list = cur?.groups ?? [];
      const g = (groups.data?.groups ?? []).find((x) => x.slug === slug);
      if (value) return { groups: g && !list.some((x) => x.slug === slug) ? [...list, g] : list };
      return { groups: list.filter((x) => x.slug !== slug) };
    });
    try {
      await apiRequest("PATCH", `/api/groups/${slug}/cac-library`, { enabled: value });
    } finally {
      void qc.invalidateQueries({ queryKey: ["/api/admin/cac-library"] });
      // A member's own grant (useCacLibrary) re-reads on its next fetch.
      void qc.invalidateQueries({ queryKey: ["/api/me/cac-library"] });
    }
  };

  if (!isAdmin) {
    return <Layout><p style={{ color: SAGE, fontFamily: FONT, padding: 24 }}>Admins only.</p></Layout>;
  }
  const all = [...(groups.data?.groups ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Layout>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "8px 16px 48px", color: WARM, fontFamily: FONT }}>
        <button type="button" onClick={() => setLocation("/admin/tools")}
          style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14 }}>
          ← Admin Tools
        </button>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>CAC audio library</h1>
        <p style={{ color: SAGE, fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 }}>
          Switch a community on and its members can open the Center for Action and Contemplation shows from Courses.
        </p>
        {groups.isLoading && <p style={{ color: SAGE, fontSize: 14 }}>Loading communities…</p>}
        {!groups.isLoading && all.length === 0 && <p style={{ color: SAGE, fontSize: 14 }}>No communities yet.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {all.map((g) => (
            <ToggleRow
              key={g.slug}
              emoji="🌵"
              label={g.name}
              description={on.has(g.slug) ? "Members can open the CAC shows" : g.slug}
              enabled={on.has(g.slug)}
              onToggle={() => { void setEnabled(g.slug, !on.has(g.slug)); }}
            />
          ))}
        </div>
      </div>
    </Layout>
  );
}
