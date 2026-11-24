import test from "node:test";
import assert from "node:assert/strict";
import { buildDockerCreateArgs, isRunnerProfile, validateRunnerSnapshot } from "./runnerPolicy.js";

const validFiles = [
  { path: "src/index.ts", content: "export const ready = true;\n" },
  { path: "src/index.test.js", content: "import test from 'node:test';\ntest('ok', () => {});\n" }
];

test("runner policy", async (suite) => {
  await suite.test("accepts only fixed runner profiles", () => {
    assert.equal(isRunnerProfile("node-tests"), true);
    assert.equal(isRunnerProfile("typescript-syntax"), true);
    assert.equal(isRunnerProfile("node -e 'do anything'"), false);
  });

  await suite.test("rejects traversal, duplicate paths and detected credentials", () => {
    assert.throws(() => validateRunnerSnapshot([{ path: "../outside.js", content: "x" }]), /Unsafe/);
    assert.throws(() => validateRunnerSnapshot([validFiles[0]!, validFiles[0]!]), /Duplicate/);
    assert.throws(() => validateRunnerSnapshot([{ path: "src/config.ts", content: "const api_key = 'secret-value-123456789';" }]), /Credential-like/);
  });

  await suite.test("builds a networkless, non-root, resource-limited container command", () => {
    const args = buildDockerCreateArgs("duna-runner:local", "duna-run-12345678-1234-1234-1234-123456789abc", "node-tests");
    assert.ok(args.includes("none"));
    assert.ok(args.includes("--read-only"));
    assert.ok(args.includes("10001:10001"));
    assert.ok(args.includes("--cap-drop"));
    assert.ok(args.includes("ALL"));
    assert.ok(!args.some((item) => item.includes("node -e")));
    assert.throws(() => buildDockerCreateArgs("duna-runner:local", "duna-run-12345678-1234-1234-1234-123456789abc", "node -e 1" as never), /Unsupported/);
  });
});
