import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

type JWKS = { keys: unknown[] };
import { requireAccessJwt, AccessUnauthorizedError, clearAccessJwksCache } from './zt-validator.js';

const TEAM_DOMAIN = 'kadragon.cloudflareaccess.com';
const ISSUER = `https://${TEAM_DOMAIN}`;
const AUD = 'test-aud';

async function createTestToken(subject: string, audience: string = AUD) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-kid';

  const token = await new SignJWT({ sub: subject })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setExpirationTime('2h')
    .sign(privateKey);

  const jwks: JWKS = { keys: [jwk] };

  return { token, jwks };
}

describe('requireAccessJwt', () => {
  beforeEach(() => {
    clearAccessJwksCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects when CF_Authorization header is missing', async () => {
    const request = new Request('https://example.com/admin/status');

    await expect(() => requireAccessJwt(request, {
      CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      CF_ACCESS_AUD_TAG: AUD,
    })).rejects.toBeInstanceOf(AccessUnauthorizedError);
  });

  it('rejects when audience is invalid', async () => {
    const { token, jwks } = await createTestToken('user@example.com', 'wrong-aud');

    const request = new Request('https://example.com/admin/status', {
      headers: { CF_Authorization: token },
    });

    await expect(() => requireAccessJwt(request, {
      CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      CF_ACCESS_AUD_TAG: AUD,
    }, { jwks })).rejects.toBeInstanceOf(AccessUnauthorizedError);
  });

  it('accepts valid token and returns payload', async () => {
    const { token, jwks } = await createTestToken('user@example.com');

    const request = new Request('https://example.com/admin/status', {
      headers: { CF_Authorization: token },
    });

    const payload = await requireAccessJwt(request, {
      CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      CF_ACCESS_AUD_TAG: AUD,
    }, { jwks });

    expect(payload.sub).toBe('user@example.com');
  });
});
