import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";
import CampaignProgress from "./CampaignProgress";

type Campaign = {
    id: string;
    name: string;
    status: string;
    createdAt: string;
    _count?: { targets?: number };
};

export default function CampaignList() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await authFetch("/campaigns");
                const json = await res.json().catch(() => ({}));
                if (res.ok) setCampaigns(json.data || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    return (
        <div className="rounded-md border">
            <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm text-left">
                    <thead className="[&_tr]:border-b">
                        <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Name</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Targets</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Progress</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Created At</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {loading && (
                            <tr>
                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                    Loading campaigns...
                                </td>
                            </tr>
                        )}
                        {!loading && campaigns.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                    No campaigns found.
                                </td>
                            </tr>
                        )}
                        {campaigns.map((c) => (
                            <tr key={c.id} className="border-b transition-colors hover:bg-muted/50">
                                <td className="p-4 align-middle font-medium">{c.name}</td>
                                <td className="p-4 align-middle">
                                    <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                            c.status === "COMPLETED"
                                                ? "bg-green-100 text-green-800"
                                                : c.status === "PROCESSING"
                                                    ? "bg-blue-100 text-blue-800"
                                                    : "bg-gray-100 text-gray-800"
                                        }`}
                                    >
                                        {c.status}
                                    </span>
                                </td>
                                <td className="p-4 align-middle">{c._count?.targets || 0}</td>
                                <td className="p-4 align-middle">
                                    <CampaignProgress
                                        campaignId={c.id}
                                        total={c._count?.targets || 0}
                                    />
                                </td>
                                <td className="p-4 align-middle text-muted-foreground">
                                    {new Date(c.createdAt).toLocaleDateString()}
                                </td>
                                <td className="p-4 align-middle text-right">
                                    <a href={`/campaigns/${c.id}`} className="text-sm text-muted-foreground hover:underline">
                                        View
                                    </a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
