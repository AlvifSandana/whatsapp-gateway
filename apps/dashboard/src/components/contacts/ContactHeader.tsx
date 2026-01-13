import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";

type Contact = {
    id: string;
    phoneE164: string;
    displayName?: string | null;
};

type Props = {
    contactId: string;
};

export default function ContactHeader({ contactId }: Props) {
    const [contact, setContact] = useState<Contact | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await authFetch(`/contacts/${contactId}`);
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    setContact(json.data || null);
                }
            } catch (err) {
                console.error(err);
            }
        };
        load();
    }, [contactId]);

    return (
        <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">
                {contact?.displayName || contact?.phoneE164 || "Contact"}
            </h1>
            {contact?.phoneE164 && (
                <p className="text-sm text-muted-foreground">{contact.phoneE164}</p>
            )}
        </div>
    );
}
