import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { AlertDialog } from "../ui/alert-dialog";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { PromptDialog } from "../ui/prompt-dialog";
import { toast } from "../../lib/toast";
import {
    MoreVertical,
    Pencil,
    Tag,
    Trash2,
    FileDown,
    Tags,
    Eye,
} from "lucide-react";
import { authFetch } from "../../lib/api";

type Contact = {
    id: string;
    displayName?: string | null;
    phoneE164: string;
    createdAt: string;
    tags: { tag: { id: string; name: string } }[];
};

type Props = {
    contacts: Contact[];
};

export default function ContactsTable({ contacts }: Props) {
    const [data, setData] = useState<Contact[]>(contacts || []);
    const [loadingList, setLoadingList] = useState(false);
    const [query, setQuery] = useState("");
    const [tagFilter, setTagFilter] = useState("all");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState<any[]>([]);
    const [tagQuery, setTagQuery] = useState("");
    const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
    const [bulkAction, setBulkAction] = useState<"add" | "remove" | null>(null);
    const [openActionId, setOpenActionId] = useState<string | null>(null);
    const [actionAnchor, setActionAnchor] = useState<HTMLButtonElement | null>(null);
    const actionMenuRef = useRef<HTMLDivElement | null>(null);
    const [actionPos, setActionPos] = useState({ top: 0, left: 0 });
    const [alertMessage, setAlertMessage] = useState<ReactNode | null>(null);
    const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
    const [confirmContactDelete, setConfirmContactDelete] = useState<Contact | null>(null);
    const [editContact, setEditContact] = useState<Contact | null>(null);
    const [editTagsContact, setEditTagsContact] = useState<Contact | null>(null);

    useEffect(() => {
        authFetch("/tags")
            .then((res) => res.json())
            .then((json) => setTags(json.data || []))
            .catch(() => setTags([]));
    }, []);

    useEffect(() => {
        if (contacts && contacts.length > 0) {
            setData(contacts);
            return;
        }
        const fetchContacts = async () => {
            setLoadingList(true);
            try {
                const res = await authFetch("/contacts");
                const json = await res.json().catch(() => ({}));
                if (res.ok) setData(json.data || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingList(false);
            }
        };
        fetchContacts();
    }, [contacts]);

    const tagOptions = useMemo(() => {
        const tags = new Set<string>();
        data.forEach((contact) => {
            contact.tags.forEach((t) => tags.add(t.tag.name));
        });
        return Array.from(tags).sort((a, b) => a.localeCompare(b));
    }, [data]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return data.filter((contact) => {
            if (tagFilter !== "all") {
                const hasTag = contact.tags.some((t) => t.tag.name === tagFilter);
                if (!hasTag) return false;
            }
            if (!q) return true;
            return (
                (contact.displayName || "").toLowerCase().includes(q) ||
                contact.phoneE164.toLowerCase().includes(q)
            );
        });
    }, [data, query, tagFilter]);

    const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.includes(c.id));

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds(selectedIds.filter((id) => !filtered.some((c) => c.id === id)));
            return;
        }
        const newIds = new Set(selectedIds);
        filtered.forEach((c) => newIds.add(c.id));
        setSelectedIds(Array.from(newIds));
    };

    const toggleSelectOne = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter((item) => item !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        setLoading(true);
        try {
            const res = await authFetch("/contacts/bulk-delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: selectedIds }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAlertMessage(json?.error || "Delete failed.");
                return;
            }
            if (json?.data?.blocked?.length > 0) {
                setAlertMessage(
                    `Deleted ${json.data.deleted}. ${json.data.blocked.length} contacts were not deleted because they have messages.`
                );
                return;
            }
            toast({ title: "Contacts deleted", description: `${selectedIds.length} removed`, variant: "success" });
            await new Promise((resolve) => setTimeout(resolve, 200));
            window.location.reload();
        } catch (err) {
            console.error(err);
            setAlertMessage("Network error.");
        } finally {
            setLoading(false);
        }
    };

    const handleBulkTags = async (mode: "add" | "remove") => {
        if (selectedIds.length === 0 || bulkTagIds.length === 0) return;
        setLoading(true);
        try {
            const res = await authFetch("/contacts/bulk-tags", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: selectedIds, tagIds: bulkTagIds, mode }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAlertMessage(json?.error || "Bulk update failed.");
                return;
            }
            toast({
                title: mode === "add" ? "Tags added" : "Tags removed",
                description: `${selectedIds.length} contacts updated`,
                variant: "success",
            });
            await new Promise((resolve) => setTimeout(resolve, 200));
            window.location.reload();
        } catch (err) {
            console.error(err);
            setAlertMessage("Network error.");
        } finally {
            setLoading(false);
            setBulkAction(null);
            setBulkTagIds([]);
        }
    };

    const handleExport = async () => {
        if (selectedIds.length === 0) return;
        setLoading(true);
        try {
            const res = await authFetch("/contacts/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: selectedIds }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                setAlertMessage(json?.error || "Export failed.");
                return;
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "contacts-export.csv";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast({ title: "Export ready", description: "contacts-export.csv", variant: "success" });
        } catch (err) {
            console.error(err);
            setAlertMessage("Network error.");
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = async (contact: Contact, next: string) => {
        setLoading(true);
        try {
            const res = await authFetch(`/contacts/${contact.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ displayName: next.trim() || null }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAlertMessage(json?.error || "Update failed.");
                return;
            }
            toast({ title: "Contact updated", description: contact.phoneE164, variant: "success" });
            await new Promise((resolve) => setTimeout(resolve, 200));
            window.location.reload();
        } catch (err) {
            console.error(err);
            setAlertMessage("Network error.");
        } finally {
            setLoading(false);
        }
    };

    const handleManageTags = async (contact: Contact, next: string) => {
        const nextNames = next
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
        const tagIds = tags
            .filter((tag) => nextNames.includes(tag.name))
            .map((tag) => tag.id);
        setLoading(true);
        try {
            const res = await authFetch(`/contacts/${contact.id}/tags`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tagIds }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAlertMessage(json?.error || "Update failed.");
                return;
            }
            toast({ title: "Tags updated", description: contact.phoneE164, variant: "success" });
            await new Promise((resolve) => setTimeout(resolve, 200));
            window.location.reload();
        } catch (err) {
            console.error(err);
            setAlertMessage("Network error.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (contact: Contact) => {
        setLoading(true);
        try {
            const res = await authFetch(`/contacts/${contact.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAlertMessage(json?.error || "Delete failed.");
                return;
            }
            toast({ title: "Contact deleted", description: contact.phoneE164, variant: "success" });
            await new Promise((resolve) => setTimeout(resolve, 200));
            window.location.reload();
        } catch (err) {
            console.error(err);
            setAlertMessage("Network error.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (actionMenuRef.current?.contains(target)) return;
            if (actionAnchor?.contains(target)) return;
            setOpenActionId(null);
            setActionAnchor(null);
        };
        document.addEventListener("click", handleClick);
        return () => document.removeEventListener("click", handleClick);
    }, [actionAnchor]);

    useEffect(() => {
        const updatePos = () => {
            if (!actionAnchor) return;
            const rect = actionAnchor.getBoundingClientRect();
            const width = 192;
            const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
            const spaceBelow = window.innerHeight - rect.bottom - 8;
            const spaceAbove = rect.top - 8;
            const menuHeight = 220;
            const top = spaceBelow < menuHeight && spaceAbove > spaceBelow
                ? Math.max(8, rect.top - menuHeight - 6)
                : Math.min(rect.bottom + 6, window.innerHeight - menuHeight - 8);
            setActionPos({ top, left });
        };

        if (openActionId && actionAnchor) {
            updatePos();
        }

        const onScroll = () => openActionId && updatePos();
        const onResize = () => openActionId && updatePos();
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [openActionId, actionAnchor]);

    return (
        <div className="rounded-md border">
            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium">Contacts</div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                        className="flex h-9 w-full min-w-[220px] rounded-md border border-input bg-background px-3 py-1 text-sm"
                        placeholder="Search name or phone..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                        className="flex h-9 min-w-[160px] rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                    >
                        <option value="all">All Tags</option>
                        {tagOptions.map((tag) => (
                            <option key={tag} value={tag}>
                                {tag}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
                <div>{selectedIds.length} selected</div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-emerald-700 hover:text-emerald-800"
                        onClick={() => setBulkAction("add")}
                        disabled={loading || selectedIds.length === 0}
                    >
                        <Tags className="h-4 w-4 mr-2" />
                        Add Tags
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-amber-700 hover:text-amber-800"
                        onClick={() => setBulkAction("remove")}
                        disabled={loading || selectedIds.length === 0}
                    >
                        <Tag className="h-4 w-4 mr-2" />
                        Remove Tags
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-sky-700 hover:text-sky-800"
                        onClick={handleExport}
                        disabled={loading || selectedIds.length === 0}
                    >
                        <FileDown className="h-4 w-4 mr-2" />
                        Export CSV
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setConfirmBulkDeleteOpen(true)}
                        disabled={loading || selectedIds.length === 0}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                    </Button>
                </div>
            </div>
            {bulkAction && (
                <div className="border-b px-4 py-3">
                    <div className="text-xs text-muted-foreground mb-2">
                        {bulkAction === "add" ? "Select tags to add" : "Select tags to remove"}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <input
                            className="flex h-9 w-full min-w-[220px] rounded-md border border-input bg-background px-3 py-1 text-sm"
                            placeholder="Search tags..."
                            value={tagQuery}
                            onChange={(e) => setTagQuery(e.target.value)}
                        />
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                className="bg-blue-600 text-white hover:bg-blue-700"
                                disabled={loading || bulkTagIds.length === 0}
                                onClick={() => handleBulkTags(bulkAction)}
                            >
                                Apply
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setBulkAction(null); setBulkTagIds([]); }}>
                                Cancel
                            </Button>
                        </div>
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
                                        checked={bulkTagIds.includes(tag.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setBulkTagIds([...bulkTagIds, tag.id]);
                                            } else {
                                                setBulkTagIds(bulkTagIds.filter((id) => id !== tag.id));
                                            }
                                        }}
                                    />
                                    <span>{tag.name}</span>
                                </label>
                            ))}
                        {tags.length === 0 && (
                            <div className="text-xs text-muted-foreground">No tags found.</div>
                        )}
                    </div>
                </div>
            )}
            <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm text-left">
                    <thead className="[&_tr]:border-b">
                        <tr className="border-b transition-colors hover:bg-muted/50">
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Name</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Phone</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Tags</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Created At</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {loadingList && (
                            <tr>
                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                    Loading contacts...
                                </td>
                            </tr>
                        )}
                        {!loadingList && filtered.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                    No contacts found.
                                </td>
                            </tr>
                        )}
                        {filtered.map((contact) => (
                            <tr key={contact.id} className="border-b transition-colors hover:bg-muted/50">
                                <td className="p-4 align-middle">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(contact.id)}
                                        onChange={() => toggleSelectOne(contact.id)}
                                    />
                                </td>
                                <td className="p-4 align-middle font-medium">{contact.displayName || "-"}</td>
                                <td className="p-4 align-middle">{contact.phoneE164}</td>
                                <td className="p-4 align-middle">
                                    <div className="flex gap-1 flex-wrap">
                                        {contact.tags.map((t) => (
                                            <span
                                                key={`${contact.id}-${t.tag.name}`}
                                                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-secondary text-secondary-foreground"
                                            >
                                                {t.tag.name}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-4 align-middle text-muted-foreground">
                                    {new Date(contact.createdAt).toLocaleDateString()}
                                </td>
                                <td className="p-4 align-middle text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(event) => {
                                            const nextOpen = openActionId === contact.id ? null : contact.id;
                                            setOpenActionId(nextOpen);
                                            setActionAnchor(nextOpen ? (event.currentTarget as HTMLButtonElement) : null);
                                        }}
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                    {openActionId === contact.id &&
                                        createPortal(
                                            <div
                                                ref={actionMenuRef}
                                                className="fixed z-50 w-48 rounded-md border bg-background p-1 shadow-lg"
                                                style={{ top: actionPos.top, left: actionPos.left }}
                                            >
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                                                    onClick={() => {
                                                        setOpenActionId(null);
                                                        setActionAnchor(null);
                                                        setEditContact(contact);
                                                    }}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-sky-700 hover:bg-sky-50"
                                                    onClick={() => {
                                                        setOpenActionId(null);
                                                        setActionAnchor(null);
                                                        window.location.href = `/contacts/${contact.id}`;
                                                    }}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                    View Messages
                                                </button>
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-purple-700 hover:bg-purple-50"
                                                    onClick={() => {
                                                        setOpenActionId(null);
                                                        setActionAnchor(null);
                                                        setEditTagsContact(contact);
                                                    }}
                                                >
                                                    <Tags className="h-4 w-4" />
                                                    Manage Tags
                                                </button>
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                                                    onClick={() => {
                                                        setOpenActionId(null);
                                                        setActionAnchor(null);
                                                        setConfirmContactDelete(contact);
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    Delete
                                                </button>
                                            </div>,
                                            document.body,
                                        )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <ConfirmDialog
                open={confirmBulkDeleteOpen}
                onOpenChange={setConfirmBulkDeleteOpen}
                title="Delete Contacts"
                description={`Delete ${selectedIds.length} contact(s)?`}
                confirmLabel="Delete"
                destructive
                loading={loading}
                onConfirm={() => {
                    setConfirmBulkDeleteOpen(false);
                    handleBulkDelete();
                }}
            />
            <ConfirmDialog
                open={!!confirmContactDelete}
                onOpenChange={(open) => {
                    if (!open) setConfirmContactDelete(null);
                }}
                title="Delete Contact"
                description={
                    confirmContactDelete ? `Delete ${confirmContactDelete.phoneE164}?` : ""
                }
                confirmLabel="Delete"
                destructive
                loading={loading}
                onConfirm={() => {
                    if (!confirmContactDelete) return;
                    const target = confirmContactDelete;
                    setConfirmContactDelete(null);
                    handleDelete(target);
                }}
            />
            <PromptDialog
                open={!!editContact}
                onOpenChange={(open) => {
                    if (!open) setEditContact(null);
                }}
                title="Edit Name"
                description={editContact ? `Update name for ${editContact.phoneE164}.` : ""}
                inputLabel="Display name"
                placeholder="Optional name"
                defaultValue={editContact?.displayName || ""}
                confirmLabel="Save"
                loading={loading}
                onConfirm={(next) => {
                    if (!editContact) return;
                    const target = editContact;
                    setEditContact(null);
                    handleEdit(target, next);
                }}
            />
            <PromptDialog
                open={!!editTagsContact}
                onOpenChange={(open) => {
                    if (!open) setEditTagsContact(null);
                }}
                title="Manage Tags"
                description="Use commas to separate tags."
                inputLabel="Tags"
                placeholder="vip, reseller"
                defaultValue={
                    editTagsContact
                        ? editTagsContact.tags.map((t) => t.tag.name).join(", ")
                        : ""
                }
                confirmLabel="Save"
                loading={loading}
                onConfirm={(next) => {
                    if (!editTagsContact) return;
                    const target = editTagsContact;
                    setEditTagsContact(null);
                    handleManageTags(target, next);
                }}
            />
            <AlertDialog
                open={!!alertMessage}
                onOpenChange={(open) => {
                    if (!open) setAlertMessage(null);
                }}
                title="Contacts"
                description={alertMessage || ""}
            />
        </div>
    );
}
