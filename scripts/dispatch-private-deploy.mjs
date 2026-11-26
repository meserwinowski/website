import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function dispatchPrivateDeploy(env, fetchImpl = fetch) {
  if (env.GITHUB_REPOSITORY !== 'meserwinowski/website' ||
      env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== 'refs/heads/main') {
    return false;
  }
  if (!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '') ||
      !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') ||
      !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) {
    throw new Error('Invalid public deployment provenance');
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
  };
  const head = await fetchImpl(
    'https://api.github.com/repos/meserwinowski/website/commits/main',
    { headers, signal: AbortSignal.timeout(30_000) }
  );
  if (!head.ok) throw new Error(`Public main lookup failed (${head.status})`);
  if ((await head.json()).sha !== env.GITHUB_SHA) return false;
  if (!env.GH_TOKEN) throw new Error('Configure WEBSITE_CONTENT_DISPATCH_TOKEN');

  const response = await fetchImpl(
    'https://api.github.com/repos/meserwinowski/website-content/actions/workflows/deploy.yml/dispatches',
    {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: { ...headers, Authorization: `Bearer ${env.GH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          trigger_kind: 'public_push',
          code_sha: env.GITHUB_SHA,
          source_run_id: env.GITHUB_RUN_ID,
          source_run_attempt: env.GITHUB_RUN_ATTEMPT,
        },
      }),
    }
  );
  if (!response.ok) throw new Error(`Private deployment request failed (${response.status})`);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dispatchPrivateDeploy(process.env).then(
    (requested) => console.log(requested ? 'Private deployment requested; inspect its run for publication.' : 'No deployment requested: non-main event or superseded code.'),
    (error) => { console.error(error.message); process.exitCode = 1; }
  );
}
