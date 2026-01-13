import { useEffect, useState } from "react";
import { API_URL, authFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { toast } from "../../lib/toast";
import { Button } from "../ui/button";

type ExportJob = {
    id: string;
    type: string;
    format: string;
    status: string;
    fileRef?: string | null;
    createdAt?: string;
};

type QueueMetrics = Record<string, number>;

export default function ExportCenter() {
    const [exportsList, setExportsList] = useState<ExportJob[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [exportType, setExportType] = useState("contacts");
    const [queueMetrics, setQueueMetrics] = useState<QueueMetrics | null>(null);

    const loadExports = async () => {
        setLoading(true);
        try {
            const res = await authFetch("/reports/exports");
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                setExportsList(json.data || []);
            } else {
                setExportsList([]);
            }
        } catch (err) {
            console.error(err);
            setExportsList([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadExports();
    }, []);

    useEffect(() => {
        const needsPolling = exportsList.some((job) => job.status === "PENDING" || job.status === "PROCESSING");
        if (!needsPolling) return;
        const id = window.setInterval(() => {
            loadExports();
        }, 5000);
        return () => window.clearInterval(id);
    }, [exportsList]);

    useEffect(() => {
        const token = getToken();
        const source = new EventSource(
            token ? `${API_URL}/events?token=${encodeURIComponent(token)}` : `${API_URL}/events`,
        );
        source.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload?.type === "export.status") {
                    const update = payload.payload;
                    setExportsList((prev) =>
                        prev.map((job) =>
                            job.id === update.exportId
                                ? { ...job, status: update.status }
                                : job,
                        ),
                    );
                }
                if (payload?.type === "queue.metrics") {
                    setQueueMetrics(payload.payload || null);
                }
            } catch (err) {
                console.error("SSE parse error", err);
            }
        };
        return () => {
            source.close();
        };
    }, []);

    const handleCreate = async () => {
        setCreating(true);
        try {
            const res = await authFetch("/reports/exports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: exportType, format: "csv" }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                toast({ title: "Export created", variant: "success" });
                setExportsList((prev) => [json.data, ...prev]);
            } else {
                toast({ title: json?.error || "Failed to create export", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to create export", variant: "error" });
        } finally {
            setCreating(false);
        }
    };

    const handleDownload = async (job: ExportJob) => {
        try {
            const res = await authFetch(`/reports/exports/${job.id}/download`);
            if (!res.ok) {
                toast({ title: "Export not ready", variant: "warning" });
                return;
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = job.fileRef || `${job.type}-export.${job.format}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to download export", variant: "error" });
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
                    <p className="text-sm text-muted-foreground">Generate and download exports.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        className="h-9 rounded-md border bg-background px-3 text-sm"
                        value={exportType}
                        onChange={(event) => setExportType(event.target.value)}
                    >
                        <option value="contacts">Contacts CSV</option>
                        <option value="messages">Messages CSV</option>
                    </select>
                    <Button className="bg-foreground text-background hover:bg-foreground/90" onClick={handleCreate} disabled={creating}>
                        {creating ? "Exporting..." : "Create Export"}
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border bg-background">
                <div className="border-b px-4 py-3 text-sm font-medium text-muted-foreground">Export Jobs</div>
                <div className="divide-y">
                    {loading ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground">Loading exports...</div>
                    ) : exportsList.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground">No exports created yet.</div>
                    ) : (
                        exportsList.map((job) => (
                            <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                <div>
                                    <div className="text-sm font-medium">{job.type}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {job.status} · {job.format.toUpperCase()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={loadExports}>
                                        Refresh
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="bg-foreground text-background hover:bg-foreground/90"
                                        onClick={() => handleDownload(job)}
                                        disabled={job.status !== "DONE"}
                                    >
                                        Download
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="rounded-xl border bg-background">
                <div className="border-b px-4 py-3 text-sm font-medium text-muted-foreground">Queue Metrics</div>
                <div className="px-4 py-3 text-xs text-muted-foreground">
                    {queueMetrics ? (
                        <div className="space-y-1">
                            <div>
                                Campaign Plan: {queueMetrics["q:campaign:plan"] ?? 0} (active{" "}
                                {queueMetrics["q:campaign:plan:active"] ?? 0}, failed{" "}
                                {queueMetrics["q:campaign:plan:failed"] ?? 0})
                            </div>
                            <div>
                                Campaign Send: {queueMetrics["q:campaign:send"] ?? 0} (active{" "}
                                {queueMetrics["q:campaign:send:active"] ?? 0}, failed{" "}
                                {queueMetrics["q:campaign:send:failed"] ?? 0})
                            </div>
                            <div>
                                Message Send: {queueMetrics["q:message:send"] ?? 0} (active{" "}
                                {queueMetrics["q:message:send:active"] ?? 0}, failed{" "}
                                {queueMetrics["q:message:send:failed"] ?? 0})
                            </div>
                            <div>
                                Import Validate: {queueMetrics["q:contacts:import:validate"] ?? 0} (active{" "}
                                {queueMetrics["q:contacts:import:validate:active"] ?? 0}, failed{" "}
                                {queueMetrics["q:contacts:import:validate:failed"] ?? 0})
                            </div>
                            <div>
                                Import Commit: {queueMetrics["q:contacts:import:commit"] ?? 0} (active{" "}
                                {queueMetrics["q:contacts:import:commit:active"] ?? 0}, failed{" "}
                                {queueMetrics["q:contacts:import:commit:failed"] ?? 0})
                            </div>
                            <div>
                                Export Jobs: {queueMetrics["q:reports:export"] ?? 0} (active{" "}
                                {queueMetrics["q:reports:export:active"] ?? 0}, failed{" "}
                                {queueMetrics["q:reports:export:failed"] ?? 0})
                            </div>
                        </div>
                    ) : (
                        <span>-</span>
                    )}
                </div>
            </div>
        </div>
    );
}
