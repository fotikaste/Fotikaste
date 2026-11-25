import type { APIRoute } from "astro";
import { pages } from "../config/pages";
import { buildSitemapXml } from "../lib/seo";

export const GET: APIRoute = () =>
  new Response(buildSitemapXml(pages, new Date().toISOString().slice(0, 10)), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
