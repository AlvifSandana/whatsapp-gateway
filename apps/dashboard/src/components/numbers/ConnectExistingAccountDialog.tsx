import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../ui/dialog";
import { API_URL, authFetch } from "../../lib/api";
import QRCode from "react-qr-code";
import { Link2, RefreshCw } from "lucide-react";
import { toast } from "../../lib/toast";
import { getToken } from "../../lib/auth";

type Props = {
    accountId: string;
    phoneE164: string;
    label?: string | null;
    trigger?: React.ReactNode;
};

export default function ConnectExistingAccountDialog({ accountId, phoneE164, label, trigger }: Props) {
    const [open, setOpen] = useState(false);
    const [qr, setQr] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const startConnect = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await authFetch(`/wa-accounts/${accountId}/connect`, { method: "POST" });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                setError(json?.error || "Failed to start connection.");
                return;
            }
            // Try immediate QR fetch in case SSE is slow
            const qrRes = await authFetch(`/wa-accounts/${accountId}/qr`);
            if (qrRes.ok) {
                const qrJson = await qrRes.json();
                setQr(qrJson?.data?.qr || null);
            }
        } catch (err) {
            console.error(err);
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            setQr(null);
            startConnect();
        } else {
            setError(null);
            setLoading(false);
        }
    }, [open]);

    // SSE Listener
    useEffect(() => {
        if (!open) return;

        const token = getToken();
        const evtSource = new EventSource(
            token ? `${API_URL}/events?token=${encodeURIComponent(token)}` : `${API_URL}/events`
        );
        evtSource.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === "numbers.status" && payload.payload.waAccountId === accountId) {
                    const status = payload.payload.status;
                    if (status === "QR_READY") {
                        setQr(payload.payload.qr);
                    } else if (status === "CONNECTED") {
                        setOpen(false);
                        toast({
                            title: "Number connected",
                            description: label || phoneE164,
                            variant: "success",
                        });
                        setTimeout(() => {
                            window.location.reload();
                        }, 200);
                    }
                }
            } catch (e) {
                console.error("SSE Parse Error", e);
            }
        };

        return () => {
            evtSource.close();
        };
    }, [open, accountId]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700">
                        <Link2 className="h-4 w-4 mr-2" />
                        Connect
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Connect WhatsApp Account</DialogTitle>
                    <DialogDescription>
                        {phoneE164} {label ? `(${label})` : ""}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center p-4 gap-4">
                    {qr ? (
                        <div className="p-4 bg-background rounded-lg">
                            <p className="text-xs mb-2 text-center text-muted-foreground">Scan with WhatsApp</p>
                            <div className="bg-background p-4">
                                <QRCode value={qr} size={220} bgColor="#ffffff" fgColor="#000000" />
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-40 w-40 bg-muted rounded-md animate-pulse">
                            <p className="text-sm">{loading ? "Generating QR..." : "Waiting for QR..."}</p>
                        </div>
                    )}
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button
                        onClick={startConnect}
                        disabled={loading}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {loading ? "Working..." : "Retry Connect"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
