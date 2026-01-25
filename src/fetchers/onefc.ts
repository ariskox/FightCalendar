import { PromotionFetcher, FightEvent, Logger } from "../types.js";
import { fetchDocument } from "./base.js";
import { load } from "cheerio";

export class OneFcFetcher implements PromotionFetcher {
  readonly name = "one" as const;
  private readonly url = "https://watch.onefc.com/upcoming-events";

  constructor(private readonly logger: Logger) {}

  async fetchUpcomingEvents(): Promise<FightEvent[]> {
    const $ = await fetchDocument(this.url, this.logger);
    const html = $.html();

    const jsonEvents = this.parseFromApolloState(html);
    if (jsonEvents.length) {
      return jsonEvents;
    }

    this.logger.warn("Falling back to DOM scraping for ONE FC events");
    return this.parseFromDom($);
  }

  private parseFromApolloState(html: string): FightEvent[] {
    const scriptRegex = /__APOLLO_STATE__\s*=\s*(\{.*?\})\s*;<\/script>/s;
    const match = scriptRegex.exec(html);
    if (!match) return [];

    try {
      const apolloState = JSON.parse(match[1]);
      const events: FightEvent[] = [];
      Object.values(apolloState).forEach((value: any) => {
        if (value && typeof value === "object" && value.__typename === "Event") {
          const title: string | undefined = value.name;
          const startDate = value.live_time ? new Date(value.live_time) : undefined;
          const url: string | undefined = value.permalink ? `https://watch.onefc.com${value.permalink}` : undefined;
          const location: string | undefined = value.venue ?? value.location ?? undefined;
          if (title && startDate && url) {
            events.push({ promotion: this.name, title, url, startDate, location });
          }
        }
      });
      return events;
    } catch (error) {
      this.logger.error("Failed to parse ONE FC apollo state", { error });
      return [];
    }
  }

  private parseFromDom($: ReturnType<typeof load>): FightEvent[] {
    const events: FightEvent[] = [];
    $("a[href*='event']").each((_, el) => {
      const link = $(el);
      const title = link.find("h3, h4").first().text().trim();
      const url = link.attr("href") ?? this.url;
      const dateText = link.find("time").attr("datetime") ?? link.find(".date, .event-date").text().trim();
      const startDate = dateText ? new Date(dateText) : null;
      if (title && startDate && !Number.isNaN(startDate.getTime())) {
        events.push({ promotion: this.name, title, url, startDate });
      }
    });
    return events;
  }
}
