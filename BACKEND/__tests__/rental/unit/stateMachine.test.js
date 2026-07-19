import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  canTransitionRental,
  canTransitionAsset,
  mapBorzoStatus,
  mergeShipmentStatus,
  canAdvancePayment,
} from "../../../src/Rental/services/stateMachine.js";
import { RENTAL_STATUS, ASSET_STATE, SHIPMENT_STATUS } from "../../../src/Rental/constants.js";
import { evaluateProviderOperation } from "../../../src/Rental/config.js";

describe("rental state machine", () => {
  it("valid: draft→reserved→confirmed", () => {
    expect(canTransitionRental(RENTAL_STATUS.DRAFT, RENTAL_STATUS.RESERVED)).toBe(true);
    expect(canTransitionRental(RENTAL_STATUS.RESERVED, RENTAL_STATUS.CONFIRMED)).toBe(true);
  });
  it("invalid: draft→closed", () => {
    expect(canTransitionRental(RENTAL_STATUS.DRAFT, RENTAL_STATUS.CLOSED)).toBe(false);
  });
  it("terminal has no exits", () => {
    expect(canTransitionRental(RENTAL_STATUS.CLOSED, RENTAL_STATUS.ACTIVE)).toBe(false);
  });
  it("asset available→held valid, rented→available invalid", () => {
    expect(canTransitionAsset(ASSET_STATE.AVAILABLE, ASSET_STATE.HELD)).toBe(true);
    expect(canTransitionAsset(ASSET_STATE.RENTED, ASSET_STATE.AVAILABLE)).toBe(false);
  });
});

describe("borzo status mapping + monotonic merge", () => {
  it("maps raw statuses", () => {
    expect(mapBorzoStatus("parcel_picked_up")).toBe(SHIPMENT_STATUS.PICKED_UP);
    expect(mapBorzoStatus("completed")).toBe(SHIPMENT_STATUS.DELIVERED);
    expect(mapBorzoStatus("courier_at_pickup")).toBe(SHIPMENT_STATUS.COURIER_ASSIGNED);
    expect(mapBorzoStatus("weird")).toBe(SHIPMENT_STATUS.UNKNOWN);
  });
  it("never regresses: pre-pickup after picked_up stays picked_up", () => {
    const merged = mergeShipmentStatus(SHIPMENT_STATUS.PICKED_UP, mapBorzoStatus("active"));
    expect(merged).toBe(SHIPMENT_STATUS.PICKED_UP);
  });
  it("parcel_picked_up after in_transit stays in_transit", () => {
    const merged = mergeShipmentStatus(SHIPMENT_STATUS.IN_TRANSIT, SHIPMENT_STATUS.PICKED_UP);
    expect(merged).toBe(SHIPMENT_STATUS.IN_TRANSIT);
  });
  it("nonterminal after delivered stays delivered", () => {
    const merged = mergeShipmentStatus(SHIPMENT_STATUS.DELIVERED, SHIPMENT_STATUS.IN_TRANSIT);
    expect(merged).toBe(SHIPMENT_STATUS.DELIVERED);
  });
  it("advances forward normally", () => {
    expect(mergeShipmentStatus(SHIPMENT_STATUS.BOOKED, SHIPMENT_STATUS.COURIER_ASSIGNED)).toBe(
      SHIPMENT_STATUS.COURIER_ASSIGNED
    );
  });
  it("delayed is metadata only", () => {
    expect(mergeShipmentStatus(SHIPMENT_STATUS.PICKED_UP, SHIPMENT_STATUS.DELAYED)).toBe(
      SHIPMENT_STATUS.PICKED_UP
    );
  });
});

describe("payment monotonicity", () => {
  it("captured cannot regress", () => {
    expect(canAdvancePayment("captured", "authorized")).toBe(false);
    expect(canAdvancePayment("authorized", "captured")).toBe(true);
  });
});

describe("provider enablement conjunction", () => {
  const base = {
    RENTAL_MODULE_ENABLED: process.env.RENTAL_MODULE_ENABLED,
    RENTAL_PROVIDER_ROLLOUT_MODE: process.env.RENTAL_PROVIDER_ROLLOUT_MODE,
    RENTAL_ENABLED_TENANT_IDS: process.env.RENTAL_ENABLED_TENANT_IDS,
    MSG91_ENABLED: process.env.MSG91_ENABLED,
    MSG91_AUTH_KEY: process.env.MSG91_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: process.env.MSG91_OTP_TEMPLATE_ID,
  };
  beforeEach(() => {
    for (const k of Object.keys(base)) delete process.env[k];
  });

  it("disabled mode denies everything", () => {
    process.env.RENTAL_MODULE_ENABLED = "true";
    process.env.RENTAL_PROVIDER_ROLLOUT_MODE = "disabled";
    process.env.MSG91_ENABLED = "true";
    process.env.MSG91_AUTH_KEY = "k";
    process.env.MSG91_OTP_TEMPLATE_ID = "t";
    const r = evaluateProviderOperation({ provider: "msg91", operation: "otp_send", tenantId: "t1" });
    expect(r.effectiveEnabled).toBe(false);
    expect(r.safeReasonCode).toBe("rollout_excluded");
  });

  it("all mode + valid creds → enabled", () => {
    process.env.RENTAL_MODULE_ENABLED = "true";
    process.env.RENTAL_PROVIDER_ROLLOUT_MODE = "all";
    process.env.MSG91_ENABLED = "true";
    process.env.MSG91_AUTH_KEY = "k";
    process.env.MSG91_OTP_TEMPLATE_ID = "t";
    const r = evaluateProviderOperation({ provider: "msg91", operation: "otp_send", tenantId: "t1" });
    expect(r.effectiveEnabled).toBe(true);
  });

  it("canary requires non-empty list and matching tenant", () => {
    process.env.RENTAL_MODULE_ENABLED = "true";
    process.env.RENTAL_PROVIDER_ROLLOUT_MODE = "canary";
    process.env.MSG91_ENABLED = "true";
    process.env.MSG91_AUTH_KEY = "k";
    process.env.MSG91_OTP_TEMPLATE_ID = "t";
    // empty list → excluded
    expect(evaluateProviderOperation({ provider: "msg91", operation: "otp_send", tenantId: "t1" }).effectiveEnabled).toBe(false);
    process.env.RENTAL_ENABLED_TENANT_IDS = "t1,t2";
    expect(evaluateProviderOperation({ provider: "msg91", operation: "otp_send", tenantId: "t1" }).effectiveEnabled).toBe(true);
    expect(evaluateProviderOperation({ provider: "msg91", operation: "otp_send", tenantId: "t9" }).effectiveEnabled).toBe(false);
  });

  it("missing credentials → unconfigured", () => {
    process.env.RENTAL_MODULE_ENABLED = "true";
    process.env.RENTAL_PROVIDER_ROLLOUT_MODE = "all";
    process.env.MSG91_ENABLED = "true";
    process.env.MSG91_AUTH_KEY = "k";
    // no MSG91_OTP_TEMPLATE_ID
    const r = evaluateProviderOperation({ provider: "msg91", operation: "otp_send", tenantId: "t1" });
    expect(r.effectiveEnabled).toBe(false);
    expect(r.state).toBe("unconfigured");
  });
});
