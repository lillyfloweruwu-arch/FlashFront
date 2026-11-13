import { Howl, Howler } from "howler";
// Muting alone still downloads audio. Block loading before importing any game components.
Howl.prototype.load = function () { return this; };
Howl.prototype.play = function () { return 0; };
Howler.mute(true);
