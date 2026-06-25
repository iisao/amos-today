import { Client, isFullPage } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { marked } from "marked";

const apiKey = import.meta.env.NOTION_API_KEY;
const postsDbId = import.meta.env.NOTION_POSTS_DB_ID;
const projectsDbId = import.meta.env.NOTION_PROJECTS_DB_ID;

const enabled = Boolean(apiKey && postsDbId && projectsDbId);

if (!enabled) {
  console.warn(
    "[notion] NOTION_API_KEY or DB IDs missing; site will build with empty content. Set env vars in Vercel and locally in .env to enable.",
  );
}

const notion = enabled ? new Client({ auth: apiKey }) : null;
const n2m = notion ? new NotionToMarkdown({ notionClient: notion }) : null;

export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedDate: string | null;
  tags: string[];
  cover: string | null;
};

export type Project = {
  id: string;
  slug: string;
  title: string;
  code: string;
  year: number | null;
  type: string;
  status: "Public" | "Hidden" | "Featured";
  client: string;
  role: string;
  summary: string;
  cover: string | null;
};

function plainText(rich: any[] | undefined): string {
  if (!rich) return "";
  return rich.map((r) => r?.plain_text ?? "").join("");
}

function getProp(props: any, name: string): any {
  return props?.[name];
}

function readSelect(prop: any): string {
  return prop?.select?.name ?? "";
}

function readMultiSelect(prop: any): string[] {
  return (prop?.multi_select ?? []).map((t: any) => t.name);
}

function readNumber(prop: any): number | null {
  return prop?.number ?? null;
}

function readDate(prop: any): string | null {
  return prop?.date?.start ?? null;
}

function readText(prop: any): string {
  return plainText(prop?.rich_text);
}

function readTitle(prop: any): string {
  return plainText(prop?.title);
}

function readCover(page: any): string | null {
  if (page?.cover?.type === "external") return page.cover.external.url;
  if (page?.cover?.type === "file") return page.cover.file.url;
  const filesProp = Object.values(page?.properties ?? {}).find(
    (p: any) => p?.type === "files",
  ) as any;
  if (filesProp?.files?.[0]) {
    const f = filesProp.files[0];
    return f.type === "external" ? f.external.url : f.file?.url ?? null;
  }
  return null;
}

function pageToPost(page: any): Post | null {
  if (!isFullPage(page)) return null;
  const p = page.properties;
  const title = readTitle(getProp(p, "Title")) || readTitle(getProp(p, "Name")) || readTitle(getProp(p, "名稱"));
  const slug = readText(getProp(p, "Slug")) || page.id.replace(/-/g, "");
  return {
    id: page.id,
    slug,
    title: title || "Untitled",
    excerpt: readText(getProp(p, "Excerpt")),
    publishedDate: readDate(getProp(p, "Published Date")),
    tags: readMultiSelect(getProp(p, "Tags")),
    cover: readCover(page),
  };
}

function pageToProject(page: any): Project | null {
  if (!isFullPage(page)) return null;
  const p = page.properties;
  const title = readTitle(getProp(p, "Title")) || readTitle(getProp(p, "Name")) || readTitle(getProp(p, "名稱"));
  const slug = readText(getProp(p, "Slug")) || page.id.replace(/-/g, "");
  const status = (readSelect(getProp(p, "Status")) || "Hidden") as Project["status"];
  return {
    id: page.id,
    slug,
    title: title || "Untitled",
    code: readText(getProp(p, "Code")),
    year: readNumber(getProp(p, "Year")),
    type: readSelect(getProp(p, "Type")),
    status,
    client: readText(getProp(p, "Client")),
    role: readText(getProp(p, "Role")),
    summary: readText(getProp(p, "Summary")),
    cover: readCover(page),
  };
}

// @notionhq/client v5 split query off `databases` onto `dataSources`.
// Each database has one+ data sources; resolve once and cache the id per db.
const dataSourceCache = new Map<string, string>();

async function resolveDataSourceId(databaseId: string): Promise<string> {
  if (!notion) throw new Error("Notion client not initialized");
  const cached = dataSourceCache.get(databaseId);
  if (cached) return cached;
  const db = await notion.databases.retrieve({ database_id: databaseId });
  const sources = (db as any).data_sources as { id: string; name: string }[] | undefined;
  if (!sources?.[0]) throw new Error(`Database ${databaseId} has no data sources`);
  const id = sources[0].id;
  dataSourceCache.set(databaseId, id);
  return id;
}

export async function getPosts(): Promise<Post[]> {
  if (!notion) return [];
  const data_source_id = await resolveDataSourceId(postsDbId);
  const res = await notion.dataSources.query({
    data_source_id,
    filter: { property: "Status", select: { equals: "Published" } },
    sorts: [{ property: "Published Date", direction: "descending" }],
  });
  return res.results.map(pageToPost).filter((x): x is Post => x !== null);
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const all = await getPosts();
  return all.find((p) => p.slug === slug) ?? null;
}

export async function getProjects(): Promise<Project[]> {
  if (!notion) return [];
  const data_source_id = await resolveDataSourceId(projectsDbId);
  const res = await notion.dataSources.query({
    data_source_id,
    filter: {
      or: [
        { property: "Status", select: { equals: "Public" } },
        { property: "Status", select: { equals: "Featured" } },
      ],
    },
    sorts: [{ property: "Year", direction: "descending" }],
  });
  return res.results.map(pageToProject).filter((x): x is Project => x !== null);
}

export async function getFeaturedProjects(): Promise<Project[]> {
  const all = await getProjects();
  return all.filter((p) => p.status === "Featured").slice(0, 3);
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const all = await getProjects();
  return all.find((p) => p.slug === slug) ?? null;
}

export async function renderPageBody(pageId: string): Promise<string> {
  if (!n2m) return "";
  const blocks = await n2m.pageToMarkdown(pageId);
  const md = n2m.toMarkdownString(blocks).parent ?? "";
  let html = marked.parse(md, { async: false }) as string;
  // Standardize images: a standalone image whose alt carries a caption becomes
  // <figure><img><figcaption> so captions render centered + small (site standard).
  html = html.replace(
    /<p>\s*<img([^>]*?)\salt="([^"]*)"([^>]*?)>\s*<\/p>/g,
    (whole, pre, alt, post) =>
      alt
        ? `<figure><img${pre} alt="${alt}"${post} loading="lazy"><figcaption>${alt}</figcaption></figure>`
        : whole,
  );
  // Image-credit line: a paragraph opening with 圖片來源／來源／圖：gets a class
  // so it renders as de-emphasized gray small text with a top rule (Notion's
  // divider block does not survive this pipeline, so we cannot rely on <hr>).
  html = html.replace(
    /<p>((?:圖片來源|來源|圖)[：:][\s\S]*?)<\/p>/g,
    '<p class="img-credit">$1</p>',
  );
  return html;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
