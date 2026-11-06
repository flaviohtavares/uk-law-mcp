/** Search and read UK legislation: the index lives in D1, the texts are read from GitHub. */

export const REPO = "flaviohtavares/uk-law";
export const RAW = `https://raw.githubusercontent.com/${REPO}/main`;
export const WEB = `https://github.com/${REPO}/blob/main`;
export const OFFICIAL = "https://www.legislation.gov.uk";
export const DISCLAIMER =
	"Not an official source and not legal advice: check the official text at legislation.gov.uk before relying on it.";

export const ACT_TYPES = ["ukpga", "ukla", "apgb", "aep", "aosp", "aip", "apni", "mnia", "nisi", "nia", "asp", "mwa", "anaw", "asc", "ukcm"];

export type Law = {
	id: string;
	type: string;
	year: string;
	number: string;
	title: string;
	status: string;
	extent: string;
	topics: string;
	path: string;
};

export type SearchOptions = {
	query: string;
	types?: string[];
	inForce?: boolean;
	extent?: string;
	topic?: string;
	limit?: number;
};

export function words(text: string): string[] {
	return (text.toLowerCase().replace(/[’']/g, "").match(/[a-z0-9]+/g) ?? []).slice(0, 12);
}

const COLUMNS = "l.id, l.type, l.year, l.number, l.title, l.status, l.extent, l.topics, l.path";

export async function getLaw(db: D1Database, id: string): Promise<Law | null> {
	return db.prepare(`SELECT ${COLUMNS} FROM laws l WHERE l.id = ?1`).bind(id.trim().replace(/^\/+|\/+$/g, "")).first<Law>();
}

export async function searchLaws(db: D1Database, o: SearchOptions): Promise<{ rows: Law[]; total: number }> {
	const q = o.query.trim();
	if (q.includes("/")) {
		const law = await getLaw(db, q);
		if (law) return { rows: [law], total: 1 };
	}
	const w = words(q);
	if (!w.length) return { rows: [], total: 0 };
	const match = w.map((x) => `title:"${x}"`).join(" AND ");
	const phrase = w.join(" ");
	const where = ["laws_fts MATCH ?1"];
	const args: unknown[] = [match];
	if (o.types?.length) {
		where.push(`l.type IN (${o.types.map((t) => { args.push(t.toLowerCase()); return `?${args.length}`; }).join(",")})`);
	}
	if (o.inForce) where.push("l.status != 'repealed'");
	if (o.extent) {
		args.push(`%+${o.extent.toUpperCase().replace(/^NI$/, "N.I.")}+%`);
		where.push(`('+' || l.extent || '+') LIKE ?${args.length}`);
	}
	if (o.topic) {
		args.push(`%${o.topic}%`);
		where.push(`l.topics LIKE ?${args.length}`);
	}
	args.push(phrase);
	const p = `?${args.length}`;
	const acts = ACT_TYPES.map((t) => `'${t}'`).join(",");
	const limit = Math.max(1, Math.min(o.limit ?? 20, 50));
	const sql = `SELECT ${COLUMNS}, count(*) OVER () AS total
		FROM laws_fts JOIN laws l ON l.rid = laws_fts.rowid
		WHERE ${where.join(" AND ")}
		ORDER BY (lower(l.title) = ${p} OR lower(l.title) = 'the ' || ${p}) DESC,
			instr(lower(l.title), ${p}) > 0 DESC,
			l.type IN (${acts}) DESC,
			l.status != 'repealed' DESC,
			CAST(l.year AS INTEGER) DESC,
			length(l.title)
		LIMIT ${limit}`;
	const res = await db.prepare(sql).bind(...args).all<Law & { total: number }>();
	const rows = res.results ?? [];
	return { rows, total: rows[0]?.total ?? 0 };
}

export async function readFile(path: string): Promise<string | null> {
	const url = `${RAW}/${path.split("/").map(encodeURIComponent).join("/")}`;
	const res = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`GitHub returned ${res.status} for ${path}`);
	return res.text();
}

/** The file of `part` ("section 5", "s.5", "schedule 1", "part 2", "regulation 3") among a README's links. */
export function partFile(contents: string, part: string): { file?: string; folder?: string; files?: string[] } {
	let p = part.toLowerCase().trim();
	p = p.replace(/^(s|ss|sec)\.?\s*(?=\d)/, "section ").replace(/^(reg|r)\.?\s*(?=\d)/, "regulation ").replace(/^(sch|sched)\.?\s*(?=\d)/, "schedule ").replace(/^(art)\.?\s*(?=\d)/, "article ");
	const slug = p.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	const links = [...contents.matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => m[1]);
	const stem = (l: string) => l.split("/").pop()!.replace(/\.md$/, "");
	const hit = links.find((l) => stem(l) === slug);
	if (hit) return { file: hit };
	const inFolder = links.filter((l) => l.split("/")[0] === slug);
	if (inFolder.length) return { folder: slug, files: inFolder.map(stem) };
	return {};
}

export type Topic = { name: string; file: string; acts: number; regs: number };

export async function topics(): Promise<Topic[]> {
	const text = (await readFile("topics/README.md")) ?? "";
	return [...text.matchAll(/^\| \[([^\]]+)\]\(([^)]+)\) \| (\d+) \| (\d+) \|$/gm)].map((m) => ({
		name: m[1], file: `topics/${m[2]}`, acts: Number(m[3]), regs: Number(m[4]),
	}));
}

export function clip(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max)}\n\n[... cut at ${max} characters. Ask for one section or part instead, or raise max_chars.]`;
}

export function describe(l: Law): string {
	const bits = [l.status, l.extent ? `extent ${l.extent}` : "", l.topics ? `topics: ${l.topics}` : ""].filter(Boolean);
	return `- ${l.id} — ${l.title} [${bits.join("; ")}]`;
}
