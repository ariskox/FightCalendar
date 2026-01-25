import { PromotionFetcher, FightEvent, Bout, Logger } from "../types.js";
import { fetchDocument } from "./base.js";
import type { Cheerio } from "cheerio";

export class OktagonFetcher implements PromotionFetcher {
  readonly name = "oktagon" as const;
  private readonly url = "https://oktagonmma.com/en/events/";

  constructor(private readonly logger: Logger) {}

  async fetchUpcomingEvents(): Promise<FightEvent[]> {
    const $ = await fetchDocument(this.url, this.logger);
    const events: FightEvent[] = [];

    $("a.event-box").each((_, el) => {
      const item = $(el);
      const title = item.find(".event-box__title").text().trim();
      const url = item.attr("href") ?? this.url;
      const dateText = item.find(".event-box__date").text().trim();
      const location = item.find(".event-box__arena").text().trim();
      const startDate = parseDate(dateText);

      if (!title || !startDate) {
        this.logger.warn("Skipping Oktagon event with missing title or date", { title, dateText });
        return;
      }

      events.push({ promotion: this.name, title, url, startDate, location: location || undefined, cardBouts: [] });
    });

    return events;
  }
}

const parseDate = (value: string): Date | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
};

// Placeholder to keep SOLID-compatible structure if bout data becomes available later.
const extractBouts = (_container: Cheerio<unknown>): Bout[] => [];
