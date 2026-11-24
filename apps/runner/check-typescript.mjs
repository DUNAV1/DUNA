import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import ts from "typescript";

const root = process.argv[2] ?? "/workspace";
const ignored = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".nuxt", ".venv", "venv"]);
const extensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name.toLowerCase())) walk(join(directory, entry.name));
    } else if (extensions.has(extname(entry.name).toLowerCase()) && !entry.name.endsWith(".d.ts")) {
      files.push(join(directory, entry.name));
    }
  }
}

walk(root);
if (files.length === 0) {
  process.stderr.write("No TypeScript (.ts, .tsx, .mts, .cts) files were found.\n");
  process.exit(2);
}

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  reportDiagnostics: true
};
let errors = 0;
for (const file of files.sort()) {
  const source = readFileSync(file, "utf8");
  const result = ts.transpileModule(source, { compilerOptions: options, fileName: file, reportDiagnostics: true });
  for (const diagnostic of result.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    errors += 1;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    process.stderr.write(`${file}${diagnostic.start === undefined ? "" : `:${diagnostic.start}`}: ${message}\n`);
  }
}

if (errors > 0) {
  process.stderr.write(`${errors} TypeScript syntax diagnostic(s) across ${files.length} file(s). This runner does not perform semantic typechecking.\n`);
  process.exit(1);
}
process.stdout.write(`TypeScript/TSX syntax check passed for ${files.length} file(s). This is not a semantic typecheck.\n`);
