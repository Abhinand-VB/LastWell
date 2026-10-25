"use client";
// W-12 (D-43 local delivery): play an alert's briefing WAV from the laptop speaker, then report
// `played` so the alert moves briefed → completed. One <audio> element per hook instance.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AlertSummary } from "@lastwell/core";
import { gateway } from "@/lib/gateway";
import { sendErrorText } from "@/lib/alerts";

export type PlayerState = "idle" | "loading" | "playing" | "error";

export function useBriefingPlayer(onAlert?: (a: AlertSummary) => void) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => audio.current?.pause(), []);

  const play = useCallback(
    async (alertId: string, opts: { report: boolean }) => {
      audio.current?.pause();
      const el = new Audio(gateway.audioUrl(alertId));
      audio.current = el;
      setPlayingId(alertId);
      setError(null);
      setState("loading");
      el.onplaying = () => setState("playing");
      el.onerror = () => {
        setState("error");
        setError("Could not load the briefing audio from the gateway.");
      };
      el.onended = async () => {
        setState("idle");
        if (!opts.report) return;
        try {
          const res = await gateway.played(alertId);
          onAlert?.(res.alert);
        } catch (err) {
          setError(sendErrorText(err).replace(/^Not sent: /, ""));
        }
      };
      try {
        await el.play();
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? `Playback blocked: ${err.message}` : "Playback blocked by the browser.");
      }
    },
    [onAlert],
  );

  const stop = useCallback(() => {
    audio.current?.pause();
    setState("idle");
  }, []);

  return { play, stop, state, playingId, error };
}
