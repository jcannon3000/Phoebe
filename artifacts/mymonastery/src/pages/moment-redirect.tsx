import { useEffect } from "react";
import { useLocation, useParams } from "wouter";

// Handles short links from calendar invites: /m/:userToken
// Looks up the full momentToken and redirects to the moment post page.
export default function MomentRedirect() {
  const { userToken } = useParams<{ userToken: string }>();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!userToken) { setLocation("/dashboard"); return; }

    fetch(`/api/m/${userToken}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.momentToken && data?.userToken) {
          setLocation(`/moment/${data.momentToken}/${data.userToken}`);
        } else {
          setLocation("/dashboard");
        }
      })
      .catch(() => setLocation("/dashboard"));
  }, [userToken, setLocation]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#091A10" }}
    >
      <div className="text-center">
        <p className="text-2xl mb-3">🙏</p>
        <p style={{ color: "#8FAF96", fontSize: "14px" }}>Opening your practice…</p>
      </div>
    </div>
  );
}
