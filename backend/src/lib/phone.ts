/**
 * Normalise a phone number to digits only, stripping country code prefixes.
 * Used for deduplication and matching incoming TextMagic replies.
 */
export function normalisePhone(raw: string): string {
  // Remove all non-digit characters
  let digits = raw.replace(/\D/g, "");

  // Strip leading zeros
  digits = digits.replace(/^0+/, "");

  // Strip common country code prefixes (longest match first)
  const countryCodes = [
    "1",   // US/Canada
    "44",  // UK
    "61",  // Australia
    "64",  // New Zealand
    "353", // Ireland
    "27",  // South Africa
    "91",  // India
    "49",  // Germany
    "33",  // France
    "34",  // Spain
    "39",  // Italy
    "31",  // Netherlands
    "46",  // Sweden
    "47",  // Norway
    "45",  // Denmark
    "358", // Finland
    "55",  // Brazil
    "52",  // Mexico
    "86",  // China
    "81",  // Japan
    "82",  // South Korea
    "65",  // Singapore
    "60",  // Malaysia
    "63",  // Philippines
    "66",  // Thailand
    "62",  // Indonesia
    "234", // Nigeria
    "254", // Kenya
    "20",  // Egypt
    "971", // UAE
    "966", // Saudi Arabia
    "972", // Israel
    "7",   // Russia
  ];

  // Sort by length descending so longer codes match first
  const sorted = [...countryCodes].sort((a, b) => b.length - a.length);

  for (const code of sorted) {
    if (digits.startsWith(code) && digits.length > code.length + 6) {
      digits = digits.slice(code.length);
      break;
    }
  }

  return digits;
}

/**
 * Returns true if two phone numbers match after normalisation.
 */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalisePhone(a);
  const nb = normalisePhone(b);
  return na === nb || na.endsWith(nb) || nb.endsWith(na);
}
