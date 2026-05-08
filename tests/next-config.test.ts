import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next config", () => {
  it("allows the local dev origins used by browser smoke tests", () => {
    expect(nextConfig).toMatchObject({
      reactStrictMode: true,
      allowedDevOrigins: ["127.0.0.1", "localhost"],
    });
  });
});
