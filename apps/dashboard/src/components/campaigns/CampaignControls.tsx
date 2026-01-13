import { useState } from "react";
import { Button } from "../ui/button";
import { AlertDialog } from "../ui/alert-dialog";
import { authFetch } from "../../lib/api";
import { toast } from "../../lib/toast";

type Props = {
    campaignId: string;
    status?: string | null;
};

export default function CampaignControls({ campaignId, status }: Props) {
    const [loading, setLoading] = useState(false);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);

    const send = async (path: string) => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await authFetch(`/campaigns/${campaignId}/${path}`, { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAlertMessage(json?.error || "Action failed.");
                return;
            }
            const actionLabel = path === "start" ? "Campaign started" : path === "pause" ? "Campaign paused" : "Campaign canceled";
            toast({ title: actionLabel, variant: "success" });
            await new Promise((resolve) => setTimeout(resolve, 200));
            window.location.reload();
        } catch (err) {
            console.error(err);
            setAlertMessage("Network error.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                {(status === "DRAFT" || status === "PAUSED" || status === "SCHEDULED") && (
                    <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={loading}
                        onClick={() => send("start")}
                    >
                        Start
                    </Button>
                )}
                {status === "PROCESSING" && (
                    <Button
                        size="sm"
                        className="bg-amber-600 text-white hover:bg-amber-700"
                        disabled={loading}
                        onClick={() => send("pause")}
                    >
                        Pause
                    </Button>
                )}
                {status && status !== "COMPLETED" && status !== "CANCELED" && (
                    <Button
                        size="sm"
                        className="bg-red-600 text-white hover:bg-red-700"
                        disabled={loading}
                        onClick={() => send("cancel")}
                    >
                        Cancel
                    </Button>
                )}
            </div>
            <AlertDialog
                open={!!alertMessage}
                onOpenChange={(open) => {
                    if (!open) setAlertMessage(null);
                }}
                title="Campaign Action"
                description={alertMessage || ""}
            />
        </>
    );
}
