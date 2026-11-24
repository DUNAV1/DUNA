import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.argv[2] ?? "/workspace";
const ignored = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".nuxt", ".venv", "venv"]);
const extensions = new Set([".js", ".mjs", ".cjs"]);
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name.toLowerCase())) walk(join(directory, entry.name));
    } else {
      const extension = entry.name.includes(".") ? `.${entry.name.split(".").pop()}`.toLowerCase() : "";
      if (extensions.has(extension)) files.push(join(directory, entry.name));
    }
  }
}

walk(root);
if (files.length === 0) {
  process.stderr.write("No JavaScript (.js, .mjs, .cjs) files were found.\n");
  process.exit(2);
}

let failed = 0;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", timeout: 10_000 });
  if (result.status !== 0) {
    failed += 1;
    process.stderr.write(`${file}:\n${result.stderr || result.stdout || "Syntax check failed."}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`${failed} of ${files.length} JavaScript file(s) failed syntax validation.\n`);
  process.exit(1);
}
process.stdout.write(`JavaScript syntax check passed for ${files.length} file(s).\n`);
