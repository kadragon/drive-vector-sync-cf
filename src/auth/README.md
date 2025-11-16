Cloudflare Access JWT Validation
===============================

Trace: { spec_id: SPEC-security-zt-1, task_id: TASK-035 }

Summary
-------
`src/auth/zt-validator.ts` provides Zero Trust (Access) JWT validation for the Worker. It enforces Cloudflare Access on all `/admin/*` endpoints.

Secrets required
----------------
- `CF_ACCESS_TEAM_DOMAIN`: e.g., `kadragon.cloudflareaccess.com`
- `CF_ACCESS_AUD_TAG`: the AUD value from the Access application

How it works
------------
1. Extracts the token from `CF_Authorization` header (or cookie fallback).
2. Fetches JWKS from `https://{team}/cdn-cgi/access/certs` (cached).
3. Verifies issuer (`https://{team}`) and audience (`CF_ACCESS_AUD_TAG`) via `jose.jwtVerify`.
4. Returns 401 with JSON if verification fails.

Key files
---------
- `src/auth/zt-validator.ts`: middleware, JWKS cache, helpers.
- `src/index.ts`: uses `requireAccessJwt` for `/admin` routes.
- `src/index.e2e.test.ts`: e2e expectations updated to `CF_Authorization`.
- `src/auth/zt-validator.test.ts`: unit tests for success/failure cases.

Client impact
-------------
Frontend manual sync no longer asks for an admin token; it relies on the Access session cookie (`CF_Authorization`).
