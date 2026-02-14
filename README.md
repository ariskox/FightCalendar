## Fight Calendar CLI

Generate an iCal file with fight events from UFC, OKTAGON MMA, and ONE FC.

Use this link to subscribe directly. Daily updates.<br>
[Fight Calendar](https://ariskox.github.io/FightCalendar/)

### Installation

```bash
pnpm install
pnpm build
```

### Usage

Run the CLI to fetch upcoming events and create an `.ics` file:

```bash
node dist/cli.js --output fight_calendar.ics
```

Options:

- `-o, --output <file>`: Path to the output `.ics` file (default: `events.ics`)
- `-p, --include-past`: Include past events in addition to upcoming ones
- `--past-only`: Include only past events (implies `--include-past`)
- `-l, --log-level <level>`: `fatal|error|warn|info|debug|trace|silent` (default: `error`)

Example including past events:

```bash
node dist/cli.js --output fight_calendar.ics --include-past
```

When past events are enabled (`--include-past` or `--past-only`), UFC also performs one extra "Load More" fetch to include one additional page of historical events.

Example for past events only:

```bash
node dist/cli.js --output fight_calendar.ics --past-only
```

After execution, the CLI prints a summary of event counts by promotion and writes the calendar file to the specified location.
