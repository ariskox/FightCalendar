#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { createLogger } from "./utils/logger.js";
import { LogLevel } from "./types.js";
import { UfcFetcher } from "./fetchers/ufc.js";
import { OktagonFetcher } from "./fetchers/oktagon.js";
import { OneFcFetcher } from "./fetchers/onefc.js";
import { EventService } from "./services/eventService.js";
import { writeIcsFile } from "./utils/ical.js";

const program = new Command();

program
  .name("fight-calendar")
  .description("Generate an iCal file with upcoming fight events (UFC, OKTAGON MMA, ONE FC)")
  .option("-o, --output <file>", "Output .ics file path", "events.ics")
  .option("-l, --log-level <level>", "Log level (fatal|error|warn|info|debug|trace|silent)", process.env.LOG_LEVEL ?? "error")
  .showHelpAfterError();

const run = async () => {
  const opts = program.parse(process.argv).opts<{ output: string; logLevel: LogLevel }>();
  const outputPath = resolve(process.cwd(), opts.output);
  const logger = createLogger(opts.logLevel);

  const fetchers = [new UfcFetcher(logger), new OktagonFetcher(logger), new OneFcFetcher(logger)];
  const service = new EventService(fetchers, logger);

  const { events, counts } = await service.collectEvents();
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
