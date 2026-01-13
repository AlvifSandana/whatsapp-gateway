export const TOKEN_KEY = "wa_gateway_token";

export const getToken = () => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string) => {
    window.localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
    window.localStorage.removeItem(TOKEN_KEY);
};
