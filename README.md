# UK Law MCP server

A free, read-only [MCP](https://modelcontextprotocol.io) server that lets AI assistants (Claude,
ChatGPT, Claude Code, Codex and others) search and read all UK legislation, about 130,000 Acts and
regulations from [UK Law](https://github.com/flaviohtavares/uk-law), updated daily from
legislation.gov.uk.

> **Not legal advice.** The texts are an unofficial copy and can be out of date or contain
> conversion errors. Always check the official text at [legislation.gov.uk](https://www.legislation.gov.uk).

**Server URL:** `https://uk-law-mcp.uk-law-mcp.workers.dev/mcp` (no sign-in). The page at the root of
that address has the same instructions.

## Install: step by step

There are two ways to connect an assistant, and both are free:

- the **MCP server** (`https://uk-law-mcp.uk-law-mcp.workers.dev/mcp`), for Claude, ChatGPT, Claude Code and Codex. Nothing to install on your computer and no sign-in;
- the **skill** (a small Python script), for Claude Code and Codex. It reads GitHub directly and works without the server.

After installing, test it with a question such as:
*"What does section 86 of the Employment Rights Act 1996 say about notice periods?"*
The answer should quote the section and link legislation.gov.uk.

### Claude (claude.ai, Claude Desktop and the mobile apps)

Works on every plan; the Free plan allows one custom connector.

1. Open [Customize → Connectors](https://claude.ai/customize/connectors). The same connector then works in Claude Desktop and the mobile apps.
2. Click **+ Add**, then **Add custom connector**.
3. Name: `UK Law`. Remote MCP server URL: `https://uk-law-mcp.uk-law-mcp.workers.dev/mcp`. Click **Continue**.
4. Under **Authentication**, choose **No sign in**, then click **Add**.
5. In a chat, click **+** (bottom left) → **Connectors** and make sure **UK Law** is switched on. Then ask your question.

On Team and Enterprise plans an Owner adds the connector once in **Organization settings → Connectors**
(Add → Custom → Web, same URL, "No sign in"); members then switch it on in Customize → Connectors.

### Claude Code

**Option A, the plugin (recommended).** Type in Claude Code:

```
/plugin marketplace add flaviohtavares/uk-law-tools
/plugin install uk-law@uk-law-tools
```

Restart Claude Code if asked. Update later with `/plugin marketplace update uk-law-tools`.

**Option B, the MCP server.** In a terminal:

```sh
claude mcp add --transport http --scope user uk-law https://uk-law-mcp.uk-law-mcp.workers.dev/mcp
```

`--scope user` makes it available in every project. Check it with `/mcp` inside Claude Code.

### Codex (CLI, IDE extension and app)

**Option A, the MCP server.** In a terminal:

```sh
codex mcp add uk-law --url https://uk-law-mcp.uk-law-mcp.workers.dev/mcp
```

or add this to `~/.codex/config.toml`:

```toml
[mcp_servers.uk-law]
url = "https://uk-law-mcp.uk-law-mcp.workers.dev/mcp"
```

Check it with `codex mcp list`, then start a new Codex session.

**Option B, the skill.** In a terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/flaviohtavares/uk-law-tools/main/install.sh | sh
```

It copies the skill to `~/.agents/skills/uk-law` (and `~/.codex/skills/uk-law`). Restart Codex.
Run the same command to update.

### ChatGPT

Custom MCP servers work on **chatgpt.com (web)** with a **Pro**, **Business** or **Enterprise/Edu**
plan. On Business, only workspace admins and owners can add them.

1. Open [Plugins](https://chatgpt.com/plugins).
2. Click **+**, then **Add custom MCP server**.
3. Name: `UK Law`. Under **Connection**, enter `https://uk-law-mcp.uk-law-mcp.workers.dev/mcp`.
4. Authentication: **None**.
5. Tick **I understand and want to continue**, then click **Create as a plugin** and install it.
6. In a new chat, type **@**, pick **UK Law**, and ask your question.

**Free and Plus plans:** paste this link into the chat and ask your question; ChatGPT reads the
instructions and opens the right file:

```
https://raw.githubusercontent.com/flaviohtavares/uk-law/main/llms.txt
```

### Other MCP clients

Add `https://uk-law-mcp.uk-law-mcp.workers.dev/mcp` as a remote server (Streamable HTTP transport,
no authentication).

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
