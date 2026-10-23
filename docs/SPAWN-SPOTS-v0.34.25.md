# Spawn spots · OpenFront v0.34.25

Generated 2026-10-17T00:43:09.978Z. 123 maps. JSON: 81277 bytes.

Map data © OpenFront contributors, CC BY-SA 4.0

[Source maps](https://github.com/openfrontio/OpenFrontIO/tree/v0.34.25/resources/maps) · [License](https://creativecommons.org/licenses/by-sa/4.0/)

Coordinates are Normal full tiles, sampled at four-tile resolution. Compact coordinates
are halved and approximate. Public cached terrain and nation anchors are the only scoring
inputs. Team areas are flagged, not enforced. No live crowding or game interaction.

Weights from the 145-game calibration: 0.60 reach120 + 0.05 reach60 + 0.10 defense
+ 0.05 coast - 0.10 nationNear - 0.10 smallIsland. V4b uses percentile-ranked terms
among valid tiles. The Python report used max-scaled reach and raw other terms, so
its measured correlations do not validate this percentile variant (see README Decisions).
Terrain explains a small part of results; player skill and selection can confound the fit.

Each map has up to three passable picks, spaced at least min(250, 0.25 × shorter
full-map side) tiles apart. Limited eligible land can leave fewer picks. World has no pick below 90% of its height. Score percentiles
use all valid tiles before spacing suppression. Up to three reasons and one independent
warning accompany each pick; island, nation and edge warnings take salience priority
in that order. Community tips cover seven named-area guides and three partial guides;
their dates and sources are embedded in spots.json. Minimap PNGs are regenerated from cache.

| Map | Picks | Top reason |
| --- | --- | --- |
| Achiran | (1352, 388); (724, 392); (1104, 356) | Biggest cheap-land pocket nearby (top 1% of map) |
| Aegean | (1528, 580); (164, 528); (1528, 328) | Biggest cheap-land pocket nearby (top 1% of map) |
| Africa | (168, 496); (1232, 392); (764, 248) | Biggest cheap-land pocket nearby (top 1% of map) |
| Alps | (1084, 1648); (1692, 1228); (1380, 1240) | Biggest cheap-land pocket nearby (top 9% of map) |
| Amazon River | (160, 104); (116, 160); (228, 92) | Biggest cheap-land pocket nearby (top 1% of map) |
| Antarctica | (880, 1268); (1612, 1640); (1696, 760) | Biggest cheap-land pocket nearby (top 1% of map) |
| Archipelago Sea | (168, 704) | Biggest cheap-land pocket nearby (top 2% of map) |
| Arctic | (1468, 908); (1644, 1372); (1196, 1708) | Biggest cheap-land pocket nearby (top 3% of map) |
| Asia | (408, 432); (732, 328); (96, 408) | Biggest cheap-land pocket nearby (top 4% of map) |
| Australia | (1244, 884); (1432, 1052); (1240, 632) | Biggest cheap-land pocket nearby (top 10% of map) |
| Baikal | (196, 296); (1736, 1280); (2280, 972) | Biggest cheap-land pocket nearby (top 3% of map) |
| Baikal (Nuke Wars) | (340, 328); (1736, 1280); (2120, 1040) | Biggest cheap-land pocket nearby (top 1% of map) |
| Baja California | (1036, 1112); (584, 212); (1432, 828) | Biggest cheap-land pocket nearby (top 1% of map) |
| Balkans | (1716, 272); (796, 252); (1476, 616) | Biggest cheap-land pocket nearby (top 4% of map) |
| Balkhash | (1168, 512); (760, 856); (1008, 732) | Biggest cheap-land pocket nearby (top 1% of map) |
| Baltics | (824, 348); (496, 1180); (512, 808) | Biggest cheap-land pocket nearby (top 1% of map) |
| Bering Sea | (340, 544); (128, 276); (1648, 316) | Biggest cheap-land pocket nearby (top 2% of map) |
| Bering Strait | (1316, 368); (128, 364); (1072, 416) | Biggest cheap-land pocket nearby (top 2% of map) |
| Between Two Seas | (1108, 440); (156, 120); (1652, 152) | Biggest cheap-land pocket nearby (top 2% of map) |
| Black Sea | (1172, 116); (1380, 404); (492, 116) | Biggest cheap-land pocket nearby (top 4% of map) |
| Bosphorus Straits | (248, 216); (108, 152); (660, 248) | Biggest cheap-land pocket nearby (top 3% of map) |
| Branching Paths | (1468, 1748); (848, 1468); (1400, 1084) | Biggest cheap-land pocket nearby (top 1% of map) |
| Britannia | (304, 1300); (1304, 1696); (1076, 1396) | Biggest cheap-land pocket nearby (top 1% of map) |
| Britannia (Classic) | (1428, 964); (448, 920); (1256, 776) | Biggest cheap-land pocket nearby (top 1% of map) |
| Cape Cod | (108, 236); (140, 532); (344, 384) | Biggest cheap-land pocket nearby (top 2% of map) |
| Caribbean | (496, 1732); (1804, 980); (504, 152) | Biggest cheap-land pocket nearby (top 3% of map) |
| Caspian Sea | (180, 1316); (876, 460); (856, 712) | Plenty of cheap land within 120 tiles |
| Caucasus | (572, 172); (820, 120); (792, 380) | Biggest cheap-land pocket nearby (top 6% of map) |
| Central America | (448, 384); (1176, 844); (2380, 1376) | Biggest cheap-land pocket nearby (top 3% of map) |
| Channel Islands | (4404, 116); (2076, 204); (3352, 120) | Biggest cheap-land pocket nearby (top 1% of map) |
| China | (1692, 1560); (1708, 448); (1652, 1184) | Biggest cheap-land pocket nearby (top 2% of map) |
| Chopping Block | (948, 948); (988, 640); (624, 976) | Biggest cheap-land pocket nearby (top 2% of map) |
| Clearwater Lakes | (956, 192); (708, 1220); (1760, 1168) | Biggest cheap-land pocket nearby (top 2% of map) |
| Conakry | (1916, 208); (1572, 184); (548, 324) | Biggest cheap-land pocket nearby (top 1% of map) |
| Crimea | (724, 572); (500, 460); (960, 484) | Biggest cheap-land pocket nearby (top 6% of map) |
| Danish Straits | (640, 364); (224, 688); (748, 604) | Biggest cheap-land pocket nearby (top 1% of map) |
| Deglaciated Antarctica | (1276, 196); (1476, 408); (1636, 924) | Biggest cheap-land pocket nearby (top 1% of map) |
| Didier | (288, 548); (1276, 576); (436, 752) | Plenty of cheap land within 120 tiles |
| Didier (France) | (968, 700); (712, 596); (1180, 236) | Biggest cheap-land pocket nearby (top 6% of map) |
| Dyslexdria | (1812, 328); (1176, 600); (688, 916) | Biggest cheap-land pocket nearby (top 2% of map) |
| East Asia | (220, 460); (612, 376); (344, 120) | Biggest cheap-land pocket nearby (top 3% of map) |
| Europe | (2104, 696); (2784, 732); (2540, 664) | Biggest cheap-land pocket nearby (top 1% of map) |
| Europe (Classic) | (1836, 284); (1452, 440); (1848, 540) | Biggest cheap-land pocket nearby (top 1% of map) |
| Falkland Islands | (1644, 664); (796, 768); (1496, 456) | Biggest cheap-land pocket nearby (top 2% of map) |
| Faroe Islands | (620, 376); (556, 620); (800, 552) | Biggest cheap-land pocket nearby (top 2% of map) |
| Finger Lakes | (512, 324); (208, 200); (996, 312) | Biggest cheap-land pocket nearby (top 1% of map) |
| Four Islands | (1284, 224); (264, 280); (1196, 1320) | Biggest cheap-land pocket nearby (top 1% of map) |
| France | (768, 1176); (516, 876); (784, 880) | Biggest cheap-land pocket nearby (top 1% of map) |
| Gateway to the Atlantic | (1716, 272); (1480, 444); (580, 1280) | Biggest cheap-land pocket nearby (top 1% of map) |
| Germany | (784, 712); (504, 792); (1092, 404) | Biggest cheap-land pocket nearby (top 5% of map) |
| Giant World Map | (1984, 724); (2600, 332); (2204, 844) | Biggest cheap-land pocket nearby (top 1% of map) |
| Great Lakes | (964, 1184); (280, 1148); (852, 912) | Biggest cheap-land pocket nearby (top 2% of map) |
| Gulf Of Guinea | (1468, 188); (2184, 2080); (1752, 264) | Biggest cheap-land pocket nearby (top 4% of map) |
| Gulf Of Mexico | (1208, 1504); (136, 756); (1080, 1768) | Biggest cheap-land pocket nearby (top 1% of map) |
| Gulf of St. Lawrence | (524, 184); (168, 848); (1308, 600) | Biggest cheap-land pocket nearby (top 3% of map) |
| Halkidiki | (212, 252); (472, 748); (1364, 120) | Biggest cheap-land pocket nearby (top 7% of map) |
| Hawaii | (2812, 1624); (2624, 1792); (2660, 1392) | Biggest cheap-land pocket nearby (top 4% of map) |
| Hecate Strait | (2132, 1224); (1804, 460); (1848, 204) | Biggest cheap-land pocket nearby (top 5% of map) |
| Hong Kong | (1044, 488); (700, 492); (1244, 160) | Biggest cheap-land pocket nearby (top 3% of map) |
| Iceland | (844, 1100); (624, 764); (1284, 480) | Biggest cheap-land pocket nearby (top 2% of map) |
| Indian Subcontinent | (692, 708); (924, 948); (1308, 808) | Biggest cheap-land pocket nearby (top 4% of map) |
| Irish Sea | (216, 588); (1252, 368); (988, 152) | Biggest cheap-land pocket nearby (top 1% of map) |
| Italia | (1204, 180); (584, 384); (960, 116) | Biggest cheap-land pocket nearby (top 1% of map) |
| Japan | (1544, 1100); (1684, 752); (1836, 312) | Biggest cheap-land pocket nearby (top 1% of map) |
| Juan De Fuca Strait | (2864, 852); (2732, 408); (940, 876) | Biggest cheap-land pocket nearby (top 2% of map) |
| Korea | (344, 1024); (556, 1656); (544, 1264) | Biggest cheap-land pocket nearby (top 1% of map) |
| Labyrinth | (792, 760); (448, 596); (708, 456) | Biggest cheap-land pocket nearby (top 1% of map) |
| Las Vegas Strip | (844, 1860); (1064, 2116); (880, 2436) | Biggest cheap-land pocket nearby (top 6% of map) |
| Lemnos | (868, 528); (1204, 576); (1420, 336) | Biggest cheap-land pocket nearby (top 1% of map) |
| Levant | (1552, 1744); (964, 1728); (592, 1712) | Biggest cheap-land pocket nearby (top 5% of map) |
| Lisbon | (1384, 940); (1296, 432); (1420, 172) | Biggest cheap-land pocket nearby (top 3% of map) |
| Los Angeles | (1152, 908); (1504, 1120); (896, 836) | Biggest cheap-land pocket nearby (top 1% of map) |
| Luna | (308, 844); (732, 616); (1020, 2832) | Biggest cheap-land pocket nearby (top 1% of map) |
| Manicouagan | (532, 992); (960, 1012); (828, 452) | Biggest cheap-land pocket nearby (top 3% of map) |
| Mare Nostrum | (1960, 192); (596, 388); (1856, 440) | Biggest cheap-land pocket nearby (top 1% of map) |
| Mars | (960, 780); (1196, 420); (1780, 760) | Biggest cheap-land pocket nearby (top 2% of map) |
| MENA | (1144, 520); (896, 484); (1872, 668) | Biggest cheap-land pocket nearby (top 2% of map) |
| Middle East | (1860, 140); (1300, 644); (1056, 544) | Biggest cheap-land pocket nearby (top 1% of map) |
| Milky Way | (912, 848); (732, 1044); (1244, 620) | Biggest cheap-land pocket nearby (top 1% of map) |
| Mississippi River | (180, 2048); (296, 1164); (144, 1936) | Biggest cheap-land pocket nearby (top 1% of map) |
| Montreal | (1124, 116); (860, 408); (696, 112) | Biggest cheap-land pocket nearby (top 4% of map) |
| More Than Luck | (156, 648); (1108, 1004); (600, 164) | Biggest cheap-land pocket nearby (top 6% of map) |
| New York City | (704, 1068); (1332, 844); (368, 172) | Biggest cheap-land pocket nearby (top 1% of map) |
| Nile Delta | (216, 616); (1200, 596); (572, 776) | Biggest cheap-land pocket nearby (top 1% of map) |
| North America | (700, 372); (1032, 648); (1212, 996) | Biggest cheap-land pocket nearby (top 2% of map) |
| Northwest Passage | (952, 1460); (160, 1532); (140, 1136) | Biggest cheap-land pocket nearby (top 1% of map) |
| Oceania | (520, 600); (144, 56); (724, 748) | Biggest cheap-land pocket nearby (top 4% of map) |
| Onion | (96, 112); (416, 116); (88, 240) | Biggest cheap-land pocket nearby (top 1% of map) |
| Pangaea | (320, 640); (588, 828); (256, 392) | Biggest cheap-land pocket nearby (top 2% of map) |
| Passage | (5452, 172); (3292, 220); (3728, 188) | Biggest cheap-land pocket nearby (top 1% of map) |
| Pluto | (1820, 428); (156, 336); (196, 1012) | Biggest cheap-land pocket nearby (top 6% of map) |
| Qing China | (1692, 1560); (1660, 608); (1900, 536) | Biggest cheap-land pocket nearby (top 2% of map) |
| Russia | (1404, 976); (992, 752); (1204, 1164) | Biggest cheap-land pocket nearby (top 1% of map) |
| San Francisco | (1356, 200); (1732, 520); (728, 204) | Biggest cheap-land pocket nearby (top 4% of map) |
| Scandinavia | (1184, 312); (940, 900); (820, 1176) | Biggest cheap-land pocket nearby (top 6% of map) |
| Sierpinski | (588, 588); (808, 708); (588, 840) | Plenty of cheap land within 120 tiles |
| Sol | (3300, 1744); (900, 2012); (3772, 616) | Plenty of cheap land within 120 tiles |
| South America | (788, 904); (980, 1452); (904, 1712) | Biggest cheap-land pocket nearby (top 1% of map) |
| Southeast Asia | (400, 360); (1056, 1088); (632, 480) | Biggest cheap-land pocket nearby (top 3% of map) |
| Strait of Gibraltar | (1440, 1108); (1360, 316); (1144, 136) | Biggest cheap-land pocket nearby (top 3% of map) |
| Strait of Hormuz | (984, 924); (1564, 552); (788, 1080) | Biggest cheap-land pocket nearby (top 4% of map) |
| Strait Of Malacca | (1084, 1056); (1084, 492); (1396, 1456) | Biggest cheap-land pocket nearby (top 4% of map) |
| Surrounded | (700, 1692); (208, 1152); (1056, 216) | Biggest cheap-land pocket nearby (top 1% of map) |
| Svalmel | (1204, 1012); (892, 312); (516, 572) | Biggest cheap-land pocket nearby (top 2% of map) |
| Taiwan Strait | (172, 608); (1104, 728); (360, 392) | Biggest cheap-land pocket nearby (top 3% of map) |
| The Box | (120, 120); (372, 120); (624, 120) | On the main landmass |
| Tierra Del Fuego | (1128, 144); (1032, 556); (1240, 968) | Biggest cheap-land pocket nearby (top 2% of map) |
| Titan | (324, 176); (1056, 984); (432, 404) | Biggest cheap-land pocket nearby (top 1% of map) |
| Tourney 2 Teams | (360, 508); (564, 328); (332, 940) | Biggest cheap-land pocket nearby (top 1% of map) |
| Tourney 3 Teams | (560, 308); (936, 308); (280, 672) | Biggest cheap-land pocket nearby (top 1% of map) |
| Tourney 4 Teams | (384, 1056); (1040, 1128); (384, 440) | Plenty of cheap land within 120 tiles |
| Tourney 8 Teams | (896, 1220); (896, 264); (1224, 600) | Biggest cheap-land pocket nearby (top 4% of map) |
| Traders Dream | (1256, 1544); (944, 1608); (960, 336) | Biggest cheap-land pocket nearby (top 1% of map) |
| Two Lakes | (1864, 280); (852, 288); (244, 696) | Biggest cheap-land pocket nearby (top 2% of map) |
| United States | (1408, 1176); (1536, 932); (1804, 996) | Biggest cheap-land pocket nearby (top 1% of map) |
| Venice | (1900, 1392); (1328, 112); (524, 736) | Biggest cheap-land pocket nearby (top 1% of map) |
| Vietnam | (876, 312); (1476, 2884); (1524, 2244) | Biggest cheap-land pocket nearby (top 4% of map) |
| Warship Warship | (1856, 972); (1124, 400); (456, 1068) | Biggest cheap-land pocket nearby (top 1% of map) |
| World | (1356, 212); (348, 240); (1604, 176) | Biggest cheap-land pocket nearby (top 1% of map) |
| World Inverted | (1764, 616); (1980, 996); (1708, 896) | Biggest cheap-land pocket nearby (top 1% of map) |
| Yangtze River | (1252, 1092); (1000, 1096); (896, 1328) | Biggest cheap-land pocket nearby (top 3% of map) |
| Yellow Sea | (276, 352); (340, 964); (920, 120) | Biggest cheap-land pocket nearby (top 4% of map) |
| Yenisei | (156, 1204); (484, 488); (400, 1344) | Biggest cheap-land pocket nearby (top 1% of map) |
