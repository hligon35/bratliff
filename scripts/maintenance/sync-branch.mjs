#!/usr/bin/env node
// Safely create-or-reuse the `monthlyUpdate` branch without ever force-pushing
// over work that wasn't produced by this maintenance automation.
//
// Usage: node scripts/maintenance/sync-branch.mjs --default-branch <name>
//
// Marker: every commit this automation makes on monthlyUpdate includes the
// trailer "Maintenance-Bot: true" in the commit message. If monthlyUpdate
// already exists remotely and its tip commit does NOT contain that trailer,
// this script refuses to touch it and exits non-zero so the workflow stops
// and a human can resolve it.

import { runCommand } from "./lib/exec.mjs";

const MAINTENANCE_BRANCH = "monthlyUpdate";
const MARKER = "Maintenance-Bot: true";

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

async function main() {
  const defaultBranch = arg("default-branch", "main");
  const cwd = process.cwd();

  const fetch = await runCommand("git", ["fetch", "origin", defaultBranch, MAINTENANCE_BRANCH], { cwd });
  if (fetch.exitCode !== 0 && !/couldn't find remote ref/i.test(fetch.stderr)) {
    console.error(`git fetch failed:\n${fetch.stderr}`);
    process.exit(1);
  }

  const remoteHead = await runCommand("git", ["rev-parse", "--verify", `origin/${MAINTENANCE_BRANCH}`], { cwd });
  const remoteBranchExists = remoteHead.exitCode === 0;

  if (!remoteBranchExists) {
    console.log(`origin/${MAINTENANCE_BRANCH} does not exist yet — creating from origin/${defaultBranch}.`);
    const create = await runCommand("git", ["checkout", "-B", MAINTENANCE_BRANCH, `origin/${defaultBranch}`], { cwd });
    if (create.exitCode !== 0) {
      console.error(`Failed to create ${MAINTENANCE_BRANCH}:\n${create.stderr}`);
      process.exit(1);
    }
    console.log(`Created and checked out ${MAINTENANCE_BRANCH} from origin/${defaultBranch}.`);
    return;
  }

  const lastMessage = await runCommand("git", ["log", "-1", "--pretty=%B", `origin/${MAINTENANCE_BRANCH}`], { cwd });
  const isOurs = lastMessage.stdout.includes(MARKER);

  if (!isOurs) {
    console.error(
      [
        `origin/${MAINTENANCE_BRANCH} already exists but its latest commit does not contain the "${MARKER}" trailer.`,
        "This means it may contain manual work that was not produced by this automation.",
        "Refusing to reset or force-push over it. Resolve manually:",
        `  - Inspect: git log origin/${MAINTENANCE_BRANCH}`,
        "  - If it is safe to discard, delete the remote branch yourself and re-run this workflow.",
        "  - If it contains work you want to keep, merge/rebase it by hand before the next run.",
      ].join("\n"),
    );
    process.exit(1);
  }

  console.log(`origin/${MAINTENANCE_BRANCH} was last updated by this automation — safe to reuse.`);
  const reset = await runCommand("git", ["checkout", "-B", MAINTENANCE_BRANCH, `origin/${defaultBranch}`], { cwd });
  if (reset.exitCode !== 0) {
    console.error(`Failed to reset ${MAINTENANCE_BRANCH} from origin/${defaultBranch}:\n${reset.stderr}`);
    process.exit(1);
  }
  console.log(`Reset ${MAINTENANCE_BRANCH} to the latest origin/${defaultBranch} (previous content was automation-only).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
