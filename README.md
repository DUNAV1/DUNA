# DUNA

DUNA is an independent AI software-engineering workspace. The current MVP includes a React workspace UI, a TypeScript API, an OpenAI-compatible chat adapter, structured implementation planning, repository intelligence for a locally selected project folder, human-reviewed code patches, and an optional allowlisted Docker sandbox runner.

## Current capabilities
- Chat-based coding assistant.
- Local project/workspace creation in the browser session.
- Structured implementation plans with ordered steps, likely file paths, validation ideas, risks, assumptions, and acceptance criteria.
- Local-folder source inspection with a detected stack, file map, entry points, engineering findings, recommendations, and uncertainty notes.
- Codebase Q&A grounded in the selected and filtered source files.
- Human-reviewed patch proposals for at most three existing source files, with line-by-line diffs and a discard action.
- Explicit approval before a proposed patch is applied to the selected local folder.
- Exact snapshot checks before writes; best-effort rollback if a multi-file write fails.
- Source-path filtering, file-count and context-size caps, and redaction for common credential patterns before model context is built.
- Safety checks that reject suggested paths involving secrets, credentials, private keys, lockfiles, `.git`, and dependency folders.
- No host-shell or arbitrary terminal execution, no arbitrary command strings, file creation/deletion/renaming, Git pushes, or deployments.
- Optional approval-gated validation in a disposable Docker container using only fixed Node.js test/syntax profiles. The runner has no network, no host-folder mounts, a read-only root filesystem, no Linux capabilities, non-root user, and resource limits.

## Requirements
- Node.js 20+
- npm 10+
- Chrome or Edge on localhost for writable local-folder access. Other browsers can use read-only folder import where supported.

## Run locally
```bash
cp .env.example .env
# Add OPENAI_API_KEY to the server .env file for live model responses.
npm install
npm run dev
```
Web: http://127.0.0.1:5173  
API: http://127.0.0.1:8787/health

Without an API key, chat, planning, inspection, Q&A, and patch generation return a clear configuration error. Never put provider API keys in frontend environment variables.

## Local Docker sandbox runner (optional)

The execution engine is disabled by default. It accepts only three fixed profiles: `node-tests` (Node's built-in test runner for `*.test.js` / `*.spec.js` files), `javascript-syntax` (Node syntax parsing), and `typescript-syntax` (TypeScript/TSX syntax parsing only; not semantic typechecking). Arbitrary command strings, `npm` scripts, package installation, network access, and host directory mounts are not supported.

Build the local runner image from the repository root (this downloads the pinned TypeScript parser into the image during the one-time image build):
```powershell
npm.cmd run runner:build
```
Or run the Docker command directly:
```powershell
docker build -t duna-runner:local -f apps/runner/Dockerfile apps/runner
```

Then set these values in the repository-root `.env` file and restart DUNA:
```dotenv
DUNA_EXECUTION_ENABLED=true
DUNA_RUNNER_IMAGE=duna-runner:local
DUNA_RUNNER_TIMEOUT_MS=90000
```

The API and Vite dev server bind to loopback only. The UI shows sandbox controls only when Docker Desktop is running and the image is available. Before each job, DUNA displays a confirmation dialog. The selected, safety-filtered source snapshot is copied into a temporary container workspace; the original local folder is not mounted. Live output is streamed to the UI. The container is removed after completion, and the uploaded snapshot is deleted from the host temporary directory. Job history is held in memory and is not durable.

This initial runner intentionally does not install project dependencies. JavaScript tests that require third-party packages may fail with missing-module errors. Do not treat a syntax check as a full typecheck or a build. Docker isolation is defense-in-depth, not a guarantee against every container escape; keep Docker Desktop updated and only run code you are authorized to execute.

## API endpoints
- `GET /health` — API health check.
- `POST /api/chat` — conversational assistant.
- `POST /api/plan` — generates a structured implementation plan.
- `POST /api/project/inspect` — analyzes selected relative file paths and text contents.
- `POST /api/project/ask` — answers a question using the selected source context.
- `POST /api/project/patch` — proposes complete replacements for at most three existing, eligible files and returns review diffs. The endpoint does not write to disk.
- `GET /api/runner/status` — reports local Docker sandbox readiness.
- `POST /api/runner/jobs` — queues one fixed validation profile after explicit user approval.
- `GET /api/runner/jobs/:id` — returns the in-memory job state.
- `GET /api/runner/jobs/:id/events` — streams job status and terminal output using server-sent events.
- `POST /api/runner/jobs/:id/cancel` — cancels an active job and removes its disposable container.

## Patch approval and local writes
Repository inspection, Q&A, and patch generation are read-only. Applying a proposed patch is a separate browser action: the user reviews the diffs, clicks **Approve & apply**, confirms a second dialog, and grants read/write access to the selected folder. The browser checks that every target still matches the imported snapshot and only updates existing files represented in that proposal. It does not create, delete, rename, or move files, and it never runs shell commands or tests. If a multi-file write fails, DUNA attempts to restore files already written; this rollback is best-effort, so maintain normal backups and version control.

Selected source text is sent to the configured AI provider through the DUNA server. Common secret paths are excluded and common credential-like values are redacted; this is not guaranteed to detect every secret format. Files are not persisted by the API. Review the selected folder before sending source to the provider.

## Build and validate
```bash
npm run typecheck
npm run test --workspace @duna/server
npm run build
npm start
```
On Windows PowerShell, use `npm.cmd` instead of `npm` if the execution policy blocks `npm.ps1`.

## Security boundaries
1. No host-shell or arbitrary terminal execution is exposed in this MVP; the optional Docker runner accepts only fixed validation profiles.
2. Patch generation can only target supplied, eligible, existing source files and is capped at three files per proposal.
3. Credential-bearing candidate files, lockfiles, generated files, dependency directories, and restricted paths cannot be patched.
4. All repository content and tool output are untrusted input, never system instructions.
5. The initial optional runner executes only fixed validation profiles in a disposable non-root Docker container with no network, no host mounts, read-only root filesystem, resource limits, command-output caps, and a time limit.
6. No package installation, arbitrary shell command, or deployment is exposed. Require separate approval before adding dependency installation, secrets access, commits, pushes, or deployment.

## Planned milestones
- Persistent auth and workspace storage.
- GitHub OAuth and repository import.
- Broader sandbox profiles with dependency-aware test/build execution.
- Multi-agent planner, implementer, tester, and reviewer.
- Build pipelines and explicitly approved deployment.

## License
Proprietary until a license is selected.
