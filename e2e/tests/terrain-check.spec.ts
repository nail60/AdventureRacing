import { test, expect } from '@playwright/test';

/**
 * Non-browser terrain/token validation.
 *
 * Fetches the app's JS bundle source and verifies a Cesium Ion token
 * is present and structurally valid (proper JWT format).
 * This would have caught the missing VITE_CESIUM_ION_TOKEN build arg.
 *
 * Works in both Vite dev mode (type="module" scripts) and production builds.
 */

/** Extract the Cesium Ion token from the app source */
async function extractToken(request: any): Promise<string | null> {
  const indexRes = await request.get('/');
  if (!indexRes.ok()) return null;
  const html = await indexRes.text();

  const scriptMatches = html.matchAll(/<script[^>]+src="([^"]+)"/g);
  const scripts = Array.from(scriptMatches, m => m[1]);

  // JWT regex: Cesium Ion tokens are JWTs with dots between segments
  const jwtPattern = /["']?(eyJ[A-Za-z0-9_.\-]{50,})["']?/;

  // Production: search the app's index bundle (skip Cesium.js which has false-positive eyJ strings)
  const appScripts = scripts.filter(s => s.endsWith('.js') && !s.includes('Cesium'));
  if (appScripts.length > 0) {
    for (const src of appScripts) {
      const res = await request.get(src);
      if (!res.ok()) continue;
      const js = await res.text();
      const match = js.match(jwtPattern);
      if (match) return match[1];
    }
    return null;
  }

  // Vite dev mode: fetch CesiumViewer module (Vite inlines env vars)
  const viewerPaths = [
    '/src/components/viewer/CesiumViewer.tsx',
    '/src/components/viewer/CesiumViewer.ts',
  ];
  for (const vpath of viewerPaths) {
    const res = await request.get(vpath);
    if (!res.ok()) continue;
    const js = await res.text();
    const match = js.match(jwtPattern);
    if (match) return match[1];
  }

  return null;
}

test.describe('terrain token validation @smoke', () => {
  test('Cesium Ion token is present and valid JWT @smoke', async ({ request }) => {
    const token = await extractToken(request);
    expect(
      token,
      'Cesium Ion token not found in app bundle — check VITE_CESIUM_ION_TOKEN build arg',
    ).toBeTruthy();

    // Verify it's a proper 3-segment JWT
    const parts = token!.split('.');
    expect(parts.length, 'Token should be a 3-part JWT (header.payload.signature)').toBe(3);

    // Decode and validate the header
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(header.typ).toBe('JWT');

    // Decode and validate the payload has required Cesium Ion fields
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(payload.jti, 'Token should have a jti (token ID)').toBeTruthy();
    expect(payload.iat, 'Token should have an iat (issued-at timestamp)').toBeGreaterThan(0);

    // Sanity check: iat should be a reasonable date (after 2024)
    const issuedDate = new Date(payload.iat * 1000);
    expect(issuedDate.getFullYear()).toBeGreaterThanOrEqual(2024);
  });
});
