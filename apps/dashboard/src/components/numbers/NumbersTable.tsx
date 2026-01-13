import { useEffect, useMemo, useState } from "react";
import AccountActions from "./AccountActions";
import { API_URL, authFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { toast } from "../../lib/toast";

type Account = {
    id: string;
    phoneE164: string;
    status: string;
    label?: string | null;
    lastSeenAt?: string | null;
    metrics?: {
        sent: number;
        failed: number;
        incoming: number;
        sent1h?: number;
        failed1h?: number;
        incoming1h?: number;
    };
};

type Props = {
    accounts: Account[];
};

export default function NumbersTable({ accounts }: Props) {
    const [data, setData] = useState<Account[]>(accounts || []);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("all");
    const [labelFilter, setLabelFilter] = useState("all");
    const [lastSeenFilter, setLastSeenFilter] = useState("all");
    const [ackFilter, setAckFilter] = useState("all");
    const [acks, setAcks] = useState<Record<string, { type: string; status: string; reason?: string; timestamp?: string }>>({});

    useEffect(() => {
        if (accounts && accounts.length > 0) return;
        const fetchAccounts = async () => {
            setLoading(true);
            try {
            const res = await authFetch("/wa-accounts?includeMetrics=true");
            const json = await res.json().catch(() => ({}));
            if (res.ok) setData(json.data || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchAccounts();
    }, [accounts]);

    useEffect(() => {
        if (accounts && accounts.length > 0) {
            setData(accounts);
        }
    }, [accounts]);

    useEffect(() => {
        const token = getToken();
        const source = new EventSource(
            token ? `${API_URL}/events?token=${encodeURIComponent(token)}` : `${API_URL}/events`,
        );
        source.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload?.type !== "ack") return;
                const ack = payload.payload;
                if (!ack?.waAccountId) return;
                const account = data.find((item) => item.id === ack.waAccountId);
                const accountLabel = account?.label || account?.phoneE164 || ack.waAccountId;
                setAcks((prev) => ({
                    ...prev,
                    [ack.waAccountId]: {
                        type: ack.type,
                        status: ack.status,
                        reason: ack.reason,
                        timestamp: payload.timestamp,
                    },
                }));
                if (ack.status && ack.status !== "ok") {
                    toast({
                        title: `Command ${ack.status}`,
                        description: ack.reason || `${ack.type} · ${accountLabel}`,
                        variant: ack.status === "rejected" ? "warning" : "error",
                    });
                } else if (ack.status === "ok") {
                    toast({
                        title: "Command accepted",
                        description: `${ack.type} · ${accountLabel}`,
                        variant: "success",
                    });
                }
            } catch (err) {
                console.error("SSE parse error", err);
            }
        };
        return () => {
            source.close();
        };
    }, []);

    const labelOptions = useMemo(() => {
        const labels = new Set<string>();
        data.forEach((acc) => {
            if (acc.label && acc.label.trim().length > 0) {
                labels.add(acc.label.trim());
            }
        });
        return Array.from(labels).sort((a, b) => a.localeCompare(b));
    }, [data]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return data.filter((acc) => {
            if (status !== "all" && acc.status !== status) return false;
            if (labelFilter !== "all" && (acc.label || "").trim() !== labelFilter) return false;
            if (lastSeenFilter !== "all") {
                if (lastSeenFilter === "never") return !acc.lastSeenAt;
                if (!acc.lastSeenAt) return false;
                const lastSeen = new Date(acc.lastSeenAt).getTime();
                const now = Date.now();
                if (lastSeenFilter === "24h" && now - lastSeen > 24 * 60 * 60 * 1000) return false;
                if (lastSeenFilter === "7d" && now - lastSeen > 7 * 24 * 60 * 60 * 1000) return false;
            }
            if (ackFilter !== "all") {
                const ackStatus = acks[acc.id]?.status;
                if (ackFilter === "none") return !ackStatus;
                if (!ackStatus || ackStatus !== ackFilter) return false;
            }
            if (!q) return true;
            return (
                acc.phoneE164.toLowerCase().includes(q) ||
                (acc.label || "").toLowerCase().includes(q)
            );
        });
    }, [data, query, status, labelFilter, lastSeenFilter, ackFilter, acks]);

    return (
        <div className="rounded-md border">
            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium">Numbers</div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                        className="flex h-9 w-full min-w-[220px] rounded-md border border-input bg-background px-3 py-1 text-sm"
                        placeholder="Search phone or label..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                        className="flex h-9 min-w-[160px] rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                    >
                        <option value="all">All Status</option>
                        <option value="CONNECTED">Connected</option>
                        <option value="DISCONNECTED">Disconnected</option>
                        <option value="QR_READY">QR Ready</option>
                    </select>
                    <select
                        className="flex h-9 min-w-[160px] rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={labelFilter}
                        onChange={(e) => setLabelFilter(e.target.value)}
                    >
                        <option value="all">All Labels</option>
                        {labelOptions.map((label) => (
                            <option key={label} value={label}>
                                {label}
                            </option>
                        ))}
                    </select>
                    <select
                        className="flex h-9 min-w-[160px] rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={lastSeenFilter}
                        onChange={(e) => setLastSeenFilter(e.target.value)}
                    >
                        <option value="all">All Last Seen</option>
                        <option value="24h">Seen in 24h</option>
                        <option value="7d">Seen in 7d</option>
                        <option value="never">Never Seen</option>
                    </select>
                    <select
                        className="flex h-9 min-w-[160px] rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={ackFilter}
                        onChange={(e) => setAckFilter(e.target.value)}
                    >
                        <option value="all">All Commands</option>
                        <option value="none">No Ack</option>
                        <option value="ok">ACK OK</option>
                        <option value="rejected">ACK Rejected</option>
                        <option value="failed">ACK Failed</option>
                        <option value="error">ACK Error</option>
                    </select>
                </div>
            </div>
            <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm text-left">
                    <thead className="[&_tr]:border-b">
                        <tr className="border-b transition-colors hover:bg-muted/50">
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Phone</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Last Seen</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Last Command</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Metrics</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {loading && (
                            <tr>
                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                    Loading accounts...
                                </td>
                            </tr>
                        )}
                        {!loading && filtered.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                    No accounts found.
                                </td>
                            </tr>
                        )}
                        {filtered.map((acc) => (
                            <tr key={acc.id} className="border-b transition-colors hover:bg-muted/50">
                                <td className="p-4 align-middle font-medium">
                                    {acc.phoneE164}
                                    {acc.label && (
                                        <div className="text-xs text-muted-foreground">{acc.label}</div>
                                    )}
                                </td>
                                <td className="p-4 align-middle">
                                    <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                                            acc.status === "CONNECTED"
                                                ? "bg-green-100 text-green-800"
                                                : acc.status === "DISCONNECTED"
                                                  ? "bg-red-100 text-red-800"
                                                  : "bg-yellow-100 text-yellow-800"
                                        }`}
                                    >
                                        {acc.status}
                                    </span>
                                </td>
                                <td className="p-4 align-middle text-muted-foreground">
                                    {acc.lastSeenAt ? new Date(acc.lastSeenAt).toLocaleString() : "-"}
                                </td>
                                <td className="p-4 align-middle text-xs text-muted-foreground">
                                    {acks[acc.id] ? (
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-medium text-foreground">{acks[acc.id].type}</span>
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                        acks[acc.id].status === "ok"
                                                            ? "bg-green-100 text-green-800"
                                                            : acks[acc.id].status === "rejected"
                                                              ? "bg-amber-100 text-amber-800"
                                                              : "bg-red-100 text-red-800"
                                                    }`}
                                                >
                                                    {acks[acc.id].status}
                                                </span>
                                            </div>
                                            {acks[acc.id].reason && (
                                                <div className="text-[10px] text-muted-foreground">
                                                    {acks[acc.id].reason}
                                                </div>
                                            )}
                                            {acks[acc.id].timestamp && (
                                                <div className="text-[10px] text-muted-foreground">
                                                    {new Date(acks[acc.id].timestamp as string).toLocaleString()}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        "-"
                                    )}
                                </td>
                                <td className="p-4 align-middle text-xs text-muted-foreground">
                                    <div>
                                        In: {acc.metrics?.incoming ?? 0}{" "}
                                        <span className="text-[10px] text-muted-foreground/80">
                                            (1h {acc.metrics?.incoming1h ?? 0})
                                        </span>
                                    </div>
                                    <div>
                                        Out: {acc.metrics?.sent ?? 0}{" "}
                                        <span className="text-[10px] text-muted-foreground/80">
                                            (1h {acc.metrics?.sent1h ?? 0})
                                        </span>
                                    </div>
                                    <div>
                                        Fail: {acc.metrics?.failed ?? 0}{" "}
                                        <span className="text-[10px] text-muted-foreground/80">
                                            (1h {acc.metrics?.failed1h ?? 0})
                                        </span>
                                    </div>
                                </td>
                                <td className="p-4 align-middle text-right">
                                    <AccountActions
                                        id={acc.id}
                                        status={acc.status}
                                        phoneE164={acc.phoneE164}
                                        label={acc.label}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
