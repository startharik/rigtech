type NewsHeadline = {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
};

const feeds = [
  { url: "https://news.google.com/rss?hl=en-SA&gl=SA&ceid=SA:en", source: "Saudi Arabia · English" },
  { url: "https://news.google.com/rss?hl=ar&gl=SA&ceid=SA:ar", source: "السعودية · العربية" },
];

const decodeXml = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/<[^>]*>/g, "")
    .trim();

const readTag = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
};

const parseFeed = (xml: string, source: string): NewsHeadline[] =>
  [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .flatMap(([, item]) => {
      const title = readTag(item, "title");
      const rawUrl = readTag(item, "link");
      if (!title || !rawUrl) return [];
      try {
        const url = new URL(rawUrl);
        if (url.protocol !== "https:") return [];
        return [{
          title: title.slice(0, 240),
          url: url.toString(),
          source,
          publishedAt: readTag(item, "pubDate") || null,
        }];
      } catch {
        return [];
      }
    });

export async function GET() {
  const results = await Promise.allSettled(feeds.map(async ({ url, source }) => {
    const response = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Saudi news feed returned HTTP ${response.status}.`);
    return parseFeed(await response.text(), source);
  }));

  const headlines = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!headlines.length && results.every((result) => result.status === "rejected")) {
    console.error("Unable to load either Saudi Arabia news feed.", results.map((result) => result.status === "rejected" ? result.reason : null));
    return Response.json(
      { headlines: [], source: "Google News · Saudi Arabia", error: "Saudi headlines are temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  }

  return Response.json(
    { headlines: headlines.slice(0, 24), source: "Google News · Saudi Arabia", error: null },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } },
  );
}
