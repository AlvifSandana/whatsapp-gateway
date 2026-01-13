import { useEffect } from "react";

const STORAGE_KEY = "wa_sidebar_collapsed";

export default function SidebarController() {
    useEffect(() => {
        const body = document.body;
        const button = document.getElementById("sidebar-toggle");

        const applyState = (collapsed: boolean) => {
            if (collapsed) {
                body.setAttribute("data-sidebar", "collapsed");
            } else {
                body.removeAttribute("data-sidebar");
            }
        };

        const initial = window.localStorage.getItem(STORAGE_KEY) === "1";
        applyState(initial);

        const handleToggle = () => {
            const next = body.getAttribute("data-sidebar") !== "collapsed";
            applyState(next);
            window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        };

        if (button) {
            button.addEventListener("click", handleToggle);
        }

        const pathname = window.location.pathname.replace(/\/$/, "") || "/";
        document.querySelectorAll(".nav-item").forEach((link) => {
            const href = link.getAttribute("href");
            if (!href) return;
            const normalized = href.replace(/\/$/, "") || "/";
            if (normalized === pathname || (normalized !== "/" && pathname.startsWith(normalized))) {
                link.setAttribute("data-active", "true");
            } else {
                link.removeAttribute("data-active");
            }
        });

        return () => {
            if (button) {
                button.removeEventListener("click", handleToggle);
            }
        };
    }, []);

    return null;
}
