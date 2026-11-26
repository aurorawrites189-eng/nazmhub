import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SITE, type Locale } from "@/lib/site-config";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isLocale, localeDirections } from "@/lib/i18n/config";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "../globals.css";

// Cloudflare Pages/Workers only run the Edge Runtime — this makes every
// page under [lang] edge-compatible (required by @cloudflare/next-on-pages).
export const runtime = "edge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : "en";
  const base = SITE.url.replace(/\/$/, "");
  // Self-referencing canonical: middleware rewrites clean URLs to the
  // internal /{lang}/... routes and passes the original clean pathname in
  // the "x-nazmhub-path" request header. Fall back to the homepage.
  const hdrs = await headers();
  const cleanPath = hdrs.get("x-nazmhub-path") || "/";
  const pageUrl = cleanPath === "/" ? base : `${base}${cleanPath}`;
  // Canonical strategy (Nov 21, 2026): /posts/<id> is the canonical home
  // for every story. Duplicate views of the same story canonical to it so
  // Google does not treat them as separate thin/duplicate pages:
  //   /kids/story/<id> -> /posts/<id> (same uuid, string transform)
  //   /series/<id>/<n> -> /posts/<episode post id> (DB lookup below)
  // Every other page keeps its self-referencing canonical (pageUrl).
  let canonicalUrl = pageUrl;
  const kidsMatch = cleanPath.match(/^\/kids\/story\/([^/]+)$/);
  if (kidsMatch) {
    canonicalUrl = `${base}/posts/${kidsMatch[1]}`;
  } else {
    const epMatch = cleanPath.match(/^\/series\/([^/]+)\/(\d+)$/);
    if (epMatch) {
      try {
        const supabase = await createClient();
        const { data: ep } = await supabase
          .from("posts")
          .select("id")
          .eq("series_id", epMatch[1])
          .eq("episode_number", Number(epMatch[2]))
          .eq("status", "published")
          .maybeSingle();
        if (ep && typeof ep.id === "string" && ep.id) {
          canonicalUrl = `${base}/posts/${ep.id}`;
        }
      } catch {
        // Keep the self-referencing canonical on lookup failure.
      }
    }
  }
  // Unique title + description per page. Every page used to share the same
  // title ("NazmHub — Write. Read. Belong."), so Google showed the same
  // snippet for all of them. The clean path comes from the
  // "x-nazmhub-path" header (see canonical comment above).
  const pageMeta: Record<string, { title: string; description: string }> = {
    "/": {
      title: "Free Kids Stories & Serials in Urdu & English",
      description:
        "Read free stories in Urdu and English — kids stories, daily serials and community writing. No paywall. New stories every day on NazmHub.",
    },
    "/series": {
      title: "Cliffhangers: Urdu & English Serial Stories, 12 Episodes Each",
      description:
        "Episode-wise novels with a twist in every episode. 17 serials in Urdu and English — mystery, sci-fi, cricket drama and family stories, free to read.",
    },
    "/kids": {
      title: "Kids Stories in Urdu & English — Free Moral & Bedtime Stories",
      description:
        "Free kids stories in Urdu and English, reviewed for children. Moral stories, bedtime stories, kindness, adventure and more — read online, bilkul free.",
    },
    "/about": {
      // Title here is overridden by the page's own generateMetadata
      // (dict.about.metaTitle); this entry supplies the description.
      title: "About NazmHub",
      description:
        "NazmHub is a free home for writers and readers in Urdu and English — stories, poetry, a reviewed Kids Corner and daily serials. Write. Read. Belong.",
    },
    "/write": {
      title: "Write a Story",
      description:
        "Write and publish your own stories in Urdu or English on NazmHub.",
    },
    "/download": {
      title: "Free Story Books PDF in Urdu & English — Download",
      description:
        "Every finished NazmHub serial as one complete free book. Read online or download the PDF — 17 books in Urdu and English, no sign-up cost.",
    },
    "/login": {
      title: "Log In",
      description: "Log in to your NazmHub account to write, read and save stories.",
    },
    "/signup": {
      title: "Sign Up",
      description:
        "Create your free NazmHub account and start writing and reading stories in Urdu and English.",
    },
    "/feed": {
      title: "Feed — Latest Stories",
      description: "The latest stories and serial episodes published on NazmHub.",
    },
  };
  // Dynamic pages (/series/<id>, /kids/story/<id>, /posts/<id>) get a
  // section-level title instead of the homepage title.
  const section = cleanPath.split("/").filter(Boolean)[0];
  const sectionMeta: Record<string, { title: string; description: string }> = {
    series: {
      title: "Cliffhangers — Serial Story",
      description: "Read this serial episode novel in Urdu or English on NazmHub.",
    },
    kids: {
      title: "Kids Story",
      description: "Read this original kids' story in Urdu or English on NazmHub.",
    },
    posts: {
      title: "Story",
      description: "Read this story on NazmHub.",
    },
  };
  const meta = pageMeta[cleanPath] ?? (section ? sectionMeta[section] : undefined);
  const title = meta
    ? `${meta.title} · ${SITE.name}`
    : `${SITE.name} — ${SITE.tagline}`;
  const description =
    meta?.description ??
    (locale === "ur"
      ? `${SITE.nameUrdu} — ${SITE.taglineUrdu} اردو اور انگریزی میں لکھنے اور پڑھنے کی کمیونٹی۔`
      : `${SITE.name} — ${SITE.tagline} A multilingual (Urdu + English) community for writers and readers.`);
  // Auth and app-only pages must never be indexed.
  const noIndexPaths = ["/login", "/signup", "/write", "/dashboard", "/admin", "/auth"];
  const noIndex = noIndexPaths.some(
    (p) => cleanPath === p || cleanPath.startsWith(`${p}/`),
  );
  return {
    metadataBase: new URL(base),
    title: {
      default: title,
      template: `%s · ${SITE.name}`,
    },
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      title,
      description,
      url: pageUrl,
      locale: locale === "ur" ? "ur_PK" : "en_US",
      alternateLocale: locale === "ur" ? ["en_US"] : ["ur_PK"],
      images: [
        {
          url: `${base}/og-image.png`,
          width: 1200,
          height: 630,
          alt: `${SITE.name} — ${SITE.tagline}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${base}/og-image.png`],
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    icons: {
      icon: "/favicon.png",
      apple: "/favicon.png",
    },
    // Google Search Console ownership verification (meta tag supplied by the site owner).
    verification: {
      google: "I23x8fplXm806WEm2SNhslb2aQBzlJLF4F-FcHSbbQQ",
    },
  };
}

// Applies the saved (or system-preferred) theme before first paint so the
// page doesn't flash the wrong color scheme.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('nazmhub-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

// NOTE: there is intentionally no app/layout.tsx. Following the documented
// Next.js i18n-routing pattern, app/[lang]/layout.tsx is the topmost layout
// for every route, so it renders <html>/<body> with the per-locale lang/dir.
export default async function LangLayout({
  children,
  params: _params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const params = await _params;
  if (!isLocale(params.lang)) notFound();
  const lang: Locale = params.lang;
  const dict = await getDictionary(lang);

  return (
    <html lang={lang} dir={localeDirections[lang]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <LanguageProvider locale={lang} dict={dict}>
          <Header locale={lang} dict={dict} />
          <main className="flex-1">{children}</main>
          <Footer dict={dict} locale={lang} />
        </LanguageProvider>
      </body>
    </html>
  );
}
