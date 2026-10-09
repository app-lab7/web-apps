import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';

let cachedKeys: { origin: string; expires: number; keys: (JsonWebKey & { kid?: string; alg?: string })[] } | null = null;
const decode = (part: string) => {
  const binary = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
};
const parse = (part: string) => JSON.parse(new TextDecoder().decode(decode(part))) as Record<string, unknown>;

async function verifyToken(token: string, issuer: string, audience: string): Promise<string | null> {
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some(s => !s || s.length > 20000)) return null;
  const header = parse(segments[0]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = parse(segments[1]);
  if (payload.iss !== issuer ||
      !(payload.aud === audience || (Array.isArray(payload.aud) && payload.aud.includes(audience))) ||
      typeof payload.exp !== 'number' || payload.exp <= now ||
      (typeof payload.nbf === 'number' && payload.nbf > now) ||
      typeof payload.sub !== 'string' || !payload.sub) return null;
  if (!cachedKeys || cachedKeys.origin !== issuer || cachedKeys.expires < Date.now()) {
    const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
    if (!response.ok) throw new Error('Cloudflare Access の公開鍵を取得できません');
    const body = await response.json() as { keys?: (JsonWebKey & { kid?: string; alg?: string })[] };
    if (!Array.isArray(body.keys)) throw new Error('Cloudflare Access の公開鍵が不正です');
    cachedKeys = { origin: issuer, expires: Date.now() + 10 * 60_000, keys: body.keys };
  }
  const jwk = cachedKeys.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && k.alg === 'RS256');
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(segments[2]), signed);
  return valid ? `${new URL(issuer).host}:${payload.sub}` : null;
}

export async function getAccessUserId(): Promise<string | null> {
  const teamDomain = env.TEAM_DOMAIN;
  const audience = env.POLICY_AUD;
  if (!teamDomain || !audience) throw new Error('Cloudflare Access の設定がありません');
  const issuer = new URL(teamDomain);
  if (issuer.protocol !== 'https:' || issuer.pathname !== '/' || issuer.search || issuer.hash ||
      !issuer.hostname.endsWith('.cloudflareaccess.com')) {
    throw new Error('TEAM_DOMAIN の設定を確認してください');
  }
  const token = (await headers()).get('cf-access-jwt-assertion');
  if (!token) return null;
  try { return await verifyToken(token, issuer.origin, audience); }
  catch { return null; }
}
