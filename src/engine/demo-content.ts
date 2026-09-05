import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { db, posts, categories, users, tags, postTags, media } from '@/db';
import { generateImage } from '@/providers';
import { getSettings } from '@/lib/settings';
import { renderMarkdown } from '@/lib/markdown';
import { slugify, wordCount, readingTime, stripMarkdown } from '@/lib/util';
import { logInfo } from '@/lib/log';
import { analyzeSeo } from './seo-analyzer';
import { buildPostSchema } from './schema';
import { schemaContext } from './generate';
import { addInternalLinks } from './internal-links';

/**
 * Sample articles for a fresh install.
 *
 * They exist so the layout can be evaluated with realistic content before any
 * API key is added — long-form body copy, a comparison table, lists, an FAQ and
 * a featured image each. They are ordinary posts once created: edit or delete
 * them like anything else.
 */

type DemoPost = {
  title: string;
  slug: string;
  category: string;
  keyword: string;
  secondary: string[];
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  tags: string[];
  imageBrief: string;
  imageAlt: string;
  /** In-body images, each inserted immediately before the named H2. */
  inline: { before: string; brief: string; alt: string }[];
  daysAgo: number;
  markdown: string;
};

const DEMO: DemoPost[] = [
  {
    title: 'How to Descale an Espresso Machine Without Wrecking It',
    slug: 'how-to-descale-an-espresso-machine',
    category: 'guides',
    keyword: 'how to descale an espresso machine',
    secondary: ['descaling solution', 'limescale espresso', 'citric acid descaler', 'how often to descale', 'hard water coffee'],
    metaTitle: 'How to Descale an Espresso Machine in 20 Minutes',
    metaDescription:
      'How to descale an espresso machine safely: which solution to use, how often to do it on hard water, and why vinegar destroys the boiler seals.',
    excerpt:
      'A twenty-minute descaling routine that keeps an espresso machine brewing hot, plus the interval that matches your water hardness.',
    tags: ['espresso', 'maintenance', 'descaling'],
    imageBrief:
      'a stainless steel home espresso machine on a wooden kitchen counter being cleaned, warm morning light through a window, shallow depth of field',
    imageAlt: 'A home espresso machine on a wooden counter mid-clean, lit by morning light',
    inline: [
      {
        before: 'What you need',
        brief: 'a bottle of descaling solution and a glass measuring jug on a kitchen counter beside an espresso machine, clean product styling, soft daylight',
        alt: 'Descaling solution and a measuring jug set out next to an espresso machine',
      },
      {
        before: 'Why not vinegar?',
        brief: 'water running from an espresso machine group head into a glass jug during a cleaning cycle, steam, close-up, kitchen background',
        alt: 'Water running from an espresso machine group head into a jug during rinsing',
      },
    ],
    daysAgo: 1,
    markdown: `Learning how to descale an espresso machine takes about twenty minutes and one bottle of solution, and it is the cheapest thing you can do to keep a machine alive past its fifth birthday. Descale every two to three months on hard water, every six on soft.

Limescale builds up wherever water is heated. In an espresso machine that means the boiler, the thermoblock and the narrow tubes between them. Once the deposit is thick enough the machine takes longer to heat, brews cooler, and eventually blocks entirely.

## How often should you descale?

Water hardness decides this, not the calendar.

| Water hardness | Typical supply | Descale every |
| --- | --- | --- |
| Soft (0–60 ppm) | Filtered or bottled | 6 months |
| Moderate (60–120 ppm) | Most municipal water | 3 months |
| Hard (120–180 ppm) | Chalk and limestone regions | 2 months |
| Very hard (180+ ppm) | Untreated well water | 4–6 weeks |

If your machine has a descale light, treat it as a reminder rather than an instruction. Most of them count brew cycles and know nothing at all about your water.

## What you need

- A commercial descaling solution, or food-grade citric acid at roughly 30 g per litre of water
- A jug that holds at least a litre
- Ten minutes of attention, plus rinsing time

That is genuinely it. Skip the specialist brushes and tablets.

## Step 1: Empty and prepare the machine

Remove the water filter if your machine has one — descaler will ruin it. Empty the drip tray, take out the portafilter, and put your jug under the group head.

## Step 2: Run the descaling cycle

Fill the tank with solution mixed to the strength on the bottle. Run about a third of the tank through the group head, then a third through the steam wand. Let the rest sit in the boiler for fifteen minutes so the acid has time to work.

## Step 3: Rinse twice

Run two complete tanks of fresh water through both the group head and the wand. This is the step people cut short, and it is why the next shot tastes of chemicals.

> If the first espresso after descaling tastes sharp or soapy, you have not rinsed enough. Run another full tank before you blame the beans.

## Why not vinegar?

Acetic acid does dissolve limescale. It also attacks the silicone and rubber seals inside the machine, and the smell never fully leaves the boiler. A bottle of proper descaler costs less than one gasket replacement.

## What to do next

Test your water hardness with a strip, set a calendar reminder at the interval in the table above, and fit an inline filter if you are on hard water. A filter roughly halves how often you have to do any of this.

## Frequently asked questions

### Can I use vinegar to descale an espresso machine?

You can, but you should not. Acetic acid dissolves limescale effectively, yet it also degrades the silicone and rubber seals inside the boiler and group head, and the odour lingers for many brew cycles. A dedicated descaler or food-grade citric acid does the same job without the damage.

### How often should I descale with hard water?

On water above 120 ppm, descale every two months. Above 180 ppm, every four to six weeks. Hard water deposits scale far faster than a home machine tolerates, and the interval matters more than which product you choose.

### What happens if I never descale?

Brew temperature drops first, so shots taste sour and thin. Heating takes progressively longer. Eventually the narrow tubes between boiler and group head block completely, which usually means a service bill larger than the machine is worth.

### Is citric acid safe for espresso machines?

Yes, at food grade and roughly 30 grams per litre. It is what most commercial descalers are built around. Rinse with two full tanks afterwards and it leaves no taste at all.`,
  },

  {
    title: 'How to Dial In an Espresso Shot in Under Ten Minutes',
    slug: 'how-to-dial-in-espresso',
    category: 'guides',
    keyword: 'how to dial in espresso',
    secondary: ['espresso ratio', 'grind size espresso', 'extraction time', 'sour espresso', 'bitter espresso'],
    metaTitle: 'How to Dial In Espresso: A 10-Minute Method',
    metaDescription:
      'Dial in espresso with one variable at a time: start at a 1:2 ratio in 25–30 seconds, then move grind size only. A repeatable method for any machine.',
    excerpt:
      'Change one variable at a time and a new bag of beans takes three shots to dial in, not thirty.',
    tags: ['espresso', 'brewing', 'technique'],
    imageBrief:
      'espresso extracting from a bottomless portafilter into a glass cup, rich crema, dark background, backlit, macro detail',
    imageAlt: 'Espresso extracting from a bottomless portafilter into a clear glass cup',
    inline: [
      {
        before: 'Step 1: Lock the dose',
        brief: 'a digital scale holding a portafilter full of ground coffee, numbers visible, dark worktop, overhead shot',
        alt: 'A portafilter of ground coffee sitting on a digital scale',
      },
      {
        before: 'Then taste, not just measure',
        brief: 'a barista tasting espresso from a small cup beside a machine, thoughtful expression, warm cafe lighting',
        alt: 'A barista tasting an espresso shot beside the machine',
      },
    ],
    daysAgo: 3,
    markdown: `Dialling in espresso means finding the grind size that gives you the right amount of liquid in the right amount of time. Start at a 1:2 ratio — 18 g of coffee in, 36 g of espresso out, in 25 to 30 seconds — then change grind size only until you hit it. Three shots is normal. Thirty means you are changing too many things at once.

Every bag of beans needs this. Roast date, origin and roast level all shift how fast water moves through the puck, so the setting that was perfect last week will be wrong today.

## The only three numbers that matter

| Variable | Starting point | What it controls |
| --- | --- | --- |
| Dose (coffee in) | 18 g | Strength and how full the basket sits |
| Yield (espresso out) | 36 g | Ratio, and how much you extract |
| Time | 25–30 seconds | Whether the grind is right |

Weigh the dose and the yield. Timing a shot without weighing the output tells you almost nothing, because a fast shot and a large shot look identical in the cup.

## Step 1: Lock the dose

Pick a dose your basket is designed for — usually printed on it, usually 18 g — and do not change it again today. Every other adjustment gets confusing if the dose is moving too.

## Step 2: Pull a shot and read it

Grind, distribute, tamp level, and pull until you hit 36 g on the scale. Note the time.

- **Under 20 seconds** — grind finer
- **20–25 seconds** — grind slightly finer
- **25–30 seconds** — you are in range
- **Over 35 seconds** — grind coarser

## Step 3: Move grind size only

Adjust one step, purge a couple of grams through the grinder so you are not pulling yesterday's setting, and pull again. Two or three iterations gets almost any bag into range.

> Change one variable at a time. If you adjust the grind and the dose together, you learn nothing from the result and you are back to guessing.

## Then taste, not just measure

Numbers get you close. Your tongue finishes the job.

- **Sour, sharp, thin** — under-extracted. Grind finer, or raise the yield slightly.
- **Bitter, dry, hollow** — over-extracted. Grind coarser, or lower the yield.
- **Flat but not unpleasant** — often stale beans rather than a bad setting.

## When it still will not behave

Channelling — water finding one fast path through the puck — makes time and taste disagree with each other. If shots are inconsistent at a fixed setting, the fix is distribution, not grind. Level the grounds properly before tamping and tamp flat.

Beans under three days off roast are also genuinely difficult, because trapped carbon dioxide disrupts the flow. Wait a few days rather than fighting it.

If shots have drifted slowly over months rather than changing with a new bag, suspect the hardware: a scaled-up espresso machine brews cooler than it reports, and every shot reads as under-extracted.

## Frequently asked questions

### What espresso ratio should I start with?

1:2 — 18 g in, 36 g out. It suits the overwhelming majority of modern medium roasts. Go slightly longer (1:2.5) for light roasts, slightly shorter (1:1.5) for very dark ones.

### Why does my espresso taste sour?

Almost always under-extraction: water passed through too fast to dissolve enough of the coffee. Grind finer and re-pull. If a finer grind makes it bitter without ever tasting balanced, brew temperature or bean freshness is the real problem.

### How long should an espresso shot take?

25 to 30 seconds from the moment the pump starts, to a yield roughly double the dose. Treat it as a diagnostic range rather than a target — a great 32-second shot is still a great shot.

### Do I need to change the grind for every bag?

Yes. Different beans and roast levels resist water differently. Expect two or three shots of adjustment whenever you open something new.`,
  },

  {
    title: 'Burr vs Blade Grinders: What Actually Changes in the Cup',
    slug: 'burr-vs-blade-grinder',
    category: 'comparisons',
    keyword: 'burr vs blade grinder',
    secondary: ['conical burr grinder', 'flat burr', 'grind consistency', 'coffee grinder upgrade'],
    metaTitle: 'Burr vs Blade Grinder: Which Is Worth Buying?',
    metaDescription:
      'Burr vs blade grinder, compared on grind consistency, taste, noise and price — plus the one situation where a blade grinder is genuinely fine.',
    excerpt:
      'A blade grinder chops, a burr grinder mills. That single mechanical difference is why one can make good espresso and the other cannot.',
    tags: ['grinders', 'gear', 'comparison'],
    imageBrief:
      'two coffee grinders side by side on a kitchen counter, one manual burr grinder and one electric grinder, even studio lighting, product photography',
    imageAlt: 'A manual burr grinder and an electric grinder side by side on a counter',
    inline: [
      {
        before: 'Why consistency decides the taste',
        brief: 'a close-up comparison of two piles of ground coffee on white paper, one even and one uneven with visible chunks, studio lighting',
        alt: 'Two piles of ground coffee side by side, one evenly ground and one uneven',
      },
      {
        before: 'Where the money goes in a burr grinder',
        brief: 'the exposed steel burrs inside a coffee grinder, macro detail, metallic texture, dramatic side lighting',
        alt: 'Close-up of the steel burrs inside a coffee grinder',
      },
    ],
    daysAgo: 5,
    markdown: `A blade grinder chops beans with a spinning propeller. A burr grinder mills them between two surfaces set a fixed distance apart. That one mechanical difference decides everything else: a burr grinder produces particles of roughly one size, and a blade grinder produces everything from dust to gravel in the same batch.

If you brew espresso or pour-over, that inconsistency is the single biggest thing standing between you and a better cup — bigger than your machine, and much bigger than your beans.

## The comparison in one table

| | Blade grinder | Burr grinder |
| --- | --- | --- |
| Mechanism | Spinning blade chops | Two burrs mill to a set gap |
| Grind consistency | Poor — dust and boulders together | Good to excellent |
| Adjustable grind size | Only by timing it | Yes, stepped or stepless |
| Suits espresso | No | Yes (with a decent model) |
| Suits French press | Passable | Yes |
| Typical price | Low | Low to high |
| Noise | Loud, brief | Quieter, longer |
| Retained grounds | Minimal | Some, varies by model |

## Why consistency decides the taste

Water extracts from small particles fast and large particles slowly. When both sit in the same basket, the dust over-extracts and turns bitter while the boulders under-extract and stay sour — in the same cup, at the same time.

You cannot fix that by adjusting brew time, because there is no brew time that is right for both. This is why a blade-ground espresso tastes simultaneously harsh and weak no matter what you do to the machine — no amount of care spent to dial in espresso will rescue it.

> The upgrade order that actually matters is grinder, then beans, then machine. Almost everyone buys it backwards.

## Where the money goes in a burr grinder

- **Under about £50 / $60** — entry electric burrs. A real improvement on blades for filter, still coarse-stepped for espresso.
- **Hand grinders in the same range** — usually better burrs than an electric at the same price, because you are not paying for the motor. The trade is a minute of effort per dose.
- **Mid-range electric** — finer adjustment steps, which is what espresso really needs.
- **Above that** — flat burrs, better alignment, more consistency at the extremes.

Conical burrs are the common choice at home and cost less. Flat burrs give a slightly tighter particle distribution and tend to appear higher up the range. The difference between conical and flat is far smaller than the difference between either and a blade.

## The one case for a blade grinder

If you brew French press or cold brew exclusively, drink it with milk, and grind once a week, a blade grinder is genuinely fine. Coarse immersion brewing is the most forgiving method there is, and pulse-grinding in short bursts keeps the batch reasonably even.

For anything pressurised or time-sensitive, it is not fine, and no technique compensates.

## Frequently asked questions

### Is a burr grinder really worth it for a beginner?

Yes, and earlier than most gear advice suggests. A cheap burr grinder with good beans beats an expensive machine with blade-ground coffee, every time.

### Conical or flat burrs?

At home, conical, unless you are chasing a specific flavour profile in espresso. The price difference buys more improvement elsewhere.

### Can I use a blade grinder for espresso if I grind for longer?

No. Longer grinding makes more dust without removing the boulders, so the batch gets more inconsistent rather than finer. Time is not a substitute for a set gap.

### How long does a burr grinder last?

Steel burrs last roughly 500–1000 kg of coffee in home use — effectively a decade or more. Ceramic burrs last longer but are more brittle.`,
  },

  {
    title: 'Espresso vs Filter Coffee: Which Should You Brew at Home?',
    slug: 'espresso-vs-filter-coffee',
    category: 'comparisons',
    keyword: 'espresso vs filter coffee',
    secondary: ['pour over vs espresso', 'coffee brewing methods', 'caffeine espresso vs filter', 'best coffee for beginners'],
    metaTitle: 'Espresso vs Filter Coffee: An Honest Comparison',
    metaDescription:
      'Espresso vs filter coffee compared on cost, effort, caffeine and taste — and a straight answer about which one a first-time home brewer should start with.',
    excerpt:
      'One is intense, fast and unforgiving. The other is forgiving, cheap to start and hard to ruin. Most people should start with the second.',
    tags: ['brewing', 'espresso', 'pour over'],
    imageBrief:
      'a small espresso cup next to a glass pour-over carafe of filter coffee on a light stone surface, natural side light, editorial food photography',
    imageAlt: 'An espresso cup beside a glass pour-over carafe of filter coffee on a stone counter',
    inline: [
      {
        before: 'What each one is good at',
        brief: 'hot water being poured in a spiral over coffee grounds in a ceramic pour-over dripper, steam rising, morning light',
        alt: 'Water being poured over coffee grounds in a ceramic pour-over dripper',
      },
      {
        before: 'Choosing by how you actually drink coffee',
        brief: 'a flat white with latte art in a ceramic cup on a cafe table next to a black filter coffee in a glass, overhead view',
        alt: 'A flat white beside a glass of black filter coffee on a cafe table',
      },
    ],
    daysAgo: 8,
    markdown: `Espresso is concentrated coffee pushed through a compacted puck under pressure in about 30 seconds. Filter coffee is water passing through a bed of grounds under gravity over three to four minutes. Espresso rewards precision and punishes small mistakes; filter forgives almost everything.

If you are choosing one to start with at home, start with filter. It costs a fraction as much to set up, and the gap between a beginner's cup and an expert's cup is far narrower.

## Side by side

| | Espresso | Filter |
| --- | --- | --- |
| Brew time | 25–30 seconds | 3–4 minutes |
| Coffee per cup | 18–20 g | 15–18 g |
| Liquid in the cup | 36–40 g | 250–300 g |
| Caffeine per serving | ~65 mg | ~120 mg |
| Kit to start properly | Machine and a good grinder | Dripper, filters, kettle |
| Tolerance for error | Low | High |
| Best at showing off | Body and intensity | Clarity and origin character |

## The caffeine question, answered properly

Espresso is far more concentrated per millilitre, but you drink much less of it. A single espresso carries roughly 65 mg of caffeine; a mug of filter coffee carries around 120 mg. Per cup as actually served, filter usually delivers more.

## What each one is good at

**Espresso** gives you body, sweetness and intensity, and it is the base for every milk drink. It also has an expensive floor: an espresso machine without a grinder that can adjust finely enough is a machine that cannot make good espresso.

**Filter** gives you clarity. Acidity, florals and the distinctions between origins come through much more plainly, which is why tasting rooms brew filter. A dripper and paper filters cost less than a bag of good beans.

> If your budget is fixed, put it into the grinder and brew filter. That combination beats a cheap espresso setup by a wide margin.

## Choosing by how you actually drink coffee

- **You mostly drink flat whites and lattes** — you need espresso, and you need to budget for the grinder too.
- **You drink black coffee and want to taste the beans** — filter, comfortably.
- **You want one cup, fast, before work** — filter with an immersion brewer, or a moka pot as a middle ground.
- **You enjoy the process itself** — either, honestly. Espresso has more dials to turn.

## What both actually depend on

Grind consistency, fresh beans and water at the right temperature matter more than which method you pick. A well-made filter coffee beats a badly made espresso every single time, and the reverse is also true.

## Frequently asked questions

### Is espresso stronger than filter coffee?

By concentration, yes — several times over. By caffeine per serving, usually no, because a filter serving is roughly seven times larger.

### Which is cheaper to run?

Filter, by a wide margin. Paper filters cost pennies and the equipment rarely fails. Espresso machines need descaling, gaskets and eventually servicing.

### Can I use the same beans for both?

Yes. Roasters label bags for a method as a guide, not a rule. Lighter roasts usually shine in filter; darker roasts are more forgiving in espresso.

### What about a moka pot?

A useful middle ground: stronger than filter, gentler than espresso, and cheap. It will not make a flat white, but it is a genuinely good daily brewer.`,
  },

  {
    title: 'Why Your Coffee Tastes Sour, and How to Fix It',
    slug: 'why-coffee-tastes-sour',
    category: 'explainers',
    keyword: 'why does my coffee taste sour',
    secondary: ['under extraction', 'sour espresso fix', 'brew temperature', 'coffee too acidic'],
    metaTitle: 'Why Your Coffee Tastes Sour (and How to Fix It)',
    metaDescription:
      'Sour coffee is almost always under-extraction. Here is how to tell sourness from acidity, and the four fixes to try in order, starting with grind size.',
    excerpt:
      'Sourness is a symptom, not a flavour note. In nearly every case the water left before it had finished the job.',
    tags: ['troubleshooting', 'extraction', 'brewing'],
    imageBrief:
      'a person tasting coffee from a white cup at a kitchen table with brewing equipment nearby, natural window light, candid documentary style',
    imageAlt: 'A person tasting coffee from a white cup with brewing equipment on the table',
    inline: [
      {
        before: 'The four fixes, in order',
        brief: 'a gooseneck kettle with a temperature display pouring into a brewer, steam, dark kitchen counter, close-up',
        alt: 'A temperature-controlled gooseneck kettle pouring water into a coffee brewer',
      },
      {
        before: 'Espresso-specific causes',
        brief: 'espresso running unevenly from a bottomless portafilter with a visible spray to one side, backlit, dark background',
        alt: 'Espresso spraying unevenly from a bottomless portafilter, showing channelling',
      },
    ],
    daysAgo: 11,
    markdown: `Sour coffee is under-extracted coffee. Water moved through the grounds too quickly, or was too cool, and dissolved the sharp acids that come out first without reaching the sugars that balance them. The fix, nine times out of ten, is to grind finer.

It is worth separating two things that often get confused. **Acidity** is a pleasant brightness — citrus, apple, berry — and good light roasts are full of it. **Sourness** is aggressive and puckering, and it makes you want to stop drinking. Acidity is a flavour. Sourness is a fault.

## Why extraction causes it

Brewing dissolves compounds in a rough order. Acids come out first, then sugars, then the bitter compounds last. Stop too early and you get the acids alone.

| Extraction level | Tastes like | Usual cause |
| --- | --- | --- |
| Under | Sour, sharp, thin, salty | Grind too coarse, brew too fast, water too cool |
| Correct | Sweet, balanced, full | — |
| Over | Bitter, dry, hollow, ashy | Grind too fine, brew too long, water too hot |

## The four fixes, in order

**1. Grind finer.** Smaller particles have more surface area, so water extracts more in the same time. This is the highest-leverage change and the one to try first.

**2. Check your water temperature.** Aim for 92–96 °C. Water straight off the boil is too hot; water that has sat for five minutes is too cool. If your kettle has no temperature control, boil and wait about 30 seconds.

**3. Extend the brew.** For filter, a longer pour or a coarser-but-slower technique. For espresso, raise the yield a few grams.

**4. Look at the beans.** Very light roasts genuinely need finer grinds and hotter water than the same recipe at a medium roast. Beans more than a month past roast can also taste flat and sharp at once.

> If a finer grind makes coffee bitter without ever passing through "balanced", the problem is temperature or freshness, not grind size.

## Espresso-specific causes

Channelling is the big one. If water finds a crack through the puck it rushes past most of the coffee, which under-extracts even though the shot looks the right length. Symptoms are shots that taste sour and thin despite normal timing, and inconsistent results at a fixed setting.

Fix distribution before you touch the grinder: break up clumps, level the bed properly, and tamp flat rather than hard.

## Filter-specific causes

- **Pouring too fast** — the bed collapses and water runs down the sides instead of through the coffee
- **An unrinsed paper filter** — adds papery dryness that reads as sour
- **Too coarse a grind for the dripper** — flat-bottom brewers need finer grinds than cones

## Frequently asked questions

### Is sour coffee bad for you?

No. It tastes unpleasant but it is not harmful. It is an extraction problem, not a spoilage one.

### Why is my coffee sour but also bitter?

That is uneven extraction — some particles over-extracted while others under-extracted. It points at grind consistency, so it usually means the grinder, not the recipe. A blade grinder produces this result no matter how carefully you brew.

### Can the water itself cause sourness?

Yes. Very soft or distilled water extracts poorly and tastes hollow and sharp. Filtered tap water with some mineral content brews better than distilled water does.

### Does a darker roast fix sourness?

It masks it. Darker roasts have less acidity to begin with, so under-extraction is less obvious — but the coffee is still under-extracted.`,
  },

  {
    title: 'Coffee Bloom: What It Is and Why Thirty Seconds Matters',
    slug: 'coffee-bloom-explained',
    category: 'explainers',
    keyword: 'coffee bloom',
    secondary: ['blooming coffee', 'degassing coffee', 'pour over bloom time', 'carbon dioxide coffee'],
    metaTitle: 'Coffee Bloom: What It Is and Why It Matters',
    metaDescription:
      'The coffee bloom is trapped carbon dioxide escaping fresh grounds. Here is why skipping it makes coffee weaker, and how long to bloom for.',
    excerpt:
      'That thirty-second pause before the main pour is not ritual. It is removing the gas that would otherwise push your water away from the coffee.',
    tags: ['pour over', 'technique', 'brewing'],
    imageBrief:
      'close-up of coffee grounds blooming and bubbling in a pour-over cone as hot water is poured, steam rising, dark moody background, macro',
    imageAlt: 'Coffee grounds bubbling and rising in a pour-over cone during the bloom',
    inline: [
      {
        before: 'How to do it',
        brief: 'coffee grounds swelling and bubbling in a paper filter as hot water is added, macro detail, steam, dark moody lighting',
        alt: 'Coffee grounds swelling and bubbling in a paper filter during the bloom',
      },
      {
        before: 'Does it apply to every method?',
        brief: 'a French press part-filled with coffee grounds and water, bubbles on the surface, kitchen window light behind',
        alt: 'A French press part-filled with blooming coffee grounds and water',
      },
    ],
    daysAgo: 15,
    markdown: `The coffee bloom is the foam that rises when you first wet fresh grounds. It is carbon dioxide, trapped inside the beans during roasting, escaping as the water hits. Pouring a small amount of water, waiting about 30 seconds, and then brewing normally is what "blooming" means.

It matters because that gas physically pushes water away from the coffee. Brew without letting it escape and water flows around the grounds rather than through them, and the cup comes out weaker and less even. This is why almost every filter coffee recipe opens with a bloom step.

## What is actually happening

Roasting produces carbon dioxide inside the bean, and beans release it slowly for weeks afterwards. Grinding opens that structure up, which is why ground coffee goes stale so much faster than whole beans.

When hot water meets fresh grounds, the remaining gas comes out all at once. The bed swells, bubbles form, and for those few seconds water cannot reach the coffee properly.

| Days off roast | Bloom you will see | Suggested bloom time |
| --- | --- | --- |
| 0–3 days | Very vigorous, bed rises a lot | 45 seconds |
| 4–14 days | Steady, even doming | 30 seconds |
| 15–30 days | Modest | 30 seconds |
| Over a month | Almost none | 20 seconds, or skip |

A weak bloom is a freshness indicator, not a technique failure. If the grounds barely move, the beans are old.

## How to do it

1. Start your timer and pour roughly twice the weight of the coffee in water — 30 g of water for 15 g of grounds.
2. Wet all the grounds. Dry pockets stay dry for the rest of the brew.
3. Wait about 30 seconds. Some people give it a gentle swirl, which helps saturate evenly.
4. Continue with your normal pour schedule.

> A quick swirl during the bloom does more for evenness than any fancy pouring pattern later in the brew.

## Does it apply to every method?

**Pour-over and drip** — yes, clearly. This is where blooming makes the most difference.

**French press** — yes. Add a little water, wait, then fill and stir.

**Espresso** — sort of. Pre-infusion, where the machine wets the puck at low pressure before ramping up, is doing the same job. If your machine has it, use it, especially with very fresh beans.

**Moka pot and cold brew** — no meaningful benefit. Immersion over long periods evens everything out anyway.

## Frequently asked questions

### How long should I bloom coffee for?

30 seconds is the standard. Very fresh beans, under three days off roast, benefit from 45. Older beans need less because there is less gas left to release.

### What if my coffee does not bloom at all?

The beans are stale, or they were ground a while ago. Neither is fixable by technique — buy fresher beans and grind them just before brewing.

### Can I skip the bloom?

You can, and the coffee will still be drinkable. It will usually be weaker and less consistent, and the difference is most obvious with beans under two weeks old.

### Does bloom water count towards my recipe?

Yes. Include it in the total brew water, not on top of it. If your recipe is 250 g of water, the 30 g bloom is part of that 250.`,
  },
];

export async function seedDemoPosts(opts: { withImages?: boolean } = {}): Promise<number> {
  const slugs = DEMO.map((d) => d.slug);
  const existing = await db
    .select({ slug: posts.slug })
    .from(posts)
    .where(inArray(posts.slug, slugs));
  const have = new Set(existing.map((e) => e.slug));
  const todo = DEMO.filter((d) => !have.has(d.slug));
  if (!todo.length) return 0;

  const s = await getSettings();
  const ctx = await schemaContext();
  const [author] = await db.select().from(users).limit(1);
  const cats = await db.select().from(categories);
  const catBySlug = new Map(cats.map((c) => [c.slug, c]));

  let created = 0;

  for (const demo of todo) {
    const category = catBySlug.get(demo.category) ?? null;

    let featuredImage: string | null = null;
    if (opts.withImages !== false) {
      const image = await generateImage(
        {
          prompt: `${demo.imageBrief}. ${s['gen.imageStyle']}. No text, no watermarks, no lettering.`,
          width: 1200,
          height: 675,
          slug: demo.slug,
        },
        { scope: 'demo-content' },
      ).catch(() => null);
      featuredImage = image?.url ?? null;
    }

    // In-body images, inserted before the heading each one belongs to.
    let markdown = demo.markdown;
    const inlineImages: { url: string; alt: string; prompt: string }[] = [];
    if (opts.withImages !== false) {
      for (const spec of demo.inline) {
        const image = await generateImage(
          {
            prompt: `${spec.brief}. ${s['gen.imageStyle']}. No text, no watermarks, no lettering.`,
            width: 1200,
            height: 675,
            slug: `${demo.slug}-${slugify(spec.before, 30)}`,
          },
          { scope: 'demo-content' },
        ).catch(() => null);
        if (!image) continue;

        const anchor = `## ${spec.before}`;
        const at = markdown.indexOf(anchor);
        if (at === -1) continue;
        markdown = `${markdown.slice(0, at)}![${spec.alt}](${image.url})\n\n${markdown.slice(at)}`;
        inlineImages.push({ url: image.url, alt: spec.alt, prompt: spec.brief });
      }
    }

    const words = wordCount(stripMarkdown(markdown));
    const publishedAt = new Date(Date.now() - demo.daysAgo * 86_400_000);

    const report = analyzeSeo({
      title: demo.title,
      slug: demo.slug,
      metaTitle: demo.metaTitle,
      metaDescription: demo.metaDescription,
      excerpt: demo.excerpt,
      contentMd: markdown,
      focusKeyword: demo.keyword,
      secondaryKeywords: demo.secondary,
      featuredImage,
      featuredImageAlt: demo.imageAlt,
      schemaJson: 'pending',
    });

    const [saved] = await db
      .insert(posts)
      .values({
        title: demo.title,
        slug: demo.slug,
        excerpt: demo.excerpt,
        contentMd: markdown,
        contentHtml: renderMarkdown(markdown).html,
        status: 'published',
        publishedAt,
        createdAt: publishedAt,
        updatedAt: publishedAt,
        categoryId: category?.id ?? null,
        authorId: author?.id ?? null,
        focusKeyword: demo.keyword,
        secondaryKeywords: JSON.stringify(demo.secondary),
        featuredImage,
        featuredImageAlt: featuredImage ? demo.imageAlt : null,
        metaTitle: demo.metaTitle,
        metaDescription: demo.metaDescription,
        seoScore: report.score,
        seoChecks: JSON.stringify(report.checks),
        wordCount: words,
        readingTime: readingTime(words),
        generationMeta: JSON.stringify({ source: 'demo-content' }),
      })
      .returning();

    await db
      .update(posts)
      .set({
        schemaJson: buildPostSchema(
          {
            title: demo.title,
            slug: demo.slug,
            excerpt: demo.excerpt,
            metaDescription: demo.metaDescription,
            contentMd: markdown,
            featuredImage,
            featuredImageAlt: demo.imageAlt,
            publishedAt,
            updatedAt: publishedAt,
            wordCount: words,
            focusKeyword: demo.keyword,
            secondaryKeywords: demo.secondary,
            category: category ? { name: category.name, slug: category.slug } : null,
            author: author
              ? { name: author.name, slug: author.slug, bio: author.bio, avatarUrl: author.avatarUrl }
              : null,
          },
          ctx,
        ),
      })
      .where(eq(posts.id, saved.id));

    for (const name of demo.tags) {
      const slug = slugify(name, 40);
      let [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
      if (!tag) [tag] = await db.insert(tags).values({ name, slug }).returning();
      await db.insert(postTags).values({ postId: saved.id, tagId: tag.id }).onConflictDoNothing();
    }

    const mediaRows = [
      ...(featuredImage
        ? [{ url: featuredImage, alt: demo.imageAlt, prompt: demo.imageBrief }]
        : []),
      ...inlineImages,
    ];
    if (mediaRows.length) {
      await db.insert(media).values(
        mediaRows.map((m) => ({ ...m, provider: 'demo', postId: saved.id })),
      );
    }

    created++;
  }

  // Cross-link them once they all exist, using phrase matching rather than a
  // model call — this must work on an install with no text provider.
  const all = await db.select().from(posts).where(inArray(posts.slug, slugs));
  for (const post of all) {
    const linked = await addInternalLinks(post.contentMd, {
      postId: post.id,
      title: post.title,
      focusKeyword: post.focusKeyword,
      max: 3,
      useAi: false,
    });
    if (linked.links.length) {
      await db
        .update(posts)
        .set({
          contentMd: linked.markdown,
          contentHtml: renderMarkdown(linked.markdown).html,
        })
        .where(eq(posts.id, post.id));
    }
  }

  await logInfo('demo-content', `Seeded ${created} sample article(s)`);
  return created;
}
