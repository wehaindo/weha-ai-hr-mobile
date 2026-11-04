import { expect, test } from '@playwright/test';
import { loginAsAdmin, resetAppState } from './helpers/test-utils';
import { loginWithMobile, mockEssApi } from './helpers/ess-mock';
import { mockPerformanceApi } from './helpers/performance-mock';

async function openPerformance(page: import('@playwright/test').Page) {
  await resetAppState(page);
  await mockEssApi(page);
  const calls = await mockPerformanceApi(page);
  await loginWithMobile(page);
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30000 });
  await page.goto('/performance');
  await expect(page.getByTestId('performance-page')).toBeVisible();
  return calls;
}

test.describe('ESS performance reviews', () => {
  test('renders the published summary, the trend and my reviews', async ({ page }) => {
    await openPerformance(page);

    await expect(page.getByTestId('performance-summary')).toBeVisible();
    await expect(page.getByTestId('performance-overall-score')).toHaveText('82.40');
    await expect(page.getByTestId('performance-rating')).toHaveText('Exceeds expectations');
    await expect(page.getByTestId('performance-strengths')).toContainText('Reliable shift coverage');
    await expect(page.getByTestId('performance-recommendations')).toContainText('Advanced retail training');
    await expect(page.getByTestId('performance-manager-comments')).toContainText('Consistent performer');

    await expect(page.getByTestId('trend-list').getByTestId('trend-score').first()).toHaveText('82.40');
    await expect(page.getByTestId('trend-delta')).toHaveText('+3.90');
    await expect(page.getByTestId('trend-not-comparable')).toHaveText('not comparable');

    await expect(page.getByTestId('review-row')).toHaveCount(2);
    await expect(page.getByTestId('reviews-list').getByTestId('review-state').first()).toHaveText('Self-assessment open');
    await expect(page.getByTestId('review-action-label').first()).toContainText('Fill self-assessment');
    await expect(page.getByTestId('reviews-list')).toContainText('Review & acknowledge');
  });

  test('submits the self-assessment with the allowlisted body', async ({ page }) => {
    const calls = await openPerformance(page);

    await page.getByTestId('review-row').first().click();
    await expect(page.getByTestId('review-detail')).toBeVisible();
    await expect(page.getByTestId('self-assessment-form')).toBeVisible();
    await expect(page.getByTestId('criterion-row')).toHaveCount(3);

    // attendance has score labels (select); customer is a number input.
    await page
      .locator('[data-testid="criterion-row"][data-key="attendance"] [data-testid="criterion-score"]')
      .selectOption('4');
    await page
      .locator('[data-testid="criterion-row"][data-key="customer"] [data-testid="criterion-score"]')
      .fill('4');
    await page
      .locator('[data-testid="criterion-row"][data-key="notes"] [data-testid="criterion-comment"]')
      .fill('Covered two weekend shifts solo.');
    await page.getByTestId('self-assessment-comments').fill('Good cycle overall.');
    await page.getByTestId('self-assessment-submit').click();

    await expect(page.getByTestId('review-detail-state')).toHaveText('Manager review');
    expect(calls.assessments).toHaveLength(1);
    const body = calls.assessments[0].body;
    expect(calls.assessments[0].url).toBe('/talent/reviews/rev-self/self-assessment');
    expect(body.comments).toBe('Good cycle overall.');
    const responses = body.responses as Array<Record<string, unknown>>;
    expect(responses).toHaveLength(3);
    expect(responses[0]).toMatchObject({ criterionKey: 'attendance', score: 4, notApplicable: false });
    expect(responses[2]).toMatchObject({ criterionKey: 'notes', score: null });
    expect(responses[2].comment).toBe('Covered two weekend shifts solo.');
    for (const forbidden of ['employeeId', 'status', 'assignmentId', 'reviewId']) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  test('acknowledges a finalized review and publishes the result', async ({ page }) => {
    const calls = await openPerformance(page);

    await page.getByTestId('review-row').nth(1).click();
    await expect(page.getByTestId('review-detail')).toBeVisible();
    await expect(page.getByTestId('acknowledge-panel')).toBeVisible();
    await expect(page.getByTestId('review-detail-state')).toHaveText('Result ready');
    await page.getByTestId('acknowledge-review').click();

    await expect(page.getByTestId('review-detail-state')).toHaveText('Acknowledged');
    // The panel is replaced by the completion note once the state flips.
    await expect(page.getByTestId('review-status-note')).toContainText('published');
    expect(calls.acks).toEqual(['rev-final']);
  });

  test('requiring a score blocks submission until every mandatory criterion is rated', async ({ page }) => {
    await openPerformance(page);
    await page.getByTestId('review-row').first().click();
    await expect(page.getByTestId('review-detail')).toBeVisible();
    await expect(page.getByTestId('self-assessment-form')).toBeVisible();

    await page.getByTestId('self-assessment-submit').click();
    await expect(page.getByTestId('self-assessment-error')).toContainText('a score is required');
  });

  test('local device accounts get the no-session state without talent API calls', async ({ page }) => {
    await resetAppState(page);
    await mockEssApi(page);
    const calls = await mockPerformanceApi(page);
    await loginAsAdmin(page);
    await page.goto('/performance');

    await expect(page.getByTestId('performance-no-session')).toBeVisible();
    expect(calls.lists).toBe(0);
    expect(calls.assessments).toHaveLength(0);
    expect(calls.acks).toHaveLength(0);
  });
});
