import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";

type Message = {
    id: string;
    status: string;
    payload: any;
    createdAt: string;
    direction: string;
};

type Props = {
    contactId: string;
};

export default function ContactMessages({ contactId }: Props) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchMessages = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await authFetch(`/contacts/${contactId}/messages`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(json?.error || "Failed to load messages.");
                return;
            }
            setMessages(json.data || []);
        } catch (err) {
            console.error(err);
            setError("Network error.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMessages();
        const interval = setInterval(fetchMessages, 5000);
        return () => clearInterval(interval);
    }, [contactId]);

    return (
        <div className="rounded-md border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="text-sm font-medium">Messages</div>
                <div className="text-xs text-muted-foreground">{messages.length} total</div>
            </div>
            <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm text-left">
                    <thead className="[&_tr]:border-b">
                        <tr className="border-b transition-colors hover:bg-muted/50">
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Direction</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Message</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Sent At</th>
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {loading && (
                            <tr>
                                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                    Loading...
                                </td>
                            </tr>
                        )}
                        {!loading && error && (
                            <tr>
                                <td colSpan={4} className="p-4 text-center text-destructive">
                                    {error}
                                </td>
                            </tr>
                        )}
                        {!loading && !error && messages.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                    No messages found.
                                </td>
                            </tr>
                        )}
                        {messages.map((msg) => (
                            <tr key={msg.id} className="border-b transition-colors hover:bg-muted/50">
                                <td className="p-4 align-middle text-xs text-muted-foreground">{msg.direction}</td>
                                <td className="p-4 align-middle text-sm">
                                    <div className="max-w-[320px] truncate" title={msg.payload?.text || "-"}>
                                        {msg.payload?.text || "-"}
                                    </div>
                                </td>
                                <td className="p-4 align-middle">
                                    <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                            msg.status === "READ"
                                                ? "bg-green-100 text-green-800"
                                                : msg.status === "DELIVERED"
                                                  ? "bg-blue-100 text-blue-800"
                                                  : msg.status === "SENT"
                                                    ? "bg-yellow-100 text-yellow-800"
                                                    : "bg-gray-100 text-gray-800"
                                        }`}
                                    >
                                        {msg.status}
                                    </span>
                                </td>
                                <td className="p-4 align-middle text-xs text-muted-foreground">
                                    {new Date(msg.createdAt).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
