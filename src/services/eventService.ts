import { PromotionFetcher, FightEvent, Logger } from "../types.js";
import { ProgressBar } from "../utils/progress.js";

export class EventService {
  constructor(private readonly fetchers: PromotionFetcher[], private readonly logger: Logger) {}

  async collectEvents(): Promise<{ events: FightEvent[]; counts: Record<string, number> }> {
    const progress = new ProgressBar(this.fetchers.length);
    const events: FightEvent[] = [];
    const counts: Record<string, number> = {};

    for (const fetcher of this.fetchers) {
      try {
        const promotionEvents = await fetcher.fetchUpcomingEvents();
        promotionEvents.forEach((event) => events.push(event));
        counts[fetcher.name] = promotionEvents.length;
        this.logger.info(`Fetched ${promotionEvents.length} events for ${fetcher.name}`);
      } catch (error) {
        this.logger.error(`Failed to fetch events for ${fetcher.name}`, { error });
        counts[fetcher.name] = 0;
      } finally {
        progress.increment(fetcher.name);
      }
    }

    progress.stop();
    return { events: events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()), counts };
  }
}
