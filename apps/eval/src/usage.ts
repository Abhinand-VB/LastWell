export const USAGE = `Usage: pnpm --filter @lastwell/eval eval --mode text|audio [--ids A01,B01,...]

  --mode text   feed scripted turns to the pipeline (docs/07 §6)
  --mode audio  stream recorded WAVs through Ink 2 first
  --ids         comma-separated script ids (default: all)`;
