// `pnpm --filter @lastwell/eval validate [dir ...]` — check every script (default: ./scripts).
// Exit code 1 when any script is invalid.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadScripts, type RawScript } from "@lastwell/core";

function readDir(dir: string): RawScript[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const source = join(dir, f);
      try {
        return { source, data: JSON.parse(readFileSync(source, "utf8")) as unknown };
      } catch (err) {
        return { source, data: { __parseError: (err as Error).message } };
      }
    });
}

export function main(argv: readonly string[]): number {
  const args = argv.filter((a) => a !== "--"); // pnpm may forward a literal "--"
  const dirs = (args.length > 0 ? args : ["scripts"]).map((d) => resolve(d));

  const raw = dirs.flatMap(readDir);
  if (raw.length === 0) {
    console.error(`No .json scripts found in ${dirs.join(", ")}`);
    return 1;
  }
  const { scripts, errors } = loadScripts(raw);

  for (const s of scripts) {
    console.log(`  ok   ${s.id}  ${s.type.padEnd(10)}  ${s.turns.length} turns  ${s.title}`);
  }
  for (const e of errors) {
    console.log(`  FAIL ${relative(process.cwd(), e.source)}${e.id ? ` (${e.id})` : ""}`);
    for (const msg of e.errors) console.log(`         - ${msg}`);
  }
  console.log(`\n${scripts.length} valid, ${errors.length} invalid (${raw.length} files)`);
  return errors.length === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
