#!/usr/bin/env node
/**
 * spotify-refresh-token.mjs — One-time Spotify refresh-token helper.
 *
 * Spotify's "currently playing" / "recently played" endpoints require a user
 * refresh token, which you mint once via the Authorization Code flow. This
 * script runs that flow locally: it opens the Spotify consent page, catches the
 * redirect on a throwaway localhost server, exchanges the code, and prints the
 * refresh token. Store that token in Cloudflare with:
 *
 *   wrangler secret put SPOTIFY_REFRESH_TOKEN --config worker/wrangler.toml
 *
 * Learner version of the OAuth flow:
 *   1. Build an authorization URL with this app's Client ID, the requested
 *      scopes, a redirect URI, and a random `state` value.
 *   2. The browser sends you to Spotify, where you approve those scopes.
 *   3. Spotify redirects back to `http://127.0.0.1:8888/callback` with a short-
 *      lived `code` and the same `state`.
 *   4. This script verifies `state`, then exchanges the `code` plus Client
 *      Secret for tokens. The access token is short-lived; the refresh token is
 *      the durable secret the Cloudflare Worker can use later.
 *
 * Node APIs used here:
 *  - `http.createServer` listens only on localhost for Spotify's redirect.
 *  - `crypto.randomBytes` makes the anti-CSRF `state` value unpredictable.
 *  - `readline` prompts for credentials when args/env vars are not provided.
 *  - `spawn` launches the system browser without blocking this process.
 *
 * PREREQUISITES (see worker/README.md):
 *   1. Create a Spotify app at https://developer.spotify.com/dashboard
 *   2. Add this exact Redirect URI to the app settings:
 *        http://127.0.0.1:8888/callback
 *   3. Have the app's Client ID and Client Secret ready.
 *
 * USAGE:
 *   npm run spotify:token -- --client-id=<id> --client-secret=<secret>
 *   # or with env vars:
 *   SPOTIFY_CLIENT_ID=<id> SPOTIFY_CLIENT_SECRET=<secret> npm run spotify:token
 *   # or run with no args and paste the values when prompted.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const PORT = 8888;
const SCOPES = 'user-read-currently-playing user-read-recently-played user-library-read';

/**
 * Parse `--name=value` CLI flags into a small object.
 *
 * This intentionally supports only the two flags the helper needs; keeping the
 * parser tiny avoids pulling in a dependency for a one-time script.
 *
 * @param {string[]} argv Arguments after the script name.
 * @returns {Record<string, string>} Parsed flag names and values.
 */
function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    // Capture everything after the first `=` so secrets containing `=` survive.
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

/**
 * Ask one question on stdin/stdout and resolve with the trimmed answer.
 *
 * `readline.createInterface` handles line editing and Enter detection. When
 * `silent` is true we add a lightweight `data` listener that prints `*` instead
 * of echoing the secret characters directly.
 *
 * @param {string} question Prompt text shown in the terminal.
 * @param {{silent?: boolean}} [options]
 * @returns {Promise<string>} The user's answer without surrounding whitespace.
 */
function prompt(question, { silent = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (silent) {
      // Best-effort masking for secret entry.
      const onData = (char) => {
        const s = char.toString();
        if (s === '\n' || s === '\r' || s === '\u0004') {
          process.stdout.write('\n');
          process.stdin.removeListener('data', onData);
        } else {
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', onData);
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Open the authorization URL in the user's default browser.
 *
 * `spawn` starts a child process asynchronously. `detached: true` plus
 * `.unref()` lets the browser opener keep running independently while this
 * script continues listening for the localhost callback.
 *
 * @param {string} url Spotify authorization URL to open.
 */
function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* If it fails, the user can copy the printed URL manually. */
  }
}

/** Run the full Authorization Code flow and print the refresh token. */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const clientId =
    args['client-id'] || process.env.SPOTIFY_CLIENT_ID || (await prompt('Spotify Client ID: '));
  if (!clientId) {
    console.error('❌ Client ID is required.');
    process.exit(1);
  }

  const clientSecret =
    args['client-secret'] ||
    process.env.SPOTIFY_CLIENT_SECRET ||
    (await prompt('Spotify Client Secret: ', { silent: true }));
  if (!clientSecret) {
    console.error('❌ Client Secret is required.');
    process.exit(1);
  }

  // `state` is sent to Spotify and must come back unchanged. That binds the
  // callback to this terminal session and prevents accepting a forged redirect.
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);

  const code = await new Promise((resolve, reject) => {
    // Local, throwaway callback server. It never leaves 127.0.0.1; Spotify only
    // needs the browser to reach it after the user grants access.
    const server = http.createServer((req, res) => {
      // `new URL` needs an absolute base because request URLs from Node's HTTP
      // server are path-only strings like `/callback?code=...`.
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const receivedCode = url.searchParams.get('code');

      // Always send a friendly browser response before resolving/rejecting the
      // terminal promise, then close the temporary server.
      const finish = (message) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><html><body style="font-family:system-ui;padding:2rem">` +
            `<h1>${message}</h1><p>You can close this tab and return to the terminal.</p>` +
            `</body></html>`,
        );
        server.close();
      };

      if (error) {
        finish('❌ Authorization failed.');
        reject(new Error(`Spotify returned error: ${error}`));
        return;
      }
      if (returnedState !== state) {
        finish('❌ State mismatch — aborting.');
        reject(new Error('State parameter mismatch (possible CSRF).'));
        return;
      }
      if (!receivedCode) {
        finish('❌ No authorization code returned.');
        reject(new Error('No code in callback.'));
        return;
      }

      finish('✅ Authorized! Refresh token generated.');
      resolve(receivedCode);
    });

    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      console.log('\n🔐 Opening Spotify authorization in your browser...');
      console.log('   If it does not open, paste this URL manually:\n');
      console.log(`   ${authUrl.toString()}\n`);
      openBrowser(authUrl.toString());
      console.log(`   Waiting for the redirect to ${REDIRECT_URI} ...`);
    });
  });

  // Exchange the authorization code for tokens. Spotify uses HTTP Basic auth
  // here: base64(client_id:client_secret) in the Authorization header, and the
  // code details in a form-encoded POST body.
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`\n❌ Token exchange failed: ${res.status} ${res.statusText}`);
    if (detail) console.error(detail);
    process.exit(1);
  }

  const data = await res.json();
  // A refresh token is the valuable long-lived credential; without it the worker
  // could only use the short-lived access token returned by this one exchange.
  if (!data.refresh_token) {
    console.error('\n❌ No refresh_token in the response:', data);
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('✅ SUCCESS — your Spotify refresh token:\n');
  console.log(`   ${data.refresh_token}`);
  console.log('\nStore it in Cloudflare (it is a secret — do not commit it):');
  console.log('   wrangler secret put SPOTIFY_REFRESH_TOKEN --config worker/wrangler.toml');
  console.log('════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
