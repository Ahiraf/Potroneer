# Turn the raw wallpaper dump in public/ into named theme assets:
#   public/themes/<slug>.jpg        up to 2560x1440 backdrop (cover-cropped)
#   public/themes/<slug>-thumb.jpg  480x300 picker preview
# and print a JSON palette (accent / average / luminance) per theme.
#
# Pass slugs to rebuild only those:  python3 assets-src/make-theme-assets.py day-sky
from PIL import Image, ImageFilter
import colorsys, json, os, sys

SRC = "assets-src/themes"
OUT = "public/themes"
os.makedirs(OUT, exist_ok=True)

# file, slug, en, bn, group, mood, weather, pack
T = [
 # Every photo here is sourced at 2000px or wider. The 37 themes that used to
 # live in this table came from phone-sized wallpapers (most 736px across) and
 # went soft the moment the camera leaned toward the backdrop wall — they were
 # dropped rather than upscaled, because upscaling never put the detail back.
 ("shoji-corridor.jpg","shoji-corridor","Shoji Corridor","শোজি বারান্দা","cozy","library","clear","starter"),
 ("firelit-sitting-room.jpg","firelit-sitting-room","Firelit Room","আগুনের ঘর","cozy","dusk","clear","starter"),
 ("gallery-window-room.jpg","gallery-window-room","Gallery Room","গ্যালারি ঘর","cozy","studio","clear","starter"),
 ("sunlit-adobe-room.jpg","sunlit-adobe-room","Adobe Room","মাটির ঘর","cozy","day","clear","starter"),
 ("window-seat-nook.jpg","window-seat-nook","Window Seat","জানালার আসন","cozy","day","breeze","starter"),
 ("linen-curtain-window.jpg","linen-curtain-window","Linen Curtains","লিনেন পর্দা","window","day","breeze","starter"),
 ("arched-autumn-window.jpg","arched-autumn-window","Arched Autumn Window","খিলানের শরৎ জানালা","window","day","leaves","village"),
 ("alpine-window.jpg","alpine-window","Alpine Window","আল্পসের জানালা","window","mountain","breeze","alpine"),
 ("cottage-sill-vases.jpg","cottage-sill-vases","Cottage Sill","কুটিরের জানালা","window","day","breeze","starter"),
 ("garden-porthole.jpg","garden-porthole","Garden Window","বাগানের জানালা","window","garden","breeze","jungle"),
 ("courtyard-window.jpg","courtyard-window","Courtyard Window","উঠোনের জানালা","window","garden","breeze","jungle"),
 ("sunset-sea-window.jpg","sunset-sea-window","Sunset Sea Window","সূর্যাস্তের সাগর জানালা","window","beach","breeze","starter"),
 ("paris-window.jpg","paris-window","Paris Window","প্যারিসের জানালা","window","town","clear","urban"),
 ("dusk-mist-window.jpg","dusk-mist-window","Dusk Mist Window","কুয়াশার গোধূলি জানালা","window","dusk","mist","starter"),
 ("white-cherry-branch.jpg","white-cherry-branch","White Cherry Branch","সাদা চেরি ডাল","bloom","blossom","petals","blossom"),
 ("sakura-canal-night.jpg","sakura-canal-night","Sakura Canal","সাকুরা খাল","bloom","lantern","petals","blossom"),
 ("platform-nine-and-three-quarters.jpg","platform-nine-and-three-quarters","Platform 9¾","প্ল্যাটফর্ম ৯¾","magic","night","sparkle","wizarding"),
 ("wizard-study.jpg","wizard-study","Wizard's Study","জাদুকরের পাঠকক্ষ","magic","library","sparkle","wizarding"),
 ("wizard-alley.jpg","wizard-alley","Wizard Alley","জাদুর গলি","magic","town","sparkle","wizarding"),
 ("common-room-hearth.jpg","common-room-hearth","Common Room","আরামকক্ষ","magic","library","sparkle","wizarding"),
 ("castle-moonrise.jpg","castle-moonrise","Castle Moonrise","চাঁদের দুর্গ","magic","night","sparkle","wizarding"),
 ("temple-dragon-dusk.jpg","temple-dragon-dusk","Temple Dragon","মন্দিরের ড্রাগন","places","dusk","sparkle","lantern"),
 ("palace-courtyard.jpg","palace-courtyard","Palace Courtyard","প্রাসাদ প্রাঙ্গণ","places","town","clear","lantern"),
 ("great-wall-autumn.jpg","great-wall-autumn","Great Wall","মহাপ্রাচীর","places","mountain","mist","alpine"),
 ("lake-boat-village.jpg","lake-boat-village","Lake Boat Village","হ্রদের নৌকা গ্রাম","places","village","mist","village"),
 ("misty-autumn-road.jpg","misty-autumn-road","Misty Autumn Road","কুয়াশার শরৎ পথ","nature","dusk","mist","village"),
 ("foggy-forest-road.jpg","foggy-forest-road","Foggy Forest Road","কুয়াশার বনপথ","nature","night","mist","jungle"),
 ("autumn-avenue.jpg","autumn-avenue","Autumn Avenue","শরতের সড়ক","nature","dusk","breeze","village"),
 ("golden-facade.jpg","golden-facade","Golden Facade","সোনালি অট্টালিকা","window","town","clear","urban"),
 ("day-sky.jpg","day-sky","Day Sky","দিনের আকাশ","window","day","clear","starter"),
]

# Vertical crop focus for the portrait sources, whose 16:9 band would otherwise
# cut the subject in half (0 = top of the photo, 1 = bottom).
FOCUS = {
 'shoji-corridor': 0.5, 'temple-dragon-dusk': 0.52, 'platform-nine-and-three-quarters': 0.5,
 'palace-courtyard': 0.42, 'arched-autumn-window': 0.46, 'wizard-study': 0.5,
 'white-cherry-branch': 0.5, 'firelit-sitting-room': 0.5, 'gallery-window-room': 0.46,
 'garden-porthole': 0.5, 'courtyard-window': 0.5, 'common-room-hearth': 0.5,
 'paris-window': 0.5, 'dusk-mist-window': 0.5, 'castle-moonrise': 0.42,
 'great-wall-autumn': 0.5,
}

# The backdrop hangs on a wall the camera can lean toward, so it wants real
# pixels. 2560 is the ceiling; the floor is whatever the source actually has —
# see backdrop_size(). Upscaling here is what made every early theme soft: a
# 1200px photo blown up to 1600 carries no more detail, only more bytes, and
# then the runtime canvas stretched it again.
BW, BH = 2560, 1440
TW, TH = 480, 300


def backdrop_size(im):
    """Largest 16:9 box this source can fill without being upscaled."""
    w = min(BW, im.width, round(im.height * BW / BH))
    return max(640, w), max(360, round(w * BH / BW))


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


only = set(sys.argv[1:])
out = []
for f, slug, en, bn, group, mood, weather, pack in T:
    if only and slug not in only:
        continue
    src = Image.open(os.path.join(SRC, f)).convert("RGB")
    fz = FOCUS.get(slug, 0.45)
    bw, bh = backdrop_size(src)
    big = cover(src, bw, bh, fz)
    big.save(f"{OUT}/{slug}.jpg", quality=84, optimize=True, progressive=True)
    cover(src, TW, TH, fz).save(f"{OUT}/{slug}-thumb.jpg", quality=80, optimize=True)
    accent, avg, lum = palette(big)
    out.append(dict(id=slug, label=en, bn=bn, group=group, mood=mood, weather=weather,
                    pack=pack, accent=accent, tone=avg, lum=lum))

print(json.dumps(out, ensure_ascii=False, indent=1))
