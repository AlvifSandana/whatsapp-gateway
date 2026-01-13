import { useEffect, useRef, useState } from "react";
import { onToast } from "../../lib/toast";

type ToastItem = {
    id: string;
    title?: string;
    description?: string;
    variant?: "default" | "success" | "error" | "warning";
    duration?: number;
};

const variantStyles: Record<string, string> = {
    default: "border-muted bg-background text-foreground",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-red-200 bg-red-50 text-red-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
};

export default function ToastHost() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const timeoutsRef = useRef(new Map<string, number>());

    useEffect(() => {
        if (typeof window === "undefined") return;
        return onToast((detail) => {
            setToasts((prev) => [...prev, detail]);
            const duration = detail.duration ?? 4000;
            const timeoutId = window.setTimeout(() => {
                setToasts((prev) => prev.filter((toast) => toast.id !== detail.id));
                timeoutsRef.current.delete(detail.id);
            }, duration);
            timeoutsRef.current.set(detail.id, timeoutId);
        });
    }, []);

    const dismiss = (id: string) => {
        const timeoutId = timeoutsRef.current.get(id);
        if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutsRef.current.delete(id);
        }
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    };

    if (toasts.length === 0) return null;

    return (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex max-w-sm flex-col gap-3">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg ${variantStyles[toast.variant || "default"]}`}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            {toast.title && <div className="text-sm font-semibold">{toast.title}</div>}
                            {toast.description && (
                                <div className="text-xs text-muted-foreground">{toast.description}</div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => dismiss(toast.id)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                        >
                            Close
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
