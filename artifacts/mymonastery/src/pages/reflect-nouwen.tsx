import { useEffect } from "react";
import { useLocation } from "wouter";
import { openExternalThenMarkRead } from "@/lib/openExternal";
import { NOUWEN_TODAY_URL, markNouwenRead } from "@/lib/cacReadState";

// Where the "A moment to reflect" notification lands. It opens today's Nouwen
// meditation on the Henri Nouwen Society's own page, in the reader (the same open
// the home card does, with the same "read" mark), and puts the home behind it so Back
// from the reader lands somewhere sensible.
export default function ReflectNouwenPage() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/dashboard");
    // After the route change so the reader opens over the home, not over this blank page.
    const t = window.setTimeout(() => {
      openExternalThenMarkRead(NOUWEN_TODAY_URL, () => markNouwenRead(), { reader: true });
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
