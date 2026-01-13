export const API_URL = "http://localhost:3000/v1";

export async function authFetch(input: string | URL, init?: RequestInit) {
    const headers = new Headers(init?.headers || {});
    if (typeof window !== "undefined") {
        const token = window.localStorage.getItem("wa_gateway_token");
        if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    const url =
        typeof input === "string" && !input.startsWith("http")
            ? `${API_URL}${input}`
            : input;
    return fetch(url, { ...init, headers });
}

export async function apiFetch(path: string, init?: RequestInit) {
    const res = await authFetch(path, init);
    if (!res.ok) {
        throw new Error(`API Error: ${res.statusText}`);
    }
    return res.json();
}
