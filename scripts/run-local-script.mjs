/**
 * run-local-script.mjs — Pick the right local helper for this operating system.
 *
 * `npm run sync` and `npm run deploy` both enter here first. The real work
 * lives in paired shell scripts: `.sh` for macOS/Linux and `.ps1` for Windows.
 * Keeping this small Node dispatcher in front lets package.json expose one
 * command while still using platform-native scripts underneath.
 *
 * Node APIs used here:
 *  - `spawnSync` starts a child process and waits for it to exit.
 *  - `path` helpers build OS-correct paths instead of hardcoding `/`.
 *  - `fileURLToPath(import.meta.url)` recreates `__dirname` in ESM modules,
 *    where files are identified by `file://` URLs rather than CommonJS paths.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM has `import.meta.url`, not `__dirname`; convert the file URL to a normal
// path, then climb from scripts/ to the repository root for a stable cwd.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

/**
 * Local script registry.
 *
 * Each entry maps a package-script name to `[command, args]` for Windows and a
 * default POSIX variant. PowerShell gets `-NoProfile` for predictable startup
 * and `-ExecutionPolicy Bypass` so a checked-out helper script can run without
 * asking users to change their machine-wide policy.
 */
const scripts = {
  sync: {
    win32: ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(scriptDir, 'sync-content.ps1')]],
    default: ['bash', [resolve(scriptDir, 'sync-content.sh')]],
  },
  deploy: {
    win32: ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(scriptDir, 'deploy.ps1')]],
    default: ['bash', [resolve(scriptDir, 'deploy.sh')]],
  },
};

const scriptName = process.argv[2];
const script = scripts[scriptName];

if (!script) {
  console.error(`Unknown local script "${scriptName ?? ''}". Expected one of: ${Object.keys(scripts).join(', ')}`);
  process.exit(1);
}

// `process.platform` is Node's normalized OS label (`win32`, `darwin`, `linux`,
// ...). Unknown POSIX-like platforms fall back to the `.sh` implementation.
const [command, args] = script[process.platform] ?? script.default;
const result = spawnSync(command, args, {
  // Run from the repo root so relative paths inside the shell scripts mean the
  // same thing no matter where npm was launched from.
  cwd: repoRoot,
  // Stream child output directly to this terminal; the dispatcher should feel
  // transparent rather than buffering or reformatting deploy/sync logs.
  stdio: 'inherit',
  windowsHide: false,
});

// `result.error` means the process could not be started at all (for example,
// `bash`/`powershell.exe` was not found). A script that starts and exits nonzero
// reports through `result.status` below instead.
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

// Preserve the child script's exit code so npm/CI sees the real success/failure.
process.exit(result.status ?? 1);
