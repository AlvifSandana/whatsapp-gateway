import test from "node:test";
import assert from "node:assert/strict";
import { getRequiredPermission } from "./rbac";

test("rbac mapping enforces write for wa-accounts mutations", () => {
  assert.equal(getRequiredPermission("POST", "/v1/wa-accounts"), "wa_accounts:write");
  assert.equal(getRequiredPermission("PATCH", "/v1/wa-accounts/abc"), "wa_accounts:write");
  assert.equal(getRequiredPermission("GET", "/v1/wa-accounts"), "wa_accounts:read");
});

test("rbac mapping enforces campaign run permissions", () => {
  assert.equal(getRequiredPermission("POST", "/v1/campaigns/abc/start"), "campaigns:run");
  assert.equal(getRequiredPermission("POST", "/v1/campaigns/abc/pause"), "campaigns:pause");
  assert.equal(getRequiredPermission("POST", "/v1/campaigns/abc/cancel"), "campaigns:cancel");
});

test("rbac mapping enforces reports permissions", () => {
  assert.equal(getRequiredPermission("GET", "/v1/reports/exports"), "reports:read");
  assert.equal(getRequiredPermission("POST", "/v1/reports/exports"), "reports:export");
});
