import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";
import CampaignControls from "./CampaignControls";

type Campaign = {
    id: string;
    name: string;
    status: string;
};

type Props = {
    campaignId: string;
};

export default function CampaignHeader({ campaignId }: Props) {
    const [campaign, setCampaign] = useState<Campaign | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await authFetch(`/campaigns/${campaignId}`);
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    setCampaign(json.data || null);
                }
            } catch (err) {
                console.error(err);
            }
        };
        load();
    }, [campaignId]);

    return (
        <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">
                {campaign?.name || "Campaign"}
            </h1>
            {campaign?.status && (
                <p className="text-sm text-muted-foreground">Status: {campaign.status}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <CampaignControls
                    campaignId={campaignId}
                    status={campaign?.status}
                />
                {campaign?.status === "DRAFT" && (
                    <a
                        className="inline-flex items-center rounded-md border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                        href={`/campaigns/${campaignId}/edit`}
                    >
                        Edit Draft
                    </a>
                )}
            </div>
        </div>
    );
}
