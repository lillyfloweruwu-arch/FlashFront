export interface CommunityAdvice {
  map: string;
  tips: string[];
  source: { name: string; url: string; date: string };
}
// Short paraphrases of the supplied community_spawn_guides.md, researched 2026-10-16.
// Unofficial guide observations, not measured win rates or live lobby assessments.
const guide = (map: string, slug: string, date: string, tips: string[]): CommunityAdvice => ({
  map, tips, source: { name: "OpenFront Intel (unofficial)", url: `https://openfront.fyi/guides/${slug}/`, date },
});
export const COMMUNITY: Record<string, CommunityAdvice> = Object.fromEntries([
  guide("World", "world-map-ffa-spawns", "2026-09-19", ["Prefer a compact pocket with a second land exit.", "Remote islands offer fewer fronts, but expansion depends on a port."]),
  guide("Europe", "europe-ffa-openings", "2026-09-17", ["The western mainland can offer a simpler first front.", "Central river openings offer access but attract contention; check crossings yourself."]),
  guide("Black Sea", "black-sea-ffa-openings", "2026-09-29", ["Keep an inland exit in the northwest; the western gate can become a trap.", "The northeast shore offers earlier water access than the southeast interior."]),
  guide("Four Islands", "four-islands-ffa-openings", "2026-09-30", ["Compare crowding when choosing an island.", "Look for an inland core and a usable coast; longer shores also expose more landing sites."]),
  guide("Strait of Gibraltar", "strait-of-gibraltar-openings", "2026-09-29", ["Southern Iberia has room, but the Gibraltar tip offers little nearby land.", "Ceuta or Tangier offer alternatives; western pockets depend on securing their gate."]),
  guide("Yangtze River", "yangtze-river-ffa-openings", "2026-09-29", ["Changzhou offers water access with several converging fronts; Wuhu has fewer exposed borders.", "Daishan trades early shelter for slower, boat-dependent growth; delta shores can be crowded."]),
  guide("Cape Cod", "cape-cod", "2026-10-10", ["Mainland west of the canal offers depth; Falmouth and Sandwich are more contested.", "Provincetown has little interior. Nantucket has room, while smaller islands suit forward positions."]),
  guide("Svalmel", "map-strategy", "2026-08-22", ["The major land groups differ in size; do not assume symmetric openings."]),
  guide("Dyslexdria", "map-strategy", "2026-08-22", ["Fragmented land makes water travel important for reinforcing another region."]),
  { map: "Europe Classic", tips: ["On Impossible difficulty, securing a defensible corner can limit opponents' expansion."], source: { name: "community guide", url: "https://youtubesummary.com/summary/_pMLT4sUzIQ", date: "Unknown; research checked 2026-10-16" } },
].map(entry => [entry.map, entry]));
