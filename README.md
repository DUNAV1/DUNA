# DUNA

DUNA is an independent AI software-engineering workspace. The current MVP includes a React workspace UI, a TypeScript API, an OpenAI-compatible chat adapter, and a structured implementation-planning workflow.

## Current capabilities
- Chat-based coding assistant.
- Local project/workspace creation in the browser session.
- Structured implementation plans with ordered steps, likely file paths, validation ideas, risks, assumptions, and acceptance criteria.
- Server-side schema validation for generated plans.
- Safety checks that reject suggested paths involving secrets, credentials, private keys, `.git`, or dependency folders.
- No host-shell execution, file writes, Git pushes, deployments, or destructive operations.

## Requirements
- Node.js 20+
- npm 10+

## Run locally
```bash
cp .env.example .env
# Add OPENAI_API_KEY to .env for live model responses.
npm install
npm run dev
```
Web: http://localhost:5173  
API: http://localhost:8787/health

Without an API key, chat and planning endpoints return a clear configuration error. Never put provider API keys in frontend environment variables.

## API endpoints
- `GET /health` — API health check.
- `POST /api/chat` — conversational assistant.
- `POST /api/plan` — generates a structured plan. Request body: `{ "task": "...", "project": { "name": "...", "description": "..." } }`.

The planning endpoint returns `controls` showing that execution is disabled, no files were changed, no commands were run, and human approval is required. Plans are suggestions, not repository inspection or verified implementation instructions.

## Build and validate
```bash
npm run typecheck
npm run build
npm start
```

## Security architecture before enabling agents
1. Run each task in a disposable, non-root container with CPU, memory, process, disk, and time limits.
2. Mount only the task workspace; never mount host home directories, Docker socket, SSH agent, or cloud credentials.
3. Default network access to deny; allowlist package registries only when needed.
4. Keep provider credentials server-side and use short-lived scoped tokens.
5. Require approval before network access, dependency installation, secrets access, commits, pushes, or deployment.
6. Capture command logs and diffs; provide cancellation and timeouts.
7. Treat repository content and tool output as untrusted input, never as system instructions.

## Planned milestones
- Persistent auth and workspace storage.
- GitHub OAuth and repository import.
- Repository-aware file inspection and context selection.
- Human-reviewed patch generation and diff approval.
- Sandboxed execution service, terminal streaming, and test runs.
- Multi-agent planner, implementer, tester, reviewer.
- Build pipelines and explicitly approved deployment.

## License
Proprietary until a license is selected.
