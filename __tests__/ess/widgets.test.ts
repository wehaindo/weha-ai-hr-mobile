import { describe, expect, it } from 'vitest';
import { listEssWidgets } from '@/lib/ess/widgets/registry';
import { ESS_SERVICES, listEssServices } from '@/lib/ess/widgets/services';

describe('ESS widget registry', () => {
  it('returns enabled widgets in display order when authorized', () => {
    const widgets = listEssWidgets(['ess.use']);
    expect(widgets.map((w) => w.id)).toEqual([
      'employee-summary',
      'service-shortcuts',
      'announcements',
      'requests-summary',
      'payroll-summary',
    ]);
    const orders = widgets.map((w) => w.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('hides every widget from a session without the permission', () => {
    expect(listEssWidgets([])).toHaveLength(0);
    expect(listEssWidgets(['app.use'])).toHaveLength(0);
  });

  it('every widget definition is enabled or explicitly disabled (no undefined state)', () => {
    for (const w of listEssWidgets(['ess.use'])) {
      expect(typeof w.enabled).toBe('boolean');
      expect(w.title.length).toBeGreaterThan(0);
    }
  });
});

describe('ESS service shortcuts', () => {
  it('available services always carry a route; coming services never do', () => {
    for (const service of ESS_SERVICES) {
      if (service.status === 'available') {
        expect(service.href, service.id).toBeTruthy();
      } else {
        expect(service.href, service.id).toBeUndefined();
      }
    }
  });

  it('grants available services only with the required permission', () => {
    const authorized = listEssServices(['ess.use']);
    expect(authorized.filter((s) => s.status === 'available').length).toBeGreaterThanOrEqual(4);

    const anonymous = listEssServices([]);
    expect(anonymous.filter((s) => s.status === 'available')).toHaveLength(0);
  });

  it('links only to routes that exist in the app', () => {
    const knownRoutes = new Set(['/profile', '/attendance', '/leave', '/requests', '/payslips']);
    for (const service of ESS_SERVICES) {
      if (service.href) expect(knownRoutes.has(service.href)).toBe(true);
    }
  });
});
