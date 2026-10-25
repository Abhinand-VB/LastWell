"use client";
// Proposed D-57: the stroke team's live evidence page for one alerted call (convex/board.ts:callEvidence).
// Quoted evidence only (signs, facts, last known well, look-alikes, each with its quote and call time),
// never the transcript; it updates by itself while the caller is still on the line.
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { LevelPill } from "@/components/console/StrokeCard";
import { STATUS_LABEL } from "@/lib/alerts";
import { EvidenceResult, factLabel, type Evidence } from "@/lib/boardLive";
import { SIGN_LABEL, mmss } from "@/lib/format";
import { ConvexIndicator as Indicator, ConvexShell as Shell, useBoardToken } from "../ConvexBoardView";

const callEvidenceRef = makeFunctionReference<"query", { token: string; callId: string }, unknown>("board:callEvidence");

export function EvidenceView({ callId }: { callId: string }) {
  const frame = (body: ReactNode, text = "live: Convex") => <Frame indicator={<Indicator text={text} />}>{body}</Frame>;
  return (
    <Shell unset={frame(<Note>NEXT_PUBLIC_CONVEX_URL is not set.</Note>, "Convex: NEXT_PUBLIC_CONVEX_URL unset")} connecting={frame(<Note>Connecting…</Note>)}>
      <LiveEvidence callId={callId} />
    </Shell>
  );
}

function LiveEvidence({ callId }: { callId: string }) {
  const { args, renew } = useBoardToken();
  const raw = useQuery(callEvidenceRef, args ? { token: args.token, callId } : "skip");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (raw === undefined) return; // loading or switching tokens: keep the last evidence on screen
    const parsed = EvidenceResult.safeParse(raw);
    if (!parsed.success) return setProblem("unexpected data");
    if (parsed.data.ok) {
      setProblem(null);
      setEvidence(parsed.data.evidence);
    } else if (parsed.data.error === "unauthorized") {
      setProblem("token expired, renewing");
      renew();
    } else {
      setProblem("not_found");
    }
    // renew only bumps a counter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const indicator = <Indicator text={problem && problem !== "not_found" ? `live: Convex (${problem})` : "live: Convex"} />;
  if (problem === "not_found") return <Frame indicator={indicator}><Note>No pre-alert was sent for this call.</Note></Frame>;
  if (!evidence) return <Frame indicator={indicator}><Note>Connecting…</Note></Frame>;
  return (
    <Frame indicator={indicator}>
      <EvidenceBody e={evidence} />
    </Frame>
  );
}

function Frame({ indicator, children }: { indicator: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-lw-page p-7 text-lw-ink [color-scheme:light]">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <Link href="/board" className="text-2xl font-bold tracking-tight text-lw-ink">
            ← Board
          </Link>
          <span className="text-2xl text-lw-ink-2">Live evidence</span>
        </div>
        {indicator}
      </header>
      {children}
    </main>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-16 text-center text-2xl text-lw-ink-3">{children}</p>;
}

function Quote({ quote, tMs }: { quote: string; tMs: number }) {
  return (
    <>
      <span className="text-lw-evidence underline decoration-lw-evidence-line decoration-2 underline-offset-4">“{quote}”</span>
      <span className="ml-3 font-mono text-sm text-lw-ink-3">{mmss(tMs)}</span>
    </>
  );
}

function EvidenceBody({ e }: { e: Evidence }) {
  const alert = e.alerts[0] ?? null;
  return (
    <article data-testid="evidence" data-version={e.version} className="mt-6 max-w-5xl rounded-3xl border border-lw-border bg-lw-surface p-7">
      <div className="flex flex-wrap items-center gap-3">
        <LevelPill level={e.level} />
        {e.label && <span className="rounded bg-lw-subtle px-2 py-0.5 text-sm font-bold text-lw-ink-2">{e.label}</span>}
        <span className="text-lg text-lw-ink-2">{e.callStatus === "live" ? "Caller still on the line" : "Call ended"}</span>
        {alert && (
          <span className="rounded-full bg-lw-subtle px-3 py-1 text-base font-semibold text-lw-ink">
            Briefing call: {STATUS_LABEL[alert.status]}
            {alert.emsConfirmedAt ? " · Paramedic-confirmed" : ""}
          </span>
        )}
      </div>

      <h2 className="mt-6 text-xl font-semibold text-lw-ink-2">Last known well</h2>
      <p className="mt-1 text-xl text-lw-ink" data-testid="evidence-lkw">
        {e.lkw ? (
          <>
            {e.lkw.display} <span className="ml-2 text-base"><Quote quote={e.lkw.quote} tMs={e.lkw.tMs} /></span>
          </>
        ) : (
          <span className="text-amber-700">Not established yet</span>
        )}
      </p>

      <h2 className="mt-6 text-xl font-semibold text-lw-ink-2">Signs heard</h2>
      {e.signs.length === 0 ? (
        <p className="mt-1 text-xl text-lw-ink-3">No stroke signs heard yet.</p>
      ) : (
        <ul className="mt-2 space-y-2" data-testid="evidence-signs">
          {e.signs.map((s, i) => (
            <li key={`${s.kind}-${i}`} className="flex items-baseline gap-3 text-xl">
              <span className="w-24 shrink-0 font-semibold text-lw-ink">{SIGN_LABEL[s.kind]}</span>
              <Quote quote={s.quote} tMs={s.tMs} />
            </li>
          ))}
        </ul>
      )}

      {e.facts.length > 0 && (
        <>
          <h2 className="mt-6 text-xl font-semibold text-lw-ink-2">Facts</h2>
          <dl className="mt-2 grid grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-xl" data-testid="evidence-facts">
            {e.facts.map((f, i) => (
              <div key={`${f.kind}-${i}`} className="contents">
                <dt className="text-lw-ink-2">{factLabel(f.kind)}</dt>
                <dd className="text-lw-ink">
                  <span className="font-semibold">{f.value}</span> <span className="text-base"><Quote quote={f.quote} tMs={f.tMs} /></span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {e.lookalikes.length > 0 && (
        <>
          <h2 className="mt-6 text-xl font-semibold text-lw-ink-2">Look-alikes raised</h2>
          <ul className="mt-2 space-y-2 text-xl">
            {e.lookalikes.map((l, i) => (
              <li key={`${l.name}-${i}`} className="text-lw-ink">
                {l.name}
                {l.ref && (
                  <span className="ml-3 text-base">
                    <Quote quote={l.ref.quote} tMs={l.ref.tMs} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-6 text-base text-lw-ink-2">The treating team makes every treatment decision.</p>
    </article>
  );
}
