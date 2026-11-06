# UK Law MCP server

A free, read-only [MCP](https://modelcontextprotocol.io) server that lets AI assistants (Claude,
ChatGPT, Claude Code, Codex and others) search and read all UK legislation, about 130,000 Acts and
regulations from [UK Law](https://github.com/flaviohtavares/uk-law), updated daily from
legislation.gov.uk.

> **Not legal advice.** The texts are an unofficial copy and can be out of date or contain
> conversion errors. Always check the official text at [legislation.gov.uk](https://www.legislation.gov.uk).

**Server URL:** `https://uk-law-mcp.<account>.workers.dev/mcp` (no sign-in). The page at the root of
that address has the same instructions.

## Connect

- **Claude (claude.ai, Claude Desktop):** Settings → Connectors → *Add custom connector* → paste the URL.
- **ChatGPT:** Settings → Apps & Connectors → Advanced → *Developer mode* → *Create* → paste the URL,
  "No authentication". Availability depends on the plan.
- **Claude Code:** `claude mcp add --transport http uk-law <URL>`
- **Codex:** in `~/.codex/config.toml`:
  ```toml
  [mcp_servers.uk-law]
  url = "<URL>"
  ```

Then ask, for example: *"What does the Employment Rights Act say about notice periods?"*

## Tools

| tool | does |
|---|---|
| `search_laws` | find laws by words of the title or by id; filters: `types`, `in_force`, `extent`, `topic`, `limit` |
| `get_law` | read a law; for long laws, the contents, then one `part` ("section 86", "schedule 1", "part 2") |
| `list_topics` | official subject headings with counts of laws in force |
| `get_topic` | Acts and regulations in force on one topic (`year` for big topics) |

## How it works

A Cloudflare Worker with a stateless MCP handler (`createMcpHandler` from the Agents SDK). The
index of laws (`index/laws.csv` of the data repository) is kept in D1 with a full-text index on the
titles; the texts are read from GitHub (cached for an hour). No user data is stored.

## Run your own

```sh
npm install
npx wrangler login
npx wrangler d1 create uk-law          # put the database_id in wrangler.jsonc
npm run sync:full                      # loads index/laws.csv from a clone of uk-law (UKLAW_DATA)
npm run deploy
```

`npm run sync` sends only the rows that changed since the last sync; the maintainer runs it after
each daily update. For local development: `python3 scripts/sync.py --full --local` and `npm run dev`.

## Who maintains this

Built and maintained by **[Tavlabs Ltd](https://www.tavlabs.uk/uk-law?utm_source=github&utm_medium=uk-law-mcp)**,
a London software house for small and medium businesses. contact@tavlabs.uk

Not affiliated with or endorsed by The National Archives, legislation.gov.uk or the UK Government.
Code: MIT. Legislation texts: © Crown and database right, Open Government Licence v3.0.
