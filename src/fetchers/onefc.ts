import { PromotionFetcher, FightEvent, Logger, FetchOptions } from "../types.js";
import { fetchDocument } from "./base.js";

export class OneFcFetcher implements PromotionFetcher {
  readonly name = "one" as const;
  private readonly url = "https://www.onefc.com/events/";

  constructor(private readonly logger: Logger) {}

  async fetchUpcomingEvents(options?: FetchOptions): Promise<FightEvent[]> {
    const includePastEvents = Boolean(options?.includePastEvents);
    const pastEventsOnly = Boolean(options?.pastEventsOnly);
    const $ = await fetchDocument(this.url, this.logger);
    const events = this.parseFromSections($, includePastEvents, pastEventsOnly);
    if (events.length) return events;

    this.logger.warn("Falling back to generic DOM scraping for ONE FC events");
    return this.parseFromDom($, includePastEvents, pastEventsOnly);
  }

  private parseFromSections($: Awaited<ReturnType<typeof fetchDocument>>, includePastEvents: boolean, pastEventsOnly: boolean): FightEvent[] {
    const events: FightEvent[] = [];
    const seen = new Set<string>();
    const now = Date.now();
    const selector = pastEventsOnly
      ? "#past-events-section .simple-post-card.is-event"
      : includePastEvents
      ? "#upcoming-events-section .simple-post-card.is-event, #past-events-section .simple-post-card.is-event"
      : "#upcoming-events-section .simple-post-card.is-event";

    $(selector).each((_, el) => {
      const card = $(el);
      const title = card.find("a.title").first().attr("title") ?? card.find("a.title").first().text().trim();
      const href = card.find("a.title").first().attr("href") ?? card.find("a[href*='/events/']").first().attr("href");
      const url = href ? new URL(href, this.url).toString() : this.url;
      const timestampText = card.find(".datetime").first().attr("data-timestamp") ?? "";
      const timestamp = Number.parseInt(timestampText, 10);
      const startDate = Number.isNaN(timestamp) ? null : new Date(timestamp * 1000);
      const location = card.find(".location, .event-location").first().text().trim() || undefined;

      if (!title || !startDate || Number.isNaN(startDate.getTime())) return;
      const isPastEvent = startDate.getTime() < now;
      if (!includePastEvents && isPastEvent) return;
      if (pastEventsOnly && !isPastEvent) return;
      if (seen.has(url)) return;

      seen.add(url);
      events.push({ promotion: this.name, title, url, startDate, location });
    });

    return events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }

  private parseFromDom($: Awaited<ReturnType<typeof fetchDocument>>, includePastEvents: boolean, pastEventsOnly: boolean): FightEvent[] {
    const events: FightEvent[] = [];
    const seen = new Set<string>();
    const now = Date.now();

    $("a[href*='/events/']").each((_, el) => {
      const link = $(el);
      const title = link.attr("title") ?? link.find("h3, h4").first().text().trim();
      const href = link.attr("href") ?? this.url;
      const url = new URL(href, this.url).toString();
      const timestampText = link.closest(".simple-post-card").find(".datetime").first().attr("data-timestamp") ?? "";
      const timestamp = Number.parseInt(timestampText, 10);
      const startDate = Number.isNaN(timestamp) ? null : new Date(timestamp * 1000);

      if (!title || !startDate || Number.isNaN(startDate.getTime())) return;
      const isPastEvent = startDate.getTime() < now;
      if (!includePastEvents && isPastEvent) return;
      if (pastEventsOnly && !isPastEvent) return;
      if (seen.has(url)) return;

      seen.add(url);
      events.push({ promotion: this.name, title, url, startDate });
    });

    return events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }
}
