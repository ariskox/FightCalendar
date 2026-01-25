import { createEvents, EventAttributes, EventStatus } from "ics";
import { writeFile } from "node:fs/promises";
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
      title: `[${event.promotion.toUpperCase()}] ${event.title}`,
      description: buildDescription(event),
      url: event.url,
      start,
      duration: { hours: 3 },
      location: event.location ?? "",
      status: "CONFIRMED" as EventStatus,
      productId: "fight-calendar-cli"
    };
  });

  const { error, value } = createEvents(icsEvents);
  if (error) {
    throw error;
  }
  await writeFile(outputPath, value ?? "");
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
