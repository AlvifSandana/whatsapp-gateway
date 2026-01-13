import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { API_URL, authFetch } from "../../lib/api";
import { toast } from "../../lib/toast";
import { Send, RefreshCw, MessageSquarePlus, Trash2 } from "lucide-react";
import { getToken } from "../../lib/auth";

type Thread = {
    contact: {
        id: string;
        phoneE164: string;
        displayName?: string | null;
    };
    waAccount: {
        id: string;
        phoneE164: string;
        label?: string | null;
    } | null;
    lastMessage: {
        id: string;
        direction: string;
        status: string;
        payload: any;
        createdAt: string;
        waAccountId: string;
    };
};

type Message = {
    id: string;
    direction: string;
    status: string;
    payload: any;
    createdAt: string;
    waAccountId: string;
};

type Account = {
    id: string;
    phoneE164: string;
    label?: string | null;
};

export default function Inbox() {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [query, setQuery] = useState("");
    const [accountFilter, setAccountFilter] = useState("");
    const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingThreads, setLoadingThreads] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [composerText, setComposerText] = useState("");
    const [composerAccount, setComposerAccount] = useState("");
    const [newOpen, setNewOpen] = useState(false);
    const [newPhone, setNewPhone] = useState("");
    const [newName, setNewName] = useState("");
    const [newText, setNewText] = useState("");
    const [newAccountId, setNewAccountId] = useState("");
    const [sending, setSending] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteWithContactOpen, setDeleteWithContactOpen] = useState(false);

    const selectedThread = useMemo(
        () => threads.find((t) => t.contact.id === selectedContactId) || null,
        [threads, selectedContactId],
    );

    const loadAccounts = async () => {
        try {
            const res = await authFetch("/wa-accounts");
            const json = await res.json().catch(() => ({}));
            setAccounts(json?.data || []);
        } catch (err) {
            console.error(err);
        }
    };

    const loadThreads = async () => {
        setLoadingThreads(true);
        try {
            const params = new URLSearchParams();
            if (query.trim()) params.set("q", query.trim());
            if (accountFilter) params.set("waAccountId", accountFilter);
            const res = await authFetch(`/messages/threads?${params.toString()}`);
            const json = await res.json().catch(() => ({}));
            setThreads(json?.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingThreads(false);
        }
    };

    const loadMessages = async (contactId: string) => {
        setLoadingMessages(true);
        try {
            const res = await authFetch(`/contacts/${contactId}/messages`);
            const json = await res.json().catch(() => ({}));
            const items = (json?.data || []) as Message[];
            items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            setMessages(items);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingMessages(false);
        }
    };

    useEffect(() => {
        loadAccounts();
        loadThreads();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadThreads();
        }, 350);
        return () => clearTimeout(timer);
    }, [query, accountFilter]);

    useEffect(() => {
        if (!selectedContactId) return;
        loadMessages(selectedContactId);
    }, [selectedContactId]);

    useEffect(() => {
        if (!selectedThread) return;
        if (!composerAccount) {
            setComposerAccount(selectedThread.lastMessage.waAccountId || "");
        }
    }, [selectedThread, composerAccount]);

    useEffect(() => {
        if (!newOpen) return;
        if (newAccountId) return;
        if (composerAccount) {
            setNewAccountId(composerAccount);
            return;
        }
        if (accounts.length > 0) {
            setNewAccountId(accounts[0].id);
        }
    }, [newOpen, newAccountId, composerAccount, accounts]);

    useEffect(() => {
        const token = getToken();
        const source = new EventSource(
            token ? `${API_URL}/events?token=${encodeURIComponent(token)}` : `${API_URL}/events`
        );
        source.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (!payload?.type) return;
                if (payload.type === "messages.incoming") {
                    loadThreads();
                    const contactId = payload.payload?.contactId;
                    if (contactId && contactId === selectedContactId) {
                        loadMessages(contactId);
                    }
                }
                if (payload.type === "messages.status") {
                    const messageId = payload.payload?.messageId;
                    const status = payload.payload?.status;
                    if (messageId && status) {
                        setMessages((prev) =>
                            prev.map((msg) => (msg.id === messageId ? { ...msg, status } : msg)),
                        );
                    }
                }
            } catch (err) {
                console.error("SSE parse error", err);
            }
        };
        return () => {
            source.close();
        };
    }, [selectedContactId]);

    const handleSend = async (targetContactId: string, text: string, waAccountId?: string) => {
        if (!text.trim()) return;
        setSending(true);
        try {
            const res = await authFetch("/messages/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contactId: targetContactId,
                    text: text.trim(),
                    waAccountId: waAccountId || undefined,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({ title: "Send failed", description: json?.error || "Action failed", variant: "error" });
                return;
            }
            toast({ title: "Message sent", variant: "success" });
            setComposerText("");
            await loadThreads();
            await loadMessages(targetContactId);
        } catch (err) {
            console.error(err);
            toast({ title: "Network error", variant: "error" });
        } finally {
            setSending(false);
        }
    };

    const handleSendNew = async () => {
        if (!newPhone.trim() || !newText.trim()) return;
        setSending(true);
        try {
            const res = await authFetch("/messages/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phoneE164: newPhone.trim(),
                    displayName: newName.trim() || undefined,
                    text: newText.trim(),
                    waAccountId: newAccountId || undefined,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({ title: "Send failed", description: json?.error || "Action failed", variant: "error" });
                return;
            }
            toast({ title: "Message sent", variant: "success" });
            setNewOpen(false);
            setNewPhone("");
            setNewName("");
            setNewText("");
            setNewAccountId("");
            await loadThreads();
            if (json?.data?.contactId) {
                setSelectedContactId(json.data.contactId);
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Network error", variant: "error" });
        } finally {
            setSending(false);
        }
    };

    const formatPreview = (message: Thread["lastMessage"]) => {
        const text = message?.payload?.text || "";
        if (!text) return "-";
        return text.length > 70 ? `${text.slice(0, 70)}...` : text;
    };

    const handleDeleteThread = async () => {
        if (!selectedThread) return;
        setSending(true);
        try {
            let res = await authFetch(`/messages/threads/${selectedThread.contact.id}`, {
                method: "DELETE",
            });
            if (!res.ok && res.status === 404) {
                res = await authFetch(`/messages/threads/${selectedThread.contact.id}/delete`, {
                    method: "POST",
                });
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({ title: "Delete failed", description: json?.error || "Action failed", variant: "error" });
                return;
            }
            toast({
                title: "Conversation deleted",
                description: selectedThread.contact.displayName || selectedThread.contact.phoneE164,
                variant: "success",
            });
            setSelectedContactId(null);
            setMessages([]);
            await loadThreads();
        } catch (err) {
            console.error(err);
            toast({ title: "Network error", variant: "error" });
        } finally {
            setSending(false);
        }
    };

    const handleDeleteThreadWithContact = async () => {
        if (!selectedThread) return;
        setSending(true);
        try {
            let res = await authFetch(`/messages/threads/${selectedThread.contact.id}/with-contact`, {
                method: "DELETE",
            });
            if (!res.ok && res.status === 404) {
                res = await authFetch(`/messages/threads/${selectedThread.contact.id}/delete-with-contact`, {
                    method: "POST",
                });
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({ title: "Delete failed", description: json?.error || "Action failed", variant: "error" });
                return;
            }
            toast({
                title: "Conversation & contact deleted",
                description: selectedThread.contact.displayName || selectedThread.contact.phoneE164,
                variant: "success",
            });
            setSelectedContactId(null);
            setMessages([]);
            await loadThreads();
        } catch (err) {
            console.error(err);
            toast({ title: "Network error", variant: "error" });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="rounded-md border">
                <div className="flex items-center gap-2 border-b px-4 py-3">
                    <Input
                        placeholder="Search by name or phone..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={loadThreads}
                        disabled={loadingThreads}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
                <div className="border-b px-4 py-3">
                    <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={accountFilter}
                        onChange={(e) => setAccountFilter(e.target.value)}
                    >
                        <option value="">All Accounts</option>
                        {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                                {account.phoneE164} {account.label ? `(${account.label})` : ""}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div className="text-xs text-muted-foreground">{threads.length} threads</div>
                    <Dialog open={newOpen} onOpenChange={setNewOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90">
                                <MessageSquarePlus className="h-4 w-4 mr-2" />
                                New
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>New Message</DialogTitle>
                                <DialogDescription>Send a message to a new number.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-3 py-2">
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={newAccountId}
                                    onChange={(e) => setNewAccountId(e.target.value)}
                                >
                                    <option value="">Auto select account</option>
                                    {accounts.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {account.phoneE164} {account.label ? `(${account.label})` : ""}
                                        </option>
                                    ))}
                                </select>
                                <Input
                                    placeholder="Phone number"
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(e.target.value)}
                                />
                                <Input
                                    placeholder="Name (optional)"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                                <textarea
                                    className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    placeholder="Type your message..."
                                    value={newText}
                                    onChange={(e) => setNewText(e.target.value)}
                                />
                            </div>
                            <DialogFooter>
                                <Button
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                    onClick={handleSendNew}
                                    disabled={sending || !newPhone.trim() || !newText.trim()}
                                >
                                    Send
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
                <div className="max-h-[70vh] overflow-auto">
                    {threads.length === 0 && (
                        <div className="p-4 text-sm text-muted-foreground">No conversations yet.</div>
                    )}
                    {threads.map((thread) => {
                        const isActive = thread.contact.id === selectedContactId;
                        return (
                            <button
                                key={thread.contact.id}
                                type="button"
                                onClick={() => setSelectedContactId(thread.contact.id)}
                                className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/40 ${isActive ? "bg-muted/60" : ""}`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium">
                                        {thread.contact.displayName || thread.contact.phoneE164}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {new Date(thread.lastMessage.createdAt).toLocaleTimeString()}
                                    </div>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    {formatPreview(thread.lastMessage)}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="rounded-md border flex flex-col min-h-[70vh]">
                <div className="border-b px-5 py-4">
                    {selectedThread ? (
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="text-sm font-semibold">
                                    {selectedThread.contact.displayName || selectedThread.contact.phoneE164}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {selectedThread.contact.phoneE164}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                                    value={composerAccount}
                                    onChange={(e) => setComposerAccount(e.target.value)}
                                >
                                    <option value="">Auto</option>
                                    {accounts.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {account.phoneE164} {account.label ? `(${account.label})` : ""}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => setDeleteOpen(true)}
                                    disabled={sending}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => setDeleteWithContactOpen(true)}
                                    disabled={sending}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete + Contact
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">Select a conversation.</div>
                    )}
                </div>
                <div className="flex-1 overflow-auto p-5 space-y-3 bg-muted/20">
                    {loadingMessages && (
                        <div className="text-sm text-muted-foreground">Loading messages...</div>
                    )}
                    {!loadingMessages && selectedThread && messages.length === 0 && (
                        <div className="text-sm text-muted-foreground">No messages yet.</div>
                    )}
                    {messages.map((msg) => {
                        const isOutbound = msg.direction === "OUT";
                        const text = msg.payload?.text || "-";
                        return (
                            <div
                                key={msg.id}
                                className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                                        isOutbound
                                            ? "bg-emerald-600 text-white"
                                            : "bg-background text-foreground border"
                                    }`}
                                >
                                    <div>{text}</div>
                                    <div className="mt-1 text-[10px] opacity-70">
                                        {new Date(msg.createdAt).toLocaleTimeString()} · {msg.status}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="border-t px-5 py-4">
                    <div className="flex items-end gap-3">
                        <textarea
                            className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Type a message..."
                            value={composerText}
                            onChange={(e) => setComposerText(e.target.value)}
                            disabled={!selectedThread || sending}
                        />
                        <Button
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => selectedThread && handleSend(selectedThread.contact.id, composerText, composerAccount)}
                            disabled={!selectedThread || sending || !composerText.trim()}
                        >
                            <Send className="h-4 w-4 mr-2" />
                            Send
                        </Button>
                    </div>
                </div>
            </div>
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete Conversation"
                description={
                    selectedThread
                        ? `Delete conversation with ${selectedThread.contact.displayName || selectedThread.contact.phoneE164}?`
                        : ""
                }
                confirmLabel="Delete"
                destructive
                loading={sending}
                onConfirm={() => {
                    setDeleteOpen(false);
                    handleDeleteThread();
                }}
            />
            <ConfirmDialog
                open={deleteWithContactOpen}
                onOpenChange={setDeleteWithContactOpen}
                title="Delete Conversation + Contact"
                description={
                    selectedThread
                        ? `Delete conversation and contact ${selectedThread.contact.displayName || selectedThread.contact.phoneE164}?`
                        : ""
                }
                confirmLabel="Delete"
                destructive
                loading={sending}
                onConfirm={() => {
                    setDeleteWithContactOpen(false);
                    handleDeleteThreadWithContact();
                }}
            />
        </div>
    );
}
