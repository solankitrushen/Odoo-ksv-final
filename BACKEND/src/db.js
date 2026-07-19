import mongoose from "mongoose";
import { logger } from "./Utils/logger.js";

function buildAtlasUri() {
  const user = process.env.MONGO_USER;
  const password = process.env.MONGO_PASSWORD;
  const cluster = process.env.MONGO_CLUSTER;
  const dbName = process.env.MONGO_DB_NAME || "instacafe";

  if (!user || !password || !cluster) {
    return null;
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);

  return `mongodb+srv://${encodedUser}:${encodedPassword}@${cluster}/${dbName}?retryWrites=true&w=majority&appName=Cluster0`;
}

export function getMongoUri() {
  const direct = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (direct?.trim()) {
    return direct.trim();
  }
  return buildAtlasUri();
}

export async function connectDB() {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error(
      "MongoDB not configured: set MONGODB_URI (or MONGO_URL), or MONGO_USER + MONGO_PASSWORD + MONGO_CLUSTER"
    );
  }

  mongoose.set("strictQuery", true);

  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    serverApi: {
      version: "1",
      strict: true,
      deprecationErrors: true,
    },
  });

  logger.info("MongoDB connected", {
    host: conn.connection.host,
    db: conn.connection.name,
  });
  return conn;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
}

/** Fire-and-forget connect for index.js boot. */
export function connectToMongo() {
  connectDB().catch((err) => {
    logger.error("MongoDB connection failed", { error: err.message });
    process.exit(1);
  });
  return mongoose.connection;
}
