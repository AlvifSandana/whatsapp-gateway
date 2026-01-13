import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { API_URL, authFetch } from "../../lib/api";
import QRCode from "react-qr-code";
import { toast } from "../../lib/toast";
import { getToken } from "../../lib/auth";

export default function ConnectAccountDialog() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<"INPUT" | "QR">("INPUT");
    const [phone, setPhone] = useState("");
    const [label, setLabel] = useState("");
    const [accountId, setAccountId] = useState<string | null>(null);
    const [qr, setQr] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        try {
            if (isSubmitting) return;
            const phoneTrimmed = phone.trim();
            if (!phoneTrimmed) return;
            setIsSubmitting(true);
            setError(null);

            const res = await authFetch("/wa-accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phoneE164: phoneTrimmed,
                    label: label.trim() || undefined,
                }),
            });
            let json: any = null;
            try {
                json = await res.json();
            } catch {
                json = null;
            }

            if (!res.ok) {
                setError(json?.error || "Failed to create account. Please try again.");
                return;
            }

            setAccountId(json.data.id);
            const connectRes = await authFetch(`/wa-accounts/${json.data.id}/connect`, { method: "POST" });
            if (!connectRes.ok) {
                setError("Failed to start WhatsApp connection. Please try again.");
                return;
            }
            setStep("QR");
        } catch (e) {
            console.error(e);
            setError("Network error. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // SSE Listener
    useEffect(() => {
        if (step === "QR" && accountId && open) {
            const token = getToken();
            const evtSource = new EventSource(
                token ? `${API_URL}/events?token=${encodeURIComponent(token)}` : `${API_URL}/events`
            );

            evtSource.onmessage = (event) => {
                try {
                    // event.data is the JSON string from Redis
                    // The API wraps it in "data" field of SSE if using default, but here we used writeSSE with data=message
                    const payload = JSON.parse(event.data);

                    if (payload.type === "numbers.status" && payload.payload.waAccountId === accountId) {
                        const status = payload.payload.status;
                        if (status === "QR_READY") {
                            setQr(payload.payload.qr);
                        } else if (status === "CONNECTED") {
                            setOpen(false);
                            toast({
                                title: "Number connected",
                                description: label.trim() || phone.trim() || "WhatsApp account",
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

            // Fallback polling (optional, for reliability if SSE fails)
            // const interval = setInterval(...) 

            return () => {
                evtSource.close();
            };
        }
    }, [step, accountId, open]);

    useEffect(() => {
        if (!open) {
            setStep("INPUT");
            setPhone("");
            setAccountId(null);
            setQr(null);
            setLabel("");
            setError(null);
            setIsSubmitting(false);
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>Connect New Number</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Connect WhatsApp Account</DialogTitle>
                    <DialogDescription>
                        Enter the phone number to identify this account.
                    </DialogDescription>
                </DialogHeader>

                {step === "INPUT" && (
                    <div className="grid gap-4 py-4">
                        <Input
                            placeholder="+1234567890"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                        <Input
                            placeholder="Label (optional)"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />
                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}
                    </div>
                )}

                {step === "QR" && (
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
                                <p className="text-sm">Generating QR...</p>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {step === "INPUT" && (
                        <Button onClick={handleCreate} disabled={!phone.trim() || isSubmitting}>
                            {isSubmitting ? "Working..." : "Next"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
