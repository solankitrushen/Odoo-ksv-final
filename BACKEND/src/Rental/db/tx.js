// SPEC-RMS-001 transaction topology: fail closed with TRANSACTION_REQUIRED when
// the Mongo deployment cannot provide transactions. No unsafe fallback path.
import mongoose from "mongoose";
import { rentalError } from "../errors.js";

let _txCapable = null;

/** Probe (and cache) whether the current topology supports transactions. */
export async function supportsTransactions(force = false) {
  if (_txCapable !== null && !force) return _txCapable;
  const conn = mongoose.connection;
  if (conn.readyState !== 1) {
    _txCapable = false;
    return false;
  }
  const session = await conn.startSession();
  try {
    await session.withTransaction(async () => {
      await conn.db.collection("_rental_tx_probe").findOne({ _p: 1 }, { session });
    });
    _txCapable = true;
  } catch {
    _txCapable = false;
  } finally {
    await session.endSession();
  }
  return _txCapable;
}

export function resetTxCapabilityCache() {
  _txCapable = null;
}

/**
 * Run fn inside a Mongo transaction. Root behavior: when the topology supports
 * transactions, all writes commit atomically. When it does not:
 *  - production → fail closed with TRANSACTION_REQUIRED (no unsafe path);
 *  - dev/test with RENTAL_ALLOW_NON_TX=true → run without a session as an
 *    explicitly-opted-in working fallback for standalone MongoDB (NOT atomic).
 * fn receives the session (or null in the fallback) and passes it to writes.
 */
export async function withRentalTransaction(fn) {
  const capable = await supportsTransactions();
  if (capable) {
    const session = await mongoose.connection.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = await fn(session);
      });
    } finally {
      await session.endSession();
    }
    return result;
  }
  if (allowNonTransactional()) {
    // Authorized dev fallback: sequential writes without a session.
    return fn(null);
  }
  throw rentalError("TRANSACTION_REQUIRED", "Mongo transactions unavailable for this command");
}

function allowNonTransactional() {
  return process.env.NODE_ENV !== "production" && process.env.RENTAL_ALLOW_NON_TX === "true";
}

/** Readiness snapshot for /ready. */
export async function transactionReadiness() {
  const conn = mongoose.connection;
  const connected = conn.readyState === 1;
  const txn = connected ? await supportsTransactions(true) : false;
  return { connected, transactions: txn };
}
