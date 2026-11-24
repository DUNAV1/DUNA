export type PatchCandidate = {
  path: string;
  originalContent: string;
  proposedContent: string;
  rationale: string;
};

function splitLines(content: string): string[] {
  if (content.length === 0) return [];
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) lines.pop();
  return lines;
}

/** Preserve the original file's newline convention when accepting model output. */
export function normalizePatchContent(original: string, proposed: string): string {
  const normalized = proposed.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (original.includes("\r\n")) return normalized.replace(/\n/g, "\r\n");
  return normalized;
}

/**
 * Produce a compact, valid single-hunk unified-style diff. The changed middle
 * section is one hunk with two lines of context; unchanged prefix/suffix are
 * omitted. This is intentionally bounded and is for review display, not patch
 * application. The approved complete replacement content is applied only on
 * the client after a fresh on-disk comparison.
 */
export function createPatchDiff(path: string, original: string, proposed: string): string {
  const oldLines = splitLines(original);
  const newLines = splitLines(proposed);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;

  if (prefix === oldLines.length && prefix === newLines.length) {
    return `--- a/${path}\n+++ b/${path}\n(no textual changes)`;
  }

  const context = 2;
  const start = Math.max(0, prefix - context);
  const oldChangeEnd = oldLines.length - suffix;
  const newChangeEnd = newLines.length - suffix;
  const oldContextEnd = Math.min(oldLines.length, oldChangeEnd + context);
  const newContextEnd = Math.min(newLines.length, newChangeEnd + context);

  const before = oldLines.slice(start, prefix);
  const removed = oldLines.slice(prefix, oldChangeEnd);
  const added = newLines.slice(prefix, newChangeEnd);
  const afterOld = oldLines.slice(oldChangeEnd, oldContextEnd);
  const afterNew = newLines.slice(newChangeEnd, newContextEnd);
  const oldCount = before.length + removed.length + afterOld.length;
  const newCount = before.length + added.length + afterNew.length;
  const oldStart = oldCount === 0 ? start : start + 1;
  const newStart = newCount === 0 ? start : start + 1;

  const diffLines = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ...before.map((line) => ` ${line}`),
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ...afterOld.map((line) => ` ${line}`)
  ];

  // A final newline is not represented in line-oriented diff display. The
  // actual exact replacement text remains present in the proposal payload.
  return diffLines.join("\n");
}

export function hasRedactionMarker(content: string): boolean {
  return /\[REDACTED(?:\s|\])/i.test(content);
}

export function isPatchCandidateSafe(path: string, originalContent: string, redactedCount: number): boolean {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  const isLockfile = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"].includes(name);
  return path.length > 0 && !isLockfile && redactedCount === 0 && !hasRedactionMarker(originalContent);
}
