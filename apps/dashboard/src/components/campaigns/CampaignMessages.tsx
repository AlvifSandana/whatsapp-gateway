import { useEffect, useMemo, useState } from "react";
import { API_URL, authFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";

type Message = {
    id: string;
    status: string;
    payload: any;
    createdAt: string;
    contact: {
        phoneE164: string;
        displayName?: string | null;
    };
    events: { event: string; createdAt: string }[];
};

type Props = {
    campaignId: string;
};

export default function CampaignMessages({ campaignId }: Props) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMessages = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await authFetch(`/campaigns/${campaignId}/messages`);
            if (!res.ok) {
                setError("Failed to load messages.");
                return;
            }
            const json = await res.json();
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
    }, [campaignId]);

    useEffect(() => {
        const token = getToken();
        const evtSource = new EventSource(
            token ? `${API_URL}/events?token=${encodeURIComponent(token)}` : `${API_URL}/events`
        );
        evtSource.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type !== "messages.status") return;
                if (payload.payload?.sourceCampaignId !== campaignId) return;

                const { messageId, status, timestamp } = payload.payload;
                setMessages((prev) =>
                    prev.map((msg) => {
                        if (msg.id !== messageId) return msg;
                        const nextEvents = [
                            { event: status, createdAt: timestamp },
                            ...msg.events,
                        ];
                        return { ...msg, status, events: nextEvents };
                    })
                );
            } catch (err) {
                console.error("SSE Parse Error", err);
            }
        };

        return () => {
            evtSource.close();
        };
    }, [campaignId]);

    const normalized = useMemo(() => {
        return messages.map((msg) => {
            const eventLabels = msg.events.map((e) => e.event);
            const latest = eventLabels[0] || msg.status;
            return { ...msg, latest };
        });
    }, [messages]);

    return (
        <div className="rounded-md border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="text-sm font-medium">Messages</div>
                <div className="text-xs text-muted-foreground">
                    {messages.length} total
                </div>
            </div>
            <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm text-left">
                    <thead className="[&_tr]:border-b">
                        <tr className="border-b transition-colors hover:bg-muted/50">
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Recipient</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Message</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Timeline</th>
                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Sent At</th>
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {loading && (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                    Loading...
                                </td>
                            </tr>
                        )}
                        {!loading && error && (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-destructive">
                                    {error}
                                </td>
                            </tr>
                        )}
                        {!loading && !error && normalized.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                    No messages found.
                                </td>
                            </tr>
                        )}
                        {normalized.map((msg) => (
                            <tr key={msg.id} className="border-b transition-colors hover:bg-muted/50">
                                <td className="p-4 align-middle">
                                    <div className="font-medium">{msg.contact.phoneE164}</div>
                                    {msg.contact.displayName && (
                                        <div className="text-xs text-muted-foreground">{msg.contact.displayName}</div>
                                    )}
                                </td>
                                <td className="p-4 align-middle text-sm">
                                    <div className="max-w-[320px] truncate" title={msg.payload?.text || "-"}>
                                        {msg.payload?.text || "-"}
                                    </div>
                                </td>
                                <td className="p-4 align-middle">
                                    <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                            msg.latest === "READ"
                                                ? "bg-green-100 text-green-800"
                                                : msg.latest === "DELIVERED"
                                                  ? "bg-blue-100 text-blue-800"
                                                  : msg.latest === "SENT"
                                                    ? "bg-yellow-100 text-yellow-800"
                                                    : "bg-gray-100 text-gray-800"
                                        }`}
                                    >
                                        {msg.latest}
                                    </span>
                                </td>
                                <td className="p-4 align-middle text-xs text-muted-foreground">
                                    {msg.events.length === 0 ? (
                                        <span>-</span>
                                    ) : (
                                        <div className="space-y-1">
                                            {msg.events.slice(0, 3).map((event, idx) => (
                                                <div key={`${msg.id}-${idx}`}>
                                                    {event.event} · {new Date(event.createdAt).toLocaleTimeString()}
                                                </div>
                                            ))}
                                        </div>
                                    )}
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
