import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/site-config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isLocale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";

export default async function HomePage({ params: _params }: { params: Promise<{ lang: string }> }) {
  const params = await _params;
  if (!isLocale(params.lang)) notFound();
  const lang = params.lang;
  const dict = await getDictionary(lang);

  // Latest stories — fetched server-side so the links are in the raw HTML
  // (Google discovers pages by following links; the client-side feed alone
  // leaves the homepage with zero story links).
  let latest: { id: string; title: string; language: string }[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("posts")
      .select("id, title, language")
      .eq("status", "published")
      .eq("visibility", "public")
      .order("published_at", { ascending: false })
      .limit(12);
    latest = (data ?? []) as { id: string; title: string; language: string }[];
  } catch {
    latest = [];
  }

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 py-20 text-center sm:py-28">
        <p className="text-5xl font-bold text-emerald-800 dark:text-emerald-400" lang="ur">
          {SITE.nameUrdu}
        </p>
        <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          {dict.hero.title}
        </h1>
        <p className="max-w-xl text-lg text-neutral-600 dark:text-neutral-300">
          {dict.hero.subtitle}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href={`/${lang}/signup`}>
            <Button className="px-6 py-3 text-base">{dict.hero.ctaWrite}</Button>
          </Link>
          <Link href={`/${lang}/kids`}>
            <Button variant="secondary" className="px-6 py-3 text-base">
              {dict.hero.ctaRead}
            </Button>
          </Link>
        </div>
        <p className="max-w-xl text-sm text-neutral-500 dark:text-neutral-400">
          {dict.hero.kidsNote}
        </p>
      </section>

      {/* Latest stories — server-rendered links to /posts/<id> */}
      {latest.length > 0 && (
        <section className="pb-20">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold">{dict.feed.title}</h2>
              <p className="mt-1 text-neutral-600 dark:text-neutral-300">{dict.feed.subtitle}</p>
            </div>
            <Link href={`/feed`}>
              <Button variant="secondary">{dict.nav.explore}</Button>
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                lang={post.language === "ur" ? "ur" : "en"}
                className="rounded-2xl border border-neutral-200 p-5 hover:border-emerald-600 dark:border-neutral-800 dark:hover:border-emerald-400"
              >
                <h3 className="font-semibold">{post.title}</h3>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {post.language === "ur" ? "اردو" : "English"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Value props */}
      <section className="grid gap-4 pb-20 sm:grid-cols-3">
        {[
          { title: lang === "ur" ? "دو زبانیں" : "Two languages", body: lang === "ur" ? "اردو اور انگریزی میں لکھیں اور پڑھیں۔" : "Write and read in Urdu and English." },
          { title: lang === "ur" ? "بچوں کے لیے محفوظ" : "Safe for kids", body: lang === "ur" ? "بچوں کا گوشہ ہر کہانی کی جانچ کے بعد ہی دکھاتا ہے۔" : "The Kids' Corner only shows reviewed stories." },
          { title: lang === "ur" ? "آپ کی آواز" : "Your voice", body: lang === "ur" ? "مسودے سے اشاعت تک، آپ کی کہانی آپ کے کنٹرول میں۔" : "From draft to published, your story stays yours." },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800"
          >
            <h2 className="mb-2 text-lg font-semibold">{f.title}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
