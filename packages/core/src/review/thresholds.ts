export const REVIEW_THRESHOLDS = {
  sendGroupGapSec: 15,
  sampleMaxGapSec: 5,
  windowMaxGapSec: 10, // also covers the recorder's cadence after an hour
  landWindowSec: 60,
  lossTolerancePct: 1,
  blunderReserve: 0.25,
  // Linear: sending twice the troop share assigns twice the observed land loss.
  lossBlameExponent: 1,
  // A blamed loss of one quarter of land exhausts this push accuracy credit.
  blunderLossPct: 25,
  greatEfficiency: 0.75,
  greatMinComparables: 3,
  waveGroupGapSec: 15,
  postLeadSec: 60,
  postLateSec: 30,
  allyRequestSec: 20,
  allyBetrayalSec: 120,
  openingSec: 300,
  openingStartTick: 300,  // the opening is judged only when the recording starts by this tick
  accuracyMinRated: 3,
  openingBonus: 5,
  defenseOnTime: 2,
  defenseMissed: 3,
  defenseCap: 10,
} as const;
