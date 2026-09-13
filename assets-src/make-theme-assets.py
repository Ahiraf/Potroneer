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
 # --- added 2026-09-13 -------------------------------------------------------
 # A second, much larger batch: sacred interiors, palaces, windows and a few
 # gardens. They arrived as raw downloads dropped straight into public/themes/,
 # which is the *derived* folder — they were moved to assets-src/themes/ under
 # real slugs so the build owns that directory again, and downsized to 3200px
 # on the way, since nothing downstream ever reads more than 2560.
 ("aurora-lake.jpg","aurora-lake","Aurora Lake","মেরুজ্যোতির হ্রদ","nature","space","stars","cosmic"),
 ("teal-arcade.jpg","teal-arcade","Teal Arcade","ফিরোজা খিলান","palace","lantern","sparkle","lantern"),
 ("golden-maples.jpg","golden-maples","Golden Maples","সোনালি ম্যাপল","nature","day","leaves","village"),
 ("autumn-leaf-glow.jpg","autumn-leaf-glow","Autumn Leaf","শরতের পাতা","nature","dusk","leaves","village"),
 ("frozen-bubble.jpg","frozen-bubble","Frozen Bubble","বরফের বুদবুদ","nature","mountain","snow","alpine"),
 ("golden-jali-screen.jpg","golden-jali-screen","Golden Screen","সোনালি জালি","window","day","clear","lantern"),
 ("shrine-window-dark.jpg","shrine-window-dark","Shrine Window","মাজারের জানালা","sacred","night","sparkle","wizarding"),
 ("durbar-hall.jpg","durbar-hall","Durbar Hall","দরবার হল","palace","lantern","sparkle","lantern"),
 ("arched-shopfront.jpg","arched-shopfront","Arched Shopfront","খিলানের দোকান","window","town","clear","urban"),
 ("starlit-colonnade.jpg","starlit-colonnade","Starlit Colonnade","তারার স্তম্ভশ্রেণি","sacred","night","sparkle","lantern"),
 ("palm-columns.jpg","palm-columns","Palm Columns","পামের স্তম্ভ","sacred","day","clear","lantern"),
 ("gilded-dome.jpg","gilded-dome","Gilded Dome","সোনালি গম্বুজ","sacred","lantern","sparkle","lantern"),
 ("blue-mosque-glass.jpg","blue-mosque-glass","Blue Mosque Glass","নীল মসজিদের কাচ","sacred","lantern","lanterns","lantern"),
 ("white-mosque-hall.jpg","white-mosque-hall","White Mosque","সাদা মসজিদ","sacred","day","clear","lantern"),
 ("turquoise-dome.jpg","turquoise-dome","Turquoise Dome","ফিরোজা গম্বুজ","sacred","lantern","sparkle","lantern"),
 ("sunray-arcade.jpg","sunray-arcade","Sunray Arcade","রোদের বারান্দা","window","day","clear","lantern"),
 ("studio-grid-window.jpg","studio-grid-window","Studio Window","স্টুডিও জানালা","cozy","studio","clear","starter"),
 ("cherry-sprig.jpg","cherry-sprig","Cherry Sprig","চেরির ডাল","bloom","blossom","petals","blossom"),
 ("marble-stair-hall.jpg","marble-stair-hall","Marble Stair Hall","মার্বেল সিঁড়ি","cozy","studio","clear","starter"),
 ("red-vault-passage.jpg","red-vault-passage","Red Vault","লাল খিলানপথ","palace","dusk","sparkle","lantern"),
 ("carved-wood-hall.jpg","carved-wood-hall","Carved Wood Hall","কাঠের কারুকাজ","sacred","lantern","lanterns","lantern"),
 ("stained-arch-hall.jpg","stained-arch-hall","Stained Arch Hall","রঙিন খিলানের হল","sacred","day","clear","lantern"),
 ("muqarnas-vault.jpg","muqarnas-vault","Muqarnas Vault","মুকারনাস ছাদ","sacred","night","sparkle","lantern"),
 ("muqarnas-oculus.jpg","muqarnas-oculus","Muqarnas Oculus","গম্বুজের চোখ","sacred","day","clear","lantern"),
 ("lantern-prayer-hall.jpg","lantern-prayer-hall","Lantern Hall","লণ্ঠনের হল","sacred","lantern","lanterns","lantern"),
 ("stucco-lacework.jpg","stucco-lacework","Stucco Lacework","পলেস্তারার জাল","sacred","day","clear","lantern"),
 ("zellij-alcove.jpg","zellij-alcove","Zellij Alcove","জেলিজ কুলুঙ্গি","sacred","day","clear","lantern"),
 ("bookshelf-window.jpg","bookshelf-window","Bookshelf Window","বইয়ের তাক","cozy","library","clear","starter"),
 ("white-arch-stair.jpg","white-arch-stair","White Arch Stair","সাদা খিলানের সিঁড়ি","cozy","day","clear","starter"),
 ("misty-pines.jpg","misty-pines","Misty Pines","কুয়াশার পাইন","nature","night","mist","jungle"),
 ("bougainvillea-door.jpg","bougainvillea-door","Bougainvillea Door","বোগেনভিলিয়ার দরজা","window","beach","breeze","starter"),
 ("moorish-gold-hall.jpg","moorish-gold-hall","Moorish Gold Hall","মূরিশ সোনালি হল","palace","lantern","sparkle","lantern"),
 ("stone-arcade-walk.jpg","stone-arcade-walk","Stone Arcade","পাথরের বারান্দা","sacred","day","clear","lantern"),
 ("fuji-pagoda.jpg","fuji-pagoda","Fuji Pagoda","ফুজি প্যাগোডা","places","mountain","clear","alpine"),
 ("fan-vault.jpg","fan-vault","Fan Vault","গথিক পাখা-ছাদ","sacred","studio","clear","wizarding"),
 ("old-town-window.jpg","old-town-window","Old Town Window","পুরোনো শহরের জানালা","window","town","clear","urban"),
 ("wooden-mosque-ring.jpg","wooden-mosque-ring","Wooden Mosque","কাঠের মসজিদ","sacred","lantern","lanterns","lantern"),
 ("cedar-pillar-hall.jpg","cedar-pillar-hall","Cedar Pillars","সিডার স্তম্ভ","sacred","day","clear","lantern"),
 ("saffron-passage.jpg","saffron-passage","Saffron Passage","জাফরানি পথ","palace","dusk","sparkle","lantern"),
 ("gothic-stone-hall.jpg","gothic-stone-hall","Gothic Hall","গথিক হল","magic","library","sparkle","wizarding"),
 ("lone-tree-snow.jpg","lone-tree-snow","Lone Tree in Snow","বরফে একলা গাছ","nature","mountain","snow","alpine"),
 ("autumn-bay-window.jpg","autumn-bay-window","Autumn Bay Window","শরতের জানালা","window","day","leaves","village"),
 ("alpine-sill-flowers.jpg","alpine-sill-flowers","Alpine Sill","পাহাড়ের জানালা","window","mountain","breeze","alpine"),
 ("pink-palace-hall.jpg","pink-palace-hall","Pink Palace","গোলাপি প্রাসাদ","palace","lantern","sparkle","lantern"),
 ("painted-parlour.jpg","painted-parlour","Painted Parlour","আঁকা বৈঠকখানা","cozy","day","clear","starter"),
 ("lattice-room-mono.jpg","lattice-room-mono","Lattice Room","জালির ঘর","places","studio","clear","urban"),
 ("haveli-doorway.jpg","haveli-doorway","Haveli Doorway","হাভেলির দরজা","palace","day","clear","lantern"),
 ("palace-chamber.jpg","palace-chamber","Palace Chamber","প্রাসাদ কক্ষ","palace","lantern","sparkle","lantern"),
 ("jade-palace-corridor.jpg","jade-palace-corridor","Jade Corridor","জেড বারান্দা","palace","dusk","sparkle","lantern"),
 ("frescoed-chamber.jpg","frescoed-chamber","Frescoed Chamber","চিত্রিত কক্ষ","palace","day","clear","lantern"),
 ("cobalt-dome.jpg","cobalt-dome","Cobalt Dome","নীল গম্বুজ","sacred","night","sparkle","lantern"),
 ("green-glass-windows.jpg","green-glass-windows","Green Glass Windows","সবুজ কাচের জানালা","window","day","clear","lantern"),
 ("brick-column-hall.jpg","brick-column-hall","Brick Columns","ইটের স্তম্ভ","sacred","dusk","mist","lantern"),
 ("sunlit-lattice-door.jpg","sunlit-lattice-door","Sunlit Lattice Door","রোদে ভরা দরজা","window","day","clear","lantern"),
 ("aged-dome-chandelier.jpg","aged-dome-chandelier","Aged Dome","পুরোনো গম্বুজ","sacred","dusk","sparkle","lantern"),
 ("emerald-tilework.jpg","emerald-tilework","Emerald Tilework","পান্না টাইল","sacred","lantern","sparkle","lantern"),
 ("stained-stone-window.jpg","stained-stone-window","Stained Stone Window","পাথরের রঙিন জানালা","window","day","clear","lantern"),
 ("jewelled-dark-hall.jpg","jewelled-dark-hall","Jewelled Hall","রত্নখচিত হল","palace","night","sparkle","lantern"),
 ("white-gold-muqarnas.jpg","white-gold-muqarnas","White Gold Muqarnas","সাদা-সোনালি মুকারনাস","sacred","day","clear","lantern"),
 ("pale-arch-hall.jpg","pale-arch-hall","Pale Arch Hall","ফ্যাকাশে খিলান হল","sacred","studio","clear","lantern"),
 ("ottoman-divan-room.jpg","ottoman-divan-room","Ottoman Divan","উসমানি বৈঠক","cozy","library","clear","lantern"),
 ("lakeside-study.jpg","lakeside-study","Lakeside Study","হ্রদের পাঠকক্ষ","cozy","day","breeze","starter"),
 ("river-stone-window.jpg","river-stone-window","River Window","নদীর জানালা","window","valley","breeze","caucasus"),
 ("blue-coffered-nave.jpg","blue-coffered-nave","Blue Coffered Nave","নীল ছাদের গির্জা","sacred","studio","clear","wizarding"),
 ("alabaster-columns.jpg","alabaster-columns","Alabaster Columns","শ্বেতপাথরের স্তম্ভ","sacred","night","sparkle","lantern"),
 ("indigo-nave.jpg","indigo-nave","Indigo Nave","নীল প্রার্থনাকক্ষ","sacred","studio","clear","wizarding"),
 ("rudbeckia-field.jpg","rudbeckia-field","Golden Daisies","সোনালি ডেইজি","bloom","garden","petals","village"),
 ("dark-ferns.jpg","dark-ferns","Dark Ferns","গাঢ় ফার্ন","nature","garden","mist","jungle"),
 ("lilac-blooms.jpg","lilac-blooms","Lilac Blooms","বেগুনি ফুল","bloom","garden","petals","blossom"),
 ("night-prayer-glass.jpg","night-prayer-glass","Night Prayer Glass","রাতের রঙিন কাচ","sacred","night","sparkle","lantern"),
 ("brick-gothic-nave.jpg","brick-gothic-nave","Brick Gothic Nave","ইটের গথিক গির্জা","sacred","library","clear","wizarding"),
 ("stone-hall-chandelier.jpg","stone-hall-chandelier","Stone Hall","পাথরের হল","magic","library","sparkle","wizarding"),
 ("bright-grid-window.jpg","bright-grid-window","Bright Grid Window","উজ্জ্বল জানালা","window","studio","clear","starter"),
 ("sunlit-book-shelf.jpg","sunlit-book-shelf","Sunlit Shelf","রোদে ভরা তাক","cozy","day","clear","starter"),
 ("chapel-green-drapes.jpg","chapel-green-drapes","Chapel Drapes","গির্জার পর্দা","sacred","dusk","sparkle","wizarding"),
 ("mosque-courtyard-dusk.jpg","mosque-courtyard-dusk","Mosque Courtyard","মসজিদের উঠোন","sacred","dusk","clear","lantern"),
 ("grand-mosque-gold.jpg","grand-mosque-gold","Grand Mosque","বড় মসজিদ","sacred","lantern","sparkle","lantern"),
 ("conservatory-pines.jpg","conservatory-pines","Conservatory Pines","কাচঘরের পাইন","window","day","breeze","starter"),
 ("blue-hydrangea.jpg","blue-hydrangea","Blue Hydrangea","নীল হাইড্রেঞ্জা","bloom","garden","petals","blossom"),
 ("vaulted-water-tunnel.jpg","vaulted-water-tunnel","Vaulted Water Tunnel","জলের সুড়ঙ্গ","sacred","dusk","mist","lantern"),
 ("emerald-door.jpg","emerald-door","Emerald Door","পান্না দরজা","palace","night","sparkle","lantern"),
 ("harbour-gothic-window.jpg","harbour-gothic-window","Harbour Window","বন্দরের জানালা","window","day","breeze","starter"),
 ("pink-daisies.jpg","pink-daisies","Pink Daisies","গোলাপি ডেইজি","bloom","garden","petals","blossom"),
 ("blue-shutters.jpg","blue-shutters","Blue Shutters","নীল শাটার","window","beach","breeze","starter"),
 ("rose-window-glass.jpg","rose-window-glass","Rose Window","গোলাপ জানালা","sacred","day","clear","lantern"),
 ("crimson-carpet-hall.jpg","crimson-carpet-hall","Crimson Carpet Hall","লাল গালিচার হল","sacred","lantern","lanterns","lantern"),
 ("teal-iwan.jpg","teal-iwan","Teal Iwan","ফিরোজা ইওয়ান","sacred","dusk","sparkle","lantern"),
 ("spanish-synagogue.jpg","spanish-synagogue","Spanish Synagogue","স্প্যানিশ সিনাগগ","magic","library","sparkle","wizarding"),
 ("white-prayer-hall.jpg","white-prayer-hall","White Prayer Hall","সাদা প্রার্থনাকক্ষ","sacred","studio","clear","lantern"),
 ("bathhouse-pool.jpg","bathhouse-pool","Bathhouse Pool","হাম্মামের চৌবাচ্চা","sacred","lantern","sparkle","lantern"),
 ("carved-mihrab.jpg","carved-mihrab","Carved Mihrab","খোদাই মিহরাব","sacred","night","sparkle","lantern"),
 ("rose-stone-court.jpg","rose-stone-court","Rose Stone Court","গোলাপি পাথরের উঠোন","places","dusk","clear","lantern"),
 ("white-stucco-room.jpg","white-stucco-room","White Stucco Room","সাদা পলেস্তারার ঘর","sacred","studio","clear","lantern"),
 ("bosphorus-porthole.jpg","bosphorus-porthole","Bosphorus Porthole","বসফরাসের গোল জানালা","window","beach","breeze","urban"),
 ("domed-white-mosque.jpg","domed-white-mosque","Domed White Mosque","সাদা গম্বুজ মসজিদ","sacred","day","clear","lantern"),
 ("azure-vault.jpg","azure-vault","Azure Vault","আকাশি ছাদ","sacred","night","sparkle","wizarding"),
 ("stone-rotunda.jpg","stone-rotunda","Stone Rotunda","পাথরের গোলঘর","sacred","dusk","sparkle","wizarding"),
 ("empty-ballroom.jpg","empty-ballroom","Empty Ballroom","খালি নাচঘর","cozy","dusk","clear","starter"),
 ("mint-mirror-room.jpg","mint-mirror-room","Mint Mirror Room","পুদিনা আয়নাঘর","palace","lantern","sparkle","lantern"),
 ("mosaic-starburst.jpg","mosaic-starburst","Mosaic Starburst","মোজাইক তারা","sacred","lantern","sparkle","lantern"),
 ("stucco-facade.jpg","stucco-facade","Stucco Facade","পলেস্তারার সম্মুখ","sacred","day","clear","lantern"),
 ("mountain-lake-window.jpg","mountain-lake-window","Mountain Lake Window","পাহাড়ি হ্রদের জানালা","window","mountain","breeze","alpine"),
 ("pale-stone-arch.jpg","pale-stone-arch","Pale Stone Arch","ফ্যাকাশে পাথরের খিলান","sacred","studio","clear","lantern"),
 ("timber-ceiling-lamp.jpg","timber-ceiling-lamp","Timber Ceiling","কাঠের ছাদ","sacred","lantern","lanterns","lantern"),
 ("carpet-library-hall.jpg","carpet-library-hall","Carpet Library","গালিচার পাঠাগার","cozy","library","clear","lantern"),
 ("open-book-pages.jpg","open-book-pages","Open Pages","খোলা পাতা","cozy","library","clear","starter"),
 ("autumn-lake-mirror.jpg","autumn-lake-mirror","Autumn Lake","শরতের হ্রদ","nature","dusk","leaves","village"),
 ("courtyard-green-window.jpg","courtyard-green-window","Courtyard Green","উঠোনের সবুজ","window","garden","breeze","jungle"),
 ("purple-orchid.jpg","purple-orchid","Purple Orchid","বেগুনি অর্কিড","bloom","night","glow","blossom"),
 ("lattice-silhouette.jpg","lattice-silhouette","Lattice Silhouette","জালির ছায়া","places","night","clear","urban"),
 ("chandelier-durbar.jpg","chandelier-durbar","Chandelier Durbar","ঝাড়বাতির দরবার","palace","lantern","sparkle","lantern"),
 ("rainbow-arch-doors.jpg","rainbow-arch-doors","Rainbow Arch Doors","রঙধনু খিলান","palace","day","clear","lantern"),
 ("sky-through-arch.jpg","sky-through-arch","Sky Through the Arch","খিলানে আকাশ","places","day","clear","lantern"),
 ("colonial-fan-hall.jpg","colonial-fan-hall","Colonial Hall","ঔপনিবেশিক হল","places","studio","clear","urban"),
 ("kyoto-dusk-pagoda.jpg","kyoto-dusk-pagoda","Kyoto Dusk","কিয়োটোর গোধূলি","places","dusk","petals","blossom"),
 ("tiled-ottoman-room.jpg","tiled-ottoman-room","Tiled Ottoman Room","টাইলের উসমানি ঘর","cozy","library","clear","lantern"),
 ("forest-torii.jpg","forest-torii","Forest Torii","বনের তোরি","places","garden","mist","jungle"),
 ("saffron-courtyard.jpg","saffron-courtyard","Saffron Courtyard","জাফরানি উঠোন","palace","day","clear","lantern"),
 ("striped-moorish-stair.jpg","striped-moorish-stair","Striped Stairwell","ডোরাকাটা সিঁড়ি","palace","day","clear","lantern"),
 ("fanlight-window.jpg","fanlight-window","Fanlight Window","পাখা-জানালা","window","day","clear","starter"),
 ("riad-corridor.jpg","riad-corridor","Riad Corridor","রিয়াদের বারান্দা","cozy","day","clear","lantern"),
 ("dusk-fog-window.jpg","dusk-fog-window","Dusk Fog Window","কুয়াশার গোধূলি","window","dusk","mist","starter"),
 ("jade-carved-door.jpg","jade-carved-door","Jade Carved Door","জেড খোদাই দরজা","palace","lantern","sparkle","lantern"),
 ("carpet-glass-room.jpg","carpet-glass-room","Carpet and Glass","গালিচা ও কাচ","cozy","night","sparkle","lantern"),
 ("golden-sea-door.jpg","golden-sea-door","Golden Sea Door","সোনালি সাগরের দরজা","window","beach","breeze","starter"),
 ("turquoise-courtyard.jpg","turquoise-courtyard","Turquoise Courtyard","ফিরোজা উঠোন","sacred","day","clear","lantern"),
 ("fjord-cabin-window.jpg","fjord-cabin-window","Fjord Cabin Window","ফিয়র্ডের জানালা","window","valley","mist","caucasus"),
 ("peacock-hall.jpg","peacock-hall","Peacock Hall","ময়ূর হল","palace","lantern","sparkle","lantern"),
 ("marble-mosque-walk.jpg","marble-mosque-walk","Marble Walk","মার্বেলের পথ","sacred","day","clear","lantern"),
 ("snow-treeline.jpg","snow-treeline","Snow Treeline","বরফের গাছসারি","nature","mountain","snow","alpine"),
 ("ring-chandelier-hall.jpg","ring-chandelier-hall","Ring Chandelier","বলয় ঝাড়বাতি","sacred","lantern","lanterns","lantern"),
 ("green-window-mosque.jpg","green-window-mosque","Green Window Mosque","সবুজ জানালার মসজিদ","sacred","day","clear","lantern"),
 ("fountain-courtyard.jpg","fountain-courtyard","Fountain Courtyard","ঝর্ণার উঠোন","places","day","clear","lantern"),
 ("painted-romanesque.jpg","painted-romanesque","Painted Basilica","চিত্রিত ব্যাসিলিকা","sacred","library","sparkle","wizarding"),
 ("sunset-bedroom-sea.jpg","sunset-bedroom-sea","Sunset Bedroom","সূর্যাস্তের শোবার ঘর","cozy","beach","breeze","starter"),
 ("golden-mirror-hall.jpg","golden-mirror-hall","Golden Mirror Hall","সোনালি আয়না হল","sacred","lantern","sparkle","lantern"),
 ("mosaic-door-night.jpg","mosaic-door-night","Mosaic Door","মোজাইক দরজা","palace","night","sparkle","lantern"),
 ("three-arch-lookout.jpg","three-arch-lookout","Three Arch Lookout","তিন খিলানের দৃশ্য","window","night","mist","alpine"),
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
