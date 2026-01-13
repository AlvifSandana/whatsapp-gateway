import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { authFetch } from "../../lib/api";
import { setToken } from "../../lib/auth";
import { toast } from "../../lib/toast";

type Mode = "login" | "register";

export default function AuthForm() {
    const [mode, setMode] = useState<Mode>("login");
    const [name, setName] = useState("");
    const [workspaceName, setWorkspaceName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const payload =
                mode === "login"
                    ? { email: email.trim(), password }
                    : {
                        name: name.trim(),
                        email: email.trim(),
                        password,
                        workspaceName: workspaceName.trim() || undefined,
                    };
            const res = await authFetch(`/auth/${mode === "login" ? "login" : "register"}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(json?.error || "Auth failed.");
                return;
            }
            const token = json?.data?.token;
            if (!token) {
                setError("No token returned.");
                return;
            }
            setToken(token);
            toast({ title: "Welcome", description: json?.data?.user?.name || "", variant: "success" });
            window.location.href = "/numbers";
        } catch (err) {
            console.error(err);
            setError("Network error.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-md rounded-2xl border bg-background p-6 shadow-sm">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xl font-semibold">
                        {mode === "login" ? "Sign in" : "Create account"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {mode === "login"
                            ? "Access your WhatsApp gateway dashboard."
                            : "Set up your workspace and start managing numbers."}
                    </div>
                </div>
            </div>
            <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
                {mode === "register" && (
                    <>
                        <Input
                            placeholder="Full name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                        <Input
                            placeholder="Workspace name"
                            value={workspaceName}
                            onChange={(e) => setWorkspaceName(e.target.value)}
                        />
                    </>
                )}
                <Input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
                <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                {error && <div className="text-sm text-destructive">{error}</div>}
                <Button
                    type="submit"
                    className="w-full bg-foreground text-background hover:bg-foreground/90"
                    disabled={loading}
                >
                    {loading ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
                </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
                {mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
                <button
                    type="button"
                    className="font-semibold text-foreground underline-offset-4 hover:underline"
                    onClick={() => setMode(mode === "login" ? "register" : "login")}
                >
                    {mode === "login" ? "Register" : "Login"}
                </button>
            </div>
        </div>
    );
}
