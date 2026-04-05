export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface FightEvent {
  promotion: PromotionName;
  title: string;
  url: string;
  startDate: Date;
  endDate?: Date;
  location?: string;
  cardBouts?: Bout[];
}

export interface Bout {
  fighters: string; // e.g., "Fighter A vs Fighter B"
  weightClass?: string;
  isTitleFight?: boolean;
  boutOrder?: number;
}

export type PromotionName = "ufc" | "oktagon" | "one" | "grmmaf";

export interface FetchOptions {
  includePastEvents?: boolean;
  pastEventsOnly?: boolean;
}

export interface PromotionFetcher {
  readonly name: PromotionName;
  fetchUpcomingEvents(options?: FetchOptions): Promise<FightEvent[]>;
}

export interface FetchContext {
  logger: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
