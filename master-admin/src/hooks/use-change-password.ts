"use client";

import { apiFetch } from "@/lib/backend-fetch";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiFetch<{ message: string }>("/vb/auth/change-password", {
        body: JSON.stringify(input),
        method: "POST",
      }),
    onError: (err: Error) => toast.error(err.message || "Could not change password"),
    onSuccess: () => toast.success("Password changed"),
  });
}
