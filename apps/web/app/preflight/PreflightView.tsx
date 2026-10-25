"use client";
// D-54: pre-flight test actions (docs/08 §4), moved off the live console. Not linked from any page.
import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import { TestLinks } from "@/components/console/SendAlert";
import { useConfig } from "@/hooks/useConfig";

export function PreflightView() {
  const { config } = useConfig();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <main className="min-h-screen bg-lw-page text-lw-ink [color-scheme:light]">
      <AppNav />
      <section className="mx-7 mt-8 max-w-2xl rounded-2xl border border-lw-border bg-lw-surface p-7">
        <h1 className="text-2xl font-bold">Pre-flight</h1>
        <p className="mt-1 text-lg text-lw-ink-2">
          Ring the briefing phone with a canned TEST alert, check the board, then clear it before the demo.
        </p>
        <div className="mt-5">
          <TestLinks config={config} onNotice={setNotice} />
        </div>
        {notice && (
          <p data-testid="test-notice" className="mt-3 text-base text-lw-ink-2">
            {notice}
          </p>
        )}
      </section>
    </main>
  );
}
