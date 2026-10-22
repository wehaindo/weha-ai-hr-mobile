import { describe, expect, it } from 'vitest';
import {
  buildProfilePatch,
  profileFormFrom,
  toProfileSections,
  validateProfileForm,
} from '@/lib/ess/profile';
import { EDITABLE_PROFILE_FIELDS, type EssEmployee } from '@/integration/ess/client';

const EMPLOYEE: EssEmployee = {
  id: 'E1',
  employeeNumber: 'EMP-001',
  firstName: 'Alif',
  lastName: 'Rahman',
  name: null,
  email: 'alif@weha.example',
  phone: '+628111',
  status: 'ACTIVE',
  companyId: 'co-1',
  departmentId: 'dep-1',
  position: 'Cashier',
  hireDate: '2024-01-15',
  company: { id: 'co-1', name: 'WEHA Retail' },
  department: null,
};

describe('field policy', () => {
  it('exposes exactly the contract allowlist (email, phone)', () => {
    expect([...EDITABLE_PROFILE_FIELDS]).toEqual(['email', 'phone']);
  });

  it('validateProfileForm rejects bad email and oversized phone', () => {
    expect(validateProfileForm({ email: 'not-an-email', phone: '' }).email).toBeTruthy();
    expect(validateProfileForm({ email: '', phone: '' }).email).toBeTruthy();
    expect(validateProfileForm({ email: 'a@b.co', phone: 'x'.repeat(33) }).phone).toBeTruthy();
    expect(validateProfileForm({ email: ' a@b.co ', phone: ' 0811 ' })).toEqual({});
  });

  it('buildProfilePatch sends only changed allowlisted fields', () => {
    const current = profileFormFrom(EMPLOYEE);
    expect(buildProfilePatch(current, EMPLOYEE)).toEqual({});

    const patch = buildProfilePatch({ ...current, phone: '0899' }, EMPLOYEE);
    expect(patch).toEqual({ phone: '0899' });
    expect(Object.keys(patch).every((k) => (EDITABLE_PROFILE_FIELDS as readonly string[]).includes(k))).toBe(
      true
    );
  });
});

describe('toProfileSections', () => {
  it('falls back from preferred name to first + last name', () => {
    const sections = toProfileSections(EMPLOYEE);
    expect(sections.identity.find((r) => r.label === 'Full name')?.value).toBe('Alif Rahman');
    expect(sections.identity.find((r) => r.label === 'Preferred name')?.value).toBe('—');

    const withName = toProfileSections({ ...EMPLOYEE, name: 'Al' });
    expect(withName.identity.find((r) => r.label === 'Full name')?.value).toBe('Al');
  });

  it('shows relation names when loaded, ids as fallback, never invented values', () => {
    const sections = toProfileSections(EMPLOYEE);
    expect(sections.organization.find((r) => r.label === 'Company')?.value).toBe('WEHA Retail');
    expect(sections.organization.find((r) => r.label === 'Department')?.value).toBe('dep-1');
    expect(sections.organization.find((r) => r.label === 'Manager')?.value).toBe('—');
  });

  it('formats hire dates and guards invalid ones', () => {
    const ok = toProfileSections(EMPLOYEE).organization.find((r) => r.label === 'Hire date')?.value;
    expect(ok).not.toBe('—');
    expect(ok).toContain('2024');

    const bad = toProfileSections({ ...EMPLOYEE, hireDate: 'not-a-date' }).organization.find(
      (r) => r.label === 'Hire date'
    )?.value;
    expect(bad).toBe('—');
  });

  it('contact section exposes only editable fields', () => {
    const sections = toProfileSections(EMPLOYEE);
    expect(sections.contact.map((r) => r.label)).toEqual(['Personal email', 'Phone number']);
  });
});
