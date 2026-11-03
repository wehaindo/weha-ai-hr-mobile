#!/usr/bin/env node
// Live mobile-UI walk of the ESS app (playwright, headless) against whatever
// backend the dev/preview server is built with (NEXT_PUBLIC_ERP_BASE_URL).
//
//   node scripts/ess-live-ui.mjs [--app http://localhost:3180] \
//     [--tenant store-003] [--email user@example.com] [--password secret]
//
// Opens the app at 375x667 (bottom-nav layout), signs in through the WEHA
// account toggle and visits every screen, reporting: real data loaded vs
// error card vs no-session, plus the API calls each screen made.

import { chromium } from 'playwright';

const args = process.argv.slice(2).reduce((acc, cur, i, arr) => {
  if (cur.startsWith('--')) return { ...acc, [cur.slice(2)]: arr[i + 1] };
  return acc;
}, {});

const APP = String(args.app ?? process.env.APP_URL ?? 'http://localhost:3180').replace(/\/+$/, '');
const TENANT = args.tenant ?? process.env.TENANT ?? 'store-003';
const EMAIL = args.email ?? process.env.EMAIL ?? 'whidayat@store003.com';
const PASSWORD = args.password ?? process.env.PASSWORD ?? 'password';

const screens = [
  ['/dashboard', 'dashboard', 'Request status grid + attendance section'],
  ['/leave', 'leave-page', 'Balances, leave status grid, history'],
  ['/requests', 'requests-page', 'History, filters, detail'],
  ['/approvals', 'approvals-page', 'Manager inbox (or access denied)'],
  ['/manager', 'manager-page', 'Manager dashboard (or access denied)'],
  ['/payslips', 'payslips-page', 'Payroll summary, periods, tabs'],
  ['/profile', 'profile-page', 'Authorized employee record'],
];

const report = [];
const say = (line) => {
  report.push(line);
  console.log(line);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 667 } });

const api = [];
page.on('response', (r) => {
  if (!r.url().includes('/api/mobile/v1/')) return;
  api.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+\/api\/mobile\/v1/, '')}`);
});

try {
  // ── login via WEHA account ────────────────────────────────────────────
  await page.goto(`${APP}/`);
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((res) => {
      const r = indexedDB.deleteDatabase('weha-device-framework');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await page.reload();
  await page.waitForSelector('[data-testid="user-grid"]', { timeout: 30000 });
  await page.getByTestId('toggle-mobile-login').click();
  await page.getByTestId('mobile-tenant').fill(TENANT);
  await page.getByTestId('mobile-email').fill(EMAIL);
  await page.getByTestId('mobile-password').fill(PASSWORD);
  await page.getByTestId('mobile-submit').click();

  let loggedIn = true;
  try {
    await page.waitForSelector('[data-testid="dashboard"]', { timeout: 25000 });
  } catch {
    loggedIn = false;
  }
  if (!loggedIn) {
    const errText = await page.getByTestId('mobile-error').textContent().catch(() => '(no error)');
    say(`LOGIN: FAILED — ${errText}`);
    process.exitCode = 1;
  } else {
    say(`LOGIN: OK (${APP} · tenant=${TENANT} · ${EMAIL})`);
    say(`LAYOUT: bottom-nav=${(await page.getByTestId('bottom-nav').count()) > 0} approvals-shield=${(await page.getByTestId('approvals-status').count()) > 0} bell=${(await page.getByTestId('notifications-button').count()) > 0}`);

    for (const [route, testid, what] of screens) {
      api.length = 0;
      await page.goto(`${APP}${route}`);
      const found = await page.getByTestId(testid).waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(1500);
      const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
      let verdict;
      if (!found) verdict = 'SCREEN MISSING (access denied / module off?)';
      else if (text.includes('Could not load')) verdict = text.match(/Could not load[^.]*/)?.[0] ?? 'LOAD ERROR';
      else if (text.includes('No employee session')) verdict = 'NO EMPLOYEE SESSION';
      else verdict = 'OK';
      const errorCalls = api.filter((l) => !l.startsWith('200'));
      say(`${route.padEnd(12)} ${verdict}${errorCalls.length ? ` · non-200: ${errorCalls.join(' | ')}` : ''} — ${what}`);
    }

    // interactive spots
    await page.goto(`${APP}/requests`);
    await page.getByTestId('requests-page').waitFor({ timeout: 15000 }).catch(() => {});
    await page.getByTestId('filter-approved').click().catch(() => {});
    await page.waitForTimeout(1200);
    const errAfterFilter = await page.getByTestId('requests-error').count();
    say(`FILTER approved: ${errAfterFilter ? 'ERROR CARD' : 'ok'}`);

    await page.goto(`${APP}/payslips`);
    await page.getByTestId('payslips-page').waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const payslipRows = await page.getByTestId('payslip-row').count().catch(() => 0);
    say(`PAYSLIPS: history rows=${payslipRows}`);
  }
} catch (e) {
  say(`FATAL ${e.message}`);
  process.exitCode = 1;
}

say('--- API map (last screen) ---');
for (const line of api) say(line);
await browser.close();
