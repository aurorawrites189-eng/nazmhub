import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isLocale } from "@/lib/i18n/config";
import { SITE } from "@/lib/site-config";
import { articleJsonLd, excerpt, langCode } from "@/lib/seo";
import { KidsStoryReader } from "@/components/KidsStoryReader";

/** Large-type kids' story reader. Only kids-approved published stories. */

async function loadKidsPost(id: string) {
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select("id, title, content, language, category, author_id, published_at, post_images(storage_path, alt_text)")
    .eq("id", id)
    .eq("status", "published")
    .eq("is_kids_approved", true)
    .maybeSingle();
  return { supabase, post };
}

export async function generateMetadata({
  params: _params,
}: {
  params: Promise<{ lang: string; id: string }>;
}): Promise<Metadata> {
  const params = await _params;
  const { supabase, post } = await loadKidsPost(params.id);
  if (!post) return { title: "Kids Story" };
  // Per-page title + description from the story itself (was the generic
  // "Kids Story · NazmHub" for every kids story). The title stays in the
  // story's own language — no translation — with the category and language
  // appended so twins and categories are distinguishable in search.
  const baseTitle = (post.title as string) ?? "Kids Story";
  const langName = langCode(post.language as string | null) === "ur" ? "Urdu" : "English";
  const { data: cat } = post.category
    ? await supabase
        .from("categories")
        .select("name_en")
        .eq("slug", post.category as string)
        .maybeSingle()
    : { data: null };
  const catName = (cat as { name_en: string } | null)?.name_en ?? null;
  const title = catName
    ? `${baseTitle} — ${catName} Story for Kids in ${langName}`
    : baseTitle;
  const description = excerpt(post.content as string);
  const cover = (
    (post as { post_images?: { storage_path: string; alt_text: string | null }[] | null })
      .post_images?.[0] as { storage_path: string; alt_text: string | null } | undefined
  ) ?? null;
  const coverUrl = cover
    ? supabase.storage.from("post-images").getPublicUrl(cover.storage_path).data.publicUrl
    : null;
  const images = coverUrl ? [{ url: coverUrl }] : undefined;
  return {
    title,
    description,
    openGraph: { type: "article", title, description, ...(images ? { images } : {}) },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(coverUrl ? { images: [coverUrl] } : {}),
    },
  };
}

export default async function KidsStoryPage({
  params: _params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const params = await _params;
  if (!isLocale(params.lang)) notFound();
  const lang = params.lang;
  const dict = await getDictionary(lang);

  const { supabase, post } = await loadKidsPost(params.id);

  // RLS is the final enforcer: a child session can never read a story that
  // isn't kids-approved, even if this filter were bypassed.
  if (!post) notFound();

  const { data: categories } = await supabase
    .from("categories")
    .select("slug, name_en, name_ur")
    .eq("is_kids", true);
  const cat = ((categories ?? []) as { slug: string; name_en: string; name_ur: string }[]).find(
    (c) => c.slug === (post.category as string | null)
  );

  const { data: author } = await supabase
    .from("public_profiles")
    .select("display_name, username")
    .eq("id", post.author_id as string)
    .maybeSingle();

  // Two more stories in the same category + language, linked at the end
  // of the reader.
  const { data: relatedRows } = await supabase
    .from("posts")
    .select("id, title, language")
    .eq("status", "published")
    .eq("is_kids_approved", true)
    .eq("category", post.category as string)
    .eq("language", post.language as string)
    .neq("id", post.id as string)
    .order("published_at", { ascending: false })
    .limit(2);
  const related = (relatedRows ?? []) as { id: string; title: string; language: string }[];

  // Article structured data. The canonical home of a kids story is its
  // /posts/<id> URL, so mainEntityOfPage points there.
  const base = SITE.url.replace(/\/$/, "");
  const cover = (
    (post as { post_images?: { storage_path: string; alt_text: string | null }[] | null })
      .post_images?.[0] as { storage_path: string; alt_text: string | null } | undefined
  ) ?? null;
  const coverUrl = cover
    ? supabase.storage.from("post-images").getPublicUrl(cover.storage_path).data.publicUrl
    : null;
  const jsonLd = articleJsonLd({
    headline: post.title as string,
    description: excerpt(post.content as string),
    url: `${base}/posts/${post.id as string}`,
    authorName: author
      ? ((author.display_name as string | null) ?? (author.username as string))
      : null,
    datePublished: (post.published_at as string | null) ?? null,
    inLanguage: langCode(post.language as string | null),
    image: coverUrl,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="bg-gradient-to-b from-violet-50 via-white to-amber-50 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900">
        <KidsStoryReader
          lang={lang}
          story={{
            id: post.id as string,
            title: post.title as string,
            content: post.content as string,
            language: (post.language as string) ?? "en",
            category: post.category as string | null,
            categoryName: cat ? (lang === "ur" ? cat.name_ur : cat.name_en) : null,
            authorName: author
              ? ((author.display_name as string | null) ?? (author.username as string))
              : null,
            cover,
            related,
          }}
          labels={{
            backToStories: dict.kids.allStories,
            fontSize: dict.kids.fontSize,
            small: dict.kids.small,
            medium: dict.kids.medium,
            large: dict.kids.large,
            reportStory: dict.kids.reportStory,
            reportReason: dict.kids.reportReason,
            reportDetails: dict.kids.reportDetails,
            submitReport: dict.moderation.submitReport,
            cancel: dict.common.cancel,
            reportSent: dict.kids.reportSent,
            reportLogin: dict.kids.reportLogin,
            reasonInappropriate: dict.kids.reportReasonInappropriate,
            reasonScary: dict.kids.reportReasonScary,
            reasonOther: dict.kids.reportReasonOther,
          }}
        />
      </div>
    </>
  );
}
