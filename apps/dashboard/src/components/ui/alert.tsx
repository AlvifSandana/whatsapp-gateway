import * as React from "react";
import { cn } from "../../lib/utils";

type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "destructive";
};

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
    ({ className, variant = "default", ...props }, ref) => (
        <div
            ref={ref}
            role="alert"
            className={cn(
                "rounded-md border px-4 py-3 text-sm",
                variant === "destructive"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-muted bg-muted/40 text-foreground",
                className
            )}
            {...props}
        />
    )
);
Alert.displayName = "Alert";

export { Alert };
