#!/usr/bin/env node
// pnpm scan:secrets — the docs/08 §9 secret grep, made cross-platform and placeholder-aware.
// Scans every tracked file (working-tree content) and the full patch history of HEAD.
// Exit 1 with file/commit and a redacted match when anything looks like a real key.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

// Real keys are long; the placeholders in .env.example ("sk_car_...", "sk-ant-...", "ACxxxx…") are not.
const PATTERNS = [
  { name: "Cartesia API key", re: /sk_car_[A-Za-z0-9_-]{16,}/g },
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "Twilio account SID", re: /\bAC[0-9a-f]{32}\b/g },
  { name: "Twilio API key SID", re: /\bSK[0-9a-f]{32}\b/g },
  { name: "ngrok auth token", re: /\b[0-9A-Za-z]{25,27}_[0-9A-Za-z]{20,22}\b/g },
  { name: "Convex deploy key", re: /\b(?:prod|dev|preview):[a-z0-9-]+\|[A-Za-z0-9+/=]{20,}/g },
  { name: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

// The scanner must never pass because its patterns stopped matching; build samples at runtime so this file holds no key.
function selfTest() {
  const hex32 = "0123456789abcdef".repeat(2);
  const samples = [
    "sk_car_" + "Ab3".repeat(8),
    "sk-ant-" + "api03-" + "x9Y".repeat(10),
    "AC" + hex32,
    "SK" + hex32,
    "2abcDEFghiJKLmnoPQRstuVWXyz_" + "3abcDEFghiJKLmnoPQRstu",
    "prod:" + "happy-animal-123|" + "QUJD".repeat(8),
    "-----BEGIN " + "RSA PRIVATE KEY-----",
  ];
  const placeholders = ["sk_car_...", "sk-ant-...", "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "AC[0-9a-f]{32}", "replace-me"];
  for (const s of samples) {
    if (!PATTERNS.some((p) => new RegExp(p.re.source).test(s))) throw new Error(`scan:secrets self-test: no pattern matches sample ${redact(s)}`);
  }
  for (const s of placeholders) {
    if (PATTERNS.some((p) => new RegExp(p.re.source).test(s))) throw new Error(`scan:secrets self-test: placeholder "${s}" is flagged`);
  }
}

function redact(s) {
  return s.length <= 10 ? "***" : `${s.slice(0, 8)}…(${s.length} chars)`;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

function scanText(text, where, findings) {
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) findings.push({ where, name, match: redact(m[0]) });
  }
}

selfTest();
const findings = [];

// 1. Tracked files: .env files must never be tracked; contents must hold no key.
const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
for (const file of tracked) {
  const base = file.split("/").pop();
  if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") findings.push({ where: file, name: "tracked env file", match: base });
  let buf;
  try {
    if (statSync(file).size > 5 * 1024 * 1024) continue;
    buf = readFileSync(file);
  } catch {
    continue; // deleted in the working tree
  }
  if (buf.includes(0)) continue; // binary
  scanText(buf.toString("utf8"), file, findings);
}

// 2. History of HEAD: a key removed later is still published.
const history = git(["log", "-p", "--no-color", "--format=commit %H"]);
let commit = "?";
for (const line of history.split("\n")) {
  if (line.startsWith("commit ")) {
    commit = line.slice(7, 19);
    continue;
  }
  if (line.startsWith("+") && !line.startsWith("+++")) scanText(line, `history ${commit}`, findings);
}

const seen = new Set();
const unique = findings.filter((f) => {
  const k = `${f.where}|${f.name}|${f.match}`;
  return seen.has(k) ? false : (seen.add(k), true);
});

if (unique.length > 0) {
  console.error(`scan:secrets FAILED: ${unique.length} finding(s)`);
  for (const f of unique) console.error(`  ${f.where}: ${f.name} ${f.match}`);
  console.error("Remove the secret, rotate it, and never rewrite published history without a human (docs/10 §3).");
  process.exit(1);
}
console.log(`scan:secrets ok: ${tracked.length} tracked files and HEAD history clean (${PATTERNS.length} patterns, self-test passed)`);
