import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BcpPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/bcp/intercessions");
  }, [setLocation]);

  return null;
}
