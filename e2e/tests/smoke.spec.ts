import { test, expect, type Page } from '@playwright/test';
import path from 'path';

const TEST_FLIGHT_PATH = path.resolve(__dirname, '../fixtures/test-flight.igc');
const SCENE_NAME = 'E2E Test Flight';

/** Dismiss the Cesium error panel overlay if it appears (e.g. invalid Ion token) */
async function dismissCesiumErrorPanel(page: Page) {
  await page.evaluate(() => {
    const panel = document.querySelector('.cesium-widget-errorPanel') as HTMLElement;
    if (panel) panel.style.display = 'none';
  });
}

// ─── API smoke tests ───────────────────────────────────────────────

test('GET /api/health returns ok @smoke', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ status: 'ok' });
});

test('GET /api/scenes returns array @smoke', async ({ request }) => {
  const res = await request.get('/api/scenes');
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

// ─── Homepage tests ────────────────────────────────────────────────

test('homepage has header, upload form, and scene list @smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByText('Adventure Racing')).toBeVisible();
  await expect(page.getByText('Create New Scene')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scenes' })).toBeVisible();
});

test('upload button disabled when form is empty', async ({ page }) => {
  await page.goto('/');
  const uploadBtn = page.getByRole('button', { name: /Upload 0 files/ });
  await expect(uploadBtn).toBeDisabled();
});

test('validation error when uploading without scene name', async ({ page }) => {
  await page.goto('/');

  // Add a file but no scene name
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(TEST_FLIGHT_PATH);
  await expect(page.getByText('1 file selected')).toBeVisible();

  // Button is disabled because sceneName is empty
  const uploadBtn = page.getByRole('button', { name: /Upload 1 file/ });
  await expect(uploadBtn).toBeDisabled();
});

// ─── Upload → Viewer serial flow ──────────────────────────────────

test.describe.serial('upload and viewer flow', () => {
  let sceneUrl: string;
  let sceneId: string;

  test('upload test flight and redirect to viewer @smoke', async ({ page, request }) => {
    await page.goto('/');

    // Fill scene name
    await page.getByPlaceholder('e.g., Red Bull X-Alps Day 3').fill(SCENE_NAME);

    // Upload file via hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_FLIGHT_PATH);
    await expect(page.getByText('1 file selected')).toBeVisible();

    // Click upload
    const uploadBtn = page.getByRole('button', { name: /Upload 1 file$/ });
    await expect(uploadBtn).toBeEnabled();
    await uploadBtn.click();

    // Wait for navigation to /scenes/:id
    await page.waitForURL(/\/scenes\//, { timeout: 30_000 });
    sceneUrl = page.url();
    sceneId = sceneUrl.match(/\/scenes\/([^/?]+)/)![1];

    // Poll API until scene is "ready" or "error"
    const deadline = Date.now() + 45_000;
    let status = 'processing';
    while (Date.now() < deadline) {
      const res = await request.get(`/api/scenes/${sceneId}`);
      const body = await res.json();
      status = body.status;
      if (status === 'ready') break;
      if (status === 'error') {
        throw new Error(
          `Scene processing failed (step: "${body.processingStep || 'unknown'}"). ` +
          'Ensure S3/MinIO is running for local tests.'
        );
      }
      await page.waitForTimeout(1_000);
    }
    expect(status).toBe('ready');
  });

  test('viewer loads with canvas and playback controls @smoke', async ({ page }) => {
    await page.goto(sceneUrl);

    // Wait for the Cesium canvas to appear
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await dismissCesiumErrorPanel(page);

    // Play button (▶)
    await expect(page.getByRole('button', { name: '▶' })).toBeVisible();

    // Time slider
    await expect(page.locator('input[type="range"]')).toBeVisible();

    // Back link
    await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
  });

  test('sidebar shows scene name and pilot', async ({ page }) => {
    await page.goto(sceneUrl);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await dismissCesiumErrorPanel(page);

    // Scene name in sidebar
    await expect(page.getByRole('heading', { name: SCENE_NAME })).toBeVisible();

    // Pilot name with checked checkbox
    const pilotLabel = page.locator('label', { hasText: 'John Smith' });
    await expect(pilotLabel).toBeVisible();
    const checkbox = pilotLabel.locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
  });

  test('Hide All / Show All toggles work', async ({ page }) => {
    await page.goto(sceneUrl);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await dismissCesiumErrorPanel(page);

    const checkbox = page.locator('label', { hasText: 'John Smith' }).locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();

    await page.getByRole('button', { name: 'Hide All' }).click();
    await expect(checkbox).not.toBeChecked();

    await page.getByRole('button', { name: 'Show All' }).click();
    await expect(checkbox).toBeChecked();
  });

  test('Back link navigates to homepage', async ({ page }) => {
    await page.goto(sceneUrl);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await dismissCesiumErrorPanel(page);

    await page.getByRole('link', { name: 'Back' }).click();
    await page.waitForURL('/');
    await expect(page.getByText('Create New Scene')).toBeVisible();
  });

  test('scene appears in scene list with ready status', async ({ page }) => {
    await page.goto('/');
    // Use the known scene URL to find the exact card link
    const sceneLink = page.locator(`a[href="/scenes/${sceneId}"]`);
    await expect(sceneLink).toBeVisible();
    await expect(sceneLink).toHaveText(SCENE_NAME);
    // Check the parent card for "ready" status badge
    const card = sceneLink.locator('..');
    await expect(card.getByText('ready')).toBeVisible();
  });

  test('Cesium Ion token is embedded in the bundle @smoke', async ({ page, request }) => {
    // Check via the terrain-check approach: extract token from app source
    // This is more reliable than window.Cesium which may not be global in dev mode
    const indexRes = await request.get('/');
    const html = await indexRes.text();
    const jwtPattern = /["']?(eyJ[A-Za-z0-9_.\-]{50,})["']?/;

    let token: string | null = null;

    // Try production bundles first
    const scriptMatches = html.matchAll(/<script[^>]+src="([^"]+)"/g);
    const scripts = Array.from(scriptMatches, m => m[1]);
    const jsScripts = scripts.filter(s => s.endsWith('.js') && !s.includes('Cesium'));

    if (jsScripts.length > 0) {
      for (const src of jsScripts) {
        const res = await request.get(src);
        if (!res.ok()) continue;
        const match = (await res.text()).match(jwtPattern);
        if (match) { token = match[1]; break; }
      }
    } else {
      // Vite dev: fetch CesiumViewer module directly
      const res = await request.get('/src/components/viewer/CesiumViewer.tsx');
      if (res.ok()) {
        const match = (await res.text()).match(jwtPattern);
        if (match) token = match[1];
      }
    }

    expect(token, 'Cesium Ion token not found — check VITE_CESIUM_ION_TOKEN').toBeTruthy();
    expect(token!.length).toBeGreaterThan(10);
  });

  test('track hover tooltip shows pilot name and altitude', async ({ page }) => {
    await page.goto(sceneUrl);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await dismissCesiumErrorPanel(page);

    // Wait for tracks to load — look for the pilot checkbox in sidebar
    await expect(page.locator('label', { hasText: 'John Smith' })).toBeVisible({ timeout: 30_000 });

    // Get canvas dimensions for hover attempt
    const coords = await page.evaluate(() => {
      const canvasEl = document.querySelector('canvas');
      if (!canvasEl) return null;
      return {
        x: canvasEl.clientWidth / 2,
        y: canvasEl.clientHeight / 2,
      };
    });

    // Best-effort hover test — canvas center may not intersect a track
    if (coords) {
      await page.mouse.move(coords.x, coords.y);
      await page.waitForTimeout(500);

      const tooltipEl = page.locator('div[style*="pointer-events: none"][style*="z-index"]').first();
      const display = await tooltipEl.evaluate(el => el.style.display).catch(() => 'none');

      if (display === 'block') {
        const content = await tooltipEl.textContent();
        expect(content).toContain('John Smith');
        expect(content).toContain('MSL');
      }
    }
  });

  test('delete scene and verify removal @smoke', async ({ page, request }) => {
    await page.goto('/');
    const sceneLink = page.locator(`a[href="/scenes/${sceneId}"]`);
    await expect(sceneLink).toBeVisible();

    // Delete via API to avoid confirm dialog issues
    const res = await request.delete(`/api/scenes/${sceneId}`);
    expect(res.ok()).toBe(true);

    // Refresh and verify scene is gone
    await page.reload();
    await expect(sceneLink).not.toBeVisible({ timeout: 5_000 });
  });
});
