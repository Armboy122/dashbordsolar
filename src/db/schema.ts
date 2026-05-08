import { index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    code: text("code"),
    address: text("address"),
    capacityKwp: numeric("capacity_kwp"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex("sites_name_unique").on(table.name),
  }),
);

export const importFiles = pgTable("import_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  reportMonth: text("report_month").notNull(),
  status: text("status").notNull().default("imported"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const monthlyReports = pgTable(
  "monthly_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").references(() => sites.id),
    siteName: text("site_name").notNull(),
    reportMonth: text("report_month").notNull(),
    capacityKwp: numeric("capacity_kwp"),
    pvYieldKwh: numeric("pv_yield_kwh"),
    inverterYieldKwh: numeric("inverter_yield_kwh"),
    exportKwh: numeric("export_kwh"),
    importKwh: numeric("import_kwh"),
    specificEnergy: numeric("specific_energy"),
    consumptionKwh: numeric("consumption_kwh"),
    selfConsumptionKwh: numeric("self_consumption_kwh"),
    selfConsumptionRate: numeric("self_consumption_rate"),
    peakPowerKw: numeric("peak_power_kw"),
    peakRatio: numeric("peak_ratio"),
    revenueBaht: numeric("revenue_baht"),
    riskScore: numeric("risk_score"),
    riskLevel: text("risk_level"),
    importFileId: uuid("import_file_id").references(() => importFiles.id),
    reasonsJson: text("reasons_json"),
    actionsJson: text("actions_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    siteMonthUnique: uniqueIndex("monthly_reports_site_month_unique").on(table.siteName, table.reportMonth),
    reportMonthIndex: index("monthly_reports_month_idx").on(table.reportMonth),
  }),
);
