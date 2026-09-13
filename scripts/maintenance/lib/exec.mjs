import { spawn } from "node:child_process";
import { redact } from "./redact.mjs";

function quoteArgForShell(value) {
  const str = String(value);
  return /[\s"]/.test(str) ? `"${str.replace(/"/g, '\\"')}"` : str;
}

/**
 * Run a command, always resolving (never rejecting) with a structured result.
 * Output is captured and redacted; the real exit code is preserved so callers
 * can never mistake a failed check for a passed/skipped one.
 */
export function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
    const needsShell = process.platform === "win32";

    let child;
    try {
      // On Windows, npm/npx/git are shell-resolved (.cmd) executables. Build a
      // single pre-quoted command string rather than passing shell:true with a
      // separate args array, which Node deprecates (DEP0190) as unsafe.
      child = needsShell
        ? spawn([command, ...args].map(quoteArgForShell).join(" "), [], {
            cwd: options.cwd,
            env: { ...process.env, ...(options.env || {}) },
            shell: true,
          })
        : spawn(command, args, {
            cwd: options.cwd,
            env: { ...process.env, ...(options.env || {}) },
          });
    } catch (error) {
      resolve({
        command: `${command} ${args.join(" ")}`.trim(),
        exitCode: -1,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: redact(String(error?.message || error)),
        timedOut: false,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        command: `${command} ${args.join(" ")}`.trim(),
        exitCode: -1,
        durationMs: Date.now() - startedAt,
        stdout: redact(stdout),
        stderr: redact(String(error?.message || error)),
        timedOut,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        command: `${command} ${args.join(" ")}`.trim(),
        exitCode: timedOut ? -1 : code,
        durationMs: Date.now() - startedAt,
        stdout: redact(stdout),
        stderr: redact(stderr),
        timedOut,
      });
    });
  });
}

/** Trim a captured output blob down to a short, report-friendly summary. */
export function summarize(text, maxLines = 12, maxChars = 1200) {
  if (!text) return "(no output)";
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const clipped = lines.slice(0, maxLines).join("\n");
  return clipped.length > maxChars ? `${clipped.slice(0, maxChars)}\n... (truncated)` : clipped || "(no output)";
}
