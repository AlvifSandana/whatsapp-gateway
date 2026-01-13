import test from "node:test";
import assert from "node:assert/strict";
import { canProcessExport } from "./export-worker";

test("export worker rejects unsupported types", () => {
  const allowed = canProcessExport({ type: "messages" }, ["reports:export"]);
  assert.equal(allowed, true);
});

test("export worker rejects unknown type", () => {
  const allowed = canProcessExport({ type: "unknown" }, ["reports:export"]);
  assert.equal(allowed, false);
});

test("export worker requires reports:export permission", () => {
  const allowed = canProcessExport({ type: "contacts" }, ["reports:read"]);
  assert.equal(allowed, false);
});

test("export worker allows contacts export with permission", () => {
  const allowed = canProcessExport({ type: "contacts" }, ["reports:export"]);
  assert.equal(allowed, true);
});
