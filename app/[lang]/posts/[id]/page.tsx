/**
 * Story reader: /[lang]/posts/[id]
 *
 * Full post display — title, author card with follow, body, images (with
 * alt text), tags, like/save/report actions, and comments. The post is
 * loaded through the viewer's RLS session (can_view_post), so kids,
 * anonymous readers and suspended authors all resolve correctly; an
 * invisible post renders notFound().
 *
 * Views are counted fire-and-forget by <ViewCounter/> (client, on mount)
 * via POST /api/posts/[id]/views — see that route for inflation caveats.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { SITE, type Locale } from "@/lib/site-config";
import { articleJsonLd, excerpt, langCode } from "@/lib/seo";
import { fillTemplate } from "@/lib/format";
import { LikeButton } from "@/components/LikeButton";
import { SaveButton } from "@/components/SaveButton";
import { FollowButton } from "@/components/FollowButton";
import { ReportDialog } from "@/components/ReportDialog";
import { CommentSection } from "@/components/CommentSection";
import { ViewCounter } from "@/components/ViewCounter";

interface PageParams {
  params: Promise<{ lang: string; id: string }>;
}

async function loadPost(id: string) {
  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
  return { supabase, post };
}

export async function generateMetadata({ params: _params }: PageParams): Promise<Metadata> {
  const params = await _params;
  const { supabase, post } = await loadPost(params.id);
  if (!post) return { title: "Story" };
  const baseTitle = post.title ?? "Story";
  // Category + language suffix so twins and categories are distinguishable
  // in search results (a bare post title says nothing about either).
  const langName = langCode(post.language) === "ur" ? "Urdu" : "English";
  const [{ data: cat }, { data: imgs }] = await Promise.all([
    post.category
      ? supabase.from("categories").select("name_en").eq("slug", post.category).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("post_images")
      .select("storage_path")
      .eq("post_id", post.id)
      .order("created_at")
      .limit(1),
  ]);
  const catName = (cat as { name_en: string } | null)?.name_en ?? null;
  let title = baseTitle;
  if (post.is_kids_approved && catName) {
    title = `${baseTitle} — ${catName} Story for Kids in ${langName}`;
  } else if (catName) {
    title = `${baseTitle} — ${catName}`;
  }
  const coverPath = (imgs as { storage_path: string }[] | null)?.[0]?.storage_path ?? null;
  const coverUrl = coverPath
    ? supabase.storage.from("post-images").getPublicUrl(coverPath).data.publicUrl
    : null;
  // Per-page description from the story itself (was the generic
  // "Read this story on NazmHub." for every post).
  const description = excerpt(post.content);
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

export default async function PostReaderPage({ params: _params }: PageParams) {
  const params = await _params;
  const lang = params.lang as Locale;
  const dict = await getDictionary(lang);
  const { supabase, post } = await loadPost(params.id);
  if (!post) notFound();

  const [{ data: author }, { data: images }] = await Promise.all([
    supabase.from("public_profiles").select("id, username, display_name, avatar_url, bio").eq("id", post.author_id).maybeSingle(),
    supabase.from("post_images").select("id, storage_path, alt_text, caption").eq("post_id", post.id).order("created_at"),
  ]);

  const admin = createAdminClient();
  const [{ count: likeCount }, { count: commentCount }] = await Promise.all([
    admin.from("likes").select("post_id", { count: "exact", head: true }).eq("post_id", post.id),
    admin.from("comments").select("id", { count: "exact", head: true }).eq("post_id", post.id).eq("status", "visible"),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let ageClass: string | null = null;
  let liked = false;
  let saved = false;
  let following = false;
  if (user) {
    const [{ data: profile }, { data: like }, { data: save }, { data: follow }] = await Promise.all([
      supabase.from("profiles").select("age_class").eq("id", user.id).maybeSingle(),
      supabase.from("likes").select("post_id").eq("user_id", user.id).eq("post_id", post.id).maybeSingle(),
      supabase.from("saved_posts").select("post_id").eq("user_id", user.id).eq("post_id", post.id).maybeSingle(),
      author
        ? supabase.from("follows").select("following_id").eq("follower_id", user.id).eq("following_id", author.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    ageClass = profile?.age_class ?? null;
    liked = !!like;
    saved = !!save;
    following = !!follow;
  }
  const isChild = ageClass === "child";
  const isOwnPost = !!user && !!author && user.id === author.id;
  const canComment = !!user && !isChild;

  // Reading is free for everyone — logged-out readers and search engines
  // see the full story. Login is only needed to interact (like, save,
  // follow, comment).
  const bodyParagraphs = String(post.content).split(/\n{2,}/);

  const imageUrls = (images ?? []).map((img: { id: string; storage_path: string; alt_text: string | null; caption: string | null }) => ({
    ...img,
    url: supabase.storage.from("post-images").getPublicUrl(img.storage_path).data.publicUrl,
  }));

  const publishedDate = post.published_at ? new Date(post.published_at).toLocaleDateString(lang) : null;

  // Article structured data — headline, author, publish date, language.
  const base = SITE.url.replace(/\/$/, "");
  const jsonLd = articleJsonLd({
    headline: post.title,
    description: excerpt(post.content),
    url: `${base}/posts/${post.id}`,
    authorName: author?.display_name ?? author?.username ?? null,
    datePublished: post.published_at ?? post.created_at ?? null,
    inLanguage: langCode(post.language),
    image: imageUrls[0]?.url ?? null,
  });

  // Related stories in the same category + language, for readers and crawlers.
  let related: { id: string; title: string; language: string }[] = [];
  if (post.category) {
    const { data: relatedRows } = await supabase
      .from("posts")
      .select("id, title, language")
      .eq("status", "published")
      .eq("category", post.category)
      .eq("language", post.language)
      .neq("id", post.id)
      .order("published_at", { ascending: false })
      .limit(3);
    related = (relatedRows ?? []) as { id: string; title: string; language: string }[];
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="mx-auto max-w-3xl px-4 py-8">
      <ViewCounter postId={post.id} lang={lang} />

      <header>
        <h1 className="text-3xl font-extrabold leading-tight md:text-4xl">{post.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
          {publishedDate && <span>{fillTemplate(dict.reader.publishedOn, { date: publishedDate })}</span>}
          <span>{fillTemplate(dict.reader.views, { count: post.view_count ?? 0 })}</span>
          <span>{fillTemplate(dict.reader.likes, { count: likeCount ?? 0 })}</span>
          {post.language && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs uppercase dark:bg-neutral-800">
              {post.language}
            </span>
          )}
        </div>
      </header>

      {author && (
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
          {author.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.avatar_url}
              alt={author.display_name ?? author.username}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl dark:bg-emerald-950">
              ✍
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{author.display_name ?? author.username}</p>
            <p className="truncate text-sm text-neutral-500">@{author.username}</p>
            {author.bio && <p className="mt-1 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">{author.bio}</p>}
          </div>
          <FollowButton
            username={author.username}
            lang={lang}
            dict={dict}
            initialFollowing={following}
            signedIn={!!user}
            canFollow={!!user && !isOwnPost && !isChild}
          />
        </div>
      )}

      {imageUrls.length > 0 && (
        <figure className="mt-6 space-y-4">
          {imageUrls.map((img) => (
            <div key={img.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt_text ?? post.title}
                className="w-full rounded-2xl object-cover"
                loading="lazy"
              />
              {img.caption && (
                <figcaption className="mt-1 text-center text-sm text-neutral-500">{img.caption}</figcaption>
              )}
            </div>
          ))}
        </figure>
      )}

      <div className="prose prose-neutral mt-6 max-w-none dark:prose-invert">
        {bodyParagraphs.map((para: string, i: number) => (
          <p key={i} className="whitespace-pre-wrap">
            {para}
          </p>
        ))}
      </div>

      {Array.isArray(post.tags) && post.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-neutral-500">{dict.reader.tags}:</span>
          {post.tags.map((tag: string) => (
            <span
              key={tag}
              className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-y border-neutral-200 py-3 dark:border-neutral-800">
        <LikeButton
          postId={post.id}
          lang={lang}
          dict={dict}
          initialLiked={liked}
          initialCount={likeCount ?? 0}
          signedIn={!!user}
        />
        <SaveButton postId={post.id} lang={lang} dict={dict} initialSaved={saved} signedIn={!!user} />
        <span className="ms-auto">
          <ReportDialog postId={post.id} lang={lang} dict={dict} signedIn={!!user} />
        </span>
      </div>
      {!user && <p className="mt-2 text-sm text-neutral-500">{dict.reader.signInToInteract}</p>}

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">
            {lang === "ur" ? "مزید کہانیاں" : "More stories"}
          </h2>
          <ul className="mt-3 space-y-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/posts/${r.id}`}
                  lang={r.language}
                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CommentSection
        postId={post.id}
        lang={lang}
        dict={dict}
        canComment={canComment}
        signedIn={!!user}
        isChild={isChild}
      />
      </article>
    </>
  );
}
