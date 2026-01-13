import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";
import { Button } from "../ui/button";
import { toast } from "../../lib/toast";

type Props = {
    contactId: string;
};

export default function ContactNotes({ contactId }: Props) {
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await authFetch(`/contacts/${contactId}`);
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    setNotes(json?.data?.notes || "");
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [contactId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await authFetch(`/contacts/${contactId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notes }),
            });
            if (res.ok) {
                toast({ title: "Notes saved", variant: "success" });
            } else {
                toast({ title: "Failed to save notes", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to save notes", variant: "error" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mt-6 rounded-xl border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold">Notes</h2>
                    <p className="text-xs text-muted-foreground">Save internal notes for this contact.</p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSave}
                    disabled={saving || loading}
                >
                    {saving ? "Saving..." : "Save"}
                </Button>
            </div>
            <textarea
                className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder={loading ? "Loading notes..." : "Write a note..."}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={loading}
            />
        </div>
    );
}
