# FlashFront release notes format

Adopted 2026-10-19. Every release ships the same three layers, written from one source.

Sources this format draws on (2026-10-19 research): Keep a Changelog (newest first, dated,
consistent change types), Linear (benefit-first headline + 2-3 sentences + Feature / Improvement /
Fix labels), Figma (show the change, don't only describe it), Discord (a real voice), League of
Legends wiki patch style (group changes the way players scan them), and in-app "what's new"
guidance (1-3 highlights, shown at a natural pause, always re-openable).

## Release rhythm

- **0.x.0 feature drop** about every 3-4 weeks, in step with OpenFront's ~5-week releases.
- **0.x.y fix release** only when something is broken (often after an OpenFront update).
- Every release auto-updates from 0.2.0 on, so notes must make sense to someone who skipped one.

## Voice

- Lead with what the player gets, not what we built ("Your heat map follows the camera smoothly",
  not "Added CAMERA_EXPRESSION fast lane").
- Game words, not code words: troops, gold, spawn, push. Never internal names or file paths.
- Concrete numbers when they matter ("panning now updates 60 times a second, was 8").
- State, never commands (PRODUCT.md copy rule): no "always", "must", "you should".
- One short sentence of personality is fine; jokes never replace the facts.
- Credits: community ideas end with " - name" on that line (first used in 0.2.0).

## Layer 1: GitHub release (the full notes)

```markdown
**<One-line headline: the biggest player benefit>.** <1-2 sentences: who this release is for and
what changes for them.>

**Updating:** <only if special; otherwise "FlashFront updates itself: click Restart to update.">

## Highlights
### <Highlight 1 name>
<2-3 sentences: what it does and why it matters in a match.> 
![<alt text>](<screenshot or short GIF>)

### <Highlight 2 name>
...  (1-3 highlights total)

## New
- **<Feature>:** <one line, player benefit>.
## Improved
- **<Area>:** <one line>.
## Fixed
- <What was wrong, from the player's view>, now <what happens>.
## Known issues
- <Anything still wrong, with a workaround if there is one>. (Omit the section if none.)

---
**Fair play:** read-only, no automation, only your own numbers (plus spawn positions during the
spawn phase), hidden in ranked and replays. Nothing uploaded unless you send feedback.
**Works with:** OpenFront v<x.y.z> on Steam, Windows 10/11.
**First install:** Windows may say "Windows protected your PC": More info, then Run anyway.
```

Rules:
- Sections appear in this order; leave out empty ones (no "Removed: none").
- New / Improved / Fixed map to Keep a Changelog's Added / Changed / Fixed; "Removed" and
  "Security" are added only when they apply.
- Each bullet is one line, starts with a capital, ends with a period.
- Highlights get a visual (screenshot or a short GIF of the change in a real match).
- Fixes describe the symptom players saw ("decision cards never appeared after connecting
  mid-match"), not the code change.

## Layer 2: In-app "What's new" (launcher)

- Shown once, the first time the launcher opens after an update, never over the game.
- The 1-3 highlights only: name, one sentence, optional image; then "Full notes" (opens the GitHub
  release) and "Got it".
- Re-openable any time from Settings ("What's new in <version>").
- The "Restart to update" prompt shows the headline line only.

## Layer 3: Short post (Discord / Community Projects)

```
FlashFront <version>: <headline>
- <highlight 1, one line>
- <highlight 2, one line>
- <highlight 3, one line>
Full notes + download: <release link>
```

## Checklist before publishing

- [ ] Headline is a player benefit, not a feature name.
- [ ] Highlights have visuals from a real match.
- [ ] Every bullet uses game words and states, no commands.
- [ ] Known issues listed honestly.
- [ ] Credits on community ideas.
- [ ] Compatible OpenFront version checked live.
- [ ] Short post and in-app highlights match the GitHub release.
