import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const profile = process.argv[2];
const ignored = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".nuxt", ".venv", "venv"]);

function findTests(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name.toLowerCase())) walk(join(directory, entry.name));
      } else if (/\.(test|spec)\.(?:js|mjs|cjs)$/i.test(entry.name)) {
        found.push(join(directory, entry.name));
      }
    }
  };
  walk(root);
  return found.sort();
}

let executable;
let args;
if (profile === "node-tests") {
  const tests = findTests("/workspace");
  if (tests.length === 0) {
    process.stderr.write("No *.test.js, *.test.mjs, *.test.cjs, *.spec.js, *.spec.mjs, or *.spec.cjs files were found.\n");
    process.exit(2);
  }
  executable = process.execPath;
  args = ["--test", ...tests];
} else if (profile === "javascript-syntax") {
  executable = process.execPath;
  args = ["/opt/duna-runner/check-javascript.mjs", "/workspace"];
} else if (profile === "typescript-syntax") {
  executable = process.execPath;
  args = ["/opt/duna-runner/check-typescript.mjs", "/workspace"];
} else {
  process.stderr.write("Unsupported DUNA runner profile.\n");
  process.exit(64);
}

const result = spawnSync(executable, args, {
  cwd: "/workspace",
  env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", CI: "true" },
  stdio: "inherit",
  timeout: 75_000,
  maxBuffer: 256 * 1024
});

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(result.error.code === "ETIMEDOUT" ? 124 : 1);
}
process.exit(result.status ?? 1);
