import { PromotionFetcher, FightEvent, Bout, Logger } from "../types.js";
import { fetchDocument } from "./base.js";
import type { Cheerio } from "cheerio";

export class UfcFetcher implements PromotionFetcher {
  readonly name = "ufc" as const;
  private readonly url = "https://www.ufc.com/events#events-list-upcoming";

  constructor(private readonly logger: Logger) {}

  async fetchUpcomingEvents(): Promise<FightEvent[]> {
    const $ = await fetchDocument(this.url, this.logger);
    const events: FightEvent[] = [];

    $("article.c-card-event--result").each((_, element) => {
      const container = $(element);
      const title = container.find("h3.c-card-event--result__headline").text().trim();
      const url = `https://www.ufc.com${container.find("a.c-card-event--result__link, h3.c-card-event--result__headline a").attr("href") ?? ""}`;

      const dateNode = container.find("div.c-card-event--result__date");
      const timestamp = parseTimestamp(dateNode.attr("data-main-card-timestamp") ?? dateNode.attr("data-prelims-card-timestamp"));
      const dateText = dateNode.text().trim();
      const startDate = timestamp ?? parseDate(dateText);
      const location = container.find("div.c-card-event--result__location").text().trim();

      if (!title || !startDate) {
        this.logger.warn("Skipping UFC event with missing title or date", { title, dateText });
        return;
      }

      if (startDate.getTime() < Date.now()) {
        return; // ignore past events when list intermixes
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
