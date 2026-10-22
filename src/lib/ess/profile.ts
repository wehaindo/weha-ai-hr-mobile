// Profile field policy + section mapping (BRD §4.2/§4.3).
// Mirrors docs/ESS-API-CONTRACT.md §2.2 — the single client-side source of
// truth for which fields an employee may edit.

import type { EssEmployee, EssProfilePatch } from '@/integration/ess/client';

export { EDITABLE_PROFILE_FIELDS } from '@/integration/ess/client';
export type { EssProfilePatch } from '@/integration/ess/client';

export interface ProfileForm {
  email: string;
  phone: string;
}

export interface ProfileFieldErrors {
  email?: string;
  phone?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validate the editable form; returns per-field error messages (empty = valid). */
export function validateProfileForm(form: ProfileForm): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  const email = form.email.trim();
  if (!email) {
    errors.email = 'Email is required';
  } else if (email.length > 254 || !EMAIL_RE.test(email)) {
    errors.email = 'Enter a valid email address';
  }

  const phone = form.phone.trim();
  if (phone.length > 32) {
    errors.phone = 'Phone number is too long (max 32 characters)';
  }
  return errors;
}

/**
 * Build the PATCH body: only allowlisted fields, only when actually changed.
 * Constructed explicitly (never spread from the form) so a future form field
 * cannot silently become an API field.
 */
export function buildProfilePatch(form: ProfileForm, current: EssEmployee): EssProfilePatch {
  const patch: EssProfilePatch = {};
  const email = form.email.trim();
  if (email !== (current.email ?? '')) patch.email = email;
  const phone = form.phone.trim();
  if (phone !== (current.phone ?? '')) patch.phone = phone;
  return patch;
}

export function profileFormFrom(employee: EssEmployee): ProfileForm {
  return {
    email: employee.email ?? '',
    phone: employee.phone ?? '',
  };
}

// ---------------------------------------------------------------------------
// Sectioned view model (BRD §4.2)
// ---------------------------------------------------------------------------

export interface ProfileSections {
  identity: { label: string; value: string }[];
  organization: { label: string; value: string }[];
  contact: { label: string; value: string }[];
}

function displayName(emp: EssEmployee): string {
  if (emp.name?.trim()) return emp.name.trim();
  return [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() || '—';
}

function managerName(emp: EssEmployee): string | null {
  if (!emp.manager) return null;
  const full = [emp.manager.firstName, emp.manager.lastName].filter(Boolean).join(' ').trim();
  return emp.manager.name?.trim() || full || emp.manager.id;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Map the API profile to BRD §4.2 sections (only fields that exist). */
export function toProfileSections(emp: EssEmployee): ProfileSections {
  return {
    identity: [
      { label: 'Full name', value: displayName(emp) },
      { label: 'Preferred name', value: emp.name?.trim() || '—' },
      { label: 'Employee number', value: emp.employeeNumber || '—' },
    ],
    organization: [
      { label: 'Company', value: emp.company?.name ?? emp.companyId ?? '—' },
      { label: 'Department', value: emp.department?.name ?? emp.departmentId ?? '—' },
      { label: 'Position', value: emp.position || '—' },
      { label: 'Manager', value: managerName(emp) ?? '—' },
      { label: 'Employment status', value: emp.status ?? '—' },
      { label: 'Hire date', value: formatDate(emp.hireDate) },
    ],
    contact: [
      { label: 'Personal email', value: emp.email || '—' },
      { label: 'Phone number', value: emp.phone || '—' },
    ],
  };
}
