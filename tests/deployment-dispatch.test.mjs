import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { dispatchPrivateDeploy } from '../scripts/dispatch-private-deploy.mjs';

const sha = 'a'.repeat(40);
const environment = {
  GITHUB_REPOSITORY: 'meserwinowski/website',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: sha,
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '2',
  GH_TOKEN: 'test-only-token',
};

describe('private deployment handoff', () => {
  it('pins the tested source and authorizes only the private request', async () => {
    const api = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha }) })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    expect(await dispatchPrivateDeploy(environment, api)).toBe(true);
    expect(api.mock.calls[0][1].headers.Authorization).toBeUndefined();
    const [url, request] = api.mock.calls[1];
    expect(url).toContain('/website-content/actions/workflows/deploy.yml/dispatches');
    expect(request.headers.Authorization).toBe('Bearer test-only-token');
    expect(JSON.parse(request.body)).toEqual({
      ref: 'main',
      inputs: { trigger_kind: 'public_push', code_sha: sha, source_run_id: '123', source_run_attempt: '2' },
    });
    expect(api).toHaveBeenCalledTimes(2);
  });

  it.each([
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/other' },
    { GITHUB_REPOSITORY: 'other/website' },
  ])('never dispatches an untrusted event: %j', async (override) => {
    const api = vi.fn();
    expect(await dispatchPrivateDeploy({ ...environment, ...override }, api)).toBe(false);
    expect(api).not.toHaveBeenCalled();
  });

  it('skips code superseded while CI was running', async () => {
    const api = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sha: 'b'.repeat(40) }) });
    expect(await dispatchPrivateDeploy(environment, api)).toBe(false);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('fails without a token or when authorization is rejected', async () => {
    const api = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha }) })
      .mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(dispatchPrivateDeploy(environment, api)).rejects.toThrow('403');
    await expect(dispatchPrivateDeploy({ ...environment, GH_TOKEN: '' },
      async () => ({ ok: true, json: async () => ({ sha }) }))).rejects.toThrow('Configure');
  });

  it('fails closed on invalid provenance or an unavailable public API', async () => {
    await expect(dispatchPrivateDeploy({ ...environment, GITHUB_SHA: '../main' }, vi.fn()))
      .rejects.toThrow('provenance');
    await expect(dispatchPrivateDeploy(environment, async () => ({ ok: false, status: 429 })))
      .rejects.toThrow('429');
  });

  it('keeps the credential-bearing job behind both CI gates and away from PRs', () => {
    const workflow = parse(readFileSync('.github/workflows/deploy.yml', 'utf8'));
    const job = workflow.jobs['request-private-deploy'];
    expect(job.needs).toEqual(['public-fixture-build', 'windows-content-check']);
    expect(job.if).toContain("github.event_name == 'push'");
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    expect(job.steps[0].with.ref).toBe('${{ github.sha }}');
    for (const name of ['public-fixture-build', 'windows-content-check']) {
      expect(JSON.stringify(workflow.jobs[name])).not.toContain('secrets.');
    }
    expect(JSON.stringify(job)).not.toMatch(/NAS_|TS_OAUTH|npm ci|content:assemble/);
  });
});
