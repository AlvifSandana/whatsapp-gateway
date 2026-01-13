import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";
import { toast } from "../../lib/toast";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { PromptDialog } from "../ui/prompt-dialog";

type Workspace = {
    id: string;
    name: string;
};

export default function WorkspaceSettings() {
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [switchWorkspaceId, setSwitchWorkspaceId] = useState("");
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [migrateData, setMigrateData] = useState(false);
    const [moveUsers, setMoveUsers] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await authFetch("/workspace");
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    setWorkspace(json.data || null);
                    setName(json.data?.name || "");
                    setSwitchWorkspaceId(json.data?.id || "");
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const loadWorkspaces = async () => {
        try {
            const res = await authFetch("/workspace/list");
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                setWorkspaces(json.data || []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        loadWorkspaces();
    }, []);

    const handleSave = async () => {
        const value = name.trim();
        if (!value) return;
        setSaving(true);
        try {
            const res = await authFetch("/workspace", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: value }),
            });
            if (res.ok) {
                const json = await res.json().catch(() => ({}));
                setWorkspace(json.data || null);
                toast({ title: "Workspace updated", variant: "success" });
            } else {
                toast({ title: "Failed to update workspace", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to update workspace", variant: "error" });
        } finally {
            setSaving(false);
        }
    };

    const handleCreate = async (value: string) => {
        const name = value.trim();
        if (!name) return;
        try {
            const res = await authFetch("/workspace/migrate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    migrateData,
                    moveUsers,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                toast({ title: "Workspace created", description: "Switched to new workspace", variant: "success" });
                setWorkspace(json.data || null);
                setName(json.data?.name || "");
                setSwitchWorkspaceId(json.data?.id || "");
                setCreateOpen(false);
                setMigrateData(false);
                setMoveUsers(false);
                loadWorkspaces();
            } else {
                toast({ title: json?.error || "Failed to create workspace", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to create workspace", variant: "error" });
        }
    };

    const handleSwitch = async () => {
        if (!switchWorkspaceId || switchWorkspaceId === workspace?.id) return;
        setSwitching(true);
        try {
            const res = await authFetch("/workspace/switch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId: switchWorkspaceId }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                setWorkspace(json.data || null);
                setName(json.data?.name || "");
                toast({ title: "Switched workspace", variant: "success" });
            } else {
                toast({ title: json?.error || "Failed to switch workspace", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to switch workspace", variant: "error" });
        } finally {
            setSwitching(false);
        }
    };

    const handleDelete = async (value: string) => {
        const confirmName = value.trim();
        if (!confirmName) return;
        try {
            const res = await authFetch("/workspace", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirmName }),
            });
            if (res.ok) {
                toast({ title: "Workspace deleted", variant: "success" });
                setDeleteOpen(false);
                window.location.href = "/login";
            } else {
                const json = await res.json().catch(() => ({}));
                toast({ title: json?.error || "Failed to delete workspace", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to delete workspace", variant: "error" });
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
                <p className="text-sm text-muted-foreground">Manage your workspace identity.</p>
            </div>
            <div className="rounded-xl border bg-background p-4">
                <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Workspace name</label>
                    <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={loading ? "Loading..." : "Workspace name"}
                        disabled={loading}
                    />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <div>Workspace ID: {workspace?.id || "-"}</div>
                    <Button
                        size="sm"
                        className="bg-foreground text-background hover:bg-foreground/90"
                        onClick={handleSave}
                        disabled={saving || loading}
                    >
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold">Create new workspace</h2>
                        <p className="text-xs text-muted-foreground">
                            This will switch you to a new workspace. Optionally move data and users.
                        </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                        Create
                    </Button>
                </div>
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={migrateData}
                            onChange={(event) => {
                                const checked = event.target.checked;
                                setMigrateData(checked);
                                if (checked) {
                                    setMoveUsers(true);
                                }
                            }}
                        />
                        Migrate all data to the new workspace
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={moveUsers}
                            onChange={(event) => setMoveUsers(event.target.checked)}
                            disabled={migrateData}
                        />
                        Move all users to the new workspace
                    </label>
                </div>
            </div>

            <div className="rounded-xl border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold">Switch workspace</h2>
                        <p className="text-xs text-muted-foreground">Switch your active workspace.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            className="h-9 rounded-md border bg-background px-3 text-sm"
                            value={switchWorkspaceId}
                            onChange={(event) => setSwitchWorkspaceId(event.target.value)}
                        >
                            {workspaces.length === 0 && (
                                <option value={workspace?.id || ""}>No workspaces</option>
                            )}
                            {workspaces.map((ws) => (
                                <option key={ws.id} value={ws.id}>
                                    {ws.name}
                                </option>
                            ))}
                        </select>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSwitch}
                            disabled={switching || switchWorkspaceId === workspace?.id}
                        >
                            {switching ? "Switching..." : "Switch"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold text-red-700">Delete workspace</h2>
                        <p className="text-xs text-red-600">
                            This permanently deletes the workspace and all related data.
                        </p>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                        Delete
                    </Button>
                </div>
            </div>

            <PromptDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                title="Create new workspace"
                inputLabel="Workspace name"
                placeholder="New Workspace"
                confirmLabel="Create"
                onConfirm={handleCreate}
            />

            <PromptDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Confirm workspace deletion"
                description={`Type "${workspace?.name || "workspace name"}" to confirm deletion.`}
                inputLabel="Workspace name"
                placeholder={workspace?.name || "Workspace name"}
                confirmLabel="Delete"
                onConfirm={handleDelete}
            />
        </div>
    );
}
