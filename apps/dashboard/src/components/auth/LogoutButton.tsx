import { useState } from "react";
import { Button } from "../ui/button";
import { API_URL } from "../../lib/api";
import { clearToken, getToken } from "../../lib/auth";

export default function LogoutButton() {
    const [loading, setLoading] = useState(false);

    const handleLogout = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const token = getToken();
            if (token) {
                await fetch(`${API_URL}/auth/logout`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            clearToken();
            window.location.href = "/login";
        }
    };

    return (
        <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
            disabled={loading}
        >
            {loading ? "Signing out..." : "Logout"}
        </Button>
    );
}
