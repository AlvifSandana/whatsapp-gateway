import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";
import { Input } from "./input";

type PromptDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: React.ReactNode;
    inputLabel?: string;
    placeholder?: string;
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    loading?: boolean;
    onConfirm: (value: string) => void;
};

const PromptDialog = ({
    open,
    onOpenChange,
    title,
    description,
    inputLabel,
    placeholder,
    defaultValue = "",
    confirmLabel = "Save",
    cancelLabel = "Cancel",
    loading = false,
    onConfirm,
}: PromptDialogProps) => {
    const [value, setValue] = React.useState(defaultValue);

    React.useEffect(() => {
        if (open) {
            setValue(defaultValue);
        }
    }, [open, defaultValue]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onConfirm(value);
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        {description ? <DialogDescription>{description}</DialogDescription> : null}
                    </DialogHeader>
                    <div className="mt-4 space-y-2">
                        {inputLabel ? (
                            <label className="text-xs font-medium text-muted-foreground">{inputLabel}</label>
                        ) : null}
                        <Input
                            value={value}
                            placeholder={placeholder}
                            onChange={(event) => setValue(event.target.value)}
                            autoFocus
                        />
                    </div>
                    <DialogFooter className="mt-6">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                            {cancelLabel}
                        </Button>
                        <Button
                            type="submit"
                            className="bg-foreground text-background hover:bg-foreground/90"
                            disabled={loading}
                        >
                            {confirmLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export { PromptDialog };
