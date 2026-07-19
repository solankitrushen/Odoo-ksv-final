import "../src/Utils/nodeCompat.js";
import mongoose from "mongoose";
import { jest, beforeAll, afterAll, afterEach } from "@jest/globals";

const TEST_DB =
  process.env.MONGODB_TEST_URI ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/instacafe_test";

beforeAll(async () => {
  process.env.MONGODB_URI = TEST_DB;
  process.env.MONGO_URL = TEST_DB;
  process.env.JWT_SECRET = "test_jwt_secret_minimum_32_characters_long";
  process.env.LEGACY_JWT_SECRET =
    "test_legacy_secret_minimum_32_chars_distinct";
  process.env.LEGACY_JWT_EXPIRE = "1h";
  process.env.JWT_EXPIRE = "1h";
  process.env.REFRESH_TOKEN_EXPIRE = "7d";
  process.env.NODE_ENV = "test";
  process.env.BCRYPT_ROUNDS = "4";
  process.env.ADMIN_EMAIL = "admin@test.com";
  process.env.ADMIN_PASSWORD = "Admin@Test123";
  process.env.ORDER_AUTO_PAYMENT_SUCCESS = "true";
  process.env.CSRF_DISABLED = "true";
  process.env.DELIVERY_OTP_DELIVERY_CHANNEL = "console";
  // Rental: allow the non-transactional fallback so workflow tests pass on a
  // standalone dev MongoDB. On a replica set the flag is a no-op (real
  // transactions are used); fail-closed behavior is covered separately.
  process.env.RENTAL_MODULE_ENABLED = "true";
  process.env.RENTAL_ALLOW_NON_TX = "true";
});

afterEach(async () => {
  process.env.ORDER_AUTO_PAYMENT_SUCCESS = "true";
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
});

export { jest };
