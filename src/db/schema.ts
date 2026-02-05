import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const calendarCache = sqliteTable("calendar_cache", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  providerId: text("provider_id").notNull(),
  calendarId: text("calendar_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  primary: integer("primary", { mode: "boolean" }).notNull().default(false),
  accessRole: text("access_role").notNull(),
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("calendar_cache_user_provider_calendar_idx").on(
    table.userId,
    table.providerId,
    table.calendarId
  ),
]);
