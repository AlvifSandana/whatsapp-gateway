import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { authFetch } from "../../lib/api";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeJson?: any;
  afterJson?: any;
  metaJson?: any;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
  };
};

type AuditLogViewerProps = {
  initialData: AuditLog[];
};

export default function AuditLogViewer({ initialData }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const [filters, setFilters] = useState({
    from: "",
    to: "",
    action: "",
    entityType: "",
  });

  const quickFilters = [
    { label: "RBAC Denied", action: "rbac.command_denied" },
    { label: "Export Denied", action: "reports.export.denied" },
    { label: "Export Completed", action: "reports.export.completed" },
  ];

  const loadMore = async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cursor: nextCursor,
        limit: "50",
      });

      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });

      const res = await authFetch(`/audit?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setLogs((prev) => [...prev, ...json.data]);
        setNextCursor(json.nextCursor || null);
      }
    } catch (e) {
      console.error("Failed to load more audit logs", e);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "50",
      });

      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });

      const res = await authFetch(`/audit?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setLogs(json.data || []);
        setNextCursor(json.nextCursor || null);
      }
    } catch (e) {
      console.error("Failed to filter audit logs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialData.length === 0) {
      handleFilter();
    }
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getActionColor = (action: string) => {
    if (action.includes("create") || action.includes("import"))
      return "bg-green-100 text-green-800";
    if (action.includes("update")) return "bg-blue-100 text-blue-800";
    if (action.includes("delete") || action.includes("disconnect"))
      return "bg-red-100 text-red-800";
    if (action.includes("start") || action.includes("connect"))
      return "bg-blue-100 text-blue-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium">From Date</label>
            <Input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium">To Date</label>
            <Input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Action</label>
            <Input
              placeholder="e.g., wa_account.create"
              value={filters.action}
              onChange={(e) =>
                setFilters({ ...filters, action: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium">Entity Type</label>
            <Input
              placeholder="e.g., Campaign"
              value={filters.entityType}
              onChange={(e) =>
                setFilters({ ...filters, entityType: e.target.value })
              }
            />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={handleFilter} disabled={loading}>
            {loading ? "Filtering..." : "Apply Filters"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setFilters({ from: "", to: "", action: "", entityType: "" });
              setLogs(initialData);
            }}
          >
            Clear
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {quickFilters.map((filter) => (
            <Button
              key={filter.action}
              size="sm"
              variant="outline"
              onClick={() => {
                setFilters((prev) => ({ ...prev, action: filter.action }));
                setNextCursor(null);
                setLogs([]);
                setTimeout(() => handleFilter(), 0);
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-md border">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm text-left">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50">
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Date
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Actor
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Action
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Entity
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {logs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-6 text-center text-muted-foreground"
                  >
                    No audit logs found.
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b transition-colors hover:bg-muted/50"
                >
                  <td className="p-4 align-middle text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="p-4 align-middle">
                    {log.actor ? (
                      <div>
                        <div className="font-medium">{log.actor.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {log.actor.email}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-4 align-middle">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getActionColor(
                        log.action,
                      )}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="p-4 align-middle">
                    <div>
                      <div className="font-medium">{log.entityType}</div>
                      {log.entityId && (
                        <div className="text-xs text-muted-foreground">
                          {log.entityId}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4 align-middle text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedLog(log)}
                    >
                      View Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {nextCursor && (
        <div className="flex justify-center">
          <Button onClick={loadMore} disabled={loading}>
            {loading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-auto p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold">Audit Log Details</h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">ID</label>
                <p className="text-sm text-muted-foreground">
                  {selectedLog.id}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Date</label>
                <p className="text-sm text-muted-foreground">
                  {formatDate(selectedLog.createdAt)}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Action</label>
                <p className="text-sm">{selectedLog.action}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Entity Type</label>
                <p className="text-sm">{selectedLog.entityType}</p>
              </div>
              {selectedLog.entityId && (
                <div>
                  <label className="text-sm font-medium">Entity ID</label>
                  <p className="text-sm text-muted-foreground">
                    {selectedLog.entityId}
                  </p>
                </div>
              )}
              {selectedLog.actor && (
                <div>
                  <label className="text-sm font-medium">Actor</label>
                  <p className="text-sm">
                    {selectedLog.actor.name} ({selectedLog.actor.email})
                  </p>
                </div>
              )}
              {selectedLog.beforeJson && (
                <div>
                  <label className="text-sm font-medium">Before</label>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.beforeJson, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.afterJson && (
                <div>
                  <label className="text-sm font-medium">After</label>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.afterJson, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.metaJson && (
                <div>
                  <label className="text-sm font-medium">Metadata</label>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.metaJson, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
