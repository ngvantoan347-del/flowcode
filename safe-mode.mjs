#!/usr/bin/env node
/**
 * Safety switch for the owner-granted full access.
 *
 *   node safe-mode.mjs --status   report the current permission posture
 *   node safe-mode.mjs --on       restrict: shell asks, irreversible commands denied
 *   node safe-mode.mjs --off      full access again (no asks, no denies)
 *
 * Design: the file is edited line by line, the candidate result is validated as JSONC
 * before anything is written, and the write is atomic. A failed validation leaves the
 * config exactly as it was.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(HERE, "opencode.jsonc");
const BACKUP_DIR = path.resolve(HERE, ".rollback", "safe-mode");

const FULL_ACCESS = [
  ["shell", "*", "allow"], ["edit", "*", "allow"], ["read", "*", "allow"], ["grep", "*", "allow"],
  ["glob", "*", "allow"], ["webfetch", "*", "allow"], ["websearch", "*", "allow"],
  ["subagent", "*", "allow"], ["skill", "*", "allow"], ["question", "*", "allow"], ["execute", "*", "allow"],
];

const RESTRICTED = [
  ["shell", "*", "ask"], ["edit", "*", "allow"], ["read", "*", "allow"], ["grep", "*", "allow"],
  ["glob", "*", "allow"], ["subagent", "*", "allow"], ["skill", "*", "allow"], ["question", "*", "allow"],
  ["execute", "*", "allow"],
  ["shell", "git push*", "deny"], ["shell", "git reset --hard*", "deny"], ["shell", "rm *", "deny"],
  ["shell", "Remove-Item *", "deny"], ["shell", "del *", "deny"], ["shell", "format *", "deny"],
  ["shell", "shutdown *", "deny"],
];

const rule = (row) => `    { "action": ${JSON.stringify(row[0])}, "resource": ${JSON.stringify(row[1])}, "effect": ${JSON.stringify(row[2])} }`;
const count = (text, effect) => (text.match(new RegExp(`"effect": "${effect}"`, "g")) || []).length;

/** Validate a JSONC candidate: drop // comments, then parse. */
function validate(text) {
  try {
    JSON.parse(text.split("\n").map((line) => line.replace(/^\s*\/\/.*$/, "")).join("\n"));
    return true;
  } catch (error) {
    console.error(`refusing to write an invalid config: ${error.message}`);
    return false;
  }
}

/** The one definition of where the permissions array lives. Two rules for the same boundary is
 *  how a formatting change silently turns the switch into a no-op. */
function permissionsBounds(lines) {
  const start = lines.findIndex((line) => /^\s*"permissions":\s*\[\s*,?\s*$/.test(line));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^\s*\],?\s*$/.test(line));
  return end < 0 ? null : { start, end };
}

/** Replace the permissions array in place, keeping every other line verbatim. */
function rebuild(lines, rules, bounds) {
  // Drop the comment lines immediately above the key: they describe the old posture.
  let first = bounds.start;
  while (first > 0 && /^\s*\/\//.test(lines[first - 1])) first -= 1;
  const header = [
    "  // Full access granted by the owner: nothing is denied, nothing asks.",
    "  // Destructive shell commands are allowed here by explicit owner instruction.",
    "  // Switch to the restricted posture with: node safe-mode.mjs --on",
  ];
  const body = rules.map(rule).join(",\n");
  return [...lines.slice(0, first), ...header, '  "permissions": [', body, "  ]", ...lines.slice(bounds.end + 1)];
}

const mode = process.argv[2] || "--status";
const source = fs.readFileSync(CONFIG, "utf8");
const lines = source.split(/\r?\n/);
const bounds = permissionsBounds(lines);
if (!bounds) {
  console.error('no "permissions" array found in opencode.jsonc - fix it by hand');
  process.exit(1);
}
const currentBlock = lines.slice(bounds.start, bounds.end + 1).join("\n");

if (mode === "--status") {
  const denied = count(currentBlock, "deny");
  const asked = count(currentBlock, "ask");
  const allowed = count(currentBlock, "allow");
  const posture = denied > 0 || asked > 0 ? "restricted" : "full access";
  console.log(`posture: ${posture}  (allow=${allowed} ask=${asked} deny=${denied})`);
  console.log(posture === "full access" ? "run: node safe-mode.mjs --on" : "run: node safe-mode.mjs --off");
  process.exit(0);
}

const rules = mode === "--on" ? RESTRICTED : mode === "--off" ? FULL_ACCESS : null;
if (!rules) {
  console.error("usage: node safe-mode.mjs --status | --on | --off");
  process.exit(1);
}

const candidate = rebuild(lines, rules, bounds);
if (!candidate) {
  console.error("could not rebuild the permissions array - fix it by hand");
  process.exit(1);
}
// Trailing blank lines are not content: without this, every round trip appends one and the file
// grows for as long as the owner keeps switching posture.
const output = `${candidate.join("\n").replace(/\n+$/, "")}\n`;
if (!validate(output)) process.exit(1);

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.writeFileSync(path.join(BACKUP_DIR, `opencode.jsonc.${mode.slice(2)}.${stamp}.bak`), source, "utf8");
const temp = `${CONFIG}.${process.pid}.tmp`;
fs.writeFileSync(temp, output, "utf8");
fs.renameSync(temp, CONFIG);
console.log(`posture now: ${mode === "--on" ? "restricted (shell asks, irreversible denied)" : "full access"}`);
console.log("start a new session for it to take effect");
