import type { Context, Next } from "hono";
import { getUserPermissionCodes } from "@repo/shared";

export const getRequiredPermission = (method: string, path: string) => {
  const is = (pattern: RegExp) => pattern.test(path);

  if (path.startsWith("/v1/auth")) return null;
  if (path.startsWith("/v1/events")) return null;
  if (path.startsWith("/health")) return null;

  if (is(/^\/v1\/rbac(\/|$)/)) return "rbac:manage";
  if (is(/^\/v1\/team(\/|$)/)) return "rbac:manage";

  if (is(/^\/v1\/workspace(\/|$)/)) {
    if (method === "GET") {
      if (is(/^\/v1\/workspace\/list$/)) return "rbac:manage";
      return null;
    }
    return "rbac:manage";
  }

  if (is(/^\/v1\/wa-accounts\/[^/]+\/connect$/) && method === "POST") return "wa_accounts:connect";
  if (is(/^\/v1\/wa-accounts\/[^/]+\/reconnect$/) && method === "POST") return "wa_accounts:reconnect";
  if (is(/^\/v1\/wa-accounts\/[^/]+\/reset-creds$/) && method === "POST") return "wa_accounts:reset_creds";
  if (is(/^\/v1\/wa-accounts\/[^/]+\/qr$/) && method === "GET") return "wa_accounts:read";
  if (is(/^\/v1\/wa-accounts(\/|$)/)) {
    if (method === "GET") return "wa_accounts:read";
    return "wa_accounts:write";
  }

  if (is(/^\/v1\/campaigns\/[^/]+\/start$/) && method === "POST") return "campaigns:run";
  if (is(/^\/v1\/campaigns\/[^/]+\/pause$/) && method === "POST") return "campaigns:pause";
  if (is(/^\/v1\/campaigns\/[^/]+\/cancel$/) && method === "POST") return "campaigns:cancel";
  if (is(/^\/v1\/campaigns(\/|$)/)) {
    if (method === "GET") return "campaigns:read";
    return "campaigns:write";
  }

  if (is(/^\/v1\/auto-replies\/[^/]+\/test$/) && method === "POST") return "auto_reply:test";
  if (is(/^\/v1\/auto-replies(\/|$)/)) {
    if (method === "GET") return "auto_reply:read";
    return "auto_reply:write";
  }

  if (is(/^\/v1\/contacts\/import(\/|$)/)) return "contacts:import";
  if (is(/^\/v1\/contacts\/export$/) && method === "POST") return "reports:export";
  if (is(/^\/v1\/contacts\/[^/]+\/messages$/) && method === "GET") return "contacts:read";
  if (is(/^\/v1\/contacts(\/|$)/)) {
    if (method === "GET") return "contacts:read";
    return "contacts:write";
  }

  if (is(/^\/v1\/tags(\/|$)/)) {
    if (method === "GET") return "contacts:read";
    return "contacts:write";
  }

  if (is(/^\/v1\/messages\/threads(\/|$)/) && method === "GET") return "contacts:read";
  if (is(/^\/v1\/messages\/send$/) && method === "POST") return "contacts:write";
  if (is(/^\/v1\/messages(\/|$)/)) return "contacts:write";

  if (is(/^\/v1\/audit(\/|$)/)) return "audit:read";

  if (is(/^\/v1\/reports\/exports(\/|$)/)) {
    if (method === "GET") return "reports:read";
    return "reports:export";
  }

  if (is(/^\/v1\/queues\/dlq(\/|$)/)) return "reports:read";
  if (is(/^\/v1\/analytics(\/|$)/)) return "reports:read";
  if (is(/^\/v1\/metrics(\/|$)/)) return "audit:read";


  return null;
};

export const rbacMiddleware = async (c: Context, next: Next) => {
  const auth = c.get("auth") as any;
  const path = c.req.path;
  if (!auth && path.startsWith("/v1/reports/exports/") && path.endsWith("/download") && c.req.query("token")) {
    return next();
  }
  const required = getRequiredPermission(c.req.method, path);
  if (!required) return next();

  const permissions = await getUserPermissionCodes(auth.userId, auth.workspaceId);
  c.set("permissions", permissions);

  if (!permissions.includes(required)) {
    return c.json({ error: "Forbidden", requiredPermission: required }, 403);
  }

  return next();
};
