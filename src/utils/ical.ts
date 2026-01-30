import { createEvents, EventAttributes, EventStatus } from "ics";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { FightEvent } from "../types.js";

export const writeIcsFile = async (events: FightEvent[], outputPath: string): Promise<void> => {
  const icsEvents: EventAttributes[] = events.map((event) => {
    const startDate = event.startDate;
    const start: [number, number, number, number, number] = [
      startDate.getFullYear(),
      startDate.getMonth() + 1,
      startDate.getDate(),
      startDate.getHours(),
      startDate.getMinutes()
    ];

    return {
      title: formatTitle(event),
      description: buildDescription(event),
      url: event.url,
      start,
      duration: { hours: 3 },
      location: event.location ?? "",
      status: "CONFIRMED" as EventStatus,
      productId: "fight-calendar-cli",
      uid: buildEventKey(event)
    };
  });

  const { error, value } = createEvents(icsEvents);
  if (error) {
    throw error;
  }

  const newVevents = extractVevents(value ?? "");
  const mergedVevents = await mergeWithExisting(outputPath, newVevents);
  const body = mergedVevents
    .sort((a, b) => (toTime(a.dtstart) ?? 0) - (toTime(b.dtstart) ?? 0))
    .map((entry) => entry.raw)
    .join("\n");

  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:fight-calendar-cli",
    "METHOD:PUBLISH",
    "X-PUBLISHED-TTL:PT1H",
    body,
    "END:VCALENDAR"
  ].join("\n");

  await writeFile(outputPath, calendar);
};

const formatTitle = (event: FightEvent): string => {
  if (event.promotion.toLowerCase() === "ufc") {
    return `[UFC] ${event.title}`;
  }
  return event.title;
};

const normalizeSummary = (summary: string | undefined): string => {
  if (!summary) return "";
  return summary.replace(/^\[[^\]]+\]\s*/, "").trim();
};

const buildEventKey = (event: FightEvent): string => {
  const normalizedTitle = normalizeSummary(event.title);
  const dateIso = event.startDate.toISOString();
  return event.url ?? `${normalizedTitle}|${dateIso}`;
};

type ParsedVevent = { key: string; dtstart?: string; raw: string };

const mergeWithExisting = async (outputPath: string, newEvents: ParsedVevent[]): Promise<ParsedVevent[]> => {
  const map = new Map<string, ParsedVevent>();

  if (existsSync(outputPath)) {
    const existingContent = await readFile(outputPath, "utf8");
    const existingEvents = extractVevents(existingContent);
    existingEvents.forEach((entry) => {
      if (entry.key) {
        map.set(entry.key, entry);
      }
    });
  }

  newEvents.forEach((entry) => {
    const existing = map.get(entry.key);
    map.set(entry.key, existing && existing.raw === entry.raw ? existing : entry);
  });

  return Array.from(map.values());
};

const extractVevents = (icsContent: string): ParsedVevent[] => {
  const unfolded = unfoldLines(icsContent);
  const parts = unfolded.split(/BEGIN:VEVENT/).slice(1);
  const collected: ParsedVevent[] = [];

  parts.forEach((part) => {
    const vevent = `BEGIN:VEVENT\n${part.split("END:VEVENT")[0]}\nEND:VEVENT`;
    const lines = vevent.split(/\n/).map((line) => line.trim());
    let summary: string | undefined;
    let url: string | undefined;
    let dtstart: string | undefined;
    let uid: string | undefined;
    lines.forEach((line) => {
      if (line.startsWith("SUMMARY:")) summary = line.slice("SUMMARY:".length);
      if (line.startsWith("URL:")) url = line.slice("URL:".length);
      if (line.startsWith("DTSTART:")) dtstart = line.slice("DTSTART:".length);
      if (line.startsWith("UID:")) uid = line.slice("UID:".length);
    });

    const key = buildKeyFromParts({ url, summary, dtstart, uid });
    if (!key) return;
    collected.push({ key, dtstart, raw: vevent });
  });

  return collected;
};

const toTime = (dtstart?: string): number | undefined => {
  if (!dtstart) return undefined;
  const parsed = new Date(dtstart.replace(/Z?$/, "Z"));
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.getTime();
};

const unfoldLines = (content: string): string => {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .reduce<string[]>((acc, line) => {
      if (line.startsWith(" ") || line.startsWith("\t")) {
        acc[acc.length - 1] = `${acc[acc.length - 1]}${line.slice(1)}`;
      } else {
        acc.push(line);
      }
      return acc;
    }, [])
    .join("\n");
};

const buildKeyFromParts = (parts: { url?: string; summary?: string; dtstart?: string; uid?: string }): string | undefined => {
  if (parts.url) return parts.url.trim();
  if (parts.summary && parts.dtstart) return `${normalizeSummary(parts.summary)}|${parts.dtstart.trim()}`;
  if (parts.uid) return parts.uid.trim();
  return undefined;
};

const buildDescription = (event: FightEvent): string => {
  const lines = [`Promotion: ${event.promotion}`, event.location ? `Location: ${event.location}` : undefined];
  if (event.cardBouts?.length) {
    lines.push("Fight Card:");
    event.cardBouts
      .sort((a, b) => (a.boutOrder ?? 0) - (b.boutOrder ?? 0))
      .forEach((bout, index) => {
        const label = bout.boutOrder ? `#${bout.boutOrder}` : `#${index + 1}`;
        const extras = [bout.weightClass, bout.isTitleFight ? "Title Fight" : undefined].filter(Boolean).join(" | ");
        lines.push(`  ${label} ${bout.fighters}${extras ? ` (${extras})` : ""}`);
      });
  }
  return lines.filter(Boolean).join("\n");
};
