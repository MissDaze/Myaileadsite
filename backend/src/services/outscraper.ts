import axios from "axios";

export interface OutscraperBusiness {
  business_name: string;
  phone: string;
  address?: string;
  category?: string;
  rating?: number;
  review_count?: number;
  maps_url?: string;
  maps_overview_url?: string;
  maps_reviews_url?: string;
  maps_photos_url?: string;
  hours?: string;
}

interface OutscraperResult {
  name?: string;
  phone?: string;
  full_address?: string;
  type?: string;
  rating?: number;
  reviews?: number;
  google_id?: string;
  place_id?: string;
  url?: string;
  website?: string;
  working_hours?: Record<string, string> | string;
  photos_count?: number;
}

interface OutscraperResponse {
  status: string;
  id?: string;
  data?: OutscraperResult[][];
}

function buildMapsUrl(result: OutscraperResult): string | undefined {
  if (result.url) return result.url;
  if (result.place_id) return `https://www.google.com/maps/place/?q=place_id:${result.place_id}`;
  return undefined;
}

function formatHours(hours: Record<string, string> | string | undefined): string | undefined {
  if (!hours) return undefined;
  if (typeof hours === "string") return hours;
  return Object.entries(hours)
    .map(([day, time]) => `${day}: ${time}`)
    .join(", ");
}

export async function scrapeBusinesses(
  query: string,
  location: string
): Promise<OutscraperBusiness[]> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) throw new Error("OUTSCRAPER_API_KEY not configured");

  const fullQuery = `${query} in ${location}`;

  const response = await axios.get<OutscraperResponse>(
    "https://api.app.outscraper.com/maps/search-v3",
    {
      params: {
        query: fullQuery,
        limit: 100,
        language: "en",
        async: false,
      },
      headers: {
        "X-API-KEY": apiKey,
      },
      timeout: 120_000,
    }
  );

  const raw = response.data;

  // Outscraper may return async job – poll if needed
  if (raw.status === "Pending" && raw.id) {
    return pollOutscraperJob(raw.id, apiKey);
  }

  const rows: OutscraperResult[] = (raw.data ?? []).flat();
  return mapResults(rows);
}

async function pollOutscraperJob(
  jobId: string,
  apiKey: string
): Promise<OutscraperBusiness[]> {
  const maxAttempts = 30;
  const delayMs = 10_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(delayMs);

    const resp = await axios.get<OutscraperResponse>(
      `https://api.app.outscraper.com/requests/${jobId}`,
      {
        headers: { "X-API-KEY": apiKey },
        timeout: 30_000,
      }
    );

    const data = resp.data;
    if (data.status === "Success" || data.status === "success") {
      const rows: OutscraperResult[] = (data.data ?? []).flat();
      return mapResults(rows);
    }
    if (data.status === "Failed" || data.status === "failed") {
      throw new Error(`Outscraper job ${jobId} failed`);
    }
    // still pending – keep polling
  }

  throw new Error(`Outscraper job ${jobId} timed out after polling`);
}

function mapResults(rows: OutscraperResult[]): OutscraperBusiness[] {
  const results: OutscraperBusiness[] = [];

  for (const r of rows) {
    // Skip entries without a phone number
    if (!r.phone) continue;

    // Only include businesses with no website
    if (r.website && r.website.trim() !== "") continue;

    const mapsUrl = buildMapsUrl(r);

    results.push({
      business_name: r.name ?? "Unknown Business",
      phone: r.phone,
      address: r.full_address,
      category: r.type,
      rating: r.rating,
      review_count: r.reviews,
      maps_url: mapsUrl,
      maps_overview_url: mapsUrl,
      maps_reviews_url: mapsUrl ? `${mapsUrl}#reviews` : undefined,
      maps_photos_url: mapsUrl ? `${mapsUrl}#photos` : undefined,
      hours: formatHours(r.working_hours),
    });
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
