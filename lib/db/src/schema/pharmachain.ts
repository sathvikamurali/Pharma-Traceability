import { pgTable, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const batchMetadataCache = pgTable("batch_metadata_cache", {
  batchId: text("batch_id").primaryKey(),
  cid: text("cid").notNull(),
  name: text("name").notNull(),
  expiryDate: text("expiry_date").notNull(),
  quantity: integer("quantity").notNull(),
  composition: text("composition").notNull(),
  storageCondition: text("storage_condition").notNull(),
  manufacturerAddress: text("manufacturer_address").notNull(),
  uploadedAt: text("uploaded_at"),
  cachedAt: timestamp("cached_at").defaultNow(),
});

export const systemStatsCache = pgTable("system_stats_cache", {
  id: integer("id").primaryKey().default(1),
  totalManufacturers: integer("total_manufacturers").notNull().default(0),
  totalDistributors: integer("total_distributors").notNull().default(0),
  totalPharmacies: integer("total_pharmacies").notNull().default(0),
  totalBatches: integer("total_batches").notNull().default(0),
  totalTransfers: integer("total_transfers").notNull().default(0),
  totalSold: integer("total_sold").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Human-readable identities for on-chain participants
export const participantProfiles = pgTable("participant_profiles", {
  address: text("address").primaryKey(),          // wallet address (lowercase)
  companyName: text("company_name").notNull(),    // e.g. "Sun Pharma Ltd."
  licenseNumber: text("license_number"),          // e.g. "MH-FDA-12345"
  role: text("role").notNull(),                   // "Manufacturer" | "Distributor" | "Pharmacy"
  city: text("city"),
  registeredAt: timestamp("registered_at").defaultNow(),
});

export const insertBatchMetadataCacheSchema = createInsertSchema(batchMetadataCache).omit({ cachedAt: true });
export type InsertBatchMetadataCache = z.infer<typeof insertBatchMetadataCacheSchema>;
export type BatchMetadataCache = typeof batchMetadataCache.$inferSelect;

export const insertParticipantProfileSchema = createInsertSchema(participantProfiles).omit({ registeredAt: true });
export type InsertParticipantProfile = z.infer<typeof insertParticipantProfileSchema>;
export type ParticipantProfile = typeof participantProfiles.$inferSelect;
