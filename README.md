# DUNA

DUNA is an independent AI software-engineering workspace. The current MVP includes a React workspace UI, a TypeScript API, an OpenAI-compatible chat adapter, structured implementation planning, repository intelligence for a locally selected project folder, and human-reviewed code patches.

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
- No host-shell execution, file creation/deletion/renaming, Git pushes, or deployments.

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
Web: http://localhost:5173  
API: http://localhost:8787/health

Without an API key, chat, planning, inspection, Q&A, and patch generation return a clear configuration error. Never put provider API keys in frontend environment variables.

## API endpoints
- `GET /health` — API health check.
- `POST /api/chat` — conversational assistant.
- `POST /api/plan` — generates a structured implementation plan.
- `POST /api/project/inspect` — analyzes selected relative file paths and text contents.
- `POST /api/project/ask` — answers a question using the selected source context.
- `POST /api/project/patch` — proposes complete replacements for at most three existing, eligible files and returns review diffs. The endpoint does not write to disk.

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
1. No host-shell or terminal execution is exposed in this MVP.
2. Patch generation can only target supplied, eligible, existing source files and is capped at three files per proposal.
3. Credential-bearing candidate files, lockfiles, generated files, dependency directories, and restricted paths cannot be patched.
4. All repository content and tool output are untrusted input, never system instructions.
5. Actual agent execution must use a disposable, non-root sandbox with CPU, memory, process, disk, and time limits, deny-by-default network access, scoped credentials, command logs, cancellation, and approval gates.
6. Require approval before dependency installation, secrets access, commits, pushes, or deployment.

## Planned milestones
- Persistent auth and workspace storage.
- GitHub OAuth and repository import.
- Sandboxed execution service, terminal streaming, and test runs.
- Multi-agent planner, implementer, tester, and reviewer.
- Build pipelines and explicitly approved deployment.

## License
Proprietary until a license is selected.
