import { load, CheerioAPI } from "cheerio";
import { request } from "undici";
import { Logger } from "../types.js";

export const fetchDocument = async (url: string, logger: Logger): Promise<CheerioAPI> => {
  logger.debug(`Fetching URL ${url}`);
  const response = await request(url, {
    headers: {
      "user-agent": "fight-calendar-cli/0.1 (+https://github.com/)"
    }
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Failed to fetch ${url}: status ${response.statusCode}`);
  }

  const body = await response.body.text();
  return load(body);
};
