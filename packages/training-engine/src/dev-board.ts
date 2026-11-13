// Developer harness: the synthetic Onion game as a Training source, so Training can be exercised
// without a recorded match. Never shown in production builds.
import synthetic from "./fixtures/synthetic-record.json";
import { SYNTH } from "./fixtures/ids";

export const devBoard = async () => ({ record: synthetic as unknown, ownClientId: SYNTH.me, startTick: 300 });
