"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RentalAdminBoundary({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isRentalAdmin, refresh } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isRentalAdmin)) queryClient.removeQueries({ queryKey: ["rental"] });
    if (!isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [isAuthenticated, isLoading, isRentalAdmin, queryClient, router]);

  if (isLoading || !isAuthenticated) {
    return <div className="grid h-screen place-items-center bg-background"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Checking operator access" /></div>;
  }
  if (!isRentalAdmin) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Alert className="max-w-lg">
          <LockKeyhole />
          <AlertTitle>Rental operator access required</AlertTitle>
          <AlertDescription className="flex flex-col gap-4">
            <p>This workspace is available only to an active administrator in the selected tenant.</p>
            <div className="flex flex-wrap gap-2"><Button onClick={refresh} variant="outline">Check access again</Button><Button onClick={() => router.replace("/auth/login")}>Return to sign in</Button></div>
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  return <>{children}</>;
}
