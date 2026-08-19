# Turn the raw wallpaper dump in public/ into named theme assets:
#   public/themes/<slug>.jpg        1600x900 backdrop (cover-cropped)
#   public/themes/<slug>-thumb.jpg   480x300 picker preview
# and print a JSON palette (accent / average / luminance) per theme.
from PIL import Image, ImageFilter
import colorsys, json, os

SRC = "assets-src/themes"
OUT = "public/themes"
os.makedirs(OUT, exist_ok=True)

# file, slug, en, bn, group, mood, weather, critters, pack
T = [
 ("willow-swan-lake.jpg","willow-swan-lake","Willow Swan Lake","উইলো রাজহাঁস হ্রদ","nature","garden","mist","birds","village"),
 ("sunflower-curtain.jpg","sunflower-curtain","Sunflower Curtain","সূর্যমুখী পর্দা","bloom","day","petals","butterflies","blossom"),
 ("castle-arches.jpg","castle-arches","Castle Arches","দুর্গের খিলান","magic","library","sparkle","owls","wizarding"),
 ("spirit-stag-cave.jpg","spirit-stag-cave","Spirit Stag Cave","আলোর হরিণ গুহা","magic","night","glow","fireflies","wizarding"),
 ("lavender-dusk.jpg","lavender-dusk","Lavender Dusk","ল্যাভেন্ডার গোধূলি","nature","dusk","petals","butterflies","blossom"),
 ("golden-swan-forest.jpg","golden-swan-forest","Golden Swan Forest","সোনালি রাজহাঁস বন","nature","dusk","mist","birds","village"),
 ("cave-lookout-pines.jpg","cave-lookout-pines","Cave Lookout","গুহার জানালা","nature","mountain","breeze","birds","alpine"),
 ("starlit-hall.jpg","starlit-hall","Starlit Hall","তারাভরা হল","magic","space","stars","satellites","cosmic"),
 ("mossy-portal.jpg","mossy-portal","Mossy Portal","শ্যাওলার দরজা","magic","garden","glow","fireflies","jungle"),
 ("moonlit-bedroom.jpg","moonlit-bedroom","Moonlit Bedroom","জ্যোৎস্না ঘর","cozy","night","stars","fireflies","starter"),
 ("castle-night-window.jpg","castle-night-window","Castle Window","দুর্গের জানালা","magic","night","sparkle","owls","wizarding"),
 ("white-blossom-wall.jpg","white-blossom-wall","White Blossom Wall","সাদা ফুলের দেয়াল","bloom","day","petals","butterflies","blossom"),
 ("pink-blossom-wall.jpg","pink-blossom-wall","Pink Blossom Wall","গোলাপি ফুলের দেয়াল","bloom","blossom","petals","butterflies","blossom"),
 ("breezy-window.jpg","breezy-window","Breezy Window","হাওয়ার জানালা","window","day","breeze","birds","starter"),
 ("winter-castle-window.jpg","winter-castle-window","Winter Castle","শীতের দুর্গ","magic","mountain","snow","owls","alpine"),
 ("lantern-terrace.jpg","lantern-terrace","Lantern Terrace","লণ্ঠন বারান্দা","magic","lantern","lanterns","fireflies","lantern"),
 ("night-town-window.jpg","night-town-window","Night Town Window","রাতের শহরের জানালা","window","night","stars","fireflies","urban"),
 ("moonlit-library.jpg","moonlit-library","Moonlit Library","জ্যোৎস্না লাইব্রেরি","cozy","library","sparkle","owls","wizarding"),
 ("seaside-balcony.jpg","seaside-balcony","Seaside Balcony","সমুদ্র বারান্দা","window","beach","breeze","birds","starter"),
 ("leaf-shadow-wall.jpg","leaf-shadow-wall","Leaf Shadows","পাতার ছায়া","cozy","day","breeze","motes","starter"),
 ("patronus-forest.jpg","patronus-forest","Patronus Forest","রক্ষাকবচ বন","magic","night","glow","fireflies","wizarding"),
 ("cartoon-room.jpg","cartoon-room","Cartoon Room","কার্টুন ঘর","cozy","day","clear","motes","starter"),
 ("tatami-room.jpg","tatami-room","Tatami Room","তাতামি ঘর","cozy","day","clear","motes","starter"),
 ("mushroom-moon-forest.jpg","mushroom-moon-forest","Mushroom Moon Forest","ব্যাঙের ছাতার বন","nature","garden","fireflies","fireflies","jungle"),
 ("snowy-pine-window.jpg","snowy-pine-window","Snowy Pines","তুষার পাইন","nature","mountain","snow","birds","alpine"),
 ("forest-stream-window.jpg","forest-stream-window","Forest Stream","বনের ঝরনা","window","garden","mist","birds","jungle"),
 ("starry-town-window.jpg","starry-town-window","Starry Town","তারার শহর","window","night","stars","fireflies","urban"),
 ("quiet-beige-wall.jpg","quiet-beige-wall","Quiet Wall","শান্ত দেয়াল","cozy","studio","clear","motes","starter"),
 ("snowflake-blue.jpg","snowflake-blue","Blue Snowflake","নীল তুষারকণা","nature","night","snow","motes","alpine"),
 ("daisy-meadow-swing.jpg","daisy-meadow-swing","Daisy Meadow","ডেইজি মাঠ","nature","village","breeze","butterflies","village"),
 ("old-town-night.jpg","old-town-night","Old Town Night","পুরোনো শহরের রাত","window","town","stars","birds","urban"),
 ("candlelit-cathedral.jpg","candlelit-cathedral","Candlelit Cathedral","মোমবাতির ক্যাথিড্রাল","magic","library","snow","owls","wizarding"),
 ("keyhole-valley.jpg","keyhole-valley","Keyhole Valley","চাবির ফুটোয় উপত্যকা","magic","valley","glow","butterflies","caucasus"),
 ("white-steps-lake.jpg","white-steps-lake","White Steps Lake","সাদা সিঁড়ি হ্রদ","window","valley","breeze","birds","caucasus"),
 ("library-city-window.jpg","library-city-window","City Library Window","শহরের লাইব্রেরি","cozy","library","sparkle","owls","wizarding"),
 ("rose-sunlit-wall.jpg","rose-sunlit-wall","Sunlit Roses","রোদে গোলাপ","bloom","blossom","petals","butterflies","blossom"),
 ("yellow-blossom-brick.jpg","yellow-blossom-brick","Golden Blossom","সোনালি ফুল","bloom","day","petals","butterflies","blossom"),
]

FOCUS = {'willow-swan-lake': 0.6, 'spirit-stag-cave': 0.7, 'golden-swan-forest': 0.58, 'patronus-forest': 0.5, 'mossy-portal': 0.52, 'lantern-terrace': 0.5, 'daisy-meadow-swing': 0.55, 'snowy-pine-window': 0.4, 'rose-sunlit-wall': 0.5, 'moonlit-bedroom': 0.55, 'cave-lookout-pines': 0.5}

BW, BH = 1600, 900
TW, TH = 480, 300


def cover(im, w, h, focus=0.45):
    """Scale to cover w×h and crop, keeping the band around `focus` (0=top)."""
    s = max(w / im.width, h / im.height)
    nw, nh = max(w, round(im.width * s)), max(h, round(im.height * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top = min(max(0, round(nh * focus - h / 2)), nh - h)
    return im.crop((left, top, left + w, top + h))


def hexc(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(v)))) for v in rgb)


def palette(im):
    """Average colour, luminance, and the most vivid frequent hue (the accent)."""
    small = im.resize((72, 40), Image.LANCZOS).convert("RGB")
    px = list(small.getdata())
    n = len(px)
    avg = [sum(p[i] for p in px) / n for i in range(3)]
    lum = (0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2]) / 255

    # Bucket by hue, score each bucket by saturation*count and pick the winner —
    # a decent "what colour is this picture about" without a full quantiser.
    buckets = {}
    for r, g, b in px:
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if s < 0.18 or l < 0.12 or l > 0.93:
            continue
        k = round(h * 18)
        e = buckets.setdefault(k, [0, 0.0, 0.0, 0.0])
        e[0] += 1
        e[1] += h
        e[2] += l
        e[3] += s
    if buckets:
        k, e = max(buckets.items(), key=lambda kv: kv[1][0] * (kv[1][3] / kv[1][0]) ** 1.4)
        c, h, l, s = e[0], e[1] / e[0], e[2] / e[0], e[3] / e[0]
        # Push the accent to a usable, readable strength.
        accent = colorsys.hls_to_rgb(h, min(0.68, max(0.52, l)), min(0.75, max(0.42, s)))
        accent = [v * 255 for v in accent]
    else:
        accent = [140, 150, 140]
    return hexc(accent), hexc(avg), round(lum, 3)


out = []
for f, slug, en, bn, group, mood, weather, critters, pack in T:
    src = Image.open(os.path.join(SRC, f)).convert("RGB")
    fz = FOCUS.get(slug, 0.45)
    big = cover(src, BW, BH, fz)
    big.save(f"{OUT}/{slug}.jpg", quality=84, optimize=True, progressive=True)
    cover(src, TW, TH, fz).save(f"{OUT}/{slug}-thumb.jpg", quality=80, optimize=True)
    accent, avg, lum = palette(big)
    out.append(dict(id=slug, label=en, bn=bn, group=group, mood=mood, weather=weather,
                    critters=critters, pack=pack, accent=accent, tone=avg, lum=lum))

print(json.dumps(out, ensure_ascii=False, indent=1))
