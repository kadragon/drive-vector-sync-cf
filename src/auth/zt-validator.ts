/**
 * Cloudflare Zero Trust (Access) JWT validation middleware
 *
 * Trace:
 *   spec_id: SPEC-security-zt-1
 *   task_id: TASK-035
 */

import {
  createRemoteJWKSet,
  createLocalJWKSet,
  jwtVerify,
  JWTPayload,
  JSONWebKeySet,
} from 'jose';

type JWKS = JSONWebKeySet;

interface AccessValidationEnv {
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD_TAG: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function clearAccessJwksCache(): void {
  jwksCache.clear();
}

function buildIssuer(teamDomain: string): string {
  const trimmed = teamDomain.replace(/https?:\/\//, '').replace(/\/$/, '');
  return `https://${trimmed}`;
}

function getJwks(teamDomain: string) {
  if (!jwksCache.has(teamDomain)) {
    const jwksUrl = new URL('/cdn-cgi/access/certs', buildIssuer(teamDomain));
    jwksCache.set(teamDomain, createRemoteJWKSet(jwksUrl));
  }
  return jwksCache.get(teamDomain)!;
}

export function extractAccessToken(request: Request): string | null {
  const header = request.headers.get('CF_Authorization') || request.headers.get('Cf-Authorization');
  if (header) {
    return header.trim();
  }

  // Fallback to cookie (browser Access sessions embed the token in CF_Authorization cookie)
  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const prefix = 'CF_Authorization=';
    const match = cookie
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(prefix));
    if (match) {
      return match.substring(prefix.length);
    }
  }
  return null;
}

export class AccessUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessUnauthorizedError';
  }
}

export async function requireAccessJwt(
  request: Request,
  env: AccessValidationEnv,
  options?: { jwks?: JWKS }
): Promise<JWTPayload> {
  const token = extractAccessToken(request);

  if (!token) {
    throw new AccessUnauthorizedError('Missing CF_Authorization token');
  }

  const issuer = buildIssuer(env.CF_ACCESS_TEAM_DOMAIN);
  const audience = env.CF_ACCESS_AUD_TAG;

  const jwks = options?.jwks
    ? createLocalJWKSet(options.jwks)
    : getJwks(env.CF_ACCESS_TEAM_DOMAIN);

  try {
    const result = await jwtVerify(token, jwks, {
      issuer,
      audience,
    });

    return result.payload;
  } catch (error) {
    const message = (error as Error).message || 'JWT verification failed';
    throw new AccessUnauthorizedError(message);
  }
}

export function unauthorizedResponse(message: string): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized', message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
