"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { authOtpRequest, normalizeEmail, RentalApiError } from "@/lib/rental-api";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/layout/wordmark";
import { cn } from "@/lib/utils";

type Mode = "password" | "otp";
type OtpStep = "email" | "code";

/** After 1st send: 30s; after 2nd send onward: 60s. */
function cooldownMsForSendCount(sendCount: number) {
  return sendCount <= 1 ? 30_000 : 60_000;
}

function formatCountdown(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/account";
  const { login, loginWithOtp } = useAuth();
  const [mode, setMode] = useState<Mode>("password");
  const [otpStep, setOtpStep] = useState<OtpStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Successful OTP sends in this login attempt (initial + resends). */
  const [otpSendCount, setOtpSendCount] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const cooldownLeftSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const canResend = otpStep === "code" && !sending && cooldownLeftSec === 0;

  function beginCooldown(nextSendCount: number) {
    setOtpSendCount(nextSendCount);
    setCooldownUntil(Date.now() + cooldownMsForSendCount(nextSendCount));
    setNow(Date.now());
  }

  function resetOtpFlow() {
    setOtpStep("email");
    setOtp("");
    setOtpSendCount(0);
    setCooldownUntil(0);
  }

  async function sendLoginCode(opts?: { resend?: boolean }) {
    if (!email.trim()) return;
    if (opts?.resend && !canResend) return;
    setSending(true);
    try {
      const out = await authOtpRequest(normalizeEmail(email));
      const issued = Boolean(out.issued || out.delivery === "sent" || out.devCode);

      // Do not open the code step unless a login OTP was actually issued.
      // Unverified accounts get a silent no-op — signup verification codes will NOT work here.
      if (!issued) {
        toast("Can't send a login code yet", {
          description:
            "Finish email verification from Sign up first (or use password after verifying). Login codes are different from signup codes.",
          tone: "error",
        });
        return;
      }

      setOtp("");
      setOtpStep("code");
      beginCooldown(otpSendCount + 1);
      toast(opts?.resend ? "Code resent" : "Check your email", {
        description: "We sent a login code. Use the newest email — older codes won't work.",
        tone: "success",
      });
    } catch (err) {
      toast(opts?.resend ? "Couldn't resend" : "Could not send code", {
        description: err instanceof RentalApiError ? err.message : "Try again",
        tone: "error",
      });
    } finally {
      setSending(false);
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await login(email, password);
      toast("Welcome back", { tone: "success" });
      router.push(next);
    } catch (err) {
      if (err instanceof RentalApiError && err.code === "EMAIL_NOT_VERIFIED") {
        toast("Verify your email first", {
          description: "Finish signup with the 6-digit code we emailed you.",
          tone: "error",
        });
        router.push(`/register?verify=1&email=${encodeURIComponent(normalizeEmail(email))}`);
        return;
      }
      toast("Login failed", {
        description: err instanceof RentalApiError ? err.message : "Try again",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    await sendLoginCode();
  }

  async function resendOtp() {
    await sendLoginCode({ resend: true });
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = otp.trim();
    if (!email.trim() || trimmed.length < 4) return;
    setSubmitting(true);
    try {
      await loginWithOtp(email, trimmed);
      toast("Signed in", { tone: "success" });
      router.push(next);
    } catch (err) {
      toast("Verification failed", {
        description: err instanceof RentalApiError ? err.message : "Try again",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container flex min-h-[80vh] items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <h1 className="mt-8 text-center text-2xl font-semibold text-ink">Log in to your account</h1>
        <p className="mt-2 text-center text-sm text-ink-soft">
          Track rentals, deposits, and returns in one place.
        </p>

        <div className="mt-6 flex rounded-lg border border-line p-1">
          {(["password", "otp"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                resetOtpFlow();
              }}
              className={cn(
                "flex-1 rounded-md py-2 text-sm font-medium transition-colors",
                mode === m ? "bg-ink text-primary-foreground" : "text-ink-soft hover:text-ink",
              )}
            >
              {m === "password" ? "Password" : "Email code"}
            </button>
          ))}
        </div>

        {mode === "password" ? (
          <form onSubmit={submitPassword} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email" className="mb-1.5 block">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@renton.test"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Customer@1234"
                  autoComplete="current-password"
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
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Log in"}
            </Button>
          </form>
        ) : otpStep === "email" ? (
          <form onSubmit={requestOtp} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="otp-email" className="mb-1.5 block">
                Email
              </Label>
              <Input
                id="otp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@renton.test"
                autoComplete="email"
                required
              />
              <p className="mt-2 text-xs text-ink-soft">We&apos;ll email a one-time login code.</p>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={sending}>
              {sending ? "Sending code…" : "Send login code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="mt-6 space-y-4">
            <p className="text-sm text-ink-soft">
              Code sent to <span className="font-medium text-ink">{email}</span>
            </p>
            <div>
              <Label htmlFor="otp" className="mb-1.5 block">
                6-digit code
              </Label>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-lg tracking-[0.3em]"
                placeholder="••••••"
                required
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={submitting || otp.length < 4}>
              {submitting ? "Verifying…" : "Verify & log in"}
            </Button>
            <div className="flex flex-col items-center gap-2 text-sm">
              <button
                type="button"
                onClick={resendOtp}
                disabled={!canResend}
                className="font-medium text-ink hover:underline disabled:cursor-not-allowed disabled:text-ink-soft disabled:no-underline"
              >
                {sending
                  ? "Sending…"
                  : cooldownLeftSec > 0
                    ? `Resend code in ${formatCountdown(cooldownLeftSec)}`
                    : "Resend code"}
              </button>
              <button
                type="button"
                className="text-ink-soft hover:text-ink"
                onClick={resetOtpFlow}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-soft">
          New here?{" "}
          <Link href="/register" className="font-medium text-ink hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
