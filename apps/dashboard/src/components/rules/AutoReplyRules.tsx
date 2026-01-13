import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { authFetch } from "../../lib/api";
import { toast } from "../../lib/toast";
import {
    CheckCircle2,
    FlaskConical,
    MoreVertical,
    Pencil,
    Plus,
    Power,
    Sparkles,
    Trash2,
    Zap,
} from "lucide-react";

type Rule = {
    id: string;
    name: string;
    waAccountId: string | null;
    isActive: boolean;
    priority: number;
    patternType: "KEYWORD" | "CONTAINS" | "REGEX";
    patternValue: string;
    replyMode: "STATIC" | "WEBHOOK";
    replyPayload: any;
    webhookUrl?: string | null;
    webhookSecret?: string | null;
    cooldownSeconds?: number | null;
    timeWindow?: {
        start: string;
        end: string;
        days?: number[];
        timeZone?: string;
    } | null;
    createdAt: string;
};

export default function AutoReplyRules() {
    const [rules, setRules] = useState<Rule[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [quickCreateId, setQuickCreateId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
    const [filterAccountId, setFilterAccountId] = useState("");
    const [filterPatternType, setFilterPatternType] = useState<"all" | Rule["patternType"]>("all");
    const [sortBy, setSortBy] = useState<"priority-desc" | "priority-asc" | "name-asc" | "name-desc" | "created-desc">("priority-desc");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);
    const [testRule, setTestRule] = useState<Rule | null>(null);
    const [testText, setTestText] = useState("");
    const [testResult, setTestResult] = useState<string | null>(null);
    const [openActionId, setOpenActionId] = useState<string | null>(null);
    const [actionAnchor, setActionAnchor] = useState<HTMLButtonElement | null>(null);
    const actionMenuRef = useRef<HTMLDivElement | null>(null);
    const [actionPos, setActionPos] = useState({ top: 0, left: 0 });
    const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [waAccountId, setWaAccountId] = useState<string>("");
    const [priority, setPriority] = useState("0");
    const [patternType, setPatternType] = useState<Rule["patternType"]>("KEYWORD");
    const [patternValue, setPatternValue] = useState("");
    const [replyText, setReplyText] = useState("");
    const [replyMode, setReplyMode] = useState<Rule["replyMode"]>("STATIC");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [webhookSecret, setWebhookSecret] = useState("");
    const [cooldownSeconds, setCooldownSeconds] = useState("0");
    const [timeWindowEnabled, setTimeWindowEnabled] = useState(false);
    const [timeWindowStart, setTimeWindowStart] = useState("09:00");
    const [timeWindowEnd, setTimeWindowEnd] = useState("18:00");
    const [timeWindowDays, setTimeWindowDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [timeWindowTimeZone, setTimeWindowTimeZone] = useState("");
    const [isActive, setIsActive] = useState(true);

    const isEditing = useMemo(() => Boolean(editingId), [editingId]);

    const accountsById = useMemo(() => {
        const map = new Map<string, any>();
        accounts.forEach((a) => map.set(a.id, a));
        return map;
    }, [accounts]);

    const filteredRules = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const filtered = rules.filter((rule) => {
            if (filterStatus === "active" && !rule.isActive) return false;
            if (filterStatus === "inactive" && rule.isActive) return false;
            if (filterAccountId && rule.waAccountId !== filterAccountId) return false;
            if (filterPatternType !== "all" && rule.patternType !== filterPatternType) return false;
            if (!q) return true;
            const replyText = rule.replyPayload?.text?.toLowerCase() || "";
            return (
                rule.name.toLowerCase().includes(q) ||
                rule.patternValue.toLowerCase().includes(q) ||
                replyText.includes(q)
            );
        });
        const sorted = [...filtered];
        sorted.sort((a, b) => {
            if (sortBy === "priority-desc") return b.priority - a.priority;
            if (sortBy === "priority-asc") return a.priority - b.priority;
            if (sortBy === "name-asc") return a.name.localeCompare(b.name);
            if (sortBy === "name-desc") return b.name.localeCompare(a.name);
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        return sorted;
    }, [rules, searchQuery, filterStatus, filterAccountId, filterPatternType, sortBy]);

    const groupedRules = useMemo(() => {
        const groups = new Map<string, Rule[]>();
        filteredRules.forEach((rule) => {
            const key = rule.waAccountId || "all";
            const existing = groups.get(key) || [];
            existing.push(rule);
            groups.set(key, existing);
        });
        return Array.from(groups.entries()).sort((a, b) => {
            if (a[0] === "all") return -1;
            if (b[0] === "all") return 1;
            return a[0].localeCompare(b[0]);
        });
    }, [filteredRules]);

    const conflictDetails = useMemo(() => {
        const normalize = (value: string) => value.toLowerCase().trim().replace(/\s+/g, " ");
        const map = new Map<string, Rule[]>();
        const conflicts = new Map<string, string[]>();

        groupedRules.forEach(([groupKey, rulesInGroup]) => {
            map.clear();
            rulesInGroup.forEach((rule) => {
                const key = `${groupKey}:${rule.patternType}:${normalize(rule.patternValue)}`;
                const list = map.get(key) || [];
                list.push(rule);
                map.set(key, list);
            });

            map.forEach((list) => {
                if (list.length <= 1) return;
                list.forEach((rule) => {
                    const others = list
                        .filter((item) => item.id !== rule.id)
                        .map((item) => item.name)
                        .slice(0, 5);
                    conflicts.set(rule.id, others);
                });
            });
        });

        return conflicts;
    }, [groupedRules]);

    const presets = useMemo(
        () => [
            {
                id: "harga",
                name: "Harga Produk",
                patternType: "KEYWORD" as Rule["patternType"],
                patternValue: "harga",
                replyText: "Untuk info harga, sebutkan nama produk yang kamu cari ya.",
                priority: 10,
            },
            {
                id: "info",
                name: "Info Produk",
                patternType: "CONTAINS" as Rule["patternType"],
                patternValue: "info",
                replyText: "Boleh jelaskan produk yang kamu maksud? Kami bantu informasinya.",
                priority: 8,
            },
            {
                id: "jam",
                name: "Jam Operasional",
                patternType: "CONTAINS" as Rule["patternType"],
                patternValue: "jam",
                replyText: "Jam operasional kami: Senin–Jumat 09:00–18:00 WIB.",
                priority: 6,
            },
            {
                id: "lokasi",
                name: "Lokasi Toko",
                patternType: "CONTAINS" as Rule["patternType"],
                patternValue: "lokasi",
                replyText: "Lokasi kami di pusat kota. Balas dengan nama kota untuk detail alamat.",
                priority: 6,
            },
            {
                id: "admin",
                name: "Minta Admin",
                patternType: "CONTAINS" as Rule["patternType"],
                patternValue: "admin",
                replyText: "Baik, admin kami akan segera membalas. Mohon tunggu sebentar ya.",
                priority: 12,
            },
        ],
        []
    );

    const dayOptions = [
        { label: "Sun", value: 0 },
        { label: "Mon", value: 1 },
        { label: "Tue", value: 2 },
        { label: "Wed", value: 3 },
        { label: "Thu", value: 4 },
        { label: "Fri", value: 5 },
        { label: "Sat", value: 6 },
    ];

    const resetForm = () => {
        setEditingId(null);
        setName("");
        setWaAccountId("");
        setPriority("0");
        setPatternType("KEYWORD");
        setPatternValue("");
        setReplyText("");
        setReplyMode("STATIC");
        setWebhookUrl("");
        setWebhookSecret("");
        setCooldownSeconds("0");
        setTimeWindowEnabled(false);
        setTimeWindowStart("09:00");
        setTimeWindowEnd("18:00");
        setTimeWindowDays([1, 2, 3, 4, 5]);
        setTimeWindowTimeZone("");
        setIsActive(true);
    };

    const loadRules = async () => {
        setError(null);
            const res = await authFetch("/auto-replies");
        if (!res.ok) {
            setError("Failed to load rules.");
            return;
        }
        const json = await res.json();
        setRules(json.data || []);
    };

    const loadAccounts = async () => {
            const res = await authFetch("/wa-accounts");
        if (res.ok) {
            const json = await res.json();
            setAccounts(json.data || []);
        }
    };

    useEffect(() => {
        loadRules();
        loadAccounts();
    }, []);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const ruleName = name.trim() || "Rule";
            const actionTitle = editingId ? "Rule updated" : "Rule created";
            if (replyMode === "STATIC" && !replyText.trim()) {
                setError("Reply Text wajib diisi untuk mode STATIC.");
                return;
            }
            if (replyMode === "WEBHOOK" && !webhookUrl.trim()) {
                setError("Webhook URL wajib diisi untuk mode WEBHOOK.");
                return;
            }

            const timeWindow = timeWindowEnabled
                ? {
                    start: timeWindowStart,
                    end: timeWindowEnd,
                    days: timeWindowDays,
                    timeZone: timeWindowTimeZone || undefined,
                }
                : null;

            const payload = {
                name,
                waAccountId: waAccountId ? waAccountId : null,
                isActive,
                priority: Number(priority || 0),
                patternType,
                patternValue,
                replyMode,
                replyText: replyMode === "STATIC" ? replyText : undefined,
                webhookUrl: replyMode === "WEBHOOK" ? webhookUrl : null,
                webhookSecret: replyMode === "WEBHOOK" ? webhookSecret : null,
                cooldownSeconds: Number(cooldownSeconds || 0),
                timeWindow,
            };

            const res = await authFetch(
                editingId ? `/auto-replies/${editingId}` : "/auto-replies",
                {
                    method: editingId ? "PUT" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );

            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                setError(json?.error || "Failed to save rule.");
                return;
            }

            await loadRules();
            toast({ title: actionTitle, description: ruleName, variant: "success" });
            resetForm();
            setIsModalOpen(false);
        } catch (err) {
            console.error(err);
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (rule: Rule) => {
        setEditingId(rule.id);
        setName(rule.name);
        setWaAccountId(rule.waAccountId || "");
        setPriority(String(rule.priority ?? 0));
        setPatternType(rule.patternType);
        setPatternValue(rule.patternValue);
        setReplyMode(rule.replyMode);
        setReplyText(rule.replyMode === "STATIC" ? rule.replyPayload?.text || "" : "");
        setWebhookUrl(rule.webhookUrl || "");
        setWebhookSecret(rule.webhookSecret || "");
        setCooldownSeconds(String(rule.cooldownSeconds ?? 0));
        if (rule.timeWindow?.start && rule.timeWindow?.end) {
            setTimeWindowEnabled(true);
            setTimeWindowStart(rule.timeWindow.start);
            setTimeWindowEnd(rule.timeWindow.end);
            setTimeWindowDays(rule.timeWindow.days && rule.timeWindow.days.length > 0 ? rule.timeWindow.days : [1, 2, 3, 4, 5]);
            setTimeWindowTimeZone(rule.timeWindow.timeZone || "");
        } else {
            setTimeWindowEnabled(false);
            setTimeWindowStart("09:00");
            setTimeWindowEnd("18:00");
            setTimeWindowDays([1, 2, 3, 4, 5]);
            setTimeWindowTimeZone("");
        }
        setIsActive(rule.isActive);
        setIsModalOpen(true);
    };

    const applyPreset = (preset: (typeof presets)[number]) => {
        setEditingId(null);
        setName(preset.name);
        setWaAccountId("");
        setPriority(String(preset.priority ?? 0));
        setPatternType(preset.patternType);
        setPatternValue(preset.patternValue);
        setReplyText(preset.replyText);
        setReplyMode("STATIC");
        setWebhookUrl("");
        setWebhookSecret("");
        setCooldownSeconds("0");
        setTimeWindowEnabled(false);
        setTimeWindowStart("09:00");
        setTimeWindowEnd("18:00");
        setTimeWindowDays([1, 2, 3, 4, 5]);
        setTimeWindowTimeZone("");
        setIsActive(true);
        setIsModalOpen(true);
    };

    const quickCreate = async (preset: (typeof presets)[number]) => {
        setQuickCreateId(preset.id);
        setError(null);
        try {
            const res = await authFetch("/auto-replies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: preset.name,
                    waAccountId: null,
                    isActive: true,
                    priority: preset.priority ?? 0,
                    patternType: preset.patternType,
                    patternValue: preset.patternValue,
                    replyMode: "STATIC",
                    replyText: preset.replyText,
                }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                setError(json?.error || "Failed to create preset rule.");
                return;
            }
            await loadRules();
            toast({ title: "Preset added", description: preset.name, variant: "success" });
        } catch (err) {
            console.error(err);
            setError("Network error. Please try again.");
        } finally {
            setQuickCreateId(null);
        }
    };

    const toggleActive = async (rule: Rule) => {
        const res = await authFetch(`/auto-replies/${rule.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !rule.isActive }),
        });
        if (res.ok) {
            await loadRules();
            toast({
                title: rule.isActive ? "Rule disabled" : "Rule enabled",
                description: rule.name,
                variant: "success",
            });
        }
    };

    const openTestModal = (rule: Rule) => {
        setTestRule(rule);
        setTestText("");
        setTestResult(null);
        setIsTestModalOpen(true);
    };

    const handleTest = async () => {
        if (!testRule) return;
        const text = testText.trim();
        if (!text) {
            setTestResult("Masukkan teks untuk dites.");
            return;
        }
        try {
            const res = await authFetch(`/auto-replies/${testRule.id}/test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setTestResult(json?.error || "Test gagal.");
                return;
            }
            const match = json?.data?.match;
            const replyText = json?.data?.replyPayload?.text || "-";
            setTestResult(match ? `Match ✅ | Balasan: ${replyText}` : "Tidak match ❌");
        } catch (err) {
            console.error(err);
            setTestResult("Test gagal. Coba lagi.");
        }
    };

    const handleDelete = async (rule: Rule) => {
        const res = await authFetch(`/auto-replies/${rule.id}`, { method: "DELETE" });
        if (res.ok) {
            await loadRules();
            toast({ title: "Rule deleted", description: rule.name, variant: "success" });
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Auto-reply Rules</h1>
                    <p className="text-sm text-muted-foreground">
                        Buat rule cepat dari preset atau isi manual via modal.
                    </p>
                </div>
                <Button
                    type="button"
                    className="bg-foreground text-background hover:bg-foreground/90"
                    onClick={() => { resetForm(); setIsModalOpen(true); }}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Buat Rule Baru
                </Button>
            </div>
            <div className="rounded-md border bg-gradient-to-br from-muted/40 to-background p-5">
                <div className="text-sm font-semibold">Panduan singkat</div>
                <div className="mt-2 text-sm text-muted-foreground">
                    1) Pilih tipe pola yang paling sederhana dulu.
                    2) Gunakan prioritas tinggi untuk rule yang paling penting.
                    3) Uji pesan yang paling sering diketik pelanggan.
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <div className="rounded-md border bg-background p-2">
                        <div className="font-medium text-foreground">KEYWORD</div>
                        <div>Cocok untuk jawaban persis. Contoh: "harga"</div>
                    </div>
                    <div className="rounded-md border bg-background p-2">
                        <div className="font-medium text-foreground">CONTAINS</div>
                        <div>Cocok untuk kalimat. Contoh: "info produk"</div>
                    </div>
                    <div className="rounded-md border bg-background p-2">
                        <div className="font-medium text-foreground">REGEX</div>
                        <div>Untuk pola lanjutan. Contoh: "^promo\\s+.+".</div>
                    </div>
                </div>
            </div>

            <div className="rounded-md border p-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-sm font-medium">Preset Rules (Quick Start)</div>
                        <div className="text-xs text-muted-foreground mt-1">
                            Satu klik untuk membuat rule umum tanpa buka modal.
                        </div>
                    </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {presets.map((preset) => (
                        <div key={preset.id} className="rounded-md border p-3">
                            <div className="text-sm font-medium">{preset.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {preset.patternType} · "{preset.patternValue}"
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {preset.replyText}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => applyPreset(preset)}>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Use Preset
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                    onClick={() => quickCreate(preset)}
                                    disabled={quickCreateId === preset.id}
                                >
                                    <Zap className="h-4 w-4 mr-2" />
                                    {quickCreateId === preset.id ? "Creating..." : "Quick Create"}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-4xl h-[85vh] w-full p-0 flex flex-col gap-0 overflow-hidden">
                    <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6">
                        <DialogTitle className="pr-10">{isEditing ? "Edit Rule" : "Buat Rule Baru"}</DialogTitle>
                        <DialogDescription>
                            Pilih preset untuk mempercepat, atau isi manual untuk kebutuhan spesifik.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                        <div className="rounded-md border p-4">
                            <form id="auto-reply-form" onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium">Rule Name</label>
                                    <Input value={name} onChange={(e) => setName(e.target.value)} required />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Nama internal untuk memudahkan pengelolaan.
                                    </p>
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Applies To</label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={waAccountId}
                                        onChange={(e) => setWaAccountId(e.target.value)}
                                    >
                                        <option value="">All Accounts</option>
                                        {accounts.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.phoneE164} {a.label ? `(${a.label})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Pilih satu nomor jika rule hanya untuk akun tertentu.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="text-sm font-medium">Pattern Type</label>
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={patternType}
                                            onChange={(e) => setPatternType(e.target.value as Rule["patternType"])}
                                        >
                                            <option value="KEYWORD">Keyword (exact)</option>
                                            <option value="CONTAINS">Contains</option>
                                            <option value="REGEX">Regex</option>
                                        </select>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Keyword = harus sama persis, Contains = mengandung kata, Regex = pola lanjutan.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Priority</label>
                                        <Input
                                            type="number"
                                            min="0"
                                            value={priority}
                                            onChange={(e) => setPriority(e.target.value)}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Angka lebih besar diproses lebih dulu.
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Pattern Value</label>
                                    <Input value={patternValue} onChange={(e) => setPatternValue(e.target.value)} required />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Contoh: "harga", "info", atau pola regex seperti "^promo\\s+.+"
                                    </p>
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Reply Mode</label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={replyMode}
                                        onChange={(e) => setReplyMode(e.target.value as Rule["replyMode"])}
                                    >
                                        <option value="STATIC">Static Reply</option>
                                        <option value="WEBHOOK">Webhook</option>
                                    </select>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Gunakan Static untuk balasan langsung, Webhook untuk logika dinamis.
                                    </p>
                                </div>

                                {replyMode === "STATIC" && (
                                    <div>
                                        <label className="text-sm font-medium">Reply Text</label>
                                        <textarea
                                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            required={replyMode === "STATIC"}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Pesan balasan otomatis yang akan dikirim ke pengirim.
                                        </p>
                                    </div>
                                )}

                                {replyMode === "WEBHOOK" && (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-sm font-medium">Webhook URL</label>
                                            <Input
                                                value={webhookUrl}
                                                onChange={(e) => setWebhookUrl(e.target.value)}
                                                placeholder="https://example.com/webhook"
                                                required={replyMode === "WEBHOOK"}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium">Webhook Secret (optional)</label>
                                            <Input
                                                value={webhookSecret}
                                                onChange={(e) => setWebhookSecret(e.target.value)}
                                                placeholder="Secret untuk signature"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-sm font-medium">Cooldown (seconds)</label>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={cooldownSeconds}
                                        onChange={(e) => setCooldownSeconds(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Mencegah spam: rule tidak akan merespons lagi selama cooldown aktif.
                                    </p>
                                </div>

                                <div className="rounded-md border p-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            id="timeWindow"
                                            type="checkbox"
                                            checked={timeWindowEnabled}
                                            onChange={(e) => setTimeWindowEnabled(e.target.checked)}
                                        />
                                        <label htmlFor="timeWindow" className="text-sm font-medium">
                                            Enable Time Window
                                        </label>
                                    </div>

                                    {timeWindowEnabled && (
                                        <div className="mt-3 space-y-3">
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <div>
                                                    <label className="text-sm font-medium">Start</label>
                                                    <Input
                                                        type="time"
                                                        value={timeWindowStart}
                                                        onChange={(e) => setTimeWindowStart(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm font-medium">End</label>
                                                    <Input
                                                        type="time"
                                                        value={timeWindowEnd}
                                                        onChange={(e) => setTimeWindowEnd(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Days</label>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {dayOptions.map((day) => (
                                                        <label key={day.value} className="flex items-center gap-2 text-xs">
                                                            <input
                                                                type="checkbox"
                                                                checked={timeWindowDays.includes(day.value)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        if (!timeWindowDays.includes(day.value)) {
                                                                            setTimeWindowDays([...timeWindowDays, day.value]);
                                                                        }
                                                                    } else {
                                                                        setTimeWindowDays(timeWindowDays.filter((d) => d !== day.value));
                                                                    }
                                                                }}
                                                            />
                                                            {day.label}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Time Zone (optional)</label>
                                                <Input
                                                    value={timeWindowTimeZone}
                                                    onChange={(e) => setTimeWindowTimeZone(e.target.value)}
                                                    placeholder="Asia/Jakarta"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        id="isActive"
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={(e) => setIsActive(e.target.checked)}
                                    />
                                    <label htmlFor="isActive" className="text-sm">
                                        Active
                                    </label>
                                </div>

                                {error && <p className="text-sm text-destructive">{error}</p>}

                            </form>
                        </div>
                    </div>

                    <div className="shrink-0 border-t px-6 py-4">
                        <div className="flex items-center gap-2">
                            <Button
                                form="auto-reply-form"
                                type="submit"
                                disabled={loading}
                                className="bg-blue-600 text-white hover:bg-blue-700"
                            >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                {isEditing ? "Update Rule" : "Create Rule"}
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Test Rule</DialogTitle>
                        <DialogDescription>
                            Masukkan contoh pesan untuk melihat apakah rule cocok.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="text-sm font-medium">
                            {testRule?.name || "-"}
                        </div>
                        <textarea
                            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Contoh: info harga paket A"
                            value={testText}
                            onChange={(e) => setTestText(e.target.value)}
                        />
                        {testResult && (
                            <div className="rounded-md border bg-muted/40 p-3 text-sm">
                                {testResult}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                className="bg-sky-600 text-white hover:bg-sky-700"
                                onClick={handleTest}
                                disabled={!testRule}
                            >
                                <FlaskConical className="h-4 w-4 mr-2" />
                                Run Test
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setIsTestModalOpen(false)}>
                                Close
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
                title="Delete Rule"
                description={deleteTarget ? `Delete rule "${deleteTarget.name}"?` : ""}
                confirmLabel="Delete"
                destructive
                onConfirm={() => {
                    if (!deleteTarget) return;
                    const rule = deleteTarget;
                    setDeleteTarget(null);
                    handleDelete(rule);
                }}
            />

            <div className="rounded-md border">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <div className="text-sm font-medium">Rules List</div>
                    <div className="text-xs text-muted-foreground">{filteredRules.length} rules</div>
                </div>
                <div className="flex flex-col gap-3 px-4 py-3 border-b lg:flex-row lg:items-center">
                    <div className="flex-1">
                        <Input
                            placeholder="Search by name, pattern, or reply..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <select
                            className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "inactive")}
                        >
                            <option value="all">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        <select
                            className="flex h-10 min-w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={filterAccountId}
                            onChange={(e) => setFilterAccountId(e.target.value)}
                        >
                            <option value="">All Accounts</option>
                            {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.phoneE164} {a.label ? `(${a.label})` : ""}
                                </option>
                            ))}
                        </select>
                        <select
                            className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={filterPatternType}
                            onChange={(e) => setFilterPatternType(e.target.value as "all" | Rule["patternType"])}
                        >
                            <option value="all">All Types</option>
                            <option value="KEYWORD">Keyword</option>
                            <option value="CONTAINS">Contains</option>
                            <option value="REGEX">Regex</option>
                        </select>
                        <select
                            className="flex h-10 min-w-[170px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={sortBy}
                            onChange={(e) =>
                                setSortBy(
                                    e.target.value as
                                        | "priority-desc"
                                        | "priority-asc"
                                        | "name-asc"
                                        | "name-desc"
                                        | "created-desc"
                                )
                            }
                        >
                            <option value="priority-desc">Priority: High → Low</option>
                            <option value="priority-asc">Priority: Low → High</option>
                            <option value="name-asc">Name: A → Z</option>
                            <option value="name-desc">Name: Z → A</option>
                            <option value="created-desc">Newest First</option>
                        </select>
                    </div>
                </div>
                <div className="relative w-full overflow-auto">
                    {filteredRules.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground">
                            Tidak ada rule yang cocok. Coba ubah filter atau buat rule baru.
                        </div>
                    ) : (
                        <div className="divide-y">
                            {groupedRules.map(([groupKey, groupRules]) => {
                                const account = groupKey === "all" ? null : accountsById.get(groupKey);
                                const groupLabel = account
                                    ? `${account.phoneE164}${account.label ? ` (${account.label})` : ""}`
                                    : "All Accounts";
                                return (
                                    <div key={groupKey}>
                                        <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                                            <div className="text-sm font-medium">{groupLabel}</div>
                                            <div className="text-xs text-muted-foreground">{groupRules.length} rules</div>
                                        </div>
                                        <table className="w-full caption-bottom text-sm text-left">
                                            <thead className="[&_tr]:border-b">
                                                <tr className="border-b transition-colors hover:bg-muted/50">
                                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Name</th>
                                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Match</th>
                                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Reply</th>
                                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="[&_tr:last-child]:border-0">
                                                {groupRules.map((rule) => (
                                                    <tr key={rule.id} className="border-b transition-colors hover:bg-muted/50">
                                                        <td className="p-4 align-middle font-medium">
                                                            <div className="flex items-center gap-2">
                                                                <span>{rule.name}</span>
                                                                {conflictDetails.has(rule.id) && (
                                                                    <span className="relative inline-flex items-center group">
                                                                        <button
                                                                            type="button"
                                                                            className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700"
                                                                        >
                                                                            Conflict
                                                                        </button>
                                                                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded-md border bg-background p-3 text-xs text-muted-foreground shadow-lg opacity-0 invisible transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                                                                            <div className="font-medium text-foreground mb-1">
                                                                                Conflict details
                                                                            </div>
                                                                            <div>Pattern sama dalam scope akun yang sama.</div>
                                                                            <div className="mt-2">
                                                                                Bentrok dengan:
                                                                                <div className="mt-1 text-foreground">
                                                                                    {(conflictDetails.get(rule.id) || []).join(", ")}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 align-middle">
                                                            <div className="text-xs text-muted-foreground">{rule.patternType}</div>
                                                            <div className="text-sm">{rule.patternValue}</div>
                                                        </td>
                                                        <td className="p-4 align-middle">
                                                            <div className="text-xs text-muted-foreground">{rule.replyMode}</div>
                                                            <div
                                                                className="text-sm max-w-[260px] truncate"
                                                                title={rule.replyPayload?.text || "-"}
                                                            >
                                                                {rule.replyPayload?.text || "-"}
                                                            </div>
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                {rule.cooldownSeconds && rule.cooldownSeconds > 0 && (
                                                                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                                                        Cooldown {rule.cooldownSeconds}s
                                                                    </span>
                                                                )}
                                                                {rule.timeWindow?.start && rule.timeWindow?.end && (
                                                                    <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                                                                        Window {rule.timeWindow.start}-{rule.timeWindow.end}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 align-middle">
                                                            <span
                                                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                                    rule.isActive
                                                                        ? "bg-green-100 text-green-800"
                                                                        : "bg-red-100 text-red-800"
                                                                }`}
                                                            >
                                                                {rule.isActive ? "Active" : "Inactive"}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 align-middle text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={(event) => {
                                                                    const nextOpen = openActionId === rule.id ? null : rule.id;
                                                                    setOpenActionId(nextOpen);
                                                                    setActionAnchor(nextOpen ? (event.currentTarget as HTMLButtonElement) : null);
                                                                }}
                                                                className="text-muted-foreground hover:text-foreground"
                                                            >
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                            {openActionId === rule.id &&
                                                                createPortal(
                                                                    <div
                                                                        ref={actionMenuRef}
                                                                        className="fixed z-50 w-48 rounded-md border bg-background p-1 shadow-lg"
                                                                        style={{ top: actionPos.top, left: actionPos.left }}
                                                                    >
                                                                        <button
                                                                            type="button"
                                                                            className={`flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm ${
                                                                                rule.isActive
                                                                                    ? "text-amber-700 hover:bg-amber-50"
                                                                                    : "text-emerald-700 hover:bg-emerald-50"
                                                                            }`}
                                                                            onClick={() => {
                                                                                setOpenActionId(null);
                                                                                toggleActive(rule);
                                                                            }}
                                                                        >
                                                                            <Power className="h-4 w-4" />
                                                                            {rule.isActive ? "Turn Off" : "Turn On"}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-sky-700 hover:bg-sky-50"
                                                                            onClick={() => {
                                                                                setOpenActionId(null);
                                                                                openTestModal(rule);
                                                                            }}
                                                                        >
                                                                            <FlaskConical className="h-4 w-4" />
                                                                            Test
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                                                                            onClick={() => {
                                                                                setOpenActionId(null);
                                                                                startEdit(rule);
                                                                            }}
                                                                        >
                                                                            <Pencil className="h-4 w-4" />
                                                                            Edit
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                                                                            onClick={() => {
                                                                                setOpenActionId(null);
                                                                                setDeleteTarget(rule);
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
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
