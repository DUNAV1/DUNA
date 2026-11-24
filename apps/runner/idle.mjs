// Keeps the already-created disposable container alive while DUNA copies the
// selected snapshot into its tmpfs workspace. The job itself runs via docker exec.
process.stdout.write("DUNA isolated runner ready.\n");
setInterval(() => {}, 60_000);
