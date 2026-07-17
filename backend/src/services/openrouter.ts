// Real AI calls via OpenRouter (was a direct Anthropic SDK call -- swapped so
// this shares the same OPENROUTER_API_KEY as the user's other projects).
// generateWebsite asks for up to 32k output tokens to produce a full
// FastAPI + React site in one shot -- this is NOT a task free-tier OpenRouter
// models handle reliably (see the healthcare-leadgen-demo project's notes on
// free models either rate-limiting or burning their token budget on internal
// reasoning), but a flagship model here is also needlessly expensive per
// generation attempt. DeepSeek's chat model is a cheap, code-capable
// middle ground -- verify it's still live and check current per-token
// pricing at https://openrouter.ai/models before a real campaign, since
// availability/pricing shifts over time.
const DEFAULT_MODEL = "deepseek/deepseek-chat";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getModel(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

async function chatCompletion(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getModel(),
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter request failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`Unexpected OpenRouter response: ${JSON.stringify(json)}`);
  return text;
}

export type Intent = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export async function classifyIntent(replyText: string): Promise<Intent> {
  const prompt =
    `Classify the following SMS reply from a business owner as POSITIVE, NEGATIVE, or NEUTRAL. ` +
    `POSITIVE means they are interested in getting a website built. ` +
    `NEGATIVE means they are not interested or want to opt out. ` +
    `NEUTRAL means ambiguous or unclear intent. ` +
    `Reply with ONLY one word: POSITIVE, NEGATIVE, or NEUTRAL.\n\nReply: "${replyText}"`;

  const text = (await chatCompletion(prompt, 20)).toUpperCase();

  if (text.includes("POSITIVE")) return "POSITIVE";
  if (text.includes("NEGATIVE")) return "NEGATIVE";
  return "NEUTRAL";
}

export interface GeneratedSite {
  files: Array<{ path: string; content: string }>;
  slug: string;
  envVars: Record<string, string>;
}

interface LeadData {
  business_name: string;
  phone: string;
  address?: string | null;
  category?: string | null;
  rating?: number | null;
  review_count?: number | null;
  maps_url?: string | null;
  hours?: string | null;
}

export async function generateWebsite(lead: LeadData): Promise<GeneratedSite> {
  const leadJson = JSON.stringify(
    {
      business_name: lead.business_name,
      phone: lead.phone,
      address: lead.address,
      category: lead.category,
      rating: lead.rating,
      review_count: lead.review_count,
      maps_url: lead.maps_url,
      hours: lead.hours,
    },
    null,
    2
  );

  const prompt = `Build a complete FastAPI + React 19 website for this business.
Business data: ${leadJson}

Determine industry and colour scheme. Generate 10-20 services in 3-5 categories.
Write 6 SEO articles (750-1200 words, Unsplash image URLs).
FastAPI: MongoDB, Motor, JWT, OpenAI chatbot via emergentintegrations.
React 19: Tailwind, shadcn/ui.
Pages: Home, Services, Articles, Contact, Booking (3-step wizard with HourlyCalendar: day/week views, colour-coded slots, double-booking prevention).
Admin: stats cards, calendar, customer manager, chat history.
Train chatbot on business data.
Return files as <files><file><path/><content/></file></files> plus <slug> and <env_vars>.
No placeholders.`;

  const responseText = await chatCompletion(prompt, 32000);

  return parseGeneratedSite(responseText, lead.business_name);
}

function parseGeneratedSite(response: string, businessName: string): GeneratedSite {
  const files: Array<{ path: string; content: string }> = [];

  // Parse <files><file><path>...</path><content>...</content></file></files>
  const filesBlockMatch = response.match(/<files>([\s\S]*?)<\/files>/);
  if (filesBlockMatch) {
    const filesBlock = filesBlockMatch[1];
    const fileRegex = /<file>\s*<path>([\s\S]*?)<\/path>\s*<content>([\s\S]*?)<\/content>\s*<\/file>/g;
    let match: RegExpExecArray | null;
    while ((match = fileRegex.exec(filesBlock)) !== null) {
      files.push({
        path: match[1].trim(),
        content: match[2].trim(),
      });
    }
  }

  // Parse <slug>...</slug>
  const slugMatch = response.match(/<slug>([\s\S]*?)<\/slug>/);
  const slug = slugMatch
    ? slugMatch[1].trim()
    : slugify(businessName);

  // Parse <env_vars>...</env_vars>
  const envVars: Record<string, string> = {};
  const envBlockMatch = response.match(/<env_vars>([\s\S]*?)<\/env_vars>/);
  if (envBlockMatch) {
    const lines = envBlockMatch[1].trim().split("\n");
    for (const line of lines) {
      const eqIdx = line.indexOf("=");
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();
        if (key) envVars[key] = value;
      }
    }
  }

  // If no files were parsed, create a minimal placeholder so the build doesn't fail silently
  if (files.length === 0) {
    console.warn("[OpenRouter] No files parsed from response – creating minimal README");
    files.push({
      path: "README.md",
      content: `# ${businessName} Website\n\nGenerated by LeadForge AI\n`,
    });
  }

  return { files, slug, envVars };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
