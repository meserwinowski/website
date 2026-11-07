import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stagingDir = '/var/services/homes/copilot/website-deploy.A1b2C3d4';
const powershell = process.env.PWSH_BINARY || 'pwsh';
const powershellAvailable = process.platform !== 'win32' && spawnSync(
  powershell, ['-NoLogo', '-NoProfile', '-Command', 'exit 0'],
  { timeout: 15_000, env: { ...process.env, POWERSHELL_TELEMETRY_OPTOUT: '1' } },
).status === 0;

function runDeploy({
  failStep = '', deployTarget = '/volume1/docker/webserver/dist',
  stagePath = stagingDir, mode = null,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'website-deploy-'));
  try {
    const bin = join(dir, 'bin');
    const log = join(dir, 'calls.log');
    mkdirSync(bin);
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(new URL('../scripts/deploy.sh', import.meta.url), join(dir, 'scripts/deploy.sh'));
    copyFileSync(new URL('../scripts/deploy.ps1', import.meta.url), join(dir, 'scripts/deploy.ps1'));
    copyFileSync(new URL('../scripts/load-deploy-env.ps1', import.meta.url), join(dir, 'scripts/load-deploy-env.ps1'));
    writeFileSync(join(dir, 'deploy.env'), [
      'NAS_USER=copilot',
      'NAS_HOST=mainecoon',
      `DEPLOY_TARGET=${deployTarget}`,
      'NGINX_DIR=/volume1/docker/webserver/nginx',
    ].join('\n'));
    writeFileSync(join(dir, 'scripts/sync-content.sh'), '#!/bin/bash\nexec npm run fixture-sync\n', { mode: 0o755 });
    writeFileSync(join(dir, 'scripts/sync-content.ps1'), 'npm run fixture-sync\nif ($LASTEXITCODE -ne 0) { throw "Fixture sync failed" }\n');

    const stub = `#!/bin/bash
tool=\${0##*/}
args=("$@")
command=\${args[\${#args[@]}-1]}
if [[ "$tool" == ssh && "$command" == *"sh -s"* ]]; then command=$(cat); fi
step="$tool"
if [[ "$tool" == npm ]]; then
  if [[ "$1" == test ]]; then step=gate
  elif [[ "$2" == verify:production ]]; then step=content
  else step=sync; fi
elif [[ "$tool" == rsync ]]; then
  if [[ "\${args[\${#args[@]}-2]}" == ./dist/ ]]; then step=upload-site; else step=upload-config; fi
elif [[ "$tool" == ssh ]]; then
  if [[ "$command" == *"rsync --version"* ]]; then step=preflight
  elif [[ "$command" == *"mktemp -d"* ]]; then step=stage
  elif [[ "$command" == *"rsync -a --delete"* ]]; then step=publish-site
  elif [[ "$command" == *"rsync -a --inplace"* ]]; then step=publish-config
  elif [[ "$command" == *"nginx -t" ]]; then step=validate
  elif [[ "$command" == *"nginx -s reload" ]]; then step=reload
  elif [[ "$command" == "rm -rf --"* ]]; then step=cleanup
  fi
fi
printf '%s\\0' "$tool" "$step" "$command" "$#" "$@" >> "$DEPLOY_TEST_LOG"
if [[ "$step" == "$DEPLOY_TEST_FAIL" ]]; then exit 23; fi
if [[ "$step" == stage ]]; then printf '%s\\n' "$DEPLOY_TEST_STAGE"; fi
exit 0
`;
    for (const tool of ['ssh', 'rsync', 'npm', 'nasctl']) {
      writeFileSync(join(bin, tool), stub, { mode: 0o755 });
    }

    const result = spawnSync(mode ? powershell : 'bash', mode ? [
      '-NoLogo', '-NoProfile', '-Command',
      `$PSNativeCommandArgumentPassing = '${mode}'; & './scripts/deploy.ps1'`,
    ] : ['scripts/deploy.sh'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DEPLOY_TEST_LOG: log,
        DEPLOY_TEST_FAIL: failStep,
        DEPLOY_TEST_STAGE: stagePath,
        HOME: dir,
        XDG_CACHE_HOME: join(dir, 'cache'),
        POWERSHELL_TELEMETRY_OPTOUT: '1',
      },
    });
    if (result.error) throw result.error;
    const calls = (() => {
      try {
        const fields = readFileSync(log, 'utf8').split('\0');
        fields.pop();
        const calls = [];
        while (fields.length) {
          const tool = fields.shift();
          const step = fields.shift();
          const command = fields.shift();
          const count = Number(fields.shift());
          calls.push({ tool, step, command, args: fields.splice(0, count) });
        }
        return calls;
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    })();
    return { ...result, output: result.stdout + result.stderr, calls, steps: calls.map(call => call.step) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const { name, mode, available } of [
  { name: 'Bash', mode: null, available: process.platform !== 'win32' },
  { name: 'PowerShell', mode: 'Standard', available: powershellAvailable },
  { name: 'PowerShell legacy native arguments', mode: 'Legacy', available: powershellAvailable },
]) {
  describe.skipIf(!available)(`local ${name} deployment`, { timeout: 15_000 }, () => {
    const deploy = options => runDeploy({ ...options, mode });
    it('gates publishing, uses copilot/sudo, and reloads only through the installed dispatcher', () => {
      const result = deploy();
      expect(result.status, result.stderr).toBe(0);
      expect(result.steps).toEqual([
        'preflight', 'sync', 'content', 'gate', 'stage', 'upload-site', 'publish-site',
        'upload-config', 'publish-config', 'validate', 'reload', 'cleanup',
      ]);

      for (const call of result.calls.filter(call => call.tool === 'ssh')) {
        expect(call.args).toEqual(expect.arrayContaining([
          'BatchMode=yes', 'StrictHostKeyChecking=yes', 'ConnectTimeout=10',
          'RemoteCommand=none', 'RequestTTY=no', 'copilot@mainecoon',
        ]));
      }
      for (const call of result.calls.filter(call => call.tool === 'rsync')) {
        expect(call.args.at(-1)).toContain(`copilot@mainecoon:${stagingDir}/`);
        expect(call.args.join(' ')).not.toContain('--rsync-path');
        expect(call.args[call.args.indexOf('-e') + 1]).toContain('StrictHostKeyChecking=yes');
        expect(call.args[call.args.indexOf('-e') + 1]).toContain('BatchMode=yes');
      }
      const site = result.calls.find(call => call.step === 'publish-site').command;
      expect(site).toContain("sudo -n stat -c '%u:%g' '/volume1/docker/webserver/dist'");
      expect(site).toContain('sudo -n rsync -a --delete');
      expect(site).toContain('--chown="$owner"');
      const config = result.calls.find(call => call.step === 'publish-config').command;
      expect(config).toContain('sudo -n rsync -a --inplace');
      expect(config).toContain('--chown="$owner"');
      expect(result.calls.find(call => call.step === 'cleanup').args.at(-1))
        .toBe(`rm -rf -- '${stagingDir}'`);
      expect(result.calls.find(call => call.step === 'stage').command)
        .toContain('chmod 0700 "$stage" && test "$(stat -c %a "$stage")" = 700');
      if (mode) {
        for (const step of ['stage', 'publish-site', 'publish-config']) {
          expect(result.calls.find(call => call.step === step).args.at(-1)).toBe("tr -d '\\r' | sh -s");
        }
      }
      for (const step of ['validate', 'reload']) {
        expect(result.calls.find(call => call.step === step).args.at(-1))
          .toContain('/volume1/docker_commands/nas-docker.sh ctl webserver_nginx exec nginx');
      }
    });

    it.each([
      ['preflight', ['preflight']],
      ['sync', ['preflight', 'sync']],
      ['content', ['preflight', 'sync', 'content']],
      ['gate', ['preflight', 'sync', 'content', 'gate']],
      ['stage', ['preflight', 'sync', 'content', 'gate', 'stage']],
      ['upload-site', ['preflight', 'sync', 'content', 'gate', 'stage', 'upload-site', 'cleanup']],
      ['publish-site', ['preflight', 'sync', 'content', 'gate', 'stage', 'upload-site', 'publish-site', 'cleanup']],
    ])('stops after a failed %s without subsequent writes', (failStep, steps) => {
      const result = deploy({ failStep });
      expect(result.status).not.toBe(0);
      expect(result.steps).toEqual(steps);
    });

    it.each(['/', '/volume1/../docker', 'relative/dist'])(
      'rejects unsafe privileged destination %s before contacting the NAS',
      deployTarget => {
        const result = deploy({ deployTarget });
        expect(result.status).not.toBe(0);
        expect(result.steps).toEqual([]);
      },
    );

    it('refuses to transfer or clean up an unexpected staging path', () => {
      const result = deploy({ stagePath: '/' });
      expect(result.status).not.toBe(0);
      expect(result.steps).toEqual(['preflight', 'sync', 'content', 'gate', 'stage']);
    });

    it.each(['upload-config', 'publish-config', 'validate', 'reload'])(
      'warns after failed nginx %s, skips later stages, and cleans up',
      failStep => {
        const result = deploy({ failStep });
        expect(result.status, result.stderr).toBe(0);
        expect(result.steps.at(-2)).toBe(failStep);
        expect(result.steps.at(-1)).toBe('cleanup');
        expect(result.output).toMatch(/failed/);
        expect(result.output).not.toContain('nginx config reloaded.');
      },
    );

    it('warns about a cleanup failure without hiding successful publication', () => {
      const result = deploy({ failStep: 'cleanup' });
      expect(result.status, result.stderr).toBe(0);
      expect(result.steps.at(-2)).toBe('reload');
      expect(result.output).toMatch(/could not remove temporary staging directory/i);
    });
  });
}
