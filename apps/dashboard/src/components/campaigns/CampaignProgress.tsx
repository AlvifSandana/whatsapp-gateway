import { useEffect, useMemo, useState } from "react";
import { API_URL, authFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";

type Props = {
    campaignId: string;
    total: number;
};

type Progress = {
    total: number;
    byStatus: Record<string, number>;
};

export default function CampaignProgress({ campaignId, total }: Props) {
    const [progress, setProgress] = useState<Progress | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const res = await authFetch(`/campaigns/${campaignId}/progress`);
                if (!res.ok) {
                    setError("Failed");
                    return;
                }
                const json = await res.json();
                if (!active) return;
                setProgress(json?.data || null);
                setError(null);
            } catch {
                setError("Failed");
            }
        };
        load();
        const interval = setInterval(load, 5000);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [campaignId]);

    useEffect(() => {
        const token = getToken();
        const source = new EventSource(
            token ? `${API_URL}/events?token=${encodeURIComponent(token)}` : `${API_URL}/events`,
        );

        source.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload?.type !== "campaign.progress") return;
                if (payload?.payload?.campaignId !== campaignId) return;
                setProgress(payload.payload);
                setError(null);
            } catch (err) {
                console.error("SSE parse error", err);
            }
        };

        return () => {
            source.close();
        };
    }, [campaignId]);

    const data = useMemo(() => {
        const byStatus = progress?.byStatus || {};
        const totalCount = progress?.total ?? total;
        const sent = byStatus.SENT || 0;
        const delivered = byStatus.DELIVERED || 0;
        const read = byStatus.READ || 0;
        const failed = byStatus.FAILED || 0;
        const queued = byStatus.QUEUED || 0;
        const done = sent + delivered + read + failed;
        const pct = totalCount > 0 ? Math.min(100, Math.round((done / totalCount) * 100)) : 0;
        return { totalCount, sent, delivered, read, failed, queued, pct };
    }, [progress, total]);

    if (error) {
        return <span className="text-xs text-muted-foreground">-</span>;
    }

    return (
        <div className="min-w-[160px]">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${data.pct}%` }}
                />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
                {data.pct}% · {data.totalCount} total
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
                Q:{data.queued} S:{data.sent} D:{data.delivered} R:{data.read} F:{data.failed}
            </div>
        </div>
    );
}
