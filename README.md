## Fight Calendar CLI

Generate an iCal file with upcoming fight events from UFC, OKTAGON MMA, and ONE FC.

Use this link to subscribe directly. Daily updates.<br>
[Fight Calendar](https://ariskox.github.io/FightCalendar/)

### Installation

```bash
pnpm install
pnpm build
```

### Usage

Run the CLI to fetch events and create an `.ics` file:

```bash
node dist/cli.js --output fight_calendar.ics
```

Options:

- `-o, --output <file>`: Path to the output `.ics` file (default: `events.ics`)
- `-l, --log-level <level>`: `fatal|error|warn|info|debug|trace|silent` (default: `error`)

After execution, the CLI prints a summary of event counts by promotion and writes the calendar file to the specified location.
