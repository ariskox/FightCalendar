#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { createLogger } from "./utils/logger.js";
import { LogLevel, PromotionName, PromotionFetcher } from "./types.js";
import { UfcFetcher } from "./fetchers/ufc.js";
import { OktagonFetcher } from "./fetchers/oktagon.js";
import { OneFcFetcher } from "./fetchers/onefc.js";
import { GrMmafFetcher } from "./fetchers/grmmaf.js";
import { EventService } from "./services/eventService.js";
import { writeIcsFile } from "./utils/ical.js";

const program = new Command();

const aliases: Record<string, PromotionName> = {
  ufc: "ufc",
  oktagon: "oktagon",
  one: "one",
  grmma: "grmmaf",
  grmmaf: "grmmaf"
};

const parsePromotions = (input: string): Set<PromotionName> => {
  const normalized = input
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!normalized.length || normalized.includes("all")) {
    return new Set<PromotionName>(["ufc", "oktagon", "one", "grmmaf"]);
  }

  const selected = new Set<PromotionName>();
  const invalid = new Set<string>();

  normalized.forEach((value) => {
    const mapped = aliases[value];
    if (!mapped) {
      invalid.add(value);
      return;
    }
    selected.add(mapped);
  });

  if (invalid.size) {
    const values = Array.from(invalid.values()).join(", ");
    throw new Error(`Unknown promotions: ${values}. Allowed: all, ufc, oktagon, one, grmmaf (alias: grmma)`);
  }

  if (!selected.size) {
    throw new Error("No promotions selected. Use --promotions all or a comma-separated list.");
  }

  return selected;
};

program
  .name("fight-calendar")
  .description("Generate an iCal file with upcoming fight events (UFC, OKTAGON MMA, ONE FC, GR MMAF)")
  .option("-o, --output <file>", "Output .ics file path", "events.ics")
  .option(
    "--promotions <list>",
    "Comma-separated promotions to fetch (ufc,oktagon,one,grmmaf). Use 'all' for all promotions.",
    "all"
  )
  .option("-p, --include-past", "Include past events in the generated calendar", false)
  .option("--past-only", "Include only past events in the generated calendar", false)
  .option("-l, --log-level <level>", "Log level (fatal|error|warn|info|debug|trace|silent)", process.env.LOG_LEVEL ?? "error")
  .showHelpAfterError();

const run = async () => {
  const opts = program.parse(process.argv).opts<{ output: string; promotions: string; includePast: boolean; pastOnly: boolean; logLevel: LogLevel }>();
  const outputPath = resolve(process.cwd(), opts.output);
  const logger = createLogger(opts.logLevel);

  const allFetchers: PromotionFetcher[] = [new UfcFetcher(logger), new OktagonFetcher(logger), new OneFcFetcher(logger), new GrMmafFetcher(logger)];
  const selectedPromotions = parsePromotions(opts.promotions);
  const fetchers = allFetchers.filter((fetcher) => selectedPromotions.has(fetcher.name));

  logger.info("Selected promotions", { promotions: Array.from(selectedPromotions.values()) });

  const service = new EventService(fetchers, logger);

  const { events, counts } = await service.collectEvents({
    includePastEvents: opts.includePast || opts.pastOnly,
    pastEventsOnly: opts.pastOnly
  });
  if (!events.length) {
    logger.warn("No events found. Nothing to write to .ics file.");
    return;
  }

  await writeIcsFile(events, outputPath);
  logger.info(`Wrote ${events.length} events to ${outputPath}`);

  console.log("\nEvent counts by promotion:");
  Object.entries(counts).forEach(([promotion, count]) => {
    console.log(`  ${promotion.toUpperCase()}: ${count}`);
  });
};

run().catch((error) => {
  // Using console.error to ensure visibility even when log level hides debug/info.
  console.error("fight-calendar failed", error);
  process.exit(1);
});
