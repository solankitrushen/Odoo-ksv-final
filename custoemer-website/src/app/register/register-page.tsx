"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { normalizeEmail, RentalApiError } from "@/lib/rental-api";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/layout/wordmark";

type Step = "details" | "verify";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, verifyEmail, resendVerification } = useAuth();
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState({ displayName: "", email: "", password: "", phone: "" });
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const resumeStarted = useRef(false);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    const wantVerify = searchParams.get("verify") === "1";
    if (!emailParam) return;
    const normalized = normalizeEmail(emailParam);
    setForm((f) => ({ ...f, email: normalized }));
    if (!wantVerify || resumeStarted.current) return;
    resumeStarted.current = true;
    setStep("verify");
    setResending(true);
    void resendVerification(normalized)
      .then(() => {
        toast("Check your email", {
          description: "We sent a fresh verification code.",
          tone: "success",
        });
      })
      .catch((err) => {
        toast("Couldn't send code", {
          description: err instanceof RentalApiError ? err.message : "Try Resend code",
          tone: "error",
        });
      })
      .finally(() => setResending(false));
  }, [searchParams, resendVerification]);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function goVerify(resumed?: boolean) {
    setCode("");
    setStep("verify");
    toast(resumed ? "Continue verification" : "Check your email", {
      description: "We sent a 6-digit verification code. Check your inbox (and spam).",
      tone: "success",
    });
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!form.displayName.trim() || !form.email.trim() || form.password.length < 8) return;
    setSubmitting(true);
    try {
      const out = await register({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      });
      goVerify(Boolean(out.verification?.resumed));
    } catch (err) {
      toast("Registration failed", {
        description: err instanceof RentalApiError ? err.message : "Try again",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitVerify(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length < 4) return;
    setSubmitting(true);
    try {
      await verifyEmail(form.email.trim(), trimmed);
      toast("Account verified", { description: "You're all set to rent.", tone: "success" });
      router.push("/account");
    } catch (err) {
      toast("Verification failed", {
        description: err instanceof RentalApiError ? err.message : "Try again",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      await resendVerification(form.email.trim());
      setCode("");
      toast("Code resent", {
        description: "A fresh code is on its way. Check your inbox (and spam).",
        tone: "success",
      });
    } catch (err) {
      toast("Couldn't resend", {
        description: err instanceof RentalApiError ? err.message : "Try again",
        tone: "error",
      });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="container flex min-h-[80vh] items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Wordmark />
        </div>

        {step === "details" ? (
          <>
            <h1 className="mt-8 text-center text-2xl font-semibold text-ink">Create your account</h1>
            <p className="mt-2 text-center text-sm text-ink-soft">
              We&apos;ll email a 6-digit code to verify your account before you can log in.
            </p>

            <form onSubmit={submitDetails} className="mt-8 space-y-4">
              <div>
                <Label htmlFor="displayName" className="mb-1.5 block">
                  Full name
                </Label>
                <Input id="displayName" value={form.displayName} onChange={set("displayName")} required />
              </div>
              <div>
                <Label htmlFor="email" className="mb-1.5 block">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password" className="mb-1.5 block">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={set("password")}
                    autoComplete="new-password"
                    minLength={8}
                    className="pr-11"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-soft transition-colors hover:text-ink"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-ink-soft">At least 8 characters.</p>
              </div>
              <div>
                <Label htmlFor="phone" className="mb-1.5 block">
                  Phone <span className="font-normal text-ink-soft">(optional)</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder="+91"
                  autoComplete="tel"
                />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? "Creating account…" : "Create account"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-ink-soft">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-ink hover:underline">
                Log in
              </Link>
            </p>
          </>
        ) : (
          <>
            <div className="mt-8 flex justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <MailCheck className="h-6 w-6 text-ink" />
              </span>
            </div>
            <h1 className="mt-5 text-center text-2xl font-semibold text-ink">Verify your email</h1>
            <p className="mt-2 text-center text-sm text-ink-soft">
              Enter the 6-digit code we sent to{" "}
              <span className="font-medium text-ink">{form.email}</span>. Your account stays
              unverified until this step succeeds.
            </p>

            <form onSubmit={submitVerify} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="code" className="mb-1.5 block">
                  Verification code
                </Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center text-lg tracking-[0.3em]"
                  placeholder="••••••"
                  required
                />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={submitting || code.length < 4}>
                {submitting ? "Verifying…" : "Verify & continue"}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-3 text-sm text-ink-soft">
              <button
                type="button"
                onClick={resend}
                disabled={resending}
                className="font-medium text-ink hover:underline disabled:opacity-50"
              >
                {resending ? "Resending…" : "Resend code"}
              </button>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={() => {
                  setStep("details");
                  setCode("");
                }}
                className="hover:text-ink"
              >
                Change details
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
