import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { authFetch } from "../../lib/api";
import { toast } from "../../lib/toast";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

type TeamUser = {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    createdAt: string;
    roles: string[];
};

type RoleOption = {
    id: string;
    name: string;
};

export default function TeamSettings() {
    const [users, setUsers] = useState<TeamUser[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteName, setInviteName] = useState("");
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRoleId, setInviteRoleId] = useState("");
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [tempPasswordEmail, setTempPasswordEmail] = useState<string>("");
    const [editingUser, setEditingUser] = useState<TeamUser | null>(null);
    const [editName, setEditName] = useState("");
    const [editRoleId, setEditRoleId] = useState("");
    const [deactivateUser, setDeactivateUser] = useState<TeamUser | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await authFetch("/team");
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                setUsers(json.data || []);
                setRoles(json.meta?.roles || []);
                if (!inviteRoleId && json.meta?.roles?.length) {
                    const member = json.meta.roles.find((r: RoleOption) => r.name === "Member");
                    setInviteRoleId(member?.id || json.meta.roles[0].id);
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const handleInvite = async () => {
        if (!inviteName.trim() || !inviteEmail.trim()) return;
        setLoading(true);
        try {
            const res = await authFetch("/team/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: inviteName.trim(),
                    email: inviteEmail.trim(),
                    roleId: inviteRoleId || undefined,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({ title: "Invite failed", description: json?.error || "Action failed", variant: "error" });
                return;
            }
            setTempPassword(json?.data?.tempPassword || null);
            setTempPasswordEmail(json?.data?.email || inviteEmail.trim());
            toast({ title: "Invite created", description: json?.data?.email, variant: "success" });
            setInviteName("");
            setInviteEmail("");
            setInviteOpen(false);
            await load();
        } catch (err) {
            console.error(err);
            toast({ title: "Network error", variant: "error" });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (user: TeamUser, name: string, roleId: string | null, isActive: boolean) => {
        setLoading(true);
        try {
            const res = await authFetch(`/team/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim() || user.name,
                    roleId: roleId || undefined,
                    isActive,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({ title: "Update failed", description: json?.error || "Action failed", variant: "error" });
                return;
            }
            toast({ title: "User updated", description: user.email, variant: "success" });
            await load();
        } catch (err) {
            console.error(err);
            toast({ title: "Network error", variant: "error" });
        } finally {
            setLoading(false);
        }
    };

    const roleOptions = useMemo(() => roles, [roles]);

    const openEdit = (user: TeamUser) => {
        const roleId = roleOptions.find((r) => r.name === user.roles[0])?.id || roleOptions[0]?.id || "";
        setEditingUser(user);
        setEditName(user.name);
        setEditRoleId(roleId);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-medium">Team Members</div>
                    <div className="text-xs text-muted-foreground">
                        Manage access for your workspace.
                    </div>
                </div>
                <Button
                    className="bg-foreground text-background hover:bg-foreground/90"
                    onClick={() => setInviteOpen(true)}
                >
                    Invite Member
                </Button>
            </div>

            <div className="rounded-md border">
                <table className="w-full caption-bottom text-sm text-left">
                    <thead className="[&_tr]:border-b">
                        <tr className="border-b transition-colors hover:bg-muted/50">
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Name</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Email</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Role</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {loading && (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                    Loading team...
                                </td>
                            </tr>
                        )}
                        {!loading && users.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                    No team members yet.
                                </td>
                            </tr>
                        )}
                        {users.map((user) => (
                            <tr key={user.id} className="border-b transition-colors hover:bg-muted/50">
                                <td className="p-4 align-middle font-medium">{user.name}</td>
                                <td className="p-4 align-middle text-muted-foreground">{user.email}</td>
                                <td className="p-4 align-middle">
                                    {user.roles.join(", ") || "-"}
                                </td>
                                <td className="p-4 align-middle">
                                    <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                            user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                                        }`}
                                    >
                                        {user.isActive ? "Active" : "Inactive"}
                                    </span>
                                </td>
                                <td className="p-4 align-middle text-right">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => openEdit(user)}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-red-600 hover:text-red-700"
                                        onClick={() => setDeactivateUser(user)}
                                    >
                                        {user.isActive ? "Deactivate" : "Activate"}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Dialog
                open={inviteOpen}
                onOpenChange={(open) => {
                    setInviteOpen(open);
                    if (!open) {
                        setInviteName("");
                        setInviteEmail("");
                        setTempPassword(null);
                        setTempPasswordEmail("");
                    }
                }}
            >
                <DialogContent className="max-w-md">
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            handleInvite();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>Invite Team Member</DialogTitle>
                            <DialogDescription>Create an account and share the temporary password.</DialogDescription>
                        </DialogHeader>
                        <div className="mt-4 space-y-3">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Name</label>
                                <Input
                                    value={inviteName}
                                    placeholder="Full name"
                                    onChange={(event) => setInviteName(event.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Email</label>
                                <Input
                                    value={inviteEmail}
                                    placeholder="email@company.com"
                                    onChange={(event) => setInviteEmail(event.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Role</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={inviteRoleId}
                                    onChange={(event) => setInviteRoleId(event.target.value)}
                                >
                                    {roleOptions.map((role) => (
                                        <option key={role.id} value={role.id}>
                                            {role.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <DialogFooter className="mt-6">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setInviteOpen(false)}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="bg-foreground text-background hover:bg-foreground/90"
                                disabled={loading || !inviteName.trim() || !inviteEmail.trim()}
                            >
                                Create invite
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {tempPassword && (
                <div className="rounded-md border bg-emerald-50 p-4 text-sm text-emerald-800">
                    Temporary password for {tempPasswordEmail}: <strong>{tempPassword}</strong>
                </div>
            )}

            <ConfirmDialog
                open={!!deactivateUser}
                onOpenChange={(open) => {
                    if (!open) setDeactivateUser(null);
                }}
                title={deactivateUser?.isActive ? "Deactivate user" : "Activate user"}
                description={
                    deactivateUser
                        ? `${deactivateUser.isActive ? "Deactivate" : "Activate"} ${deactivateUser.email}?`
                        : ""
                }
                confirmLabel="Confirm"
                destructive={deactivateUser?.isActive}
                loading={loading}
                onConfirm={() => {
                    if (!deactivateUser) return;
                    handleUpdate(deactivateUser, deactivateUser.name, null, !deactivateUser.isActive);
                    setDeactivateUser(null);
                }}
            />

            <Dialog
                open={!!editingUser}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditingUser(null);
                        setEditName("");
                        setEditRoleId("");
                    }
                }}
            >
                <DialogContent className="max-w-md">
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (!editingUser) return;
                            handleUpdate(editingUser, editName, editRoleId || null, editingUser.isActive);
                            setEditingUser(null);
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>Edit Member</DialogTitle>
                            <DialogDescription>Update member profile and access.</DialogDescription>
                        </DialogHeader>
                        <div className="mt-4 space-y-3">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Name</label>
                                <Input
                                    value={editName}
                                    onChange={(event) => setEditName(event.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Role</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={editRoleId}
                                    onChange={(event) => setEditRoleId(event.target.value)}
                                >
                                    {roleOptions.map((role) => (
                                        <option key={role.id} value={role.id}>
                                            {role.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <DialogFooter className="mt-6">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setEditingUser(null)}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="bg-foreground text-background hover:bg-foreground/90"
                                disabled={loading || !editName.trim()}
                            >
                                Save changes
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
