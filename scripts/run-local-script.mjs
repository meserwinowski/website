import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

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

const [command, args] = script[process.platform] ?? script.default;
const result = spawnSync(command, args, {
  cwd: repoRoot,
  stdio: 'inherit',
  windowsHide: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
