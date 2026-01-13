import { useEffect } from "react";
import { getToken } from "../../lib/auth";

export default function AuthGate() {
    useEffect(() => {
        const token = getToken();
        const path = window.location.pathname;
        const isLogin = path === "/login" || path === "/login/";

        if (!token && !isLogin) {
            window.location.href = "/login";
            return;
        }

        if (token && isLogin) {
            window.location.href = "/numbers";
            return;
        }
    }, []);

    return null;
}
