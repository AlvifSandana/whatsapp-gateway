import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { authFetch } from "../../lib/api";

export default function CreateCampaignForm() {
    const [name, setName] = useState("");
    const [message, setMessage] = useState("");
    const [sender, setSender] = useState("");
    const [routingMode, setRoutingMode] = useState("AUTO");
    const [scheduleAt, setScheduleAt] = useState("");
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState<any[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [tagQuery, setTagQuery] = useState("");

    useEffect(() => {
        authFetch("/wa-accounts").then(res => res.json()).then(json => setAccounts(json.data));
    }, []);

    useEffect(() => {
        authFetch("/tags").then(res => res.json()).then(json => setTags(json.data));
    }, []);

    useEffect(() => {
        if (routingMode === "AUTO") {
            setSender("");
        }
    }, [routingMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await authFetch("/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    waAccountId: routingMode === "MANUAL" ? sender : undefined,
                    message,
                    scheduleAt: scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
                    tagIds: selectedTagIds,
                    // Wait, without tags it targets no one. 
                    // MVP: let's hardcode fetching all tags or just skip tags for now and add them manually?
                    // The API requires tagIds to add targets. 
                    // Let's add a simple tag selector or just fetch all contacts with a specific tag?
                })
            });
            if (res.ok) {
                window.location.href = "/campaigns";
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <div>
                <label className="text-sm font-medium">Campaign Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>

            <div>
                <label className="text-sm font-medium">Sender Account</label>
                <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={sender}
                    onChange={e => setSender(e.target.value)}
                    required={routingMode === "MANUAL"}
                >
                    <option value="">Select Account</option>
                    {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.phoneE164} ({a.label || 'No Label'})</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="text-sm font-medium">Routing Mode</label>
                <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={routingMode}
                    onChange={e => setRoutingMode(e.target.value)}
                >
                    <option value="AUTO">Auto (least busy account)</option>
                    <option value="MANUAL">Manual (specific account)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                    Auto akan memilih akun yang paling sedikit beban dari akun yang terkoneksi.
                </p>
            </div>

            <div>
                <label className="text-sm font-medium">Message</label>
                <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    required
                />
            </div>

            <div>
                <label className="text-sm font-medium">Target Tags</label>
                <Input
                    placeholder="Search tags..."
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                />
                <div className="mt-2 flex items-center gap-2 text-xs">
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
                    <span className="text-muted-foreground">
                        {selectedTagIds.length} selected
                    </span>
                </div>
                <div className="mt-2 max-h-40 overflow-auto rounded-md border p-2">
                    {tags
                        .filter((tag) =>
                            tag.name.toLowerCase().includes(tagQuery.trim().toLowerCase())
                        )
                        .map((tag) => (
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
                    {tags.length > 0 &&
                        tags.filter((tag) =>
                            tag.name.toLowerCase().includes(tagQuery.trim().toLowerCase())
                        ).length === 0 && (
                            <div className="text-xs text-muted-foreground">No matching tags.</div>
                        )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    Pilih satu atau lebih tag untuk menentukan target campaign.
                </p>
            </div>

            <div>
                <label className="text-sm font-medium">Schedule (optional)</label>
                <Input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                    Jika diisi, campaign akan berjalan otomatis sesuai jadwal.
                </p>
            </div>

            <Button type="submit" disabled={loading}>Create Draft</Button>
        </form>
    )
}
