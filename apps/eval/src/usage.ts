export const USAGE = `Usage: pnpm --filter @lastwell/eval eval --mode text|audio [--ids A01,B01,...] [--model live|fake] [--out dir]

  --mode text   feed scripted turns to the pipeline (docs/07 §5)
  --mode audio  stream recorded WAVs through Ink 2 first (deferred, D-33)
  --ids         comma-separated script ids (default: all)
  --model       live = Claude API (needs ANTHROPIC_API_KEY, default); fake = deterministic fake model, offline
  --out         results directory (default apps/eval/results)`;
