export type ToastVariant = "default" | "success" | "error" | "warning";

export type ToastInput = {
    title?: string;
    description?: string;
    variant?: ToastVariant;
    duration?: number;
};

type ToastDetail = ToastInput & { id: string };

const EVENT_NAME = "wa:toast";

const createId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const toast = (input: ToastInput) => {
    if (typeof window === "undefined") return;
    const detail: ToastDetail = {
        id: createId(),
        variant: "default",
        duration: 4000,
        ...input,
    };
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
};

export const onToast = (handler: (detail: ToastDetail) => void) => {
    const listener = (event: Event) => {
        const custom = event as CustomEvent<ToastDetail>;
        if (!custom.detail) return;
        handler(custom.detail);
    };
    window.addEventListener(EVENT_NAME, listener);
    return () => window.removeEventListener(EVENT_NAME, listener);
};
