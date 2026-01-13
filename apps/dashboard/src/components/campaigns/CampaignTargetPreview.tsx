import { useState } from "react";
import { Button } from "../ui/button";
import { authFetch } from "../../lib/api";

type Props = {
    campaignId: string;
};

type Preview = {
    total: number;
    sample: { id: string; phoneE164: string; displayName?: string | null }[];
};

export default function CampaignTargetPreview({ campaignId }: Props) {
    const [preview, setPreview] = useState<Preview | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadPreview = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await authFetch(`/campaigns/${campaignId}/preview-targets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(json?.error || "Failed to preview targets.");
                return;
            }
            setPreview(json?.data || null);
        } catch (err) {
            console.error(err);
            setError("Network error.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-md border p-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-medium">Target Preview</div>
                    <div className="text-xs text-muted-foreground">
                        Lihat jumlah target berdasarkan tagId campaign.
                    </div>
                </div>
                <Button size="sm" variant="ghost" onClick={loadPreview} disabled={loading}>
                    {loading ? "Loading..." : "Preview"}
                </Button>
            </div>

            {error && <p className="text-sm text-destructive mt-3">{error}</p>}

            {preview && (
                <div className="mt-3 text-sm">
                    <div className="text-muted-foreground">
                        Total targets: <span className="text-foreground font-medium">{preview.total}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Sample:</div>
                    <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {preview.sample.length === 0 && <div>-</div>}
                        {preview.sample.map((item) => (
                            <div key={item.id}>
                                {item.phoneE164} {item.displayName ? `(${item.displayName})` : ""}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
