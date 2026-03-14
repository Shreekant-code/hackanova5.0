import FormCrawlCache from "../../Schema/FormCrawlCacheSchema.js";

const FORM_CACHE_TTL_MINUTES = Number(process.env.AUTOMATION_FORM_CACHE_TTL_MINUTES || 60);

const getHost = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

export const getCachedFormCrawl = async (url) => {
  const now = new Date();
  const cached = await FormCrawlCache.findOne({
    url,
    expires_at: { $gt: now },
  }).lean();
  return cached || null;
};

export const upsertFormCrawlCache = async ({ url, crawlHash, crawledData }) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + FORM_CACHE_TTL_MINUTES * 60 * 1000);
  const payload = {
    url,
    host: getHost(url),
    crawl_hash: String(crawlHash || ""),
    crawled_data: crawledData || {},
    crawled_at: now,
    expires_at: expiresAt,
  };

  return FormCrawlCache.findOneAndUpdate({ url }, payload, {
    upsert: true,
    new: true,
  });
};
