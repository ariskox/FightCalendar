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
    const deduped = this.dedupeEvents(events);
    return { events: deduped.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()), counts };
  }

  private dedupeEvents(events: FightEvent[]): FightEvent[] {
    const map = new Map<string, FightEvent>();

    events.forEach((event) => {
      const key = this.buildKey(event);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, event);
        return;
      }

      map.set(key, this.pickLatest(existing, event));
    });

    return Array.from(map.values());
  }

  private buildKey(event: FightEvent): string {
    if (event.url) return event.url.trim().toLowerCase();
    return `${event.promotion}:${event.title.trim().toLowerCase()}`;
  }

  private pickLatest(current: FightEvent, candidate: FightEvent): FightEvent {
    const currentTime = current.startDate.getTime();
    const candidateTime = candidate.startDate.getTime();

    if (candidateTime !== currentTime) {
      return candidateTime > currentTime ? candidate : current;
    }

    const currentScore = this.informationScore(current);
    const candidateScore = this.informationScore(candidate);
    return candidateScore >= currentScore ? candidate : current;
  }

  private informationScore(event: FightEvent): number {
    const hasLocation = event.location ? 1 : 0;
    const hasCard = event.cardBouts?.length ? 1 : 0;
    return hasLocation + hasCard;
  }
}
