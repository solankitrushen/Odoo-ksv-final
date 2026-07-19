"use client";

import { apiFetch, ApiError } from "@/lib/backend-fetch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "store" or "admin" — controls API path */
  role: "admin" | "store";
}

export function ForgotPasswordDialog({ open, onOpenChange, role }: Props) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep("email");
    setOtp("");
    setNewPassword("");
    setLoading(false);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const sendOTP = async () => {
    setLoading(true);
    try {
      await apiFetch(`/auth/${role}/forgot-password`, {
        body: JSON.stringify({ email }),
        method: "POST",
      });
      toast.success("If account exists, OTP sent to your email");
      setStep("otp");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setLoading(true);
    try {
      await apiFetch(`/auth/${role}/reset-password`, {
        body: JSON.stringify({ email, otp, newPassword }),
        method: "POST",
      });
      toast.success("Password reset. Sign in with new password.");
      close();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(o) => {
        if (!o) close();
        else onOpenChange(o);
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {step === "email"
              ? "Enter your email. We'll send a 6-digit OTP."
              : "Enter the OTP from your email and a new password."}
          </DialogDescription>
        </DialogHeader>
        {step === "email" ? (
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block" htmlFor="fp-email">
                Email
              </Label>
              <Input
                id="fp-email"
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                value={email}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block" htmlFor="fp-otp">
                6-digit OTP
              </Label>
              <Input
                id="fp-otp"
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                value={otp}
              />
            </div>
            <div>
              <Label className="mb-1.5 block" htmlFor="fp-pw">
                New password
              </Label>
              <PasswordInput
                id="fp-pw"
                onChange={(e) => setNewPassword(e.target.value)}
                value={newPassword}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={close} variant="outline">
            Cancel
          </Button>
          {step === "email" ? (
            <Button disabled={!email || loading} onClick={sendOTP}>
              {loading ? "Sending..." : "Send OTP"}
            </Button>
          ) : (
            <Button
              disabled={otp.length !== 6 || newPassword.length < 8 || loading}
              onClick={resetPassword}
            >
              {loading ? "Resetting..." : "Reset password"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
