import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isLocale } from "@/lib/i18n/config";
import { SITE } from "@/lib/site-config";
import { articleJsonLd, excerpt, langCode } from "@/lib/seo";
import { publicStorageUrl } from "@/lib/storage";

interface EpisodeRow {
  id: string;
  title: string;
  content: string;
  episode_number: number | null;
  author_id: string | null;
  published_at: string | null;
  language: string | null;
}

interface SeriesRow {
  id: string;
  title: string;
}

/**
 * Episode reader: /[lang]/series/[seriesId]/[episode]
 * Public — cliffhangers bring readers back, no gate.
 */

async function loadEpisode(seriesId: string, epNum: number) {
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("series")
    .select("id, title")
    .eq("id", seriesId)
    .maybeSingle();
  if (!s) return { supabase, series: null, episode: null };
  const { data: ep } = await supabase
    .from("posts")
    .select("id, title, content, episode_number, author_id, published_at, language, post_images(storage_path)")
    .eq("series_id", seriesId)
    .eq("episode_number", epNum)
    .eq("status", "published")
    .maybeSingle();
  return { supabase, series: s as SeriesRow | null, episode: ep as EpisodeRow | null };
}

export async function generateMetadata({
  params: _params,
}: {
  params: Promise<{ lang: string; seriesId: string; episode: string }>;
}): Promise<Metadata> {
  const params = await _params;
  const epNum = parseInt(params.episode, 10);
  if (!Number.isFinite(epNum) || epNum < 1) return { title: "Cliffhangers — Serial Story" };
  const { series, episode } = await loadEpisode(params.seriesId, epNum);
  if (!series || !episode) return { title: "Cliffhangers — Serial Story" };
  // Per-page title + description from the episode itself (was the generic
  // "Cliffhangers — Serial Story · NazmHub" for every episode).
  const title = `${episode.title} — ${series.title} Episode ${epNum}`;
  const description = excerpt(episode.content);
  const coverPath =
    (episode as { post_images?: { storage_path: string }[] | null }).post_images?.[0]
      ?.storage_path ?? null;
  const coverUrl = coverPath ? publicStorageUrl("post-images", coverPath) : null;
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

export default async function EpisodePage({
  params: _params,
}: {
  params: Promise<{ lang: string; seriesId: string; episode: string }>;
}) {
  const params = await _params;
  if (!isLocale(params.lang)) notFound();
  const lang = params.lang;
  const dict = await getDictionary(lang);
  const epNum = parseInt(params.episode, 10);
  if (!Number.isFinite(epNum) || epNum < 1) notFound();

  const { supabase, series: s, episode: epRow } = await loadEpisode(params.seriesId, epNum);
  if (!s) notFound();
  if (!epRow) notFound();
  const episode = epRow as EpisodeRow;
  const cover =
    (epRow as { post_images?: { storage_path: string }[] | null }).post_images?.[0]?.storage_path ??
    null;

  // Prev / next episode numbers.
  const { data: neighbors } = await supabase
    .from("posts")
    .select("episode_number")
    .eq("series_id", params.seriesId)
    .eq("status", "published")
    .order("episode_number", { ascending: true });
  const nums = ((neighbors ?? []) as { episode_number: number | null }[])
    .map((n) => n.episode_number ?? 0)
    .filter((n) => n > 0);
  const idx = nums.indexOf(epNum);
  const prevNum = idx > 0 ? nums[idx - 1] : null;
  const nextNum = idx >= 0 && idx < nums.length - 1 ? nums[idx + 1] : null;

  const { data: author } = episode.author_id
    ? await supabase
        .from("public_profiles")
        .select("display_name, username")
        .eq("id", episode.author_id)
        .maybeSingle()
    : { data: null };

  // Article structured data. The canonical home of an episode is its
  // /posts/<id> URL, so mainEntityOfPage points there.
  const base = SITE.url.replace(/\/$/, "");
  const jsonLd = articleJsonLd({
    headline: episode.title,
    description: excerpt(episode.content),
    url: `${base}/posts/${episode.id}`,
    authorName: author
      ? ((author.display_name as string | null) ?? (author.username as string))
      : null,
    datePublished: episode.published_at,
    inLanguage: langCode(episode.language),
    image: cover ? publicStorageUrl("post-images", cover) : null,
  });

  const t = dict.series as Record<string, string>;
  const paragraphs = String(episode.content).split(/\n{2,}/);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href={`/series/${params.seriesId}`}
          className="text-sm font-medium text-indigo-700 underline dark:text-indigo-400"
        >
          ← {(s as { title: string }).title} · {t.backToSeries}
        </Link>

        <header className="mt-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            {t.episode} {epNum}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold leading-tight md:text-4xl">{episode.title}</h1>
        </header>

        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicStorageUrl("post-images", cover)}
            alt={episode.title}
            className="mt-6 aspect-[16/9] w-full rounded-3xl object-cover shadow-md"
            loading="eager"
          />
        )}

        <div className="prose prose-neutral mt-6 max-w-none dark:prose-invert">
          {paragraphs.map((para, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>

        <nav className="mt-10 flex items-center justify-between gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <div>
            {prevNum !== null && (
              <Link
                href={`/series/${params.seriesId}/${prevNum}`}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                ← {t.prevEpisode} {prevNum}
              </Link>
            )}
          </div>
          <div>
            {nextNum !== null ? (
              <Link
                href={`/series/${params.seriesId}/${nextNum}`}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
              >
                {t.nextEpisode} {nextNum} →
              </Link>
            ) : (
              <span className="text-sm text-neutral-500">⏳ {t.ongoing}…</span>
            )}
          </div>
        </nav>
      </article>
    </>
  );
}
