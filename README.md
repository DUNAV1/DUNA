# DUNA

DUNA is an independent AI software-engineering workspace. This repository contains the first runnable MVP: a React workspace UI, a TypeScript API, an OpenAI-compatible chat adapter, project/task scaffolding, and explicit safety boundaries for future code execution.

## Current MVP
- Chat-based coding assistant with streamed responses.
- Local project/workspace creation in the browser session.
- Task planning prompt and project context.
- API health endpoint and provider configuration.
- No host-shell execution. Code execution is intentionally disabled until an isolated runner is deployed.
- No automatic Git pushes, deployments, or destructive file operations.

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

Without an API key, the chat endpoint returns a clear configuration error. Never put API keys in frontend environment variables.

## Build
```bash
npm run typecheck
npm run build
npm start
```

## GitLab: create the standalone repository
Create an empty GitLab project named `duna` under your account/group, then:
```bash
git init
git add .
git commit -m "Initial DUNA MVP"
git branch -M main
git remote add origin https://gitlab.com/<YOUR_NAMESPACE>/duna.git
git push -u origin main
```
This environment does not currently have an authorized GitLab repository-creation/push integration, so the source is prepared locally and the remote repository has not been created.

## Security architecture before enabling agents
1. Run each task in a disposable, non-root container with CPU, memory, process, disk, and time limits.
2. Mount only the task workspace; never mount host home directories, Docker socket, SSH agent, or cloud credentials.
3. Default network access to deny; allowlist package registries only when needed.
4. Keep provider credentials server-side and use short-lived scoped tokens.
5. Require approval before network access, dependency installation, secrets access, commits, pushes, or deployment.
6. Capture command logs and diffs; provide cancellation and timeouts.
7. Treat repository content and tool output as untrusted input, never as system instructions.

## Planned milestones
- Persistent auth and workspace storage (Supabase).
- GitLab/GitHub OAuth and repository import.
- Sandboxed execution service and terminal streaming.
- Patch/diff review, tests, branch/commit workflow.
- Multi-agent planner, implementer, tester, reviewer.
- Build pipelines and explicitly approved deployment.

## License
Proprietary until a license is selected.
