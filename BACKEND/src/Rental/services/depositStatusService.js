// SPEC-006 portal deposit status surface.
import { RentalOrder, RentalDepositEntry } from "../schema/index.js";
import { rentalError } from "../errors.js";
import { projectDeposit, deriveDepositStatus } from "./depositLedger.js";

export async function getDepositStatus(tenantId, rentalId, { customerId } = {}) {
  const filter = { _id: rentalId, tenantId };
  if (customerId) filter.customerId = customerId;
  const rental = await RentalOrder.findOne(filter).lean();
  if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");

  const entries = await RentalDepositEntry.find({ tenantId, rentalId }).sort({ createdAt: 1 }).lean();
  const proj = entries.length
    ? projectDeposit(entries)
    : {
        depositCollectedPaise: rental.depositCollectedPaise || 0,
        deductionsPaise: rental.deductionsPaise || 0,
        forfeitedDepositPaise: rental.forfeitedDepositPaise || 0,
        depositRefundsPendingPaise: rental.depositRefundsPendingPaise || 0,
        depositRefundsCompletedPaise: rental.depositRefundsCompletedPaise || 0,
        depositLiabilityPaise: rental.depositLiabilityPaise || 0,
        refundableDepositPaise: rental.refundableDepositPaise || 0,
      };

  const expectedDepositPaise = rental.depositSnapshot?.depositPaise || 0;
  const status = deriveDepositStatus(proj, { expectedDepositPaise });

  return {
    rentalId: String(rental._id),
    rentalNumber: rental.rentalNumber,
    status,
    expectedDepositPaise,
    ...proj,
    entries,
  };
}
