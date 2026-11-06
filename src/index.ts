import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

import { DISCLAIMER, OFFICIAL, WEB, clip, describe, getLaw, partFile, readFile, searchLaws, topics } from "./data";

const INSTRUCTIONS = `UK Law: the legislation of the United Kingdom (Acts and regulations of the UK Parliament, Scotland, Wales and Northern Ireland, historic parliaments and EU-origin law), converted from legislation.gov.uk and updated daily.

How to answer a question about UK law:
1. search_laws with words from the law's title (or browse list_topics / get_topic by subject).
2. get_law with the id. A long law returns its contents; then call get_law again with part, e.g. "section 86", "schedule 1", "part 2".
3. Answer from the text you read: name the law and section, quote the key words, give the official link, say how current the text is (status and text_date in the front matter: "as-enacted" means later amendments are NOT applied; "revised-with-pending-changes" means some are not yet applied) and where it applies (extent: E England, W Wales, S Scotland, N.I. Northern Ireland).
4. Say it is not legal advice and the official text or a lawyer should be checked.`;

const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

function text(t: string) {
	return { content: [{ type: "text" as const, text: t }] };
}

function createServer(env: Env) {
	const server = new McpServer({ name: "uk-law", version: "1.0.0" }, { instructions: INSTRUCTIONS });

	server.registerTool(
		"search_laws",
		{
			title: "Search UK laws",
			description:
				"Find UK Acts and regulations by words of their title, or by id (e.g. ukpga/1996/18). Exact titles, Acts and laws in force come first. Returns id, title, status, extent and topics.",
			inputSchema: z.object({
				query: z.string().describe('Words from the title, e.g. "employment rights act", or an id such as "ukpga/2018/12"'),
				types: z.array(z.string()).optional().describe("Only these id prefixes: ukpga (UK Acts), uksi (UK regulations), asp/ssi (Scotland), asc/anaw/wsi (Wales), nia/nisr (Northern Ireland), eur (EU-origin)"),
				in_force: z.boolean().optional().describe("Leave out repealed laws"),
				extent: z.string().optional().describe("Only laws that extend to E, W, S or N.I."),
				topic: z.string().optional().describe("Only laws under a topic whose name contains this text, e.g. Housing"),
				limit: z.number().int().min(1).max(50).optional().describe("Default 20"),
			}),
			annotations: readOnly,
		},
		async ({ query, types, in_force, extent, topic, limit }) => {
			const { rows, total } = await searchLaws(env.DB, { query, types, inForce: in_force, extent, topic, limit });
			if (!rows.length) return text("No law found. Try fewer or different words, or list_topics to browse by subject.");
			const more = total > rows.length ? `\n\n${total - rows.length} more match; add words or filters to narrow down.` : "";
			return text(`${rows.map(describe).join("\n")}${more}`);
		},
	);

	server.registerTool(
		"get_law",
		{
			title: "Read a UK law",
			description:
				"Read a law by id. Short laws come whole. Long laws (100+ sections) return their front matter and a Contents list: then ask for one part, e.g. part: \"section 86\", \"schedule 1\", \"regulation 3\" or \"part 2\" (lists that part's sections).",
			inputSchema: z.object({
				id: z.string().describe("Law id from search_laws, e.g. ukpga/1996/18"),
				part: z.string().optional().describe('One section, regulation, article, schedule or part of a long law, e.g. "section 86"'),
				max_chars: z.number().int().min(2000).max(200000).optional().describe("Default 60000"),
			}),
			annotations: readOnly,
		},
		async ({ id, part, max_chars }) => {
			const law = await getLaw(env.DB, id);
			if (!law) return text(`No law with id "${id}". Use search_laws to find it.`);
			let path = law.path;
			let body = await readFile(path);
			if (body === null) return text(`The file of ${law.title} could not be read (${WEB}/${path}).`);
			if (part) {
				if (!path.endsWith("/README.md")) {
					body = `(${law.title} is a single file; here is all of it.)\n\n${body}`;
				} else {
					const hit = partFile(body, part);
					if (hit.files) {
						return text(`${law.title}, ${part}: ask for one of these with get_law part:\n${hit.files.map((f) => `- ${f.replace(/-/g, " ")}`).join("\n")}`);
					}
					if (!hit.file) return text(`No "${part}" in the contents of ${law.title}. Call get_law without part to see the contents.`);
					path = `${path.slice(0, -"README.md".length)}${hit.file}`;
					body = (await readFile(path)) ?? `The file ${path} could not be read.`;
				}
			}
			return text(`${clip(body, max_chars ?? 60000)}\n\nFile: ${WEB}/${path}\nOfficial: ${OFFICIAL}/${law.id}\n${DISCLAIMER}`);
		},
	);

	server.registerTool(
		"list_topics",
		{
			title: "List topics",
			description: "Topics (the official subject headings of legislation.gov.uk) with the number of Acts and regulations in force. Optionally only those whose name has these words.",
			inputSchema: z.object({ query: z.string().optional().describe("e.g. housing, tax, employment") }),
			annotations: readOnly,
		},
		async ({ query }) => {
			const ws = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
			const list = (await topics()).filter((t) => ws.every((w) => t.name.toLowerCase().includes(w)));
			if (!list.length) return text("No topic with those words. Call list_topics without a query to see them all.");
			return text(list.map((t) => `- ${t.name} (${t.acts} Acts, ${t.regs} regulations in force)`).join("\n"));
		},
	);

	server.registerTool(
		"get_topic",
		{
			title: "Read a topic page",
			description: "The Acts and regulations in force on one topic, with how many regulations each Act has on it. Big topics list regulations by year: pass year to read one.",
			inputSchema: z.object({
				name: z.string().describe("Topic name from list_topics, e.g. Landlord and Tenant"),
				year: z.string().optional().describe("For big topics: the year of regulations to list"),
				max_chars: z.number().int().min(2000).max(200000).optional().describe("Default 60000"),
			}),
			annotations: readOnly,
		},
		async ({ name, year, max_chars }) => {
			const all = await topics();
			const n = name.toLowerCase().trim();
			const found = all.find((t) => t.name.toLowerCase() === n) ?? all.filter((t) => t.name.toLowerCase().includes(n));
			const topic = Array.isArray(found) ? (found.length === 1 ? found[0] : null) : found;
			if (!topic) {
				const options = Array.isArray(found) && found.length ? `Several match: ${found.map((t) => t.name).join("; ")}` : "No such topic; use list_topics.";
				return text(options);
			}
			let file = topic.file;
			if (year && file.endsWith("/README.md")) file = file.replace(/README\.md$/, `${year}.md`);
			const body = await readFile(file);
			if (body === null) return text(`No page for ${topic.name}${year ? ` in ${year}` : ""}.`);
			return text(`${clip(body, max_chars ?? 60000)}\n\nPage: ${WEB}/${file}\n${DISCLAIMER}`);
		},
	);

	return server;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/mcp") {
			return createMcpHandler(() => createServer(env), { route: "/mcp" })(request, env, ctx);
		}
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
