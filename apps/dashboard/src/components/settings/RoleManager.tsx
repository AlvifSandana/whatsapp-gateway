import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../../lib/api";
import { toast } from "../../lib/toast";
import { Button } from "../ui/button";
import { PromptDialog } from "../ui/prompt-dialog";
import { ConfirmDialog } from "../ui/confirm-dialog";

type Permission = {
    id: string;
    code: string;
    groupName: string;
    description?: string | null;
};

type Role = {
    id: string;
    name: string;
    description?: string | null;
    permissions: string[];
};

export default function RoleManager() {
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [selectedRoleId, setSelectedRoleId] = useState<string>("");
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [renameRole, setRenameRole] = useState<Role | null>(null);
    const [deleteRole, setDeleteRole] = useState<Role | null>(null);

    const selectedRole = roles.find((role) => role.id === selectedRoleId) || null;

    const groupedPermissions = useMemo(() => {
        const groups: Record<string, Permission[]> = {};
        permissions.forEach((permission) => {
            if (!groups[permission.groupName]) {
                groups[permission.groupName] = [];
            }
            groups[permission.groupName].push(permission);
        });
        return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
    }, [permissions]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [permissionsRes, rolesRes] = await Promise.all([
                authFetch("/rbac/permissions"),
                authFetch("/rbac/roles"),
            ]);
            const permissionsJson = await permissionsRes.json().catch(() => ({}));
            const rolesJson = await rolesRes.json().catch(() => ({}));
            if (permissionsRes.ok) {
                setPermissions(permissionsJson.data || []);
            }
            if (rolesRes.ok) {
                const roleList = rolesJson.data || [];
                setRoles(roleList);
                const stillExists = roleList.some((role: Role) => role.id === selectedRoleId);
                if ((!selectedRoleId || !stillExists) && roleList.length > 0) {
                    setSelectedRoleId(roleList[0].id);
                    setSelectedPermissions(roleList[0].permissions || []);
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (selectedRole) {
            setSelectedPermissions(selectedRole.permissions || []);
        }
    }, [selectedRoleId, roles]);

    const togglePermission = (code: string) => {
        setSelectedPermissions((prev) =>
            prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
        );
    };

    const handleSave = async () => {
        if (!selectedRole) return;
        setSaving(true);
        try {
            const res = await authFetch(`/rbac/roles/${selectedRole.id}/permissions`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permissionCodes: selectedPermissions }),
            });
            if (res.ok) {
                toast({ title: "Permissions updated", variant: "success" });
                await loadData();
            } else {
                toast({ title: "Failed to update permissions", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to update permissions", variant: "error" });
        } finally {
            setSaving(false);
        }
    };

    const handleCreateRole = async (name: string) => {
        const value = name.trim();
        if (!value) return;
        try {
            const res = await authFetch("/rbac/roles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: value }),
            });
            if (res.ok) {
                toast({ title: "Role created", variant: "success" });
                setCreateOpen(false);
                await loadData();
            } else {
                toast({ title: "Failed to create role", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to create role", variant: "error" });
        }
    };

    const handleRenameRole = async (role: Role, name: string) => {
        const value = name.trim();
        if (!value) return;
        try {
            const res = await authFetch(`/rbac/roles/${role.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: value }),
            });
            if (res.ok) {
                toast({ title: "Role updated", variant: "success" });
                setRenameRole(null);
                await loadData();
            } else {
                toast({ title: "Failed to update role", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to update role", variant: "error" });
        }
    };

    const handleDeleteRole = async (role: Role) => {
        try {
            const res = await authFetch(`/rbac/roles/${role.id}`, { method: "DELETE" });
            if (res.ok) {
                toast({ title: "Role deleted", variant: "success" });
                setDeleteRole(null);
                await loadData();
            } else {
                toast({ title: "Failed to delete role", variant: "error" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to delete role", variant: "error" });
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Roles & Permissions</h1>
                    <p className="text-sm text-muted-foreground">Manage access levels for your workspace.</p>
                </div>
                <Button className="bg-foreground text-background hover:bg-foreground/90" onClick={() => setCreateOpen(true)}>
                    New Role
                </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="rounded-xl border bg-background">
                    <div className="border-b px-4 py-3 text-xs font-semibold text-muted-foreground">Roles</div>
                    <div className="divide-y">
                        {roles.map((role) => (
                            <button
                                key={role.id}
                                type="button"
                                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm ${
                                    role.id === selectedRoleId ? "bg-muted" : "hover:bg-muted/50"
                                }`}
                                onClick={() => setSelectedRoleId(role.id)}
                            >
                                <span className="font-medium">{role.name}</span>
                                <span className="text-xs text-muted-foreground">
                                    {role.permissions?.length || 0}
                                </span>
                            </button>
                        ))}
                        {roles.length === 0 && (
                            <div className="px-4 py-6 text-sm text-muted-foreground">No roles found.</div>
                        )}
                    </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold">
                                {selectedRole ? selectedRole.name : "Select a role"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {selectedRole ? "Toggle permissions and save changes." : "Choose a role to edit."}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={!selectedRole}
                                onClick={() => selectedRole && setRenameRole(selectedRole)}
                            >
                                Rename
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                disabled={!selectedRole}
                                onClick={() => selectedRole && setDeleteRole(selectedRole)}
                            >
                                Delete
                            </Button>
                            <Button
                                size="sm"
                                className="bg-foreground text-background hover:bg-foreground/90"
                                disabled={!selectedRole || saving}
                                onClick={handleSave}
                            >
                                {saving ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-sm text-muted-foreground">Loading permissions...</div>
                    ) : selectedRole ? (
                        <div className="space-y-5">
                            {groupedPermissions.map(([groupName, groupPermissions]) => (
                                <div key={groupName} className="space-y-2">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {groupName}
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {groupPermissions.map((permission) => (
                                            <label
                                                key={permission.code}
                                                className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-1"
                                                    checked={selectedPermissions.includes(permission.code)}
                                                    onChange={() => togglePermission(permission.code)}
                                                />
                                                <div>
                                                    <div className="font-medium">{permission.code}</div>
                                                    <div className="text-muted-foreground">
                                                        {permission.description || "No description"}
                                                    </div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">Select a role to manage permissions.</div>
                    )}
                </div>
            </div>

            <PromptDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                title="Create Role"
                inputLabel="Role name"
                placeholder="Operator"
                confirmLabel="Create"
                onConfirm={handleCreateRole}
            />

            <PromptDialog
                open={!!renameRole}
                onOpenChange={(open) => {
                    if (!open) setRenameRole(null);
                }}
                title="Rename Role"
                inputLabel="Role name"
                defaultValue={renameRole?.name || ""}
                confirmLabel="Update"
                onConfirm={(value) => {
                    if (renameRole) handleRenameRole(renameRole, value);
                }}
            />

            <ConfirmDialog
                open={!!deleteRole}
                onOpenChange={(open) => {
                    if (!open) setDeleteRole(null);
                }}
                title="Delete role?"
                description={
                    deleteRole
                        ? `Delete "${deleteRole.name}" and remove its permissions.`
                        : "Delete this role."
                }
                confirmLabel="Delete"
                destructive
                onConfirm={() => {
                    if (deleteRole) handleDeleteRole(deleteRole);
                }}
            />
        </div>
    );
}
