import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const accounts = pgTable("stipend_accounts", {
  id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  credentialId: text("credential_id").notNull(),
  humanAddress: text("human_address").notNull().unique(),
  agentAddress: text("agent_address").notNull(),
  agentPrivateKeyHex: text("agent_private_key_hex"),
  agentRevokedAt: timestamp("agent_revoked_at", { withTimezone: true }),
  ausdBalance: numeric("ausd_balance", { precision: 20, scale: 6 })
    .notNull()
    .default("250.000000"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stipends = pgTable("stipend_policies", {
  id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  remaining: numeric("remaining", { precision: 20, scale: 6 }).notNull(),
  perPaymentCap: numeric("per_payment_cap", { precision: 20, scale: 6 }).notNull(),
  dailyCap: numeric("daily_cap", { precision: 20, scale: 6 }).notNull(),
  maxPaymentsPerHour: integer("max_payments_per_hour").notNull(),
  payeeDataApi: text("payee_data_api").notNull(),
  payeeAgent: text("payee_agent").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotes = pgTable("stipend_quotes", {
  id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  stipendId: uuid("stipend_id")
    .notNull()
    .references(() => stipends.id),
  recipient: text("recipient").notNull(),
  recipientLabel: text("recipient_label").notNull(),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  asset: text("asset").notNull(),
  assetHash: text("asset_hash").notNull(),
  purpose: text("purpose").notNull(),
  frozen: boolean("frozen").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const receipts = pgTable("stipend_receipts", {
  id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  accountId: uuid("account_id").references(() => accounts.id),
  stipendId: uuid("stipend_id").references(() => stipends.id),
  quoteId: uuid("quote_id").references(() => quotes.id),
  status: text("status").notNull(),
  reason: text("reason").notNull(),
  recipient: text("recipient").notNull(),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  asset: text("asset").notNull(),
  purpose: text("purpose").notNull(),
  injected: boolean("injected").notNull().default(false),
  constructed: boolean("constructed").notNull().default(false),
  chainId: integer("chain_id").notNull().default(10143),
  blockNumber: text("block_number"),
  txHash: text("tx_hash"),
  srcAddress: text("src_address"),
  logIndex: integer("log_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
