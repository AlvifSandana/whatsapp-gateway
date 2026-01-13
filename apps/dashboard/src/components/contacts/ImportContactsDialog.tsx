import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { authFetch } from "../../lib/api";
import { toast } from "../../lib/toast";

type Job = {
    id: string;
    status: string;
    filename: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    rows: {
        rowNo: number;
        normalizedPhone: string | null;
        normalizedName: string | null;
        tags: string[];
        isValid: boolean;
        error: string | null;
    }[];
};

export default function ImportContactsDialog() {
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<"UPLOAD" | "PREVIEW" | "DONE">("UPLOAD");
    const [jobId, setJobId] = useState<string | null>(null);
    const [job, setJob] = useState<Job | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showValidOnly, setShowValidOnly] = useState(false);
    const [hasNotifiedDone, setHasNotifiedDone] = useState(false);

    const fetchJob = async (id: string) => {
        const res = await authFetch(`/contacts/import/${id}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            setError(json?.error || "Failed to load job.");
            return;
        }
        setJob(json.data);
        if (json?.data?.status === "DONE") {
            setStep("DONE");
            if (!hasNotifiedDone) {
                toast({
                    title: "Import finished",
                    description: `${json.data.validRows} contacts added`,
                    variant: "success",
                });
                setHasNotifiedDone(true);
            }
        }
        if (json?.data?.status === "FAILED") {
            setError("Import failed. Please try again.");
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await authFetch("/contacts/import", {
                method: "POST",
                body: formData,
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(json?.error || "Import failed");
                return;
            }
            setJobId(json?.data?.jobId);
            await fetchJob(json?.data?.jobId);
            setStep("PREVIEW");
            toast({
                title: "Import queued",
                description: "Validating CSV in the background.",
                variant: "default",
            });
        } catch (e) {
            console.error(e);
            setError("Error importing");
        } finally {
            setLoading(false);
        }
    };

    const handleCommit = async () => {
        if (!jobId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await authFetch(`/contacts/import/${jobId}/commit`, {
                method: "POST",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(json?.error || "Commit failed");
                return;
            }
            await fetchJob(jobId);
        } catch (e) {
            console.error(e);
            setError("Error committing");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) {
            setFile(null);
            setLoading(false);
            setStep("UPLOAD");
            setJobId(null);
            setJob(null);
            setError(null);
            setShowValidOnly(false);
            setHasNotifiedDone(false);
        }
    }, [open]);

    useEffect(() => {
        if (!open || !jobId) return;
        if (step === "UPLOAD") return;
        const interval = setInterval(() => {
            fetchJob(jobId);
        }, 2000);
        return () => clearInterval(interval);
    }, [open, jobId, step]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">Import CSV</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Import Contacts</DialogTitle>
                    <DialogDescription>
                        Upload a CSV with columns: name, phone, tags
                    </DialogDescription>
                </DialogHeader>

                {step === "UPLOAD" && (
                    <div className="grid gap-4 py-4">
                        <Input
                            type="file"
                            accept=".csv"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>
                )}

                {step === "PREVIEW" && job && (
                    <div className="space-y-4 py-2">
                        <div className="rounded-md border p-3 text-sm">
                            <div>File: {job.filename}</div>
                            <div className="text-muted-foreground">
                                Total: {job.totalRows} · Valid: {job.validRows} · Invalid: {job.invalidRows} · Duplicates: {job.duplicateRows}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Status: <span className="text-foreground">{job.status}</span>
                            </div>
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-emerald-600"
                                    style={{
                                        width:
                                            job.totalRows > 0
                                                ? `${Math.round((job.validRows / job.totalRows) * 100)}%`
                                                : "0%",
                                    }}
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={showValidOnly}
                                    onChange={(e) => setShowValidOnly(e.target.checked)}
                                />
                                Show valid rows only
                            </label>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                    if (!jobId) return;
                                    try {
                                        const res = await authFetch(`/contacts/import/${jobId}/invalid.csv`);
                                        if (!res.ok) {
                                            setError("Failed to download invalid rows.");
                                            return;
                                        }
                                        const blob = await res.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const link = document.createElement("a");
                                        link.href = url;
                                        link.download = `invalid-contacts-${jobId}.csv`;
                                        document.body.appendChild(link);
                                        link.click();
                                        link.remove();
                                        window.URL.revokeObjectURL(url);
                                        toast({
                                            title: "Invalid rows downloaded",
                                            description: `invalid-contacts-${jobId}.csv`,
                                            variant: "success",
                                        });
                                    } catch (err) {
                                        console.error(err);
                                        setError("Failed to download invalid rows.");
                                    }
                                }}
                            >
                                Download Invalid CSV
                            </Button>
                        </div>
                        <div className="rounded-md border p-3">
                            <div className="text-sm font-medium mb-2">Preview (first 20 rows)</div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                                {job.rows
                                    .filter((row) => (showValidOnly ? row.isValid : true))
                                    .map((row) => (
                                        <div key={row.rowNo} className="flex items-center justify-between gap-2">
                                            <div>
                                                #{row.rowNo} {row.normalizedPhone || "-"} {row.normalizedName ? `(${row.normalizedName})` : ""}
                                                {row.tags.length > 0 ? ` · ${row.tags.join(", ")}` : ""}
                                            </div>
                                            {!row.isValid && (
                                                <span className="text-red-600">{row.error}</span>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>
                )}

                {step === "DONE" && (
                    <div className="py-4 text-sm text-muted-foreground">
                        Import selesai. Kontak baru sudah ditambahkan.
                    </div>
                )}

                <DialogFooter>
                    {step === "UPLOAD" && (
                        <Button onClick={handleUpload} disabled={!file || loading}>
                            {loading ? "Validating..." : "Upload & Validate"}
                        </Button>
                    )}
                    {step === "PREVIEW" && (
                        <Button
                            onClick={handleCommit}
                            disabled={loading || !job || job.validRows === 0 || job.status !== "READY"}
                        >
                            {loading || job.status === "COMMITTING" ? "Committing..." : "Commit Import"}
                        </Button>
                    )}
                    {step === "DONE" && (
                        <Button onClick={() => { setOpen(false); window.location.reload(); }}>
                            Close
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
