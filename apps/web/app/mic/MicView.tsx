"use client";
// W-08: browser-microphone fallback (docs/05 §10, D-13, D-36). One mixed track: the laptop mic
// hears both people at the table. Audio → AudioWorklet (16 kHz s16le, 640-byte frames every
// 20 ms) → WS /browser/media/:callId?token=…; the console for the new call opens in a new tab.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { gateway } from "@/lib/gateway";
import { useConfig } from "@/hooks/useConfig";

type Phase = "idle" | "starting" | "live" | "stopping" | "error";

interface Session {
  ctx: AudioContext;
  stream: MediaStream;
  ws: WebSocket;
  callId: string;
}

export function MicView() {
  const { config, loaded } = useConfig();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [frames, setFrames] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const sent = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setFrames(sent.current), 250);
    return () => {
      clearInterval(t);
      teardown();
    };
  }, []);

  function teardown() {
    const s = session.current;
    session.current = null;
    if (!s) return;
    s.stream.getTracks().forEach((t) => t.stop());
    void s.ctx.close().catch(() => {});
    if (s.ws.readyState === WebSocket.OPEN) {
      s.ws.send(JSON.stringify({ type: "end" }));
      s.ws.close(1000, "stop");
    }
  }

  async function start() {
    setError(null);
    setPhase("starting");
    sent.current = 0;
    // Open the console tab synchronously inside the click so pop-up blockers allow it.
    const consoleTab = window.open("about:blank", "_blank");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const { callId: id, micWsUrl } = await gateway.startBrowserCall();
      const ws = new WebSocket(micWsUrl);
      ws.binaryType = "arraybuffer";
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("could not open the audio link to the gateway"));
      });
      ws.onclose = () => {
        if (session.current?.ws === ws) {
          setError("Audio link closed by the gateway.");
          setPhase("error");
          teardown();
        }
      };

      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule("/worklets/downsampler.js");
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "lw-downsampler", { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
      node.port.onmessage = (ev: MessageEvent<{ type: "frame"; buffer: ArrayBuffer } | { type: "level"; rms: number }>) => {
        const m = ev.data;
        if (m.type === "level") setLevel(Math.min(1, m.rms * 4));
        else if (ws.readyState === WebSocket.OPEN) {
          ws.send(m.buffer);
          sent.current += 1;
        }
      };
      src.connect(node);

      session.current = { ctx, stream, ws, callId: id };
      setCallId(id);
      setPhase("live");
      if (consoleTab) consoleTab.location.href = `/console/${id}`;
    } catch (err) {
      consoleTab?.close();
      teardown();
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Microphone permission denied — allow the microphone for this page in the browser, then press Start again."
          : name === "NotFoundError"
            ? "No microphone found on this laptop."
            : err instanceof Error
              ? err.message
              : "could not start the microphone",
      );
      setPhase("error");
    }
  }

  async function stop() {
    const id = session.current?.callId ?? callId;
    setPhase("stopping");
    teardown();
    if (id) await gateway.endCall(id).catch(() => {});
    setPhase("idle");
    setLevel(0);
  }

  const disabled = loaded && !config.featureBrowserMic;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-baseline justify-between">
        <Link href="/" className="text-3xl font-bold tracking-tight text-white">
          LastWell
        </Link>
        <span className="text-xl text-slate-400">Browser microphone fallback</span>
      </header>

      <p className="text-xl leading-relaxed text-slate-300">
        Use this when the phone line fails. Put the laptop between the caller and the dispatcher: one microphone hears both,
        and the transcript is labelled <span className="font-semibold text-violet-300">Mic</span>.
      </p>

      {disabled ? (
        <p className="rounded-xl bg-slate-800 p-5 text-xl text-slate-300">The browser-mic fallback is turned off (FEATURE_BROWSER_MIC).</p>
      ) : (
        <section className="rounded-3xl bg-slate-900/80 p-8 ring-1 ring-slate-700/60">
          {phase === "live" || phase === "stopping" ? (
            <button
              type="button"
              data-testid="mic-stop"
              onClick={stop}
              disabled={phase === "stopping"}
              className="w-full rounded-2xl bg-slate-200 px-6 py-5 text-2xl font-bold text-slate-900 hover:bg-white disabled:opacity-60"
            >
              Stop and end call
            </button>
          ) : (
            <button
              type="button"
              data-testid="mic-start"
              onClick={start}
              disabled={phase === "starting"}
              className="w-full rounded-2xl bg-sky-600 px-6 py-5 text-2xl font-bold text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {phase === "starting" ? "Starting…" : "Start microphone call"}
            </button>
          )}

          <div className="mt-8">
            <div className="flex items-baseline justify-between text-base text-slate-400">
              <span>Input level</span>
              <span className="font-mono tabular-nums" data-testid="mic-frames">
                {frames} frames sent
              </span>
            </div>
            <div className="mt-2 h-5 overflow-hidden rounded-full bg-slate-800" aria-label="Microphone level">
              <div
                data-testid="mic-level"
                className="h-full rounded-full bg-emerald-400 transition-[width] duration-100"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
          </div>

          {callId && (
            <p className="mt-6 text-lg text-slate-300">
              Call{" "}
              <Link className="text-sky-300 underline" href={`/console/${callId}`} target="_blank">
                open console
              </Link>
            </p>
          )}
          {error && (
            <p role="alert" className="mt-6 rounded-lg bg-red-500/15 px-4 py-3 text-lg text-red-200 ring-1 ring-red-400/60">
              {error}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
