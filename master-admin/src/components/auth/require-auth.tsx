"use client";

import { useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="grid h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Checking session" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
