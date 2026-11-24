# DUNA disposable runner image

This image is built locally and used only after `DUNA_EXECUTION_ENABLED=true` is set in the DUNA server environment.

Security properties configured by the DUNA API at container creation:
- `--network none`; no outbound network
- `--read-only` root filesystem
- no host bind mounts or Docker socket
- non-root UID/GID 10001
- all Linux capabilities dropped and `no-new-privileges`
- 512 MiB memory / swap cap, 1 CPU, 64 process cap
- 128 MiB temporary workspace and 32 MiB `/tmp`
- fixed profiles only; no user-defined command strings

The container is disposable and removed after each run. The project snapshot is copied into its tmpfs workspace and is never mounted from the host. The runner does not install project dependencies or expose npm scripts.

Build from the repository root:
```powershell
docker build -t duna-runner:local -f apps/runner/Dockerfile apps/runner
```
