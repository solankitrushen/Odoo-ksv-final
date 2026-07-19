"use client";

import { apiFetch, ApiError } from "@/lib/backend-fetch";
import {
  persistAuthFlagFromResponse,
  type AuthFlagResponse,
} from "@/lib/auth-flag-client";
import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Renton Admin";
const LOGIN_PATH = process.env.NEXT_PUBLIC_LOGIN_PATH ?? "/auth/admin/login";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const qc = useQueryClient();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiFetch<AuthFlagResponse>(LOGIN_PATH, {
        body: JSON.stringify({ email, password }),
        method: "POST",
      });
      if (!persistAuthFlagFromResponse(data)) {
        throw new Error("Login response missing auth flag");
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Welcome back");
      router.replace("/dashboard");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Login failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in to {APP_NAME}</CardTitle>
        <CardDescription>Use your account credentials.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              autoComplete="email"
              id="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              autoComplete="current-password"
              id="password"
              onChange={(e) => setPassword(e.target.value)}
              required
              value={password}
            />
          </div>
          <Button className="w-full" disabled={loading} type="submit">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
