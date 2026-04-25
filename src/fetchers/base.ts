import { load, CheerioAPI } from "cheerio";
import { request } from "undici";
import { Logger } from "../types.js";

export const fetchText = async (url: string, logger: Logger): Promise<string> => {
  logger.debug(`Fetching URL ${url}`);
  const response = await request(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Failed to fetch ${url}: status ${response.statusCode}`);
  }

  return response.body.text();
};

export const fetchDocument = async (url: string, logger: Logger): Promise<CheerioAPI> => {
  const body = await fetchText(url, logger);
  return load(body);
};
