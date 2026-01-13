import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";
import { toast } from "../../lib/toast";
import { Button } from "../ui/button";
import { PromptDialog } from "../ui/prompt-dialog";
import { ConfirmDialog } from "../ui/confirm-dialog";

type Tag = {
    id: string;
    name: string;
    _count?: { contacts?: number };
};

export default function TagManager() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [renameTag, setRenameTag] = useState<Tag | null>(null);
    const [deleteTag, setDeleteTag] = useState<Tag | null>(null);

    const loadTags = async () => {
        setLoading(true);
        try {
            const res = await authFetch("/tags");
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                setTags(json.data || []);
            } else {
                setTags([]);
            }
        } catch (err) {
            console.error(err);
            setTags([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTags();
    }, []);

    const handleCreate = async (name: string) => {
        const value = name.trim();
        if (!value) return;
        try {
            const res = await authFetch("/tags", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: value }),
            });
            if (res.ok) {
                toast({ title: "Tag created", variant: "success" });
                setCreateOpen(false);
                loadTags();
            } else {
                toast({ title: "Failed to create tag", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to create tag", variant: "error" });
        }
    };

    const handleRename = async (tag: Tag, name: string) => {
        const value = name.trim();
        if (!value) return;
        try {
            const res = await authFetch(`/tags/${tag.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: value }),
            });
            if (res.ok) {
                toast({ title: "Tag updated", variant: "success" });
                setRenameTag(null);
                loadTags();
            } else {
                toast({ title: "Failed to update tag", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to update tag", variant: "error" });
        }
    };

    const handleDelete = async (tag: Tag) => {
        try {
            const res = await authFetch(`/tags/${tag.id}`, { method: "DELETE" });
            if (res.ok) {
                toast({ title: "Tag deleted", variant: "success" });
                setDeleteTag(null);
                loadTags();
            } else {
                toast({ title: "Failed to delete tag", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to delete tag", variant: "error" });
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
                    <p className="text-sm text-muted-foreground">Create and manage contact tags.</p>
                </div>
                <Button className="bg-foreground text-background hover:bg-foreground/90" onClick={() => setCreateOpen(true)}>
                    New Tag
                </Button>
            </div>

            <div className="rounded-xl border bg-background">
                <div className="border-b px-4 py-3 text-sm font-medium text-muted-foreground">Tag List</div>
                <div className="divide-y">
                    {loading ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground">Loading tags...</div>
                    ) : tags.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground">No tags created yet.</div>
                    ) : (
                        tags.map((tag) => (
                            <div key={tag.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                <div>
                                    <div className="text-sm font-medium">{tag.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {tag._count?.contacts || 0} contacts
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={() => setRenameTag(tag)}>
                                        Rename
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => setDeleteTag(tag)}>
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <PromptDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                title="Create Tag"
                inputLabel="Tag name"
                placeholder="VIP Customers"
                confirmLabel="Create"
                onConfirm={handleCreate}
            />

            <PromptDialog
                open={!!renameTag}
                onOpenChange={(open) => {
                    if (!open) setRenameTag(null);
                }}
                title="Rename Tag"
                inputLabel="Tag name"
                defaultValue={renameTag?.name || ""}
                confirmLabel="Update"
                onConfirm={(value) => {
                    if (renameTag) handleRename(renameTag, value);
                }}
            />

            <ConfirmDialog
                open={!!deleteTag}
                onOpenChange={(open) => {
                    if (!open) setDeleteTag(null);
                }}
                title="Delete tag?"
                description={
                    deleteTag
                        ? `This will remove "${deleteTag.name}" from all contacts.`
                        : "This will remove the tag."
                }
                confirmLabel="Delete"
                destructive
                onConfirm={() => {
                    if (deleteTag) handleDelete(deleteTag);
                }}
            />
        </div>
    );
}
