import type { Page } from '@playwright/test';

export const ADMIN_PIN = '1234';

/** Wipe local state (localStorage + IndexedDB database) and reload to a fresh seeded boot. */
export async function resetAppState(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('weha-device-framework');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
  await page.waitForSelector('[data-testid="user-grid"]', { timeout: 30000 });
}

/** Login as the seeded admin from the login screen. */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.getByTestId('user-administrator').click();
  await page.waitForSelector('[data-testid="pin-dialog"]');
  await page.keyboard.type(ADMIN_PIN);
  await page.getByTestId('pin-submit').click();
  await page.waitForSelector('[data-testid="dashboard"]', { timeout: 30000 });
}
