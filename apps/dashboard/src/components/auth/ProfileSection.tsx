import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../../lib/api";
import LogoutButton from "./LogoutButton";

type User = {
    name?: string;
    email?: string;
};

export default function ProfileSection() {
    const [user, setUser] = useState<User | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await authFetch("/auth/me");
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    setUser(json?.data?.user || null);
                }
            } catch (err) {
                console.error(err);
            }
        };
        load();
    }, []);

    const initials = useMemo(() => {
        const name = (user?.name || user?.email || "User").trim();
        if (!name) return "U";
        const parts = name.split(/\s+/).filter(Boolean);
        const first = parts[0]?.[0] || "U";
        const second = parts.length > 1 ? parts[1]?.[0] : "";
        return (first + second).toUpperCase();
    }, [user]);

    return (
        <div className="sidebar-profile rounded-md border bg-background/80 p-3">
            <button
                type="button"
                className="sidebar-profile-toggle flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left hover:bg-muted"
                onClick={() => setOpen((prev) => !prev)}
            >
                <div className="flex items-center gap-3">
                    <div className="sidebar-avatar inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
                        {initials}
                    </div>
                    <div className="sidebar-profile-details">
                        <div className="text-sm font-medium">
                            {user?.name || "User"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {user?.email || "-"}
                        </div>
                    </div>
                </div>
                <span className="sidebar-profile-caret text-xs text-muted-foreground">
                    {open ? "▲" : "▼"}
                </span>
            </button>
            {open && (
                <div className="sidebar-profile-body mt-3 grid gap-2">
                    <a
                        href="/settings/team"
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                    >
                        Profile Settings
                    </a>
                    <LogoutButton />
                </div>
            )}
        </div>
    );
}
