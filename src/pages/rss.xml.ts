import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getPosts } from "../lib/notion";

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: "Amos｜樂創媒體",
    description:
      "Amos（蔡尚勲 / Amos Tsai）的觀點站。我用結構說故事，用故事推進。",
    site: context.site ?? "https://amos.today",
    items: posts.map((post) => ({
      title: post.title,
      description: post.excerpt,
      link: `/writing/${post.slug}/`,
      ...(post.publishedDate ? { pubDate: new Date(post.publishedDate) } : {}),
      categories: post.tags,
    })),
    customData: `<language>zh-Hant</language>`,
  });
}
