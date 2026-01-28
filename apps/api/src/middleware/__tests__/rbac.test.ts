import { describe, it, expect } from 'vitest';
import { getRequiredPermission } from '../rbac';

describe('RBAC Middleware', () => {
  it('enforces write for wa-accounts mutations', () => {
    expect(getRequiredPermission('POST', '/v1/wa-accounts')).toBe('wa_accounts:write');
    expect(getRequiredPermission('PATCH', '/v1/wa-accounts/abc')).toBe('wa_accounts:write');
    expect(getRequiredPermission('GET', '/v1/wa-accounts')).toBe('wa_accounts:read');
  });

  it('enforces campaign run permissions', () => {
    expect(getRequiredPermission('POST', '/v1/campaigns/abc/start')).toBe('campaigns:run');
    expect(getRequiredPermission('POST', '/v1/campaigns/abc/pause')).toBe('campaigns:pause');
    expect(getRequiredPermission('POST', '/v1/campaigns/abc/cancel')).toBe('campaigns:cancel');
  });

  it('enforces reports permissions', () => {
    expect(getRequiredPermission('GET', '/v1/reports/exports')).toBe('reports:read');
    expect(getRequiredPermission('POST', '/v1/reports/exports')).toBe('reports:export');
  });
});
