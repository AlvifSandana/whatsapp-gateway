import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { authFetch } from "../../lib/api";
import { toast } from "../../lib/toast";

type Campaign = {
    id: string;
    name: string;
    waAccountId?: string | null;
    payload?: { text?: string };
    scheduleAt?: string | null;
    targetFilter?: { tagIds?: string[] };
    status?: string;
};

type Props = {
    campaignId?: string;
};

const steps = ["Basics", "Audience", "Message", "Schedule", "Review"];

export default function CampaignWizard({ campaignId }: Props) {
    const [name, setName] = useState("");
    const [message, setMessage] = useState("");
    const [sender, setSender] = useState("");
    const [routingMode, setRoutingMode] = useState("AUTO");
    const [scheduleAt, setScheduleAt] = useState("");
    const [accounts, setAccounts] = useState<any[]>([]);
    const [tags, setTags] = useState<any[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [tagQuery, setTagQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [campaignStatus, setCampaignStatus] = useState<string | null>(null);

    useEffect(() => {
        authFetch("/wa-accounts").then((res) => res.json()).then((json) => setAccounts(json.data || []));
        authFetch("/tags").then((res) => res.json()).then((json) => setTags(json.data || []));
    }, []);

    useEffect(() => {
        if (!campaignId) return;
        const load = async () => {
            try {
                const res = await authFetch(`/campaigns/${campaignId}`);
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    const data = json.data as Campaign;
                    setName(data.name || "");
                    const text = (data.payload as any)?.text || "";
                    setMessage(text);
                    setSender(data.waAccountId || "");
                    setRoutingMode(data.waAccountId ? "MANUAL" : "AUTO");
                    setScheduleAt(data.scheduleAt ? data.scheduleAt.slice(0, 16) : "");
                    setSelectedTagIds((data.targetFilter as any)?.tagIds || []);
                    setCampaignStatus(data.status || null);
                }
            } catch (err) {
                console.error(err);
            }
        };
        load();
    }, [campaignId]);

    useEffect(() => {
        if (routingMode === "AUTO") {
            setSender("");
        }
    }, [routingMode]);

    const filteredTags = useMemo(() => {
        const query = tagQuery.trim().toLowerCase();
        if (!query) return tags;
        return tags.filter((tag) => tag.name.toLowerCase().includes(query));
    }, [tags, tagQuery]);

    const canNext = () => {
        if (stepIndex === 0) return name.trim().length > 0;
        if (stepIndex === 1) return selectedTagIds.length > 0;
        if (stepIndex === 2) return message.trim().length > 0;
        return true;
    };

    const handleSubmit = async () => {
        if (campaignId && campaignStatus && campaignStatus !== "DRAFT") {
            toast({ title: "Only draft campaigns can be edited", variant: "warning" });
            return;
        }
        setLoading(true);
        try {
            const payload = {
                name: name.trim(),
                waAccountId: routingMode === "MANUAL" ? sender || null : null,
                message: message.trim(),
                scheduleAt: scheduleAt ? new Date(scheduleAt).toISOString() : null,
                tagIds: selectedTagIds,
            };
            const res = await authFetch(campaignId ? `/campaigns/${campaignId}` : "/campaigns", {
                method: campaignId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                window.location.href = "/campaigns";
            } else {
                const json = await res.json().catch(() => ({}));
                toast({ title: json?.error || "Failed to save campaign", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to save campaign", variant: "error" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {steps.map((step, index) => (
                    <div key={step} className="flex items-center gap-2">
                        <div
                            className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                                index <= stepIndex ? "bg-emerald-600 text-white border-emerald-600" : "bg-muted"
                            }`}
                        >
                            {index + 1}
                        </div>
                        <span className={index === stepIndex ? "text-foreground font-medium" : ""}>{step}</span>
                    </div>
                ))}
            </div>

            {stepIndex === 0 && (
                <div className="space-y-4 max-w-lg">
                    <div>
                        <label className="text-sm font-medium">Campaign Name</label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Routing Mode</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={routingMode}
                            onChange={(e) => setRoutingMode(e.target.value)}
                        >
                            <option value="AUTO">Auto (least busy account)</option>
                            <option value="MANUAL">Manual (specific account)</option>
                        </select>
                    </div>
                    {routingMode === "MANUAL" && (
                        <div>
                            <label className="text-sm font-medium">Sender Account</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={sender}
                                onChange={(e) => setSender(e.target.value)}
                            >
                                <option value="">Select Account</option>
                                {accounts.map((account) => (
                                    <option key={account.id} value={account.id}>
                                        {account.phoneE164} ({account.label || "No Label"})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            )}

            {stepIndex === 1 && (
                <div className="space-y-4 max-w-lg">
                    <div>
                        <label className="text-sm font-medium">Target Tags</label>
                        <Input
                            placeholder="Search tags..."
                            value={tagQuery}
                            onChange={(e) => setTagQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <button
                            type="button"
                            className="rounded-md border px-2 py-1 text-muted-foreground hover:bg-muted/40"
                            onClick={() => setSelectedTagIds(tags.map((tag) => tag.id))}
                        >
                            Select all
                        </button>
                        <button
                            type="button"
                            className="rounded-md border px-2 py-1 text-muted-foreground hover:bg-muted/40"
                            onClick={() => setSelectedTagIds([])}
                        >
                            Clear all
                        </button>
                        <span className="text-muted-foreground">{selectedTagIds.length} selected</span>
                    </div>
                    <div className="max-h-44 overflow-auto rounded-md border p-2">
                        {filteredTags.map((tag) => (
                            <label key={tag.id} className="flex items-center gap-2 py-1 text-sm">
                                <input
                                    type="checkbox"
                                    checked={selectedTagIds.includes(tag.id)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedTagIds([...selectedTagIds, tag.id]);
                                        } else {
                                            setSelectedTagIds(selectedTagIds.filter((id) => id !== tag.id));
                                        }
                                    }}
                                />
                                <span>{tag.name}</span>
                                <span className="text-xs text-muted-foreground">({tag._count?.contacts || 0})</span>
                            </label>
                        ))}
                        {tags.length === 0 && (
                            <div className="text-xs text-muted-foreground">No tags found.</div>
                        )}
                    </div>
                </div>
            )}

            {stepIndex === 2 && (
                <div className="space-y-4 max-w-lg">
                    <div>
                        <label className="text-sm font-medium">Message</label>
                        <textarea
                            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            required
                        />
                    </div>
                </div>
            )}

            {stepIndex === 3 && (
                <div className="space-y-4 max-w-lg">
                    <div>
                        <label className="text-sm font-medium">Schedule (optional)</label>
                        <Input
                            type="datetime-local"
                            value={scheduleAt}
                            onChange={(e) => setScheduleAt(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            If set, the campaign will start automatically at the scheduled time.
                        </p>
                    </div>
                </div>
            )}

            {stepIndex === 4 && (
                <div className="rounded-md border p-4 max-w-xl space-y-2 text-sm">
                    <div className="font-medium">Review</div>
                    <div>Name: {name || "-"}</div>
                    <div>Routing: {routingMode === "MANUAL" ? "Manual" : "Auto"}</div>
                    <div>Sender: {sender || "Auto"}</div>
                    <div>Tags: {selectedTagIds.length} selected</div>
                    <div>Message: {message ? message.slice(0, 120) : "-"}</div>
                    <div>Schedule: {scheduleAt || "Immediate"}</div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStepIndex((prev) => Math.max(prev - 1, 0))}
                    disabled={stepIndex === 0}
                >
                    Back
                </Button>
                {stepIndex < steps.length - 1 ? (
                    <Button type="button" onClick={() => setStepIndex((prev) => prev + 1)} disabled={!canNext()}>
                        Next
                    </Button>
                ) : (
                    <Button type="button" onClick={handleSubmit} disabled={loading}>
                        {loading ? "Saving..." : campaignId ? "Update Campaign" : "Create Campaign"}
                    </Button>
                )}
            </div>
        </div>
    );
}
