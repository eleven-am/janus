import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { config } from "@/config/index.js";
import * as authSchema from "./auth.schema.js";
import * as schema from "./schema.js";

const sqlite = new Database(config.DATABASE_PATH);

export const db = drizzle(sqlite, { schema: { ...authSchema, ...schema } });

migrate(db, { migrationsFolder: "./drizzle" });
