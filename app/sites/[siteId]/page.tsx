import { SiteDetail } from "@/src/components/site-detail";
import { decodeSiteParam } from "@/src/lib/site-history";

export default async function SitePage({
  params,
  searchParams,
}: {
  params: { siteId: string | string[] } | Promise<{ siteId: string | string[] }>;
  searchParams?: { month?: string | string[]; year?: string | string[] } | Promise<{ month?: string | string[]; year?: string | string[] }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const siteName = await decodeSiteParam(resolvedParams);
  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : {};
  const initialMonth = Array.isArray(resolvedSearchParams.month) ? resolvedSearchParams.month[0] : resolvedSearchParams.month ?? "";
  const initialYearValue = Array.isArray(resolvedSearchParams.year) ? resolvedSearchParams.year[0] : resolvedSearchParams.year ?? "";
  const parsedYear = initialYearValue.trim() ? Number(initialYearValue) : null;
  const initialYear = parsedYear !== null && Number.isFinite(parsedYear) ? parsedYear : null;

  return <SiteDetail siteName={siteName} initialMonth={initialMonth} initialYear={initialYear} />;
}
