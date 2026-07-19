"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useChangePassword } from "@/hooks/use-change-password";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const change = useChangePassword();

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const submit = async () => {
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords do not match");
      return;
    }
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      reset();
      onOpenChange(false);
    } catch {
      /* toast handled in hook */
    }
  };

  return (
    <Dialog
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Update your admin account password.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block" htmlFor="cur-pw">
              Current password
            </Label>
            <PasswordInput id="cur-pw" onChange={(e) => setCurrent(e.target.value)} value={current} />
          </div>
          <div>
            <Label className="mb-1.5 block" htmlFor="new-pw">
              New password
            </Label>
            <PasswordInput
              id="new-pw"
              onChange={(e) => setNext(e.target.value)}
              placeholder="At least 8 characters"
              value={next}
            />
          </div>
          <div>
            <Label className="mb-1.5 block" htmlFor="confirm-pw">
              Confirm new password
            </Label>
            <PasswordInput id="confirm-pw" onChange={(e) => setConfirm(e.target.value)} value={confirm} />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={change.isPending} onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={change.isPending || !current || !next || !confirm} onClick={submit}>
            {change.isPending ? "Saving…" : "Change password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
