import { isAllowedProjectPath, PROJECT_FILE_LIMITS, redactSensitiveValues } from "./projectIntelligence.js";

export const RUNNER_PROFILES = {
  "node-tests": {
    label: "Node.js tests",
    description: "Run discovered JavaScript tests with Node's built-in test runner. Project dependencies are not installed.",
    commandLabel: "node --test"
  },
  "javascript-syntax": {
    label: "JavaScript syntax check",
    description: "Parse JavaScript, MJS, and CJS files without executing project code.",
    commandLabel: "Node.js syntax parser"
  },
  "typescript-syntax": {
    label: "TypeScript / TSX syntax check",
    description: "Parse TypeScript and TSX files. This is a syntax check, not a full typecheck.",
    commandLabel: "TypeScript transpile diagnostics"
  }
} as const;

export type RunnerProfile = keyof typeof RUNNER_PROFILES;
export type RunnerInputFile = { path: string; content: string };

const IMAGE_PATTERN = /^[a-z0-9][a-z0-9._/:@-]{0,127}$/i;

export function isRunnerProfile(value: unknown): value is RunnerProfile {
  return typeof value === "string" && Object.hasOwn(RUNNER_PROFILES, value);
}

export function validateRunnerSnapshot(files: RunnerInputFile[]): RunnerInputFile[] {
  if (files.length < 1 || files.length > PROJECT_FILE_LIMITS.maxFiles) {
    throw new Error(`Select between 1 and ${PROJECT_FILE_LIMITS.maxFiles} supported source files.`);
  }

  const seen = new Set<string>();
  let totalChars = 0;
  const validated: RunnerInputFile[] = [];

  for (const file of files) {
    if (!isAllowedProjectPath(file.path)) throw new Error(`Unsafe or unsupported project path: ${file.path}`);
    if (seen.has(file.path)) throw new Error(`Duplicate project path: ${file.path}`);
    seen.add(file.path);
    if (file.content.length > PROJECT_FILE_LIMITS.maxFileChars) throw new Error(`File exceeds the runner size limit: ${file.path}`);

    const sanitized = redactSensitiveValues(file.content);
    if (sanitized.redactedCount > 0) {
      throw new Error(`Credential-like content was detected in ${file.path}. Remove it and re-import before running checks.`);
    }

    totalChars += file.content.length;
    if (totalChars > PROJECT_FILE_LIMITS.maxTotalChars) {
      throw new Error(`Selected source exceeds the ${PROJECT_FILE_LIMITS.maxTotalChars.toLocaleString()} character runner limit.`);
    }
    validated.push({ path: file.path, content: file.content });
  }

  return validated;
}

/** Fixed Docker arguments: no user-provided shell string, mounts, or network. */
export function buildDockerCreateArgs(image: string, containerName: string, profile: RunnerProfile): string[] {
  if (!IMAGE_PATTERN.test(image)) throw new Error("Invalid DUNA runner image name.");
  if (!/^duna-run-[a-f0-9-]{36}$/.test(containerName)) throw new Error("Invalid DUNA runner container name.");
  if (!isRunnerProfile(profile)) throw new Error("Unsupported DUNA runner profile.");

  return [
    "create",
    "--name", containerName,
    "--network", "none",
    "--read-only",
    "--memory", "512m",
    "--memory-swap", "512m",
    "--cpus", "1",
    "--pids-limit", "64",
    "--ulimit", "nofile=256:256",
    "--security-opt", "no-new-privileges:true",
    "--cap-drop", "ALL",
    "--user", "10001:10001",
    "--tmpfs", "/workspace:rw,nosuid,nodev,size=128m",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=32m",
    "--workdir", "/workspace",
    "--env", "HOME=/tmp",
    "--env", "CI=true",
    "--entrypoint", "node",
    image,
    "/opt/duna-runner/idle.mjs"
  ];
}
