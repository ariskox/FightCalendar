import { PromotionFetcher, FightEvent, Logger, FetchOptions } from "../types.js";
import { fetchDocument } from "./base.js";

const BASE_URL = "https://www.tapology.com";
const PROMOTION_URL = `${BASE_URL}/fightcenter/promotions/3664-quest-fighting-league-qfl`;

export class QuestFlFetcher implements PromotionFetcher {
  readonly name = "questfl" as const;

  constructor(private readonly logger: Logger) {}

  async fetchUpcomingEvents(options?: FetchOptions): Promise<FightEvent[]> {
    const includePastEvents = Boolean(options?.includePastEvents);
    const pastEventsOnly = Boolean(options?.pastEventsOnly);

    this.logger.debug("QuestFL fetch starting", { includePastEvents, pastEventsOnly, url: PROMOTION_URL });

    const $ = await fetchDocument(PROMOTION_URL, this.logger);
    const events: FightEvent[] = [];
    const now = Date.now();

    $("ul.fcListing li.fcEvent, ul.fcListing li").each((_, el) => {
      const item = $(el);

      const nameEl = item.find("a.name").first();
      const title = nameEl.text().trim();
      const href = nameEl.attr("href") ?? "";
      const url = href ? (href.startsWith("http") ? href : `${BASE_URL}${href}`) : PROMOTION_URL;

      const dateText = item.find("span.date, div.date, .date").first().text().trim();
      const startDate = parseDate(dateText);

      if (!title || !startDate) {
        this.logger.debug("Skipping QuestFL event with missing title or date", { title, dateText });
        return;
      }

      const location = item.find("span.location, div.location, .location").first().text().trim() || undefined;
      const isPastEvent = startDate.getTime() < now;

      if (pastEventsOnly && !isPastEvent) return;
      if (!includePastEvents && isPastEvent) return;

      this.logger.debug("Accepted QuestFL event", { title, url, startDate: startDate.toISOString(), location });
      events.push({ promotion: this.name, title, url, startDate, location });
    });

    this.logger.debug("QuestFL fetch completed", { count: events.length });
    return events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }
}

const parseDate = (value: string): Date | null => {
  if (!value) return null;

  // Handle "Sat 04.19.2025" or "04.19.2025" (MM.DD.YYYY)
  const dotMatch = value.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (dotMatch) {
    const [, month, day, year] = dotMatch;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  // Handle "Apr 19, 2025" or "April 19, 2025"
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed);

  return null;
};
