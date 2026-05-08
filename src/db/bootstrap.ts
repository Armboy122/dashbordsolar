import { sql } from "./client";

export async function ensureSchema() {
  await sql`create extension if not exists pgcrypto`;

  await sql`
    create table if not exists sites (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      code text,
      address text,
      capacity_kwp numeric,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists import_files (
      id uuid primary key default gen_random_uuid(),
      filename text not null,
      report_month text not null,
      status text not null default 'imported',
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists monthly_reports (
      id uuid primary key default gen_random_uuid(),
      site_id uuid references sites(id),
      site_name text not null,
      report_month text not null,
      capacity_kwp numeric,
      pv_yield_kwh numeric,
      inverter_yield_kwh numeric,
      export_kwh numeric,
      import_kwh numeric,
      specific_energy numeric,
      consumption_kwh numeric,
      self_consumption_kwh numeric,
      self_consumption_rate numeric,
      peak_power_kw numeric,
      peak_ratio numeric,
      revenue_baht numeric,
      risk_score numeric,
      risk_level text,
      reasons_json text,
      actions_json text,
      import_file_id uuid references import_files(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (site_name, report_month)
    )
  `;

  await sql`create index if not exists monthly_reports_month_idx on monthly_reports(report_month)`;

  await sql`
    create table if not exists monthly_analysis (
      id uuid primary key default gen_random_uuid(),
      site_name text not null,
      report_month text not null,
      specific_energy numeric,
      pv_yield_kwh numeric,
      peak_ratio numeric,
      peer_median_specific numeric,
      peer_percent numeric,
      prev_specific_energy numeric,
      trailing3_specific_avg numeric,
      trailing12_specific_avg numeric,
      yoy_specific_energy numeric,
      own_history_percent numeric,
      yoy_percent numeric,
      history_risk_score numeric,
      history_risk_level text,
      history_reasons_json text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (site_name, report_month)
    )
  `;

  await sql`create index if not exists monthly_analysis_month_idx on monthly_analysis(report_month)`;
}
