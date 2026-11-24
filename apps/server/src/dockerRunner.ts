import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { buildDockerCreateArgs, type RunnerInputFile, type RunnerProfile } from "./runnerPolicy.js";

export async function checkDockerReadiness(image: string): Promise<{ dockerAvailable: boolean; imageAvailable: boolean; message?: string }> {
  if (!/^[a-z0-9][a-z0-9._/:@-]{0,127}$/i.test(image)) {
    return { dockerAvailable: false, imageAvailable: false, message: "DUNA_RUNNER_IMAGE contains invalid characters." };
  }
  const info = await runProcess("docker", ["info", "--format", "{{.ServerVersion}}"], 5_000).catch((error) => ({
    code: 1, stdout: "", stderr: error instanceof Error ? error.message : "Docker CLI unavailable", timedOut: false
  }));
  if (info.code !== 0 || info.timedOut) {
    return { dockerAvailable: false, imageAvailable: false, message: "Docker Desktop must be running and the docker CLI must be available." };
  }
  const inspected = await runProcess("docker", ["image", "inspect", image], 5_000).catch((error) => ({
    code: 1, stdout: "", stderr: error instanceof Error ? error.message : "Runner image unavailable", timedOut: false
  }));
  return {
    dockerAvailable: true,
    imageAvailable: inspected.code === 0 && !inspected.timedOut,
    message: inspected.code === 0 ? undefined : `Build the local runner image first: docker build -t ${image} -f apps/runner/Dockerfile apps/runner`
  };
}

export type RunnerJobState = "queued" | "preparing" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled";

export type RunnerJob = {
  id: string;
  profile: RunnerProfile;
  state: RunnerJobState;
  output: string;
  exitCode: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

type InternalJob = RunnerJob & { listeners: Set<(event: string, payload: unknown) => void>; containerId: string | null; cancelRequested: boolean };

const jobs = new Map<string, InternalJob>();
const MAX_JOBS = 20;
const MAX_OUTPUT_CHARS = 80_000;
const configuredTimeout = Number(process.env.DUNA_RUNNER_TIMEOUT_MS ?? 90_000);
const JOB_TIMEOUT_MS = Number.isFinite(configuredTimeout) ? Math.max(15_000, Math.min(180_000, configuredTimeout)) : 90_000;

function emit(job: InternalJob, event: string, payload: unknown): void {
  for (const listener of job.listeners) listener(event, payload);
}

function appendOutput(job: InternalJob, chunk: string): void {
  if (!chunk) return;
  const next = job.output + chunk;
  job.output = next.length > MAX_OUTPUT_CHARS
    ? `[Earlier output truncated at ${MAX_OUTPUT_CHARS} characters]\n${next.slice(-MAX_OUTPUT_CHARS)}`
    : next;
  emit(job, "log", { chunk: chunk.slice(-MAX_OUTPUT_CHARS) });
}

function setState(job: InternalJob, state: RunnerJobState): void {
  job.state = state;
  if (state === "running") job.startedAt = new Date().toISOString();
  if (["succeeded", "failed", "timed_out", "cancelled"].includes(state)) job.finishedAt = new Date().toISOString();
  emit(job, "status", publicJob(job));
}

export function publicJob(job: RunnerJob): RunnerJob {
  return {
    id: job.id,
    profile: job.profile,
    state: job.state,
    output: job.output,
    exitCode: job.exitCode,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error
  };
}

function runProcess(
  executable: string,
  args: string[],
  timeoutMs: number,
  onOutput?: (chunk: string) => void
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (data: Buffer) => {
      const value = data.toString("utf8");
      stdout = (stdout + value).slice(-MAX_OUTPUT_CHARS);
      onOutput?.(value);
    });
    child.stderr.on("data", (data: Buffer) => {
      const value = data.toString("utf8");
      stderr = (stderr + value).slice(-MAX_OUTPUT_CHARS);
      onOutput?.(value);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

async function writeSnapshot(root: string, files: RunnerInputFile[]): Promise<void> {
  for (const file of files) {
    const target = resolve(root, ...file.path.split("/"));
    if (!target.startsWith(`${resolve(root)}${sep}`)) throw new Error(`Unsafe staging path: ${file.path}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, { encoding: "utf8", mode: 0o644, flag: "wx" });
  }
}

function trimHistory(): void {
  const completed = [...jobs.values()]
    .filter((job) => ["succeeded", "failed", "timed_out", "cancelled"].includes(job.state))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  while (jobs.size > MAX_JOBS && completed.length > 0) {
    const oldest = completed.shift();
    if (oldest) jobs.delete(oldest.id);
  }
}

export function getRunnerJob(id: string): RunnerJob | undefined {
  const job = jobs.get(id);
  return job ? publicJob(job) : undefined;
}

export function subscribeRunnerJob(id: string, listener: (event: string, payload: unknown) => void): (() => void) | null {
  const job = jobs.get(id);
  if (!job) return null;
  job.listeners.add(listener);
  listener("snapshot", publicJob(job));
  if (["succeeded", "failed", "timed_out", "cancelled"].includes(job.state)) listener("done", publicJob(job));
  return () => job.listeners.delete(listener);
}

export function createRunnerJob(profile: RunnerProfile, files: RunnerInputFile[]): RunnerJob {
  const activeJobs = [...jobs.values()].filter((job) => ["queued", "preparing", "running"].includes(job.state)).length;
  if (activeJobs >= 2) throw new Error("DUNA already has two active sandbox jobs. Wait for one to finish.");

  const job: InternalJob = {
    id: randomUUID(),
    profile,
    state: "queued",
    output: "",
    exitCode: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null,
    listeners: new Set(),
    containerId: null,
    cancelRequested: false
  };
  jobs.set(job.id, job);
  trimHistory();
  void executeJob(job, files);
  return publicJob(job);
}

export async function cancelRunnerJob(id: string): Promise<boolean> {
  const job = jobs.get(id);
  if (!job || ["succeeded", "failed", "timed_out", "cancelled"].includes(job.state)) return false;
  job.cancelRequested = true;
  job.error = "Cancelled by user.";
  if (job.containerId) {
    await runProcess("docker", ["kill", job.containerId], 5_000).catch(() => undefined);
  }
  setState(job, "cancelled");
  return true;
}

async function executeJob(job: InternalJob, files: RunnerInputFile[]): Promise<void> {
  const image = process.env.DUNA_RUNNER_IMAGE ?? "duna-runner:local";
  const containerName = `duna-run-${job.id}`;
  let stagingDir: string | null = null;

  try {
    setState(job, "preparing");
    stagingDir = await mkdtemp(join(tmpdir(), "duna-runner-"));
    await writeSnapshot(stagingDir, files);
    if (job.cancelRequested) { setState(job, "cancelled"); return; }

    appendOutput(job, `DUNA sandbox job ${job.id}\nProfile: ${job.profile}\nSelected source files: ${files.length}\nNetwork: disabled · Host folders: not mounted · Container: disposable\n\n`);

    const created = await runProcess("docker", buildDockerCreateArgs(image, containerName, job.profile), 15_000);
    if (created.timedOut || created.code !== 0 || !created.stdout.trim()) {
      throw new Error((created.stderr || created.stdout || "Docker could not create the sandbox container.").trim().slice(-2000));
    }
    job.containerId = created.stdout.trim().split(/\s+/).at(-1) ?? null;
    if (!job.containerId || !/^[a-f0-9]{12,64}$/i.test(job.containerId)) throw new Error("Docker returned an invalid container identifier.");
    if (job.cancelRequested) { setState(job, "cancelled"); return; }

    const started = await runProcess("docker", ["start", job.containerId], 10_000);
    if (started.timedOut || started.code !== 0) {
      throw new Error((started.stderr || started.stdout || "Unable to start the isolated sandbox container.").trim().slice(-2000));
    }

    if (job.cancelRequested) { setState(job, "cancelled"); return; }

    const sourcePath = `${stagingDir}${sep}.`;
    const copied = await runProcess("docker", ["cp", sourcePath, `${job.containerId}:/workspace`], 20_000);
    if (copied.timedOut || copied.code !== 0) {
      throw new Error((copied.stderr || copied.stdout || "Unable to copy the source snapshot into the sandbox.").trim().slice(-2000));
    }

    if (job.cancelRequested) { setState(job, "cancelled"); return; }

    setState(job, "running");
    appendOutput(job, "Starting isolated check…\n\n");
    const attached = await runProcess("docker", ["exec", job.containerId, "node", "/opt/duna-runner/runner-entrypoint.mjs", job.profile], JOB_TIMEOUT_MS, (chunk) => appendOutput(job, chunk));
    if (job.cancelRequested) { setState(job, "cancelled"); return; }
    if (attached.timedOut) {
      job.state = "timed_out";
      job.error = `Sandbox exceeded the ${Math.round(JOB_TIMEOUT_MS / 1000)} second time limit.`;
      job.exitCode = null;
      appendOutput(job, `\n${job.error}\n`);
      setState(job, "timed_out");
      return;
    }

    job.exitCode = attached.code;
    setState(job, attached.code === 0 ? "succeeded" : "failed");
    appendOutput(job, `\nDUNA sandbox finished with exit code ${attached.code}.\n`);
  } catch (error) {
    job.error = error instanceof Error ? error.message : "Unknown sandbox runner error";
    job.exitCode = null;
    appendOutput(job, `\nRunner error: ${job.error}\n`);
    setState(job, "failed");
  } finally {
    await runProcess("docker", ["rm", "--force", job.containerId ?? containerName], 10_000).catch(() => undefined);
    job.containerId = null;
    if (stagingDir) await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    emit(job, "done", publicJob(job));
    trimHistory();
  }
}
