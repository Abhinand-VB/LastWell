"use client";
import { useEffect, useState } from "react";
import { FALLBACK_CONFIG, loadConfig, type WebConfig } from "@/lib/config";

/** GET /api/config once; until it answers (or if it fails) the safe fallback flags apply. */
export function useConfig(): { config: WebConfig; loaded: boolean } {
  const [config, setConfig] = useState<WebConfig>(FALLBACK_CONFIG);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const attempt = () =>
      loadConfig()
        .then((c) => {
          if (!cancelled) {
            setConfig(c);
            setLoaded(true);
          }
        })
        .catch(() => {
          if (!cancelled) setTimeout(attempt, 3000);
        });
    attempt();
    return () => {
      cancelled = true;
    };
  }, []);
  return { config, loaded };
}
