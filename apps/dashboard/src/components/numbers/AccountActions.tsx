import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "../ui/button";
import { AlertDialog } from "../ui/alert-dialog";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { PromptDialog } from "../ui/prompt-dialog";
import { authFetch } from "../../lib/api";
import ConnectExistingAccountDialog from "./ConnectExistingAccountDialog";
import { Link2, MoreVertical, Pencil, Power, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "../../lib/toast";

type Props = {
    id: string;
    status: string;
    phoneE164: string;
    label?: string | null;
};

export default function AccountActions({ id, status, phoneE164, label }: Props) {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [alertMessage, setAlertMessage] = useState<ReactNode | null>(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [confirmDeleteWithDataOpen, setConfirmDeleteWithDataOpen] = useState(false);
    const [editLabelOpen, setEditLabelOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

    const send = async (path: string) => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await authFetch(`/wa-accounts/${id}/${path}`, { method: "POST" });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                setAlertMessage(json?.error || "Action failed.");
                return;
            }
            const actionLabel =
                path === "reconnect"
                    ? "Reconnecting account"
                    : path === "reset-creds"
                        ? "Credentials reset"
                        : path === "disconnect"
                            ? "Account disconnected"
                            : "Action completed";
            toast({ title: actionLabel, description: label || phoneE164, variant: "success" });
            await new Promise((resolve) => setTimeout(resolve, 200));
            window.location.reload();
        } catch (err) {
            console.error(err);
            setAlertMessage("Network error.");
        } finally {
            setLoading(false);
        }
    };

    const handleEditLabel = async (next: string) => {
        if (loading) return;
        setEditLabelOpen(false);
        setLoading(true);
        try {
            const res = await authFetch(`/wa-accounts/${id}/label`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: next.trim() || null }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAlertMessage(json?.error || "Update failed.");
                return;
            }
            toast({ title: "Label updated", description: next.trim() || phoneE164, variant: "success" });
            await new Promise((resolve) => setTimeout(resolve, 200));
            window.location.reload();
        } catch (err) {
            console.error(err);
            setAlertMessage("Network error.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (loading) return;
        setConfirmDeleteOpen(false);
        setLoading(true);
        try {
            const res = await authFetch(`/wa-accounts/${id}/delete`, { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 409 && json?.details) {
                    setAlertMessage(
                        <div className="space-y-1">
                            <div>Cannot delete account with related records.</div>
                            <div className="text-xs text-muted-foreground">
                                Messages: {json.details.messages}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Campaigns: {json.details.campaigns}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Auto-reply rules: {json.details.autoReplyRules}
                            </div>
                        </div>
                    );
                } else {
                    setAlertMessage(json?.error || "Delete failed.");
                }
                return;
            }
            toast({ title: "Account deleted", description: label || phoneE164, variant: "success" });
            await new Promise((resolve) => setTimeout(resolve, 200));
            window.location.reload();
        } catch (err) {
            console.error(err);
            setAlertMessage("Network error.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteWithData = async () => {
        if (loading) return;
        setConfirmDeleteWithDataOpen(false);
        setLoading(true);
        try {
            const res = await authFetch(`/wa-accounts/${id}/delete-with-data`, { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAlertMessage(json?.error || "Delete failed.");
                return;
            }
            toast({ title: "Account deleted", description: label || phoneE164, variant: "success" });
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
            if (menuRef.current?.contains(target)) return;
            if (buttonRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener("click", handleClick);
        return () => document.removeEventListener("click", handleClick);
    }, []);

    useEffect(() => {
        const updatePos = () => {
            if (!buttonRef.current) return;
            const rect = buttonRef.current.getBoundingClientRect();
            const width = 192;
            const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
            const top = Math.min(rect.bottom + 6, window.innerHeight - 8);
            setMenuPos({ top, left });
        };

        if (open) {
            updatePos();
        }

        const onScroll = () => open && updatePos();
        const onResize = () => open && updatePos();
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [open]);

    return (
        <div className="flex items-center justify-end">
            <Button
                variant="ghost"
                size="sm"
                ref={buttonRef}
                onClick={() => setOpen((prev) => !prev)}
                disabled={loading}
                className="text-muted-foreground hover:text-foreground"
            >
                <MoreVertical className="h-4 w-4" />
            </Button>
            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        className="fixed z-50 w-48 rounded-md border bg-background p-1 shadow-lg"
                        style={{ top: menuPos.top, left: menuPos.left }}
                    >
                        {status !== "CONNECTED" && (
                            <ConnectExistingAccountDialog
                                accountId={id}
                                phoneE164={phoneE164}
                                label={label}
                                trigger={
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                                        onClick={() => setOpen(false)}
                                    >
                                        <Link2 className="h-4 w-4" />
                                        Connect
                                    </button>
                                }
                            />
                        )}
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-sky-700 hover:bg-sky-50"
                            onClick={() => {
                                setOpen(false);
                                send("reconnect");
                            }}
                        >
                            <RefreshCw className="h-4 w-4" />
                            Reconnect
                        </button>
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-purple-700 hover:bg-purple-50"
                            onClick={() => {
                                setOpen(false);
                                send("reset-creds");
                            }}
                        >
                            <RotateCcw className="h-4 w-4" />
                            Reset Creds
                        </button>
                        {status === "CONNECTED" && (
                            <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
                                onClick={() => {
                                    setOpen(false);
                                    send("disconnect");
                                }}
                            >
                                <Power className="h-4 w-4" />
                                Disconnect
                            </button>
                        )}
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                                    onClick={() => {
                                        setOpen(false);
                                        setEditLabelOpen(true);
                                    }}
                                >
                                    <Pencil className="h-4 w-4" />
                                    Edit Label
                                </button>
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                            onClick={() => {
                                setOpen(false);
                                setConfirmDeleteOpen(true);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </button>
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                            onClick={() => {
                                setOpen(false);
                                setConfirmDeleteWithDataOpen(true);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete + Data
                        </button>
                    </div>,
                    document.body,
                )}
            <PromptDialog
                open={editLabelOpen}
                onOpenChange={setEditLabelOpen}
                title="Edit Label"
                description={`Update label for ${phoneE164}.`}
                inputLabel="Label"
                placeholder="Optional label"
                defaultValue={label || ""}
                confirmLabel="Save"
                loading={loading}
                onConfirm={handleEditLabel}
            />
            <ConfirmDialog
                open={confirmDeleteOpen}
                onOpenChange={setConfirmDeleteOpen}
                title="Delete Account"
                description={`Delete account ${phoneE164}${label ? ` (${label})` : ""}? This cannot be undone.`}
                confirmLabel="Delete"
                destructive
                loading={loading}
                onConfirm={handleDelete}
            />
            <ConfirmDialog
                open={confirmDeleteWithDataOpen}
                onOpenChange={setConfirmDeleteWithDataOpen}
                title="Delete Account + Data"
                description={`Delete account ${phoneE164}${label ? ` (${label})` : ""} and remove all related data? This cannot be undone.`}
                confirmLabel="Delete"
                destructive
                loading={loading}
                onConfirm={handleDeleteWithData}
            />
            <AlertDialog
                open={!!alertMessage}
                onOpenChange={(isOpen) => {
                    if (!isOpen) setAlertMessage(null);
                }}
                title="Account Action"
                description={alertMessage || ""}
            />
        </div>
    );
}
