import { PromotionFetcher, FightEvent, Bout, Logger, FetchOptions } from "../types.js";
import { fetchDocument } from "./base.js";
import type { Cheerio } from "cheerio";

export class UfcFetcher implements PromotionFetcher {
  readonly name = "ufc" as const;
  private readonly url = "https://www.ufc.com/events#events-list-upcoming";
  private readonly loadMoreUrl = "https://www.ufc.com/events?page=1";

  constructor(private readonly logger: Logger) {}

  async fetchUpcomingEvents(options?: FetchOptions): Promise<FightEvent[]> {
    const includePastEvents = Boolean(options?.includePastEvents);
    const pastEventsOnly = Boolean(options?.pastEventsOnly);
    const $ = await fetchDocument(this.url, this.logger);
    const events = this.parseEvents($, includePastEvents, pastEventsOnly);

    if (includePastEvents) {
      try {
        const $loadMore = await fetchDocument(this.loadMoreUrl, this.logger);
        events.push(...this.parseEvents($loadMore, true, pastEventsOnly));
      } catch (error) {
        this.logger.warn("Failed to load additional UFC past events page", { error });
      }
    }

    return events;
  }

  private parseEvents($: Awaited<ReturnType<typeof fetchDocument>>, includePastEvents: boolean, pastEventsOnly: boolean): FightEvent[] {
    const events: FightEvent[] = [];

    $("article.c-card-event--result").each((_, element) => {
      const container = $(element);
      const href = container.find("a.c-card-event--result__link, h3.c-card-event--result__headline a").attr("href") ?? "";
      const url = `https://www.ufc.com${href}`;
      const rawTitle = container.find("h3.c-card-event--result__headline").text().trim();
      const headlinePrefix = container.find(".c-card-event--result__headline-prefix").first().text().trim();
      const cardText = container.text().replace(/\s+/g, " ").trim();
      const ufcNumber = extractUfcNumber(headlinePrefix, rawTitle, url, cardText);
      const title = formatUfcTitle(rawTitle, ufcNumber);

      const dateNode = container.find("div.c-card-event--result__date");
      const timestamp = parseTimestamp(dateNode.attr("data-main-card-timestamp") ?? dateNode.attr("data-prelims-card-timestamp"));
      const dateText = dateNode.text().trim();
      const startDate = timestamp ?? parseDate(dateText);
      const location = container.find("div.c-card-event--result__location").text().trim();

      if (!title || !startDate) {
        this.logger.warn("Skipping UFC event with missing title or date", { title, dateText });
        return;
      }

      const isPastEvent = startDate.getTime() < Date.now();
      if (!includePastEvents && isPastEvent) {
        return; // ignore past events when list intermixes
      }
      if (pastEventsOnly && !isPastEvent) {
        return;
      }

      const cardBouts = extractBouts(container);
      events.push({ promotion: this.name, title, url, startDate, location: location || undefined, cardBouts });
    });

    return events;
  }
}

const extractBouts = ($container: Cheerio<any>): Bout[] => {
  const bouts: Bout[] = [];
  const nodes = $container.find("li.c-listing-fight__item").toArray();

  nodes.forEach((element, index) => {
    const row = $container.find(element);
    const fighters = row.find("h4.c-listing-fight__headline").text().trim().replace(/\s+/g, " ");
    const weightClass = row.find("span.c-listing-fight__class").text().trim();
    const isTitleFight = row.find("span.c-listing-fight__belt").length > 0;
    if (fighters) {
      bouts.push({ fighters, weightClass: weightClass || undefined, isTitleFight, boutOrder: index + 1 });
    }
  });
  return bouts;
};

const parseDate = (value: string): Date | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
};

const parseTimestamp = (value?: string | null): Date | null => {
  if (!value) return null;
  const asNumber = Number.parseInt(value, 10);
  if (Number.isNaN(asNumber)) return null;
  return new Date(asNumber * 1000);
};

const UFC_NUMBER_CAPTURE_GROUP = "(\\d{1,4})";
const UFC_NUMBER_IN_TEXT_REGEX = new RegExp(`\\bUFC[\\s\\-_/]*${UFC_NUMBER_CAPTURE_GROUP}\\b`, "i");
const UFC_NUMBER_IN_URL_REGEX = new RegExp(`/ufc-${UFC_NUMBER_CAPTURE_GROUP}(?:[/?#-]|$)`, "i");

const extractUfcNumber = (...values: string[]): string | undefined => {
  for (const value of values) {
    const match = value.match(UFC_NUMBER_IN_TEXT_REGEX);
    if (match) return `UFC ${match[1]}`;
    const urlMatch = value.match(UFC_NUMBER_IN_URL_REGEX);
    if (urlMatch) return `UFC ${urlMatch[1]}`;
  }
  return undefined;
};

const formatUfcTitle = (title: string, ufcNumber?: string): string => {
  if (!ufcNumber) return title;
  if (UFC_NUMBER_IN_TEXT_REGEX.test(title)) return title;
  return `${ufcNumber}: ${title}`;
};
