import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isLocale } from "@/lib/i18n/config";
import { KidsExplorer } from "@/components/KidsExplorer";
import type { KidsStory } from "@/components/KidsStoryCard";
import { SITE } from "@/lib/site-config";

interface RawPost {
  id: string;
  title: string;
  content: string;
  language: string;
  category: string | null;
  post_images: { storage_path: string; alt_text: string | null }[] | null;
}

interface CategoryRow {
  slug: string;
  name_en: string;
  name_ur: string;
}

async function toKidsStories(
  posts: RawPost[],
  catName: (slug: string | null) => string | null
): Promise<KidsStory[]> {
  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    language: p.language,
    category: p.category,
    categoryName: catName(p.category),
    cover: p.post_images?.[0]
      ? { storage_path: p.post_images[0].storage_path, alt_text: p.post_images[0].alt_text }
      : null,
  }));
}

/**
 * Parent-facing introductions, one per kids category, in both languages.
 * Each is written for a parent or teacher landing from search: what the
 * stories teach, why they are safe, and how to use them. Unknown slugs
 * fall back to a generic introduction built from the category name.
 */
const INTROS: Record<string, { en: string; ur: string }> = {
  "moral-stories": {
    en: "Moral stories for kids in Urdu and English — free to read on NazmHub. Every story here carries a gentle lesson: telling the truth, saying sorry, sharing with friends, keeping a promise, and doing the right thing even when nobody is watching. The stories are short and simple, and every one is reviewed by our team before children can read it, so parents can hand over the screen without worry. Read one at bedtime or in class, then ask your child what the character should have done — that one question is where the lesson sticks. New moral stories arrive regularly in both Urdu and English, so the same value can be enjoyed in whichever language your child loves most.",
    ur: "بچوں کے لیے اخلاقی کہانیاں اردو اور انگریزی میں — نظم ہب پر مفت پڑھیں۔ یہاں ہر کہانی میں ایک پیارا سبق ہے: سچ بولنا، معافی مانگنا، دوستوں سے بانٹنا، وعدہ نبھانا، اور صحیح کام کرنا چاہے کوئی دیکھ رہا ہو یا نہ ہو۔ کہانیاں چھوٹی اور آسان ہیں، اور ہر کہانی بچوں تک پہنچنے سے پہلے ہماری ٹیم جانچتی ہے، اس لیے والدین بے فکر ہو کر بچوں کو پڑھنے دے سکتے ہیں۔ سونے سے پہلے یا کلاس میں ایک کہانی پڑھیں، پھر بچے سے پوچھیں کہ کردار کو کیا کرنا چاہیے تھا — اسی ایک سوال سے سبق دل میں بیٹھتا ہے۔ نئی اخلاقی کہانیاں اردو اور انگریزی دونوں میں باقاعدگی سے آتی رہتی ہیں۔",
  },
  bedtime: {
    en: "Bedtime stories for kids in Urdu and English — free to read on NazmHub. These are gentle, calm stories made for the last minutes of the day: sleepy robots, kind grandmothers, dream-making machines, and small brave friends who always make it home safe. Every story is short enough to finish in one sitting and reviewed by our team before children can read it, so the night ends peacefully. Read one aloud, in Urdu or English, and let your child drift off with a happy ending. New bedtime stories arrive regularly, so there is always a fresh one waiting when the lights go out.",
    ur: "بچوں کے لیے سونے سے پہلے کی کہانیاں اردو اور انگریزی میں — نظم ہب پر مفت پڑھیں۔ یہ دن کے آخری لمحوں کے لیے نرم اور پرسکون کہانیاں ہیں: نیند والا روبوٹ، مہربان دادی، خواب بنانے والی مشین، اور چھوٹے بہادر دوست جو ہمیشہ خیریت سے گھر پہنچتے ہیں۔ ہر کہانی اتنی چھوٹی ہے کہ ایک ہی بار میں ختم ہو جائے، اور ہر کہانی بچوں تک پہنچنے سے پہلے ہماری ٹیم جانچتی ہے، تاکہ رات سکون سے گزرے۔ اردو یا انگریزی میں ایک کہانی بلند آواز سے پڑھیں اور بچے کو خوشگوار انجام کے ساتھ نیند آنے دیں۔ نئی کہانیاں باقاعدگی سے آتی رہتی ہیں، اس لیے بتی بجھتے ہی ہمیشہ کوئی نئی کہانی منتظر ہوتی ہے۔",
  },
  kindness: {
    en: "Kindness stories for kids in Urdu and English — free to read on NazmHub. These stories show what kindness really looks like: noticing someone who needs help, sharing even when it is hard, saying thank you, and playing fair. The characters are small robots, children, cooks, and neighbours — ordinary heroes doing one kind thing at a time. Every story is reviewed by our team before children can read it, so parents can trust what is on the screen. Read one together and ask your child where they have seen kindness today. New kindness stories arrive regularly in both Urdu and English, so the same warm feeling can be enjoyed in whichever language your child loves most.",
    ur: "بچوں کے لیے مہربانی کی کہانیاں اردو اور انگریزی میں — نظم ہب پر مفت پڑھیں۔ یہ کہانیاں دکھاتی ہیں کہ مہربانی اصل میں کیا ہوتی ہے: کسی کی مدد کرنا، مشکل ہونے پر بھی بانٹنا، شکریہ کہنا، اور انصاف سے کھیلنا۔ کردار چھوٹے روبوٹ، بچے، باورچی اور پڑوسی ہیں — عام ہیرو جو ایک وقت میں ایک اچھا کام کرتے ہیں۔ ہر کہانی بچوں تک پہنچنے سے پہلے ہماری ٹیم جانچتی ہے، اس لیے والدین اسکرین پر موجود مواد پر بھروسہ کر سکتے ہیں۔ ایک کہانی مل کر پڑھیں اور بچے سے پوچھیں کہ آج انہوں نے مہربانی کہاں دیکھی۔ نئی کہانیاں اردو اور انگریزی دونوں میں باقاعدگی سے آتی رہتی ہیں۔",
  },
  adventure: {
    en: "Adventure stories for kids in Urdu and English — free to read on NazmHub. Brave rescue birds, tiny robots on big missions, astronauts, and young explorers set off into the unknown — and always come back with a lesson about courage, teamwork, and helping others. The adventures are exciting but never scary, and every story is reviewed by our team before children can read it. Read one when your child needs a spark of bravery, in Urdu or English, and talk about what the hero did right. New adventure stories arrive regularly, so there is always a new journey waiting on the shelf.",
    ur: "بچوں کے لیے مہم جوئی کی کہانیاں اردو اور انگریزی میں — نظم ہب پر مفت پڑھیں۔ بہادر بچانے والی چڑیا، بڑے مشن پر چھوٹا روبوٹ، خلاباز، اور نوجوان مہم جو نامعلوم کی طرف نکلتے ہیں — اور ہمیشہ ہمت، ٹیم ورک اور دوسروں کی مدد کا سبق لے کر لوٹتے ہیں۔ مہم جوئی دلچسپ ہے لیکن کبھی ڈراؤنی نہیں، اور ہر کہانی بچوں تک پہنچنے سے پہلے ہماری ٹیم جانچتی ہے۔ جب بچے کو ہمت کی ضرورت ہو تو اردو یا انگریزی میں ایک کہانی پڑھیں، اور بات کریں کہ ہیرو نے کیا صحیح کیا۔ نئی مہم جوئی کی کہانیاں باقاعدگی سے آتی رہتی ہیں، اس لیے شیلف پر ہمیشہ کوئی نیا سفر منتظر ہوتا ہے۔",
  },
  educational: {
    en: "Educational stories for kids in Urdu and English — free to read on NazmHub. These stories teach while they entertain: village teachers, recycling robots, library friends, and curious children who ask big questions about the world around them. Teachers and parents use them in class and at home to start conversations about learning, nature, and community. Every story is reviewed by our team before children can read it, and the language stays simple enough for young readers in Urdu or English. Read one together, then try the idea in real life — plant a seed, recycle a bottle, or visit a library. New educational stories arrive regularly, so the classroom never runs out of stories.",
    ur: "بچوں کے لیے تعلیمی کہانیاں اردو اور انگریزی میں — نظم ہب پر مفت پڑھیں۔ یہ کہانیاں تفریح کے ساتھ ساتھ سکھاتی بھی ہیں: گاؤں کی استانی، ری سائیکلنگ والا روبوٹ، لائبریری کا دوست، اور تجسس والے بچے جو دنیا کے بارے میں بڑے سوال پوچھتے ہیں۔ اساتذہ اور والدین انہیں کلاس اور گھر میں سیکھنے، فطرت اور برادری کے بارے میں بات چیت شروع کرنے کے لیے استعمال کرتے ہیں۔ ہر کہانی بچوں تک پہنچنے سے پہلے ہماری ٹیم جانچتی ہے، اور زبان اردو یا انگریزی میں چھوٹے قارئین کے لیے آسان رکھی گئی ہے۔ ایک کہانی مل کر پڑھیں، پھر خیال کو حقیقی زندگی میں آزمائیں — بیج بوئیں، بوتل ری سائیکل کریں، یا لائبریری جائیں۔ نئی تعلیمی کہانیاں باقاعدگی سے آتی رہتی ہیں۔",
  },
  "science-nature": {
    en: "Science and nature stories for kids in Urdu and English — free to read on NazmHub. Patient gardeners, beach-cleaning robots, growing seeds, and curious minds explore how the natural world works — why plants grow, why the sea matters, and how small actions protect the planet. The science stays gentle and story-first, so young readers learn without realising they are learning. Every story is reviewed by our team before children can read it. Read one together in Urdu or English, then step outside and look for the same wonder in your own garden, street, or sky. New science and nature stories arrive regularly for young explorers.",
    ur: "بچوں کے لیے سائنس اور فطرت کی کہانیاں اردو اور انگریزی میں — نظم ہب پر مفت پڑھیں۔ صابر باغبان، ساحل صاف کرنے والا روبوٹ، اگتے ہوئے بیج، اور تجسس والے ذہن دریافت کرتے ہیں کہ قدرتی دنیا کیسے کام کرتی ہے — پودے کیوں اگتے ہیں، سمندر کیوں اہم ہے، اور چھوٹے اقدامات سیارے کی حفاظت کیسے کرتے ہیں۔ سائنس نرم اور کہانی کے انداز میں رہتی ہے، تاکہ چھوٹے قارئین بغیر محسوس کیے سیکھیں۔ ہر کہانی بچوں تک پہنچنے سے پہلے ہماری ٹیم جانچتی ہے۔ اردو یا انگریزی میں ایک کہانی مل کر پڑھیں، پھر باہر جا کر اپنے باغ، گلی یا آسمان میں وہی حیرت تلاش کریں۔ نوجوان مہم جوؤں کے لیے نئی کہانیاں باقاعدگی سے آتی رہتی ہیں۔",
  },
  "animal-stories": {
    en: "Animal stories for kids in Urdu and English — free to read on NazmHub. Clever birds, kind crabs, brave rescue animals, and gentle giants show children how animals live, help each other, and teach us about friendship and courage. The animals talk, joke, and solve problems together — and every story is reviewed by our team before children can read it, so the fun stays safe. Read one at bedtime or in class, in Urdu or English, and ask your child which animal they would like to meet. New animal stories arrive regularly, so there is always a new friend waiting on the shelf.",
    ur: "بچوں کے لیے جانوروں کی کہانیاں اردو اور انگریزی میں — نظم ہب پر مفت پڑھیں۔ ہوشیار پرندے، مہربان کیکڑے، بہادر بچانے والے جانور، اور نرم دل دیو بچوں کو دکھاتے ہیں کہ جانور کیسے رہتے ہیں، ایک دوسرے کی مدد کرتے ہیں، اور ہمیں دوستی اور ہمت کے بارے میں کیا سکھاتے ہیں۔ جانور باتیں کرتے ہیں، مذاق کرتے ہیں، اور مل کر مسائل حل کرتے ہیں — اور ہر کہانی بچوں تک پہنچنے سے پہلے ہماری ٹیم جانچتی ہے، تاکہ تفریح محفوظ رہے۔ سونے سے پہلے یا کلاس میں اردو یا انگریزی میں ایک کہانی پڑھیں، اور بچے سے پوچھیں کہ وہ کس جانور سے ملنا چاہیں گے۔ نئی جانوروں کی کہانیاں باقاعدگی سے آتی رہتی ہیں۔",
  },
  "fairy-tales": {
    en: "Fairy tales for kids in Urdu and English — free to read on NazmHub. Gentle magic, kind fairies, brave little heroes, and happy endings — classic wonder retold simply for young readers. The tales are short, warm, and never frightening, and every story is reviewed by our team before children can read it. Read one at bedtime in Urdu or English and let your child fall asleep inside a story. New fairy tales arrive regularly, so the magic never runs out.",
    ur: "بچوں کے لیے پریوں کی کہانیاں اردو اور انگریزی میں — نظم ہب پر مفت پڑھیں۔ نرم جادو، مہربان پریاں، بہادر چھوٹے ہیرو، اور خوشگوار انجام — کلاسیکی حیرت چھوٹے قارئین کے لیے آسان انداز میں۔ کہانیاں چھوٹی، گرم اور کبھی ڈراؤنی نہیں، اور ہر کہانی بچوں تک پہنچنے سے پہلے ہماری ٹیم جانچتی ہے۔ سونے سے پہلے اردو یا انگریزی میں ایک کہانی پڑھیں اور بچے کو کہانی کے اندر سونے دیں۔ نئی پریوں کی کہانیاں باقاعدگی سے آتی رہتی ہیں، اس لیے جادو کبھی ختم نہیں ہوتا۔",
  },
};

function introFor(slug: string, name: string, lang: string): string {
  const known = INTROS[slug];
  if (known) return lang === "ur" ? known.ur : known.en;
  return lang === "ur"
    ? `${name} — بچوں کے لیے اردو اور انگریزی میں کہانیاں، نظم ہب پر مفت پڑھیں۔ ہر کہانی بچوں تک پہنچنے سے پہلے ہماری ٹیم جانچتی ہے، اس لیے والدین بے فکر ہو کر بچوں کو پڑھنے دے سکتے ہیں۔ نئی کہانیاں باقاعدگی سے آتی رہتی ہیں۔`
    : `${name} for kids in Urdu and English — free to read on NazmHub. Every story is reviewed by our team before children can read it, so parents can trust what is on the screen. New stories arrive regularly in both Urdu and English.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; category: string }>;
}): Promise<Metadata> {
  const { lang, category } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("slug, name_en, name_ur")
    .eq("slug", category)
    .eq("is_kids", true)
    .maybeSingle();
  const row = (data ?? null) as CategoryRow | null;
  if (!row) return {};
  const name = row.name_en;
  return {
    title: `${name} for Kids in Urdu & English`,
    description: `Free ${name.toLowerCase()} for kids in Urdu and English, reviewed for children. Read online, bilkul free on NazmHub.`,
    alternates: {
      canonical: `${SITE.url.replace(/\/$/, "")}/kids/${row.slug}`,
    },
  };
}

export default async function KidsCategoryPage({
  params: _params,
}: {
  params: Promise<{ lang: string; category: string }>;
}) {
  const params = await _params;
  if (!isLocale(params.lang)) notFound();
  const lang = params.lang;
  const dict = await getDictionary(lang);

  const supabase = await createClient();
  const { data: categoryRow } = await supabase
    .from("categories")
    .select("slug, name_en, name_ur")
    .eq("slug", params.category)
    .eq("is_kids", true)
    .maybeSingle();
  const category = (categoryRow ?? null) as CategoryRow | null;
  if (!category) notFound();
  const name = lang === "ur" ? category.name_ur : category.name_en;

  const { data: categories } = await supabase
    .from("categories")
    .select("slug, name_en, name_ur")
    .eq("is_kids", true)
    .order("name_en");
  const catList = (categories ?? []) as CategoryRow[];
  const catName = (slug: string | null) => {
    const c = catList.find((x) => x.slug === slug);
    return c ? (lang === "ur" ? c.name_ur : c.name_en) : null;
  };

  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, content, language, category, post_images(storage_path, alt_text)")
    .eq("status", "published")
    .eq("is_kids_approved", true)
    .eq("category", category.slug)
    .order("published_at", { ascending: false })
    .limit(60);
  const stories = await toKidsStories((posts ?? []) as RawPost[], catName);

  const others = catList.filter((c) => c.slug !== category.slug);

  return (
    <div className="bg-gradient-to-b from-violet-50 via-white to-amber-50 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="mb-4 text-sm">
          <Link href="/kids" className="font-medium text-violet-700 hover:underline dark:text-violet-300">
            ← {dict.kids.title}
          </Link>
        </p>
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-violet-800 sm:text-5xl dark:text-violet-300">
            {name}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-left text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {introFor(category.slug, name, lang)}
          </p>
          <p className="mx-auto mt-3 w-fit rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            {dict.kids.safeNotice}
          </p>
        </div>

        <KidsExplorer
          lang={lang}
          stories={stories}
          categories={catList.map((c) => ({
            slug: c.slug,
            name: lang === "ur" ? c.name_ur : c.name_en,
          }))}
          continueReading={[]}
          labels={{
            searchPlaceholder: dict.kids.searchPlaceholder,
            allStories: dict.kids.allStories,
            readStory: dict.kids.readStory,
            fontSize: dict.kids.fontSize,
            small: dict.kids.small,
            medium: dict.kids.medium,
            large: dict.kids.large,
            continueReading: dict.kids.continueReading,
            emptyTitle: dict.kids.emptyTitle,
            emptyBody: dict.kids.emptyBody,
          }}
        />

        {others.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-2xl font-extrabold text-neutral-900 dark:text-white">
              {lang === "ur" ? "دیگر زمرے" : "More categories"}
            </h2>
            <div className="flex flex-wrap gap-2">
              {others.map((c) => (
                <Link
                  key={c.slug}
                  href={`/kids/${c.slug}`}
                  className="rounded-full bg-white px-5 py-2 text-sm font-bold text-neutral-600 transition hover:bg-violet-100 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {lang === "ur" ? c.name_ur : c.name_en}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
