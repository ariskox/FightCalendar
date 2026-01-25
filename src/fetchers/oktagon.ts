import { PromotionFetcher, FightEvent, Bout, Logger } from "../types.js";
import { fetchDocument } from "./base.js";
import type { Cheerio } from "cheerio";

export class OktagonFetcher implements PromotionFetcher {
  readonly name = "oktagon" as const;
  private readonly url = "https://oktagonmma.com/en/events/";

  constructor(private readonly logger: Logger) {}

  async fetchUpcomingEvents(): Promise<FightEvent[]> {
    const $ = await fetchDocument(this.url, this.logger);
    const html = $.html();

    // Primary: parse Next.js data payload (more reliable than DOM which is mostly empty)
    const fromNextData = parseFromNextData(html, this.logger);
    if (fromNextData.length) return fromNextData;

    // Fallback: legacy DOM scraping if the event-box cards are still rendered
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

type NextData = {
  props?: {
    pageProps?: {
      dehydratedState?: {
        queries?: Array<{ state?: { data?: any } }>;
      };
    };
  };
};

const parseFromNextData = (html: string, logger: Logger): FightEvent[] => {
  const scriptMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!scriptMatch?.[1]) return [];

  try {
    const data: NextData = JSON.parse(scriptMatch[1]);
    const queries = data.props?.pageProps?.dehydratedState?.queries ?? [];
    const now = Date.now();
    const seen = new Set<string>();
    const events: FightEvent[] = [];

    queries.forEach((query) => {
      const entries = (query.state as any)?.data as any[] | undefined;
      if (!Array.isArray(entries)) return;

      entries.forEach((event) => {
        const id: string | undefined = event?.id?.toString();
        if (!id || seen.has(id)) return;

        const startDateRaw: string | undefined = event?.startDate;
        if (!startDateRaw) return;
        const startDate = new Date(startDateRaw);
        if (Number.isNaN(startDate.getTime()) || startDate.getTime() < now) return;

        const slug: string | undefined = event?.slug ?? event?.slugs?.[0];
        const url = slug ? `https://oktagonmma.com/en/events/${slug}` : "https://oktagonmma.com/en/events/";
        const titleObj = event?.title;
        const title: string | undefined = typeof titleObj === "string" ? titleObj : titleObj?.en ?? titleObj?.cs ?? titleObj?.de;
        if (!title) return;

        const city = event?.location?.city?.en ?? event?.location?.city?.cs ?? event?.location?.city ?? "";
        const country = event?.location?.country ?? "";
        const venue = event?.location?.name?.en ?? event?.location?.name?.cs ?? event?.location?.name ?? "";
        const location = [venue, city, country].filter(Boolean).join(", ");

        seen.add(id);
        events.push({ promotion: "oktagon", title, url, startDate, location: location || undefined, cardBouts: [] });
      });
    });

    return events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  } catch (error) {
    logger.error("Failed to parse Oktagon NEXT data", { error });
    return [];
  }
};
