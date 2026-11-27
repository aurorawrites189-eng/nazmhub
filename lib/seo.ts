/**
 * Shared SEO helpers for story pages — per-page descriptions and
 * Article JSON-LD. (Nov 21, 2026: generic titles/descriptions fix.)
 * Titles themselves come from each page's generateMetadata (story title
 * in the story's own language); these helpers build the description
 * from the story text and the structured-data block.
 */
import { SITE } from "./site-config";

/** First ~150 chars of story text, cut cleanly at a word boundary. */
export function excerpt(text: string | null | undefined, maxLen = 150): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** Normalize the stored post language to a BCP 47 code for JSON-LD. */
export function langCode(language: string | null | undefined): "ur" | "en" {
  return typeof language === "string" && language.toLowerCase().startsWith("ur")
    ? "ur"
    : "en";
}

export interface ArticleJsonLdInput {
  headline: string;
  description: string;
  /** Canonical URL of the story (its /posts/<slug> home). */
  url: string;
  authorName?: string | null;
  datePublished?: string | null;
  inLanguage?: string;
  /** Cover image URL — Google's Article rich result requires an image. */
  image?: string | null;
}

/** Minimal valid Article structured data for a story/episode page. */
export function articleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const base = SITE.url.replace(/\/$/, "");
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    inLanguage: input.inLanguage ?? "en",
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      url: base,
    },
  };
  if (input.authorName) {
    jsonLd.author = { "@type": "Person", name: input.authorName };
  }
  if (input.datePublished) {
    jsonLd.datePublished = input.datePublished;
  }
  if (input.image) {
    jsonLd.image = input.image;
  }
  return jsonLd;
}
