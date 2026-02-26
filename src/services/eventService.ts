import { PromotionFetcher, FightEvent, Logger, FetchOptions } from "../types.js";
import { ProgressBar } from "../utils/progress.js";

export class EventService {
  private static readonly multipleSlashesPattern = /\/{2,}/g;
  private static readonly trailingSlashesPattern = /\/+$/;

  constructor(private readonly fetchers: PromotionFetcher[], private readonly logger: Logger) {}

  async collectEvents(options?: FetchOptions): Promise<{ events: FightEvent[]; counts: Record<string, number> }> {
    const progress = new ProgressBar(this.fetchers.length);
    const events: FightEvent[] = [];
    const counts: Record<string, number> = {};

    for (const fetcher of this.fetchers) {
      try {
        const promotionEvents = await fetcher.fetchUpcomingEvents(options);
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
    const byUrl = new Map<string, FightEvent>();
    const byTitleDate = new Map<string, FightEvent>();

    events.forEach((event) => {
      const urlKey = this.buildUrlKey(event);
      const titleDateKey = this.buildTitleDateKey(event);
      const existingByUrl = urlKey ? byUrl.get(urlKey) : undefined;
      const existing = existingByUrl ?? byTitleDate.get(titleDateKey);
      if (!existing) {
        if (urlKey) byUrl.set(urlKey, event);
        byTitleDate.set(titleDateKey, event);
        return;
      }

      const merged = this.pickLatest(existing, event);
      const existingUrlKey = this.buildUrlKey(existing);
      const existingTitleDateKey = this.buildTitleDateKey(existing);
      const mergedTitleDateKey = this.buildTitleDateKey(merged);

      if (urlKey) byUrl.set(urlKey, merged);
      if (existingUrlKey && existingUrlKey !== urlKey) byUrl.set(existingUrlKey, merged);

      if (titleDateKey !== mergedTitleDateKey) byTitleDate.delete(titleDateKey);
      if (existingTitleDateKey !== mergedTitleDateKey && existingTitleDateKey !== titleDateKey) {
        byTitleDate.delete(existingTitleDateKey);
      }
      byTitleDate.set(mergedTitleDateKey, merged);
    });

    return Array.from(byTitleDate.values());
  }

  private buildUrlKey(event: FightEvent): string {
    if (!event.url) return "";
    const trimmed = event.url.trim();
    if (!trimmed) return "";
    try {
      const parsed = new URL(trimmed);
      const normalizedOrigin = parsed.origin.toLowerCase();
      const normalizedPath = this.normalizePath(parsed.pathname).toLowerCase();
      return `${normalizedOrigin}${normalizedPath}`;
    } catch {
      return trimmed.toLowerCase();
    }
  }

  private buildTitleDateKey(event: FightEvent): string {
    const normalizedTitle = event.title.trim().toLowerCase().replace(/\s+/g, " ");
    const dateKey = event.startDate.toISOString().split("T")[0];
    return `${event.promotion}:${normalizedTitle}:${dateKey}`;
  }

  private normalizePath(pathname: string): string {
    return (
      pathname
        .replace(EventService.multipleSlashesPattern, "/")
        .replace(EventService.trailingSlashesPattern, "") || "/"
    );
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
