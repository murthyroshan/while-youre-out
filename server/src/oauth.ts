// Account linking, as Alexa+ add-ons do it: an OAuth 2.1 authorization server (authorization code
// with PKCE S256 only, a refresh token with every access token, rotated on use), the discovery
// documents Alexa reads (/.well-known/oauth-protected-resource and oauth-authorization-server),
// statically registered clients with their exact redirect URIs, and a bare 401 when a request needs
// a token it doesn't have. Alexa+ doesn't support a WWW-Authenticate header on that 401: it finds the
// metadata at the well-known address, which MCP allows too. Linking gives the household its own
// house: the token says which. Alexa+'s service tier (client_credentials, scope mcp:service) gets a
// short token with no household, for discovery only. Local tools (the MCP Inspector) may register
// themselves for localhost only.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';

export interface OAuthClient {
  id: string;
  secret?: string;
  name: string;
  /** Exact redirect URIs, or patterns for a family of them (Alexa uses several by region). */
  redirects: Array<string | RegExp>;
}

export interface OAuthOptions {
  publicUrl: string;
  /** The protected MCP endpoint's path (its canonical URI is publicUrl + this). */
  resourcePath: string;
  clients: OAuthClient[];
  /** A new household for a parent who links (the demo gives each one a private sample family). */
  newHouse: () => string;
}

interface Grant {
  client: string;
  /** The linked household; none for a service-level (client_credentials) token. */
  house?: string;
  scope: string;
  expires: number;
}

const SCOPES = ['household'];
/** Alexa+'s service-level scope: discovery (initialize, tools/list), never a family's data. */
export const SERVICE_SCOPE = 'mcp:service';
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 30 * 24 * 3600_000;
const CODE_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 5000;

/** Alexa's account-linking redirect URIs (one per region). */
export const ALEXA_REDIRECTS = [/^https:\/\/(layla|pitangui|alexa)\.amazon\.com\/api\/skill\/link\/[A-Z0-9]{8,32}$/, /^https:\/\/alexa\.amazon\.co\.jp\/api\/skill\/link\/[A-Z0-9]{8,32}$/];

const sha = (s: string) => createHash('sha256').update(s).digest();
const b64url = (b: Buffer) => b.toString('base64url');
const hashKey = (t: string) => b64url(sha(t));
const random = () => randomBytes(32).toString('base64url');
const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const isLocal = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
};

export function createOAuth(opts: OAuthOptions) {
  const base = opts.publicUrl.replace(/\/$/, '');
  const resource = `${base}${opts.resourcePath}`;
  const clients = new Map(opts.clients.map((c) => [c.id, c]));
  const pending = new Map<string, { client: string; redirect: string; state: string; challenge: string; scope: string; expires: number }>();
  const codes = new Map<string, Grant & { redirect: string; challenge: string; used: boolean }>();
  const access = new Map<string, Grant>();
  const refresh = new Map<string, Grant>();
  const bounded = <K, V>(m: Map<K, V>) => {
    if (m.size > MAX_ENTRIES) m.delete(m.keys().next().value!);
  };

  const redirectAllowed = (c: OAuthClient, uri: string) => c.redirects.some((r) => (typeof r === 'string' ? r === uri : r.test(uri)));
  const issue = (g: Omit<Grant, 'expires'>) => {
    const a = random();
    const r = random();
    access.set(hashKey(a), { ...g, expires: Date.now() + ACCESS_TTL_S * 1000 });
    refresh.set(hashKey(r), { ...g, expires: Date.now() + REFRESH_TTL_MS });
    bounded(access);
    bounded(refresh);
    return { access_token: a, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: r, scope: g.scope };
  };

  /** The household a request's bearer token belongs to, or null. */
  const verify = (authorization: string | undefined): Grant | null => {
    const m = /^Bearer ([\w-]{20,200})$/.exec(authorization ?? '');
    if (!m) return null;
    const g = access.get(hashKey(m[1]));
    if (!g || g.expires < Date.now()) return null;
    return g;
  };
  /** A bare 401: Alexa+ starts account linking from it, and finds the metadata at the well-known address. */
  const challenge = (res: express.Response) => void res.status(401).json({ error: 'unauthorized', message: 'Access token required to use this tool.' });

  const router = express.Router();
  router.use('/oauth', express.urlencoded({ extended: false, limit: '8kb' }), express.json({ limit: '8kb' }));

  const protectedResource = (_req: express.Request, res: express.Response) =>
    void res.json({ resource, authorization_servers: [base], scopes_supported: SCOPES, bearer_methods_supported: ['header'], resource_name: "While You're Out" });
  router.get('/.well-known/oauth-protected-resource', protectedResource);
  router.get(`/.well-known/oauth-protected-resource${opts.resourcePath}`, protectedResource);
  router.get('/.well-known/oauth-authorization-server', (_req, res) =>
    void res.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      revocation_endpoint: `${base}/oauth/revoke`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
      scopes_supported: [...SCOPES, SERVICE_SCOPE],
    }),
  );

  // Local tools only (the MCP Inspector on a judge's laptop): Alexa itself is registered statically.
  router.post('/oauth/register', (req, res) => {
    const uris = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris.filter((u: unknown) => typeof u === 'string') : [];
    if (!uris.length || !uris.every(isLocal)) return void res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'Only localhost tools can register themselves.' });
    const id = `local-${randomBytes(9).toString('base64url')}`;
    clients.set(id, { id, name: String(req.body?.client_name ?? 'A local tool').slice(0, 60), redirects: uris });
    res.status(201).json({ client_id: id, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
  });

  router.get('/oauth/authorize', (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const c = q.client_id ? clients.get(q.client_id) : undefined;
    // Without a known client and an exact registered redirect, nothing is redirected anywhere.
    if (!c || !q.redirect_uri || !redirectAllowed(c, q.redirect_uri)) return void res.status(400).type('html').send(page('Can’t link', '<p>This link isn’t from a registered app.</p>'));
    const back = (params: Record<string, string>) => {
      const u = new URL(q.redirect_uri!);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      if (q.state) u.searchParams.set('state', q.state);
      res.redirect(302, u.toString());
    };
    if (q.response_type !== 'code') return back({ error: 'unsupported_response_type' });
    if (!q.code_challenge || q.code_challenge_method !== 'S256' || !/^[\w-]{43,128}$/.test(q.code_challenge)) return back({ error: 'invalid_request', error_description: 'PKCE S256 is required.' });
    if (q.resource && q.resource !== resource) return back({ error: 'invalid_target' });
    const scope = (q.scope ?? 'household').split(' ').filter((s) => SCOPES.includes(s) || s === 'openid').join(' ') || 'household';
    const tx = random();
    pending.set(tx, { client: c.id, redirect: q.redirect_uri, state: q.state ?? '', challenge: q.code_challenge, scope, expires: Date.now() + CODE_TTL_MS });
    bounded(pending);
    res
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(
        page(
          'Link While You’re Out',
          `<p class="lead"><b>${esc(c.name)}</b> would like to link to While You’re Out.</p>
<ul><li>Answer whoever looks after your kids from your own notes</li><li>Send their questions to your phone, and your answers back</li><li>Keep tonight’s activity log for you</li></ul>
<p class="muted">This demo links a private sample family (the Sharmas). In a real home, you’d sign in to your household here.</p>
<form method="post" action="${base}/oauth/authorize"><input type="hidden" name="tx" value="${tx}">
<button name="decision" value="allow" class="primary">Link</button> <button name="decision" value="deny">Cancel</button></form>`,
        ),
      );
  });

  router.post('/oauth/authorize', (req, res) => {
    const tx = String(req.body?.tx ?? '');
    const p = pending.get(tx);
    pending.delete(tx);
    if (!p || p.expires < Date.now()) return void res.status(400).type('html').send(page('That link expired', '<p>Start linking again from the Alexa app.</p>'));
    const u = new URL(p.redirect);
    if (p.state) u.searchParams.set('state', p.state);
    if (req.body?.decision !== 'allow') {
      u.searchParams.set('error', 'access_denied');
      return void res.redirect(302, u.toString());
    }
    const code = random();
    codes.set(hashKey(code), { client: p.client, house: opts.newHouse(), scope: p.scope, redirect: p.redirect, challenge: p.challenge, used: false, expires: Date.now() + CODE_TTL_MS });
    bounded(codes);
    u.searchParams.set('code', code);
    res.redirect(302, u.toString());
  });

  /** The client a token request comes from: its id, and its secret if it has one. */
  const clientOf = (req: express.Request): OAuthClient | null => {
    let id = req.body?.client_id as string | undefined;
    let secret = req.body?.client_secret as string | undefined;
    const basic = /^Basic (.+)$/.exec(req.headers.authorization ?? '');
    if (basic) [id, secret] = Buffer.from(basic[1], 'base64').toString().split(':').map(decodeURIComponent);
    const c = id ? clients.get(id) : undefined;
    if (!c) return null;
    if (c.secret && !(secret && sameSecret(secret, c.secret))) return null;
    return c;
  };

  router.post('/oauth/token', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const fail = (error: string, status = 400) => void res.status(status).json({ error });
    const c = clientOf(req);
    if (!c) return fail('invalid_client', 401);
    const b = req.body ?? {};
    if (b.grant_type === 'authorization_code') {
      const key = hashKey(String(b.code ?? ''));
      const g = codes.get(key);
      codes.delete(key); // single use
      if (!g || g.used || g.expires < Date.now() || g.client !== c.id || g.redirect !== b.redirect_uri) return fail('invalid_grant');
      if (b.resource && b.resource !== resource) return fail('invalid_target');
      const verifier = String(b.code_verifier ?? '');
      if (!/^[\w.~-]{43,128}$/.test(verifier) || b64url(sha(verifier)) !== g.challenge) return fail('invalid_grant');
      return void res.json(issue({ client: c.id, house: g.house, scope: g.scope }));
    }
    if (b.grant_type === 'refresh_token') {
      const key = hashKey(String(b.refresh_token ?? ''));
      const g = refresh.get(key);
      refresh.delete(key); // rotated: the old one stops working
      if (!g || g.expires < Date.now() || g.client !== c.id) return fail('invalid_grant');
      return void res.json(issue({ client: c.id, house: g.house, scope: g.scope }));
    }
    if (b.grant_type === 'client_credentials') {
      // Machine to machine: only a client with a secret, only the service scope, only this server,
      // a short token and no refresh token (the client asks again when it expires).
      if (!c.secret) return fail('unauthorized_client');
      const scopes = String(b.scope ?? SERVICE_SCOPE).split(' ').filter(Boolean);
      if (!scopes.length || scopes.some((s) => s !== SERVICE_SCOPE)) return fail('invalid_scope');
      if (!b.resource) return fail('invalid_request');
      if (b.resource !== resource) return fail('invalid_target');
      const a = random();
      access.set(hashKey(a), { client: c.id, scope: SERVICE_SCOPE, expires: Date.now() + ACCESS_TTL_S * 1000 });
      bounded(access);
      return void res.json({ access_token: a, token_type: 'Bearer', expires_in: ACCESS_TTL_S, scope: SERVICE_SCOPE });
    }
    fail('unsupported_grant_type');
  });

  router.post('/oauth/revoke', (req, res) => {
    const t = String(req.body?.token ?? '');
    access.delete(hashKey(t));
    refresh.delete(hashKey(t));
    res.status(200).json({});
  });

  return { router, verify, challenge, resource };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title}</title>
<style>:root{color-scheme:light dark;--bg:#FAF9FB;--card:#fff;--text:#14181E;--muted:#5B6371}@media(prefers-color-scheme:dark){:root{--bg:#0B0E13;--card:#14181E;--text:#fff;--muted:#9AA5B4}}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif}main{max-width:480px;margin:48px auto;padding:24px;background:var(--card);border-radius:16px}
h1{font-size:26px;margin:0 0 12px}.lead{font-size:18px}.muted{color:var(--muted);font-size:15px}li{margin:6px 0}
button{min-height:48px;padding:0 22px;border-radius:999px;border:0;font:inherit;font-weight:700;cursor:pointer;background:#E8ECF2;color:#14181E}button.primary{background:#2D415E;color:#fff}</style></head>
<body><main><h1>${title}</h1>${body}</main></body></html>`;
