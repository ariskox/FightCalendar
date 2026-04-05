import { load } from "cheerio";
import { request } from "undici";
import { FightEvent, FetchOptions, Logger, PromotionFetcher } from "../types.js";
import { fetchText } from "./base.js";

type FeedItem = {
  title: string;
  url: string;
  publishedAt: Date;
  summary: string;
  content: string;
};

type ModelsMessage = { role: "system" | "user"; content: string };

type ModelsResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type LlmEventClassification = {
  is_competition_event: boolean;
  is_future_event: boolean;
  event_start_date_iso: string | null;
  event_end_date_iso: string | null;
  event_title: string | null;
  location: string | null;
};

const FEED_BASE_URL = "https://grmmaf.gr/category/news/feed/";
const DEFAULT_FEED_PAGE_LIMIT = 3;
const DEFAULT_MAX_LATEST_ARTICLES = 5;
const DEFAULT_MODELS_ENDPOINT = "https://models.github.ai/inference/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_MAX_ARTICLE_CHARS = 2400;

export class GrMmafFetcher implements PromotionFetcher {
  readonly name = "grmmaf" as const;

  constructor(private readonly logger: Logger) {}

  async fetchUpcomingEvents(options?: FetchOptions): Promise<FightEvent[]> {
    const includePastEvents = Boolean(options?.includePastEvents);
    const pastEventsOnly = Boolean(options?.pastEventsOnly);
    const token = process.env.GITHUB_MODELS_TOKEN ?? process.env.GITHUB_TOKEN;

    this.logger.debug("GR MMAF fetch starting", {
      includePastEvents,
      pastEventsOnly,
      model: process.env.GITHUB_MODELS_MODEL ?? DEFAULT_MODEL,
      endpoint: process.env.GITHUB_MODELS_ENDPOINT ?? DEFAULT_MODELS_ENDPOINT,
      feedPageLimit: parsePositiveInt(process.env.GRMMAF_FEED_PAGE_LIMIT, DEFAULT_FEED_PAGE_LIMIT),
      maxLatestArticles: parsePositiveInt(process.env.GRMMAF_MAX_LATEST_ARTICLES, DEFAULT_MAX_LATEST_ARTICLES),
      maxArticleChars: parsePositiveInt(process.env.GRMMAF_ARTICLE_MAX_CHARS, DEFAULT_MAX_ARTICLE_CHARS),
      hasToken: Boolean(token)
    });

    if (!token) {
      this.logger.warn("Skipping GR MMAF fetcher because GITHUB_MODELS_TOKEN/GITHUB_TOKEN is not set");
      return [];
    }

    const feedItems = await this.fetchFeedItems();
    this.logger.debug("GR MMAF feed items fetched", { count: feedItems.length });
    const events: FightEvent[] = [];

    for (const item of feedItems) {
      this.logger.debug("Classifying GR MMAF article", { title: item.title, url: item.url, publishedAt: item.publishedAt.toISOString() });
      const classification = await this.classifyArticle(item, token);
      if (!classification) {
        this.logger.debug("Skipping GR MMAF article: no classification", { url: item.url });
        continue;
      }
      this.logger.debug("GR MMAF classification result", {
        url: item.url,
        isCompetitionEvent: classification.is_competition_event,
        isFutureEvent: classification.is_future_event,
        eventStartDateIso: classification.event_start_date_iso,
        eventEndDateIso: classification.event_end_date_iso,
        eventTitle: classification.event_title,
        location: classification.location
      });
      if (!classification.is_competition_event) {
        this.logger.debug("Skipping GR MMAF article: model marked as non-competition", { url: item.url });
        continue;
      }
      if (!classification.is_future_event) {
        this.logger.debug("Skipping GR MMAF article: model marked as non-future", { url: item.url });
        continue;
      }
      if (!classification.event_start_date_iso) {
        this.logger.debug("Skipping GR MMAF article: missing event_start_date_iso", { url: item.url });
        continue;
      }

      const startDate = parseIsoDate(classification.event_start_date_iso);
      if (!startDate) {
        this.logger.debug("Skipping GR MMAF post with invalid event date from model", {
          title: item.title,
          url: item.url,
          eventDate: classification.event_start_date_iso
        });
        continue;
      }

      const eventTitle = normalizeWhitespace(classification.event_title || item.title);
      const location = normalizeWhitespace(classification.location || "");
      const parsedEndDate = classification.event_end_date_iso ? parseIsoDate(classification.event_end_date_iso) : null;
      const endDate = parsedEndDate && parsedEndDate.getTime() > startDate.getTime() ? parsedEndDate : undefined;

      if (classification.event_end_date_iso && !parsedEndDate) {
        this.logger.debug("Ignoring GR MMAF invalid event_end_date_iso", {
          url: item.url,
          eventEndDateIso: classification.event_end_date_iso
        });
      }

      if (parsedEndDate && parsedEndDate.getTime() <= startDate.getTime()) {
        this.logger.debug("Ignoring GR MMAF end date because it is not after start date", {
          url: item.url,
          startDate: startDate.toISOString(),
          endDate: parsedEndDate.toISOString()
        });
      }

      events.push({
        promotion: this.name,
        title: `[GR MMAF] ${eventTitle}`,
        url: item.url,
        startDate,
        endDate,
        location: location || undefined
      });

      this.logger.debug("Accepted GR MMAF event", {
        url: item.url,
        title: eventTitle,
        startDate: startDate.toISOString(),
          endDate: endDate?.toISOString(),
        location: location || undefined
      });
    }

    const now = Date.now();
    const filtered = events.filter((event) => {
      const isPastEvent = event.startDate.getTime() < now;
      if (pastEventsOnly) return isPastEvent;
      if (!includePastEvents) return !isPastEvent;
      return true;
    });

    const deduped = new Map<string, FightEvent>();
    filtered.forEach((event) => {
      const key = event.url.trim().toLowerCase();
      if (!deduped.has(key)) deduped.set(key, event);
    });

    this.logger.debug("GR MMAF fetch completed", {
      rawEvents: events.length,
      filteredEvents: filtered.length,
      dedupedEvents: deduped.size
    });

    return Array.from(deduped.values()).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }

  private async fetchFeedItems(): Promise<FeedItem[]> {
    const pageLimit = parsePositiveInt(process.env.GRMMAF_FEED_PAGE_LIMIT, DEFAULT_FEED_PAGE_LIMIT);
    const maxLatestArticles = parsePositiveInt(process.env.GRMMAF_MAX_LATEST_ARTICLES, DEFAULT_MAX_LATEST_ARTICLES);
    const items: FeedItem[] = [];

    this.logger.debug("Fetching GR MMAF RSS pages", { pageLimit, maxLatestArticles });

    pageLoop: for (let page = 1; page <= pageLimit; page += 1) {
      const pageUrl = page === 1 ? FEED_BASE_URL : `${FEED_BASE_URL}?paged=${page}`;
      const xml = await fetchText(pageUrl, this.logger);
      const $ = load(xml, { xmlMode: true });
      const pageItems = $("item").toArray();
      this.logger.debug("Parsed GR MMAF RSS page", { page, pageUrl, pageItems: pageItems.length });
      if (!pageItems.length) {
        this.logger.debug("Stopping GR MMAF RSS pagination because page has no items", { page, pageUrl });
        break;
      }

      pageItems.forEach((itemNode) => {
        const node = $(itemNode);
        const title = normalizeWhitespace(node.find("title").first().text());
        const url = node.find("link").first().text().trim();
        const pubDate = node.find("pubDate").first().text().trim();
        const descriptionRaw = node.find("description").first().text();
        const contentRaw = node.find("content\\:encoded").first().text();
        const publishedAt = new Date(pubDate);

        if (!title || !url || Number.isNaN(publishedAt.getTime())) return;

        items.push({
          title,
          url,
          publishedAt,
          summary: extractText(descriptionRaw),
          content: extractText(contentRaw)
        });

        if (items.length >= maxLatestArticles) {
          this.logger.debug("Reached GR MMAF latest-articles cap", {
            maxLatestArticles,
            page,
            lastUrl: url
          });
          return;
        }
      });

      if (items.length >= maxLatestArticles) {
        break pageLoop;
      }
    }

    this.logger.debug("Completed GR MMAF RSS collection", { totalItems: items.length });

    return items;
  }

  private async classifyArticle(item: FeedItem, token: string): Promise<LlmEventClassification | null> {
    const endpoint = process.env.GITHUB_MODELS_ENDPOINT ?? DEFAULT_MODELS_ENDPOINT;
    const model = process.env.GITHUB_MODELS_MODEL ?? DEFAULT_MODEL;
    const maxChars = parsePositiveInt(process.env.GRMMAF_ARTICLE_MAX_CHARS, DEFAULT_MAX_ARTICLE_CHARS);

    const articleText = clipText(`${item.summary}\n\n${item.content}`, maxChars);
    const messages: ModelsMessage[] = [
      {
        role: "system",
        content:
          "You classify Greek MMA federation posts. Return ONLY a JSON object with keys: is_competition_event (boolean), is_future_event (boolean), event_start_date_iso (string|null), event_end_date_iso (string|null), event_title (string|null), location (string|null). Use RFC3339 with timezone, e.g. 2026-04-28T10:00:00+03:00. If event spans multiple days, set event_end_date_iso to the final day/time. If single-day, set event_end_date_iso to null. If not a competition event, set date/title/location to null."
      },
      {
        role: "user",
        content: [
          `Title: ${item.title}`,
          `URL: ${item.url}`,
          `Published at: ${item.publishedAt.toISOString()}`,
          "Article:",
          articleText
        ].join("\n")
      }
    ];

    try {
      this.logger.debug("Sending GR MMAF article to GitHub Models", {
        url: item.url,
        model,
        endpoint,
        inputChars: articleText.length
      });

      const response = await request(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2026-03-10"
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 300,
          messages
        })
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const body = await response.body.text();
        this.logger.warn("GitHub Models request failed for GR MMAF article", {
          statusCode: response.statusCode,
          url: item.url,
          body: clipText(body, 240)
        });
        return null;
      }

      const payload = (await response.body.json()) as ModelsResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        this.logger.debug("GR MMAF model response missing content", { url: item.url, payload });
        return null;
      }

      const parsed = parseModelJson(content);
      if (!parsed) {
        this.logger.debug("Skipping GR MMAF article due to unparseable model JSON", {
          url: item.url,
          modelContent: clipText(content, 400)
        });
        return null;
      }

      return parsed;
    } catch (error) {
      this.logger.warn("GitHub Models request errored for GR MMAF article", { url: item.url, error });
      return null;
    }
  }
}

const parseModelJson = (content: string): LlmEventClassification | null => {
  const parsed = safeJsonParse(content) ?? safeJsonParse(extractJsonObject(content));
  if (!parsed || typeof parsed !== "object") return null;

  const candidate = parsed as Partial<LlmEventClassification>;
  if (typeof candidate.is_competition_event !== "boolean") return null;
  if (typeof candidate.is_future_event !== "boolean") return null;

  return {
    is_competition_event: candidate.is_competition_event,
    is_future_event: candidate.is_future_event,
    event_start_date_iso: typeof candidate.event_start_date_iso === "string" ? candidate.event_start_date_iso : null,
    event_end_date_iso: typeof candidate.event_end_date_iso === "string" ? candidate.event_end_date_iso : null,
    event_title: typeof candidate.event_title === "string" ? candidate.event_title : null,
    location: typeof candidate.location === "string" ? candidate.location : null
  };
};

const parseIsoDate = (value: string): Date | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const safeJsonParse = (value: string): unknown | null => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractJsonObject = (value: string): string => {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return "";
  return value.slice(start, end + 1);
};

const extractText = (value: string): string => {
  if (!value) return "";
  const $ = load(`<root>${value}</root>`);

  $("p")
    .last()
    .find("a")
    .each((_, anchor) => {
      const text = $(anchor).text().trim().toLowerCase();
      if (text.includes("appeared first on")) {
        $(anchor).closest("p").remove();
      }
    });

  return normalizeWhitespace($("root").text());
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const clipText = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();
