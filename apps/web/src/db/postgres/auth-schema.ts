import { relations, sql } from "drizzle-orm";
import { pgTable, text, bigint, index, customType } from "drizzle-orm/pg-core";

const epochDate = customType<{ data: Date; driverData: number }>({
  dataType: () => "bigint",
  toDriver: (value) => value.getTime(),
  fromDriver: (value) => new Date(Number(value)),
});
const integerBoolean = customType<{ data: boolean; driverData: number }>({
  dataType: () => "integer",
  toDriver: (value) => (value ? 1 : 0),
  fromDriver: (value) => Number(value) === 1,
});

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integerBoolean("email_verified")
    .default(sql`0`)
    .notNull(),
  image: text("image"),
  createdAt: epochDate("created_at")
    .default(sql`(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)`)
    .notNull(),
  updatedAt: epochDate("updated_at")
    .default(sql`(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: epochDate("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: epochDate("created_at")
      .default(
        sql`(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)`,
      )
      .notNull(),
    updatedAt: epochDate("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: epochDate("access_token_expires_at"),
    refreshTokenExpiresAt: epochDate("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: epochDate("created_at")
      .default(
        sql`(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)`,
      )
      .notNull(),
    updatedAt: epochDate("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: epochDate("expires_at").notNull(),
    createdAt: epochDate("created_at")
      .default(
        sql`(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)`,
      )
      .notNull(),
    updatedAt: epochDate("updated_at")
      .default(
        sql`(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)`,
      )
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: bigint("count", { mode: "number" }).notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
