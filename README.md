## Fight Calendar CLI

Generate an iCal file with fight events from UFC, OKTAGON MMA, ONE FC, and GR MMAF.

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
- `--promotions <list>`: Comma-separated promotions (`ufc,oktagon,one,grmmaf`) or `all` (default: `all`, alias: `grmma`)
- `-p, --include-past`: Include past events in addition to upcoming ones
- `--past-only`: Include only past events (implies `--include-past`)
- `-l, --log-level <level>`: `fatal|error|warn|info|debug|trace|silent` (default: `error`)

Example selecting only GR MMAF:

```bash
node dist/cli.js --promotions grmma
```

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

### GR MMAF via GitHub Models

The GR MMAF fetcher uses GitHub Models to classify news posts and extract event metadata.

Required environment variables:

- `FC_MODELS_TOKEN`: Token with `models:read`

Optional environment variables:

- `FC_MODELS_MODEL`: Model ID (default: `openai/gpt-4.1-mini`)
- `FC_MODELS_ENDPOINT`: Endpoint (default: `https://models.github.ai/inference/chat/completions`)
- `GRMMAF_FEED_PAGE_LIMIT`: Number of RSS pages to scan (default: `3`)
- `GRMMAF_MAX_LATEST_ARTICLES`: Number of latest GR MMAF posts to process (default: `5`)
- `GRMMAF_ARTICLE_MAX_CHARS`: Max article chars sent to model (default: `2400`)

If no token is configured, GR MMAF is skipped and other promotions continue normally.
