// Rental module entry. Exposes the /api/v1/rental router, the raw webhook router
// (mounted before express.json), and boot config assertion.
export { default as rentalRoutes } from "./routes/index.js";
export { default as rentalWebhookRoutes } from "./routes/webhooks.js";
export { assertRentalConfig, isModuleEnabled } from "./config.js";
export { transactionReadiness } from "./db/tx.js";
