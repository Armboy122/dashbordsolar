import { chromium, type Page } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";

const ORIGIN = "https://intl.fusionsolar.huawei.com";

async function select(page: Page, name: string, value: string) {
  const input = page.getByRole("combobox", { name, exact: true });
  // Huawei overlays the readonly input with the selected label; keyboard focus
  // avoids that label intercepting pointer clicks.
  if (await input.getAttribute("aria-expanded") !== "true") await input.press("Space");
  await page.getByText(value, { exact: true }).filter({ visible: true }).last().click();
}

/** Uses only the visible report UI; no private endpoints or persisted login cookies. */
export async function downloadReport(options: {
  month: string; directory: string; username: string; password: string; headed?: boolean;
}) {
  const browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  let stage = "login";
  try {
    await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
    if (new URL(page.url()).hostname !== "intl.fusionsolar.huawei.com") throw new Error("Unexpected login host");
    const inputs = page.locator("input:visible");
    await inputs.nth(0).fill(options.username);
    await inputs.nth(1).fill(options.password);
    await page.getByText("Log In", { exact: true }).click();
    try {
      await page.getByText("Reports", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 45_000 });
    } catch {
      const visibleText = (await page.locator("body").innerText()).split(options.password).join("[redacted]").split(options.username).join("[account]");
      await fs.writeFile(path.join(options.directory, "login-status.txt"), visibleText, { mode: 0o600 });
      throw new Error("LOGIN_REQUIRED: Login did not complete. Check credentials or complete CAPTCHA/OTP manually; no automatic retries.");
    }
    stage = "report navigation";
    await page.getByText("Reports", { exact: true }).filter({ visible: true }).first().click();
    await page.getByRole("link", { name: "Plant Report", exact: true }).click();
    const panel = page.getByRole("tabpanel", { name: "Plant Report", exact: true });
    await panel.waitFor();
    stage = "select dimension";
    await select(page, "Dimension", "By plant");
    stage = "select granularity";
    await select(page, "Time granularity", "By month");
    stage = "select month";
    const period = page.getByRole("textbox", { name: "Statistical period", exact: true });
    await period.click();
    await period.fill(options.month);
    await period.press("Enter");
    await period.press("Tab");
    if (await period.inputValue() !== options.month) throw new Error("Report month was not selected correctly");
    await panel.getByRole("button", { name: "Search", exact: true }).click();
    // Wait for the report UI to finish refreshing, then verify scope before exporting.
    await panel.getByRole("cell").first().waitFor();
    const total = panel.getByText(/^Total:\s*\d+$/);
    await total.waitFor();
    const expectedRows = Number((await total.innerText()).match(/\d+/)?.[0]);
    if (!expectedRows) throw new Error("Report is empty; refusing to import");
    const plantInput = panel.getByRole("textbox").first();
    if (await plantInput.inputValue()) throw new Error("Unexpected plant filter; refusing partial export");
    stage = "export";
    const [year, month] = options.month.split("-");
    const taskName = `Plant Report_${month}-${year}`;
    await panel.getByRole("button", { name: "Export", exact: true }).click();
    const tasks = page.getByRole("dialog", { name: "Tasks", exact: true });
    await tasks.waitFor();
    const task = tasks.locator(".row-body").filter({ has: page.getByText(taskName, { exact: true }) }).first();
    const downloadLink = task.getByTitle("Download", { exact: true });
    await downloadLink.waitFor({ timeout: 120_000 });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      downloadLink.click(),
    ]);
    const filename = download.suggestedFilename();
    if (!filename.includes(`${month}-${year}`) || !/\.xlsx$/i.test(filename)) {
      throw new Error(`Unexpected download filename for ${options.month}`);
    }
    const file = path.join(options.directory, path.basename(filename));
    await download.saveAs(file);
    if (await download.failure()) throw new Error("Excel download failed");
    return { file, expectedRows, month: options.month };
  } catch (error) {
    // Avoid Playwright call logs: they may contain form values (including credentials).
    if (error instanceof Error && error.message.startsWith("LOGIN_REQUIRED:")) throw error;
    if (stage !== "login") {
      const diagnostic = `${stage}\n${error instanceof Error ? error.message : "error"}\n${await page.locator("body").ariaSnapshot()}`;
      await fs.writeFile(path.join(options.directory, "page-status.txt"), diagnostic.split(options.password).join("[redacted]").split(options.username).join("[account]"), { mode: 0o600 }).catch(() => {});
    }
    throw new Error(`FusionSolar ${stage} failed (${error instanceof Error ? error.name : "error"}). No data imported.`);
  } finally {
    await context.close();
    await browser.close();
  }
}
