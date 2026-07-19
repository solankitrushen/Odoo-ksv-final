"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 p-6">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          {message ? <p className="mt-1 text-sm text-muted-foreground">{message}</p> : null}
        </div>
        {onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
