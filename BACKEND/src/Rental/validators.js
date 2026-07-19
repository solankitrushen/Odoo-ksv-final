// Exact Zod request schemas. Reject unknown security-sensitive fields via strict().
import { z } from "zod";
import { PERIOD_CODES, FORFEIT_CATEGORIES } from "./constants.js";

const isoDate = z.string().datetime({ offset: true });
const paise = z.number().int().min(0);
const bps = z.number().int().min(0).max(10000);

export const customerCreate = z
  .object({
    type: z.enum(["person", "business"]).optional(),
    displayName: z.string().min(1).max(200),
    legalName: z.string().max(200).optional(),
    email: z.string().email(),
    phone: z.string().min(6).max(20),
    gstin: z.string().min(4).max(20).optional(),
    contacts: z.array(z.object({}).passthrough()).max(20).optional(),
    addresses: z.array(z.object({}).passthrough()).max(20).optional(),
    tags: z.array(z.string()).max(50).optional(),
    notes: z.string().max(2000).optional(),
    externalRef: z.string().max(120).optional(),
    /** When set with email, admin provisions portal login and sends SMTP verify code. */
    portalPassword: z.string().min(8).max(200).optional(),
  })
  .strict();

export const portalProvision = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(200),
  })
  .strict();

export const customerUpdate = z
  .object({
    type: z.enum(["person", "business"]).optional(),
    displayName: z.string().min(1).max(200).optional(),
    legalName: z.string().max(200).nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().min(6).max(20).nullable().optional(),
    gstin: z.string().min(4).max(20).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    tags: z.array(z.string()).max(50).optional(),
  })
  .strict();

export const customerStatusReason = z
  .object({
    reason: z.string().min(1).max(2000).optional(),
    version: z.number().int().optional(),
  })
  .strict();

export const categoryCreate = z
  .object({
    code: z.string().min(1).max(60),
    name: z.string().min(1).max(200),
    parentCategoryId: z.string().optional(),
    sortOrder: z.number().int().optional(),
    policies: z.object({}).passthrough().optional(),
  })
  .strict();

export const categoryUpdate = z
  .object({
    code: z.string().min(1).max(60).optional(),
    name: z.string().min(1).max(200).optional(),
    parentCategoryId: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
    policies: z.object({}).passthrough().optional(),
    version: z.number().int().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "version"), { message: "Nothing to update" });

export const productCreate = z
  .object({
    productSku: z.string().min(1).max(80),
    name: z.string().min(1).max(200),
    categoryId: z.string().optional(),
    taxClassId: z.string().min(1),
    description: z.string().max(2000).optional(),
    brand: z.string().max(120).optional(),
    images: z.array(z.string().url().max(500)).max(10).optional(),
    dimensions: z.object({}).passthrough().optional(),
    weightGrams: z.number().int().min(0).optional(),
    fulfillment: z.object({}).passthrough().optional(),
    policies: z.object({}).passthrough().optional(),
  })
  .strict();

export const productUpdate = z
  .object({
    productSku: z.string().min(1).max(80).optional(),
    name: z.string().min(1).max(200).optional(),
    categoryId: z.string().nullable().optional(),
    taxClassId: z.string().min(1).optional(),
    description: z.string().max(2000).nullable().optional(),
    brand: z.string().max(120).nullable().optional(),
    images: z.array(z.string().url().max(500)).max(10).optional(),
    dimensions: z.object({}).passthrough().nullable().optional(),
    weightGrams: z.number().int().min(0).nullable().optional(),
    fulfillment: z.object({}).passthrough().nullable().optional(),
    policies: z.object({}).passthrough().optional(),
    version: z.number().int().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "version"), { message: "Nothing to update" });

export const taxCodeCreate = z
  .object({
    code: z.string().min(1).max(40),
    name: z.string().min(1).max(200),
    rateBps: z.number().int().min(0).max(10000),
    mode: z.enum(["exclusive", "inclusive"]).optional(),
    jurisdiction: z.string().max(40).optional(),
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullable().optional(),
  })
  .strict();

export const taxCodeUpdate = z
  .object({
    code: z.string().min(1).max(40).optional(),
    name: z.string().min(1).max(200).optional(),
    rateBps: z.number().int().min(0).max(10000).optional(),
    mode: z.enum(["exclusive", "inclusive"]).optional(),
    jurisdiction: z.string().max(40).optional(),
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullable().optional(),
    version: z.number().int().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "version"), { message: "Nothing to update" });

export const variantCreate = z
  .object({
    productId: z.string().min(1),
    variantSku: z.string().min(1).max(80),
    variantSignature: z.string().max(400).optional(),
    name: z.string().min(1).max(200),
    attributes: z.object({}).passthrough().optional(),
    defaultPeriodCode: z.enum(PERIOD_CODES).optional(),
  })
  .strict();

export const variantUpdate = z
  .object({
    variantSku: z.string().min(1).max(80).optional(),
    variantSignature: z.string().max(400).optional(),
    name: z.string().min(1).max(200).optional(),
    attributes: z.object({}).passthrough().optional(),
    defaultPeriodCode: z.enum(PERIOD_CODES).optional(),
    version: z.number().int().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "version"), { message: "Nothing to update" });

export const pricelistCreate = z
  .object({
    code: z.string().min(1).max(60),
    name: z.string().min(1).max(200),
    isDefault: z.boolean().optional(),
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullable().optional(),
  })
  .strict();

export const pricelistUpdate = z
  .object({
    code: z.string().min(1).max(60).optional(),
    name: z.string().min(1).max(200).optional(),
    isDefault: z.boolean().optional(),
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullable().optional(),
    version: z.number().int().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "version"), { message: "Nothing to update" });

export const rateEntryCreate = z
  .object({
    pricelistId: z.string().min(1),
    targetType: z.enum(["variant", "product", "default"]),
    targetId: z.string().optional(),
    periodCode: z.enum(PERIOD_CODES),
    ratePaise: paise,
    minimumBillingMinutes: z.number().int().min(0).optional(),
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullable().optional(),
  })
  .strict();

export const rateEntryUpdate = z
  .object({
    ratePaise: paise.optional(),
    minimumBillingMinutes: z.number().int().min(0).optional(),
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullable().optional(),
    periodCode: z.enum(PERIOD_CODES).optional(),
    version: z.number().int().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "version"), { message: "Nothing to update" });

export const commercialPolicyCreate = z
  .object({
    scopeType: z.enum(["organization", "category", "product"]),
    scopeId: z.string().optional(),
    policyType: z.enum(["tax", "deposit", "late", "grace", "cap"]),
    policy: z.object({}).passthrough(),
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullable().optional(),
  })
  .strict();

export const assetCreate = z
  .object({
    assetCode: z.string().min(1).max(80),
    variantId: z.string().min(1),
    productId: z.string().optional(),
    serialNumber: z.string().max(120).optional(),
    condition: z.enum(["new", "excellent", "good", "fair", "damaged", "unusable"]).optional(),
    locationId: z.string().max(80).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

export const assetBatchCreate = z
  .object({ assets: z.array(assetCreate).min(1).max(200) })
  .strict();

export const assetPatch = z
  .object({
    condition: z.enum(["new", "excellent", "good", "fair", "damaged", "unusable"]).optional(),
    locationId: z.string().max(80).optional(),
    notes: z.string().max(1000).nullable().optional(),
    serialNumber: z.string().max(120).nullable().optional(),
    version: z.number().int().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "version"), { message: "Nothing to update" });

export const assetRetire = z
  .object({
    reason: z.string().max(500).optional(),
    version: z.number().int().optional(),
  })
  .strict();

export const stockQuery = z.object({
  productId: z.string().optional(),
  variantId: z.string().optional(),
  locationId: z.string().max(80).optional(),
});

export const availabilityQuery = z.object({
  variantId: z.string().min(1),
  startAt: isoDate,
  endAt: isoDate,
  quantity: z.coerce.number().int().min(1).max(1000).optional(),
  locationId: z.string().max(80).optional(),
});

export const rentalCreate = z
  .object({
    customerId: z.string().min(1),
    startAt: isoDate,
    endAt: isoDate,
    timezone: z.string().max(60).optional(),
    orderChannel: z.enum(["admin", "walk_in", "phone", "email", "external_assisted", "customer"]).optional(),
    lines: z
      .array(
        z.object({
          lineId: z.string().max(40).optional(),
          variantId: z.string().min(1),
          quantity: z.number().int().min(1).max(1000),
          periodCode: z.enum(PERIOD_CODES).optional(),
          startAt: isoDate.optional(),
          endAt: isoDate.optional(),
          locationId: z.string().max(80).optional(),
        })
      )
      .min(1),
    addresses: z.object({}).passthrough().optional(),
    fulfillment: z.object({}).passthrough().optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const reserveBody = z
  .object({
    selectedAssetIds: z.array(z.string()).max(1000).optional(),
    version: z.number().int().optional(),
  })
  .strict();

export const confirmBody = z
  .object({
    acknowledgedFingerprint: z.string().optional(),
    paymentPolicy: z.string().optional(),
    version: z.number().int().optional(),
  })
  .strict();

export const manualPaymentBody = z
  .object({
    amountPaise: paise,
    allocation: z.object({ chargePaise: paise, depositPaise: paise }),
    method: z.enum(["cash", "bank_transfer", "upi_manual", "cheque", "other_manual"]),
    reference: z.string().min(1).max(120),
    receivedAt: isoDate.optional(),
    reason: z.string().max(500).optional(),
    version: z.number().int().optional(),
  })
  .strict();

export const depositApplyBody = z
  .object({
    amountPaise: paise,
    chargeAllocations: z.array(z.object({ chargeId: z.string(), amountPaise: paise })).optional(),
    reason: z.string().min(1).max(500),
    version: z.number().int().optional(),
  })
  .strict();

export const depositForfeitBody = z
  .object({
    amountPaise: paise,
    category: z.enum(FORFEIT_CATEGORIES),
    reason: z.string().min(1).max(500),
    approvalArtifactId: z.string().min(1),
    version: z.number().int().optional(),
  })
  .strict();

export const razorpayOrderBody = z
  .object({
    amountPaise: paise,
    purpose: z.string().max(60).optional(),
    version: z.number().int().optional(),
  })
  .strict();

export const customerCheckoutConfirm = z
  .object({
    orderId: z.string().min(1).max(80),
    paymentId: z.string().min(1).max(80),
    signature: z.string().max(200).optional(),
  })
  .strict();

export const cartItemAdd = z
  .object({
    lineId: z.string().max(40).optional(),
    variantId: z.string().min(1),
    quantity: z.number().int().min(1).max(1000),
    periodCode: z.enum(PERIOD_CODES).optional(),
    startAt: isoDate,
    endAt: isoDate,
    locationId: z.string().max(80).optional(),
  })
  .strict();

export const cartItemPatch = z
  .object({
    quantity: z.number().int().min(1).max(1000).optional(),
    periodCode: z.enum(PERIOD_CODES).optional(),
    startAt: isoDate.optional(),
    endAt: isoDate.optional(),
    locationId: z.string().max(80).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const quotationTemplateCreate = z
  .object({
    code: z.string().min(1).max(40),
    name: z.string().min(1).max(200),
    headerText: z.string().max(2000).optional(),
    footerText: z.string().max(2000).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const quotationTemplatePatch = z
  .object({
    name: z.string().min(1).max(200).optional(),
    headerText: z.string().max(2000).optional(),
    footerText: z.string().max(2000).optional(),
    isDefault: z.boolean().optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const repairCreate = z
  .object({
    rentalId: z.string().min(1),
    assetId: z.string().min(1).optional(),
    notes: z.string().max(2000).optional(),
    damagePreTaxPaise: z.number().int().min(0).optional(),
  })
  .strict();

export const repairPatch = z
  .object({
    status: z.enum(["open", "in_repair", "done", "scrapped"]).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const adminRolesPatch = z
  .object({
    roles: z.array(z.enum(["admin", "manager", "officer", "vendor"])).min(1),
  })
  .strict();

export const incidentCreate = z
  .object({
    type: z.enum(["damage", "loss", "fraud", "non_return", "other"]),
    rentalId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    notes: z.string().max(2000).optional(),
    amountPaise: z.number().int().min(0).optional(),
  })
  .strict();

export const incidentResolve = z
  .object({
    status: z.enum(["resolved", "written_off", "investigating"]).optional(),
    resolution: z.string().max(2000).optional(),
    amountPaise: z.number().int().min(0).optional(),
  })
  .strict();

export const cartFulfillment = z
  .object({
    method: z.enum(["delivery", "pickup"]),
    addressId: z.string().optional(),
  })
  .strict();

export const customerSelfProfilePatch = z
  .object({
    displayName: z.string().min(1).max(200).optional(),
    phone: z.union([z.string().min(6).max(20), z.literal("")]).optional(),
  })
  .strict()
  .refine((v) => v.displayName !== undefined || v.phone !== undefined, {
    message: "Nothing to update",
  });

export const customerAddressItem = z
  .object({
    id: z.string().optional(),
    label: z.string().max(60).optional(),
    fullName: z.string().min(1).max(200),
    phone: z.string().min(6).max(20),
    line1: z.string().min(1).max(300),
    line2: z.string().max(300).optional(),
    city: z.string().min(1).max(120),
    state: z.string().min(1).max(120),
    pincode: z.string().min(4).max(20),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const customerAddressesReplace = z
  .object({
    addresses: z.array(customerAddressItem).max(20),
  })
  .strict();

export const inspectBody = z
  .object({
    damagePreTaxPaise: paise.optional(),
    damageGstPaise: paise.optional(),
    /** Admin can confirm or adjust computed late fee / late GST at inspection. */
    lateFeePaise: paise.optional(),
    lateGstPaise: paise.optional(),
    notes: z.string().max(2000).optional(),
    /** Three-angle evidence URLs (from POST .../inspection/photos or prior upload). */
    photos: z
      .object({
        front: z.string().url().max(500),
        side: z.string().url().max(500),
        back: z.string().url().max(500),
      })
      .strict(),
    outcomes: z
      .array(z.object({ assetId: z.string(), assetState: z.string(), condition: z.string().optional() }))
      .optional(),
    version: z.number().int().optional(),
  })
  .strict();

export const returnBody = z.object({ actualReturnedAt: isoDate.optional(), version: z.number().int().optional() }).strict();
export const cancelBody = z.object({ reason: z.string().min(1).max(500), version: z.number().int().optional() }).strict();

// Customer auth
export const customerRegister = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(200),
    phone: z.string().min(6).max(20).optional(),
    displayName: z.string().max(200).optional(),
    type: z.enum(["person", "business"]).optional(),
  })
  .strict();

export const customerLogin = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).strict();
export const emailVerify = z
  .object({ email: z.string().email(), code: z.string().min(4).max(8) })
  .strict();
export const emailResend = z.object({ email: z.string().email() }).strict();
export const otpRequest = z.object({ email: z.string().email() }).strict();
export const otpVerify = z.object({ email: z.string().email(), otp: z.string().min(4).max(8) }).strict();

void bps;

export function parse(schema, data) {
  return schema.parse(data);
}
