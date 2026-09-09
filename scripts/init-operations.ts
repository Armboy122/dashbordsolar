import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { ensureOperationsSchema } = await import(
    "../src/lib/operations-store"
  );
  await ensureOperationsSchema();
  console.log(
    "Operations tables ready; existing reports and scoring unchanged.",
  );
}
main().catch(() => {
  console.error("Operations table setup failed");
  process.exitCode = 1;
});
