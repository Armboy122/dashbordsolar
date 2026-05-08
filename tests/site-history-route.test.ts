import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.hoisted(() => vi.fn());
const withTimeoutMock = vi.hoisted(() => vi.fn());

vi.mock("../src/db/client", () => ({
  sql: sqlMock,
}));

vi.mock("../src/lib/async-timeout", () => ({
  withTimeout: withTimeoutMock,
}));

import { GET } from "../app/api/sites/history/route";

describe("site history route", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    withTimeoutMock.mockReset();
  });

  it("returns mapped history rows on success", async () => {
    const dbRows = [
      {
        report_month: "2024-02",
        site_name: "สิตี",
        capacity_kwp: 100,
        inverter_yield_kwh: 90,
        pv_yield_kwh: 95,
        specific_energy: 0.95,
        export_kwh: 5,
        import_kwh: 3,
        consumption_kwh: 30,
        self_consumption_kwh: 20,
        self_consumption_rate: 0.66,
        peak_power_kw: 60,
        peak_ratio: 0.88,
        risk_score: 3,
        risk_level: "normal",
        reasons_json: '["ok"]',
        actions_json: '["none"]',
      },
    ];

    sqlMock.mockReturnValue({});
    withTimeoutMock.mockResolvedValue(dbRows);

    const response = await GET(new Request("http://localhost/api/sites/history?site=%E0%B8%AA%E0%B8%B4%E0%B8%95%E0%B8%B5"));
    const payload = (await response.json()) as {
      ok: boolean;
      site: string;
      rows: Array<{ reportMonth: string; siteName: string; peakRatio: number | null }>;
      noData: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      site: "สิตี",
      noData: false,
      rows: [
        {
          reportMonth: "2024-02",
          siteName: "สิตี",
          peakRatio: 0.88,
        },
      ],
    });
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(sqlMock.mock.calls[0][1]).toBe("สิตี");
    expect(withTimeoutMock).toHaveBeenCalledWith(expect.any(Object), 8000, "Site history query timed out");
  });

  it("returns a sanitized error when the history query fails", async () => {
    sqlMock.mockReturnValue({});
    withTimeoutMock.mockRejectedValue(new Error("relation \"monthly_reports\" does not exist"));

    const response = await GET(new Request("http://localhost/api/sites/history?site=%E0%B8%AA%E0%B8%B4%E0%B8%95%E0%B8%B5"));
    const payload = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(500);
    expect(payload).toEqual({ ok: false, error: "ไม่สามารถโหลดรายละเอียดไซต์ได้" });
  });

  it("returns the same sanitized error when the history query times out", async () => {
    sqlMock.mockReturnValue({});
    withTimeoutMock.mockRejectedValue(new Error("Site history query timed out"));

    const response = await GET(new Request("http://localhost/api/sites/history?site=%E0%B8%AA%E0%B8%B4%E0%B8%95%E0%B8%B5"));
    const payload = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(500);
    expect(payload).toEqual({ ok: false, error: "ไม่สามารถโหลดรายละเอียดไซต์ได้" });
  });

  it("rejects requests without a site parameter", async () => {
    const response = await GET(new Request("http://localhost/api/sites/history"));
    const payload = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(400);
    expect(payload).toEqual({ ok: false, error: "Missing site parameter" });
  });
});