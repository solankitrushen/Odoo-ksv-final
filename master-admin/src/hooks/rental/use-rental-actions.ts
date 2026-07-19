"use client";

import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { createIntentKey, rentalCommand } from "@/lib/rental-api";
import { labelAction } from "@/lib/rental-labels";
import type { RentalOrder, RentalStatus } from "@/lib/rental-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type RentalLifecycleAction =
  | "reserve"
  | "confirm"
  | "dispatch"
  | "confirm-delivery"
  | "issue"
  | "return"
  | "inspection"
  | "close"
  | "cancel";

const NEEDS_VERSION: RentalLifecycleAction[] = ["reserve", "confirm", "issue"];

export interface RentalActionInput {
  rentalId: string;
  action: RentalLifecycleAction;
  version?: number;
  body?: Record<string, unknown>;
}

export function useRentalAction() {
  const scope = useRentalScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rentalId, action, version, body }: RentalActionInput) => {
      const options = {
        idempotencyKey: createIntentKey(),
        ...(NEEDS_VERSION.includes(action) ? { version } : {}),
      };
      return rentalCommand<{ rental: RentalOrder }>(`/admin/rentals/${rentalId}/${action}`, "POST", body ?? {}, options);
    },
    onSuccess: (_data, { action }) => {
      toast.success(labelAction(action));
      void qc.invalidateQueries({ queryKey: ["rental", scope] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Next lifecycle verbs for this status + fulfillment method. */
export function actionsForStatus(
  status: RentalStatus,
  fulfillmentMethod?: string | null
): RentalLifecycleAction[] {
  const delivery = fulfillmentMethod === "delivery";
  switch (status) {
    case "draft":
      return ["reserve", "cancel"];
    case "reserved":
      return ["confirm", "cancel"];
    case "confirmed":
      return delivery ? ["dispatch", "cancel"] : ["issue", "cancel"];
    case "dispatch_pending":
      return ["confirm-delivery", "cancel"];
    case "dispatched":
      return ["issue"];
    case "active":
    case "overdue":
    case "return_pending":
      return ["return"];
    case "returned":
      return ["inspection"];
    case "inspection":
      // Close is only via Clear & close on the rental detail page (settles + closes).
      return [];
    default:
      return [];
  }
}
