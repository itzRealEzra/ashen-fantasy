# Changelog

All notable changes to Ashen Fantasy are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
versioning follows [Semantic Versioning](https://semver.org/).

Policy: every code update must add an entry here and bump the version
(`server.py` `server_version`, `CLIENT_VERSION` in `public/js/app.js`,
footer in `public/index.html`), then commit
and push to `main` on https://github.com/itzRealEzra/ashen-fantasy.

## [Unreleased]

## [0.8.4] - 2026-10-18
### Added
- UI icon art from `public/assets/icons`, all 20 files wired up:
  - **Sidebar tabs** — Character, Cultivate, Battle, Inventory and Mail each
    draw a 22px icon beside their label, brightening on hover and when the
    tab is active.
  - **Equipment doll** — all 13 equip slots have an art file: helmet, body
    armor, arm armor, leg armor, foot armor, cloak/cape, main weapon,
    secondary weapon, spirit core, spirit ring (both fingers), jade pendant,
    immortal crown, and the elixir slots. The icon shows only while a slot is
    **empty**; a filled slot keeps showing the equipped item, so the two never
    compete.
  - **Qi Pill and Spirit Meal** now draw from `assets/icons/` instead of
    having no art at all.
- `GET /api/icons` returns the icon map, resolved per request like item and
  enemy art, so a new PNG appears on refresh without restarting the server.
  A tab or slot whose file is missing simply renders no image and keeps its
  text label — icons can be added one file at a time without breaking layout.

### Changed
- `icons` joined `enemies` and `items` as a scanned asset directory, and
  `_ITEM_ICON_FILES` declares the handful of items whose art lives there.
  An item's picture still resolves from `assets/items/<id>.png` by default.
- Sidebar buttons became flex rows with a left-aligned icon, and their
  vertical padding dropped from 22px to 15px. A 20px icon inside 22px of
  padding made every tab ~63px tall, and the new Mail tab pushed the sidebar
  past the fold on shorter screens.

### Note
- These icons are 1254x1254 PNGs totalling **10.2 MB**, matching the scale of
  the existing enemy and item art, but they render at 22px (tabs) and 34px
  (slots). Opening the Inventory panel pulls roughly 8 MB of art to fill slots
  a third of that size. They are committed as supplied; rescaling them to
  ~256px would cut the payload by an order of magnitude with no visible
  difference, if you want that as a follow-up.

278 tests passing (133 API + 145 client).

## [0.8.3] - 2026-10-18
### Added
- Mail. The sidebar gains a Mail tab with an unread badge, covering patch
  notes, the newcomer starter pack, and maintenance rewards. Mail is held
  server-side, so a reward can only be reached by claiming it.
  - `GET /api/mail` — the mailbox, plus the unread count.
  - `POST /api/mail/read` — opening a mail marks it read.
  - `POST /api/mail/claim` — grants a mail's items into the bag, exactly once.
  - `POST /api/mail/maintenance` — admin trigger that mails every cultivator
    (or one, with `username`). Send a subject, body, and optional items:
    ```
    POST /api/mail/maintenance
    {"subject": "Downtime apology", "body": "We were down 20 minutes.",
     "items": {"spirit_meal": 3}}
    ```
- Read rules, as specified. Opening a mail marks it read — except when it
  still carries unclaimed items, which stays unread until claimed, so the badge
  keeps pointing at it after the body has been read. Claiming is what settles
  an attachment: read and claimed together. A mail with nothing to claim has
  no reason to stay unread and arrives read.
- Newcomer starter pack, mailed once to every new cultivator and claimable
  from Mail: Wooden Sword, Leather Helmet, Leather Chest, Leather Leggings,
  Leather Bracers, Leather Boots and Leather Cape — one Common piece per
  armour slot. Claimed gear lands in the Bag and is equipped from the doll.
- Patch notes are mailed automatically, once per build: a save whose
  `patch_version` is behind the running server gets one note on its next mail
  check. Cultivators created on the current build never get a retroactive
  note for the build they started on.
- `tools/restore_player.py` — rebuilds `players.json` from a browser
  `localStorage.af_player` value. `python tools/restore_player.py --list` shows
  the current save file.

### Changed
- The build number now lives in a single `SERVER_VERSION` constant in
  `server.py`, built into `server_version` from there, so the mail code can
  compare a player's `patch_version` against the running build without
  needing a request. The version-consistency test reads the constant instead
  of scraping a literal out of the handler.
- Seven Common gear pieces are back in the item database (29 items, was 22).
  They deliberately have no drop source: the starter pack mail is the only
  way to obtain them. This also re-arms the equipment slot check that has
  been inert while the database was empty.

### Fixed
- Version handshake: `SERVER_VERSION` was bumped ahead of the client and
  footer, so the game refused to start with a "Server/client version mismatch"
  alert. All three now move together and are checked by a test.

Notes on scope: mail is unauthenticated like the rest of the API, which is
consistent with a solo game, but it inherits the same cross-site exposure the
0.8.2 origin guard closes — the guard already applies to the new endpoints.
Items claimed from mail go through the same 9,999-per-item inventory cap as
loot.

237 tests passing (123 API + 114 client).

## [0.8.2] - 2026-10-18
### Security
- Cross-site hijack closed. `/api/*` sent `Access-Control-Allow-Origin: *`,
  and since `/api/sync` needs no credential beyond a username, any page the
  player visited could read their save and silently rewrite it. Binding to
  `127.0.0.1` never protected against this: the browser is what makes the
  request. The API now serves same-origin only and refuses any `/api/*` request
  carrying a foreign `Origin`. The `Origin` check is the real defence rather
  than the removed header alone, because a cross-origin `POST` with
  `Content-Type: text/plain` is a "simple request" that skips the preflight
  entirely and would still have been applied. `OPTIONS` now returns 403
  outright. Verified live: a cross-origin read and a `text/plain` cross-origin
  write both return 403 and leave the save untouched, while same-origin and
  non-browser (curl / native) requests still work.
- Realm skip closed. `/api/sync` accepted any `realm_idx` above the stored
  value without checking that the qi had been earned, so a fresh cultivator
  could `POST realm_idx: 10` and land in Qi Refinement Realm X for free. A
  jump is now accepted only when the server's own `legit` qi figure can pay
  every stage on the way, mirroring the client's `advanceRealm` (each stage
  costs its own value, surplus carries forward, the `cap` stage is never left).
  The check runs on `legit` rather than the claimed value on purpose:
  `advanceRealm` already spends the cost before syncing, so the client only
  ever reports the surplus, and gating on that would be circular.

### Fixed
- `ROLLS` and `LAST_ROLL_BY_IP` no longer grow without bound. `prune_roll_state`
  drops expired rolls and roll cooldowns older than an hour, and runs on every
  `/api/roll`. Previously an abandoned roll stayed resident for the life of
  the process, since an entry was only removed when its owner came back to
  spend it.

### Notes
- Inventory is still client-authoritative (capped at 9,999 per item) and
  equipment is still not validated against ownership. Both are deliberate for a
  solo game with no accounts; making loot server-authoritative is the natural
  first step if shared play is ever added, and no part of this change blocks
  that. Equipment is currently inert anyway: `GEAR` is empty and all 22 items
  carry `slot: None`, so no item can satisfy the slot check.
- No regression for honest play. Verified live on one server: 12s of idle
  accrued 70 qi with `clamped=False` and the breakthrough to Qi Refinement
  Realm I was accepted, while an instant `realm_idx: 10` on the same save was
  refused.

170 tests passing (77 API + 93 client), stable over 3 consecutive runs.

## [0.8.1] - 2026-10-16
### Changed
- Scrollbars are hidden across the whole app (all 10 scroll containers: the
  main content pane, root roll list, root detail and index, event log, loot
  log, equipment doll, bag panel, bag grid, and the username screen). Covered
  for all three engines — WebKit/Blink, Firefox, and legacy Edge — while
  scrolling itself still works via wheel, touch, drag, and keyboard
  (Tab / arrows / Page Up-Down / Home-End). The 2px scrollbar-compensating
  padding on the roll list is gone now that no bar is drawn.

## [0.8.0] - 2026-10-16
### Added
- **Item rarity ladder: Common → Uncommon → Rare → Epic → Legendary → Mythic**,
  colored gray / green / blue / purple / gold / crimson. It replaces the old
  Mortal → Primordial names, which now belong to Spiritual Roots only — the two
  ladders share no names, so a root's rarity can never be mistaken for an
  item's.
- Every drop row carries a rarity, and a material's rarity is derived from the
  best rarity any beast drops it under, so loot tables stay the single source
  of truth. Current spread: 8 Common, 8 Uncommon, 5 Rare, 1 Epic
  (Corrupted Beast Core), with Legendary and Mythic reserved for later areas.
- Enemy loot lists now show each drop's rarity, quantity, and chance, colored by
  rarity, and item tooltips show the same for every beast in "Drops from".
- `ITEM_RARITY_BANDS` records the suggested drop-chance window per rarity. It is
  documentation only — 8 drops deliberately sit outside their band (Bloodied
  Tusk is Rare at 65%, Tough Boar Hide Uncommon at 80%), because rarity and
  drop chance are independent by design.
- Art assets are picked up automatically by name. Drop a PNG at
  `public/assets/enemies/<mob_id>.png` or `public/assets/items/<item_id>.png`
  and that mob or item draws it everywhere it appears — enemy card, combat
  view, bag grid, equipment doll, elixir slot, and tooltip. Ids without a
  matching file keep their emoji glyph, so art can be added one file at a
  time. Wired up: all 6 Origin Village enemies and 7 materials (Rat Fur, Raw
  Meat, Broken Claw, Rat Tail, Small Beast Bone, Weak Beast Blood, Beast Core
  Fragment).
- All 20 Origin Village materials now have art (12 new PNGs: Beast Blood,
  Beast Bone, Bloodied Tusk, Boar Fat, Boar Hide, Boar Tusk, Corrupted Beast
  Core, Gray Wolf Essence, Gray Wolf Pelt, Tough Boar Hide, Weak Beast Core,
  Wolf Fang, Wolf Pelt). Only Qi Pill and Spirit Meal still use an emoji.
- Tooltips now exist for **every** item. Materials previously fell back to the
  browser's slow native `title` attribute while gear and consumables got the
  real one; all of them now get the same panel — art or emoji, name, rarity,
  type, description, and stats.
- Item tooltips gained a **Drops from** section: every beast that drops the
  item, sorted by best drop chance, showing the percentage (top 4, then
  "+N more"). This answers the one question a material tooltip really has.
- Material tooltips also show **Held: N**, since the bag grid's count badge is
  too small to read mid-hover.

### Fixed
- New art files are picked up **without restarting the server**. Art was
  resolved once at import, so a PNG added while `server.py` was running stayed
  invisible until a manual restart — and a stale server process would keep
  serving the old set. `/api/areas` and `/api/items` now rescan
  `public/assets/{enemies,items}` per request, and an id whose file disappears
  correctly falls back to its emoji again.
- Two flaky client tests, both unrelated to any feature:
  - "combat damage mirrored into the save every strike" failed roughly 1 run in
    7, because a critical hit one-shot the 35 HP test rat before it could
    attack, so no damage was ever dealt. The test now lets the beast strike
    first.
  - The source-level assertions hardcoded `\n`, so they broke whenever git
    checked `app.js` out with CRLF endings. The file is now normalised on read,
    making the suite immune to line-ending style.
- Edits to areas, mobs, drops, and items no longer appear "not applied" for up
  to an hour: `/api/areas` and `/api/items` were served with `max-age=3600`, so
  the browser replayed its cached copy and kept showing retired areas and
  enemies. Both are now `no-store`, and the client fetches them with
  `cache: "no-store"`. `/api/roots` and `/api/realms` stay cached — they are
  static.
- Item tooltips no longer label every piece of gear as "armor": the type line
  now comes from the item's equip slot, so a sword reads "Main Weapon", a robe
  "Body Armor", a ring "Accessory", and so on. Empty doll slots draw from the
  same slot-to-label table, so a slot and the item worn in it never disagree.

### Changed
- Hunting grounds replaced with a single **Origin Village** (Mortal, Beginner):
  Wild Rat and Giant Field Rat (Very Easy), plus Forest Wolf, Gray Wolf,
  Wild Boar, and Rabid Boar (Easy), each with its own drop table. Mobs now
  carry a per-enemy difficulty label shown on the enemy card. The four old
  areas (Misty Mortal Valley, Whispering Bamboo Forest, Ember Caverns,
  Frostbite Peaks) and all 20 of their beasts are removed.
- The 36 loot entries across those six beasts register 20 materials
  automatically (Rat Fur, Wolf Pelt, Boar Hide, Corrupted Beast Core, and so
  on), so the bag is no longer empty after a hunt.
- Bag tabs regrouped from kind (All/Gear/Consumable/Materials) to what an item
  is worn for: All, Materials, Consumable, Armor, Weapon, Artifact, Accessory.
  Gear is bucketed by its equip slot, so shields sit under Weapon with other
  hand-held pieces and cores/crowns under Artifact.
- Removed the "Empty. Hunt beasts for loot." placeholder; the bag grid simply
  renders its empty cells.
- The item database is cleared and will be rebuilt one item at a time: all 48
  gear pieces are removed. Only the Qi Pill and Spirit Meal remain as gear-free
  seed consumables; `GEAR` and `_GEAR_DROPS` are empty but kept in place, each
  with a template comment, so items can be added back individually.
- Healing Pill removed. New cultivators now start with an empty bag.
- Elixir slots are now derived from the pills that actually exist, keyed by
  what a pill does (heals / grants qi / both) instead of hardcoded names. A
  slot with no matching pill shows a neutral "Elixir I/II/III" label rather
  than advertising a pill that cannot be found, and picks the name back up
  automatically when one is added.

## [0.7.19] - 2026-10-16
### Added
- `README.md` setup guide: requirements (Python stdlib, Node for tests),
  launching `server.py`, opening the game, and running both test suites.

## [0.7.18] - 2026-10-16
### Fixed
- Breakthrough Qi no longer vanishes: the server deducted the stage cost a
  second time on top of the client's spend, wiping the carried surplus on
  every breakthrough. The client spends; the server stores and validates.
- Qi Pills are no longer silently rolled back by sync validation: Qi from
  pills actually consumed between syncs now counts toward the honest-gain
  ceiling (computed from the inventory delta).
- Peak-stage Dao Insight can no longer regress: condensing more than once
  between syncs used to be clamped back to +1 per sync.
- Existing characters are protected: creating a name that already walks
  the jianghu is rejected (HTTP 409) instead of silently overwriting it,
  and a cleared browser restores the server copy via `GET /api/player`
  instead of forcing a fresh roll.
- Combat damage is mirrored into the save every strike: hiding, reloading,
  or closing the tab mid-hunt keeps the damage (no refresh-heal), and a
  survivor of a mutual kill still falls instead of fighting on at 0 HP.
- Stale respawn timers can no longer heal a fresh enemy: the 2s search
  only completes for the fight it belongs to.
- Battle tab refreshes the hunting-ground list on entry, so realm locks
  update immediately after a breakthrough.
- Character save restoration tolerates server copies missing fields
  (stats/roots get safe defaults in normalize), and gear parked in the
  wrong doll slot re-homes to its real slot (or back to the bag) instead
  of rendering a robe as a helmet forever.
### Changed
- Elixir slots now match the pills that exist: three named slots
  (Healing Pill / Qi Pill / Spirit Meal) instead of four labels with two
  no pill could ever fill; legacy 4-slot saves re-home on boot.
- All 48 gear pieces now have an acquisition source: the 25 without one
  were wired into their tier's existing mob drop tables (no new items).
- Character sheet shows current/max HP (live), not max only.
- Combat shows the Qi reward of the last kill during the search phase.
- Material tooltip category reads "material"; material descriptions state
  plainly that crafting is deferred rather than "coming soon".
- Roots screen: removed leftover dev placeholders, dead code, and the
  stale inspection panel after re-rolling.
### Added
- Regression suites, stdlib only: `tests/test_client.js` (node; drives the
  real client functions with DOM stubs) and `tests/test_api.py` (runs the
  server in-process, never touches `players.json`) — 67 + 36 checks over
  sync validation, breakthrough math, elixirs, combat, and the
  server/client/footer version lock.

## [0.7.17] - 2026-10-16
### Fixed
- Breakthrough button deadlock: it no longer hides while the bottleneck
  is unmet (grinding the bottleneck is done BY clicking it), and the qi
  bar/button now both read the live stage cost instead of a possibly
  stale cached value — a full 29K bar always shows the button.
- Leaving a battle now wipes the loot log (Leave button, defeat, or
  switching panels mid-hunt) instead of carrying it into the next fight.
- Wound recovery no longer freezes: regen keys off "no fight running"
  instead of the battle view, which used to stay stuck on "combat"
  after a panel switch — that's why HP sat at e.g. 59/725 forever.
- Switching panels during a fight auto-leaves it: HP is persisted, the
  tick stops, the log clears, and the battle screen resets to the area
  list (no more frozen combat screen when returning).
- New characters no longer start fights at ~41/675 HP: `/api/sync`
  echoed the server's `hp: null` over the client-tracked value and
  wound recovery then "regened" from zero — sync now ignores null
  server HP, the sync response no longer includes the field, and
  invalid HP snaps to full (same rule as clampHp).
- server.py: removed dead duplicate `_gear`/`_con` definitions.
### Changed
- `.env` is git-ignored.

## [0.7.16] - 2026-10-16
### Fixed
- Tooltip no longer ticks/flickers during continuous hovering: the
  hide-timer now re-checks whether the cursor is on the tooltip before
  hiding (slot-mouseleave could run after tooltip-mouseenter and schedule
  a hide right under the cursor), identical content skips the innerHTML
  rewrite entirely, and repeat-hovers of the same target keep the
  tooltip perfectly still. Added a subtle 0.12s fade-in.

## [0.7.15] - 2026-10-16
### Changed
- Stats notification is now a small chip in the bottom-right corner
  (14px, compact padding, right-aligned rows) instead of a large
  bottom-center popup.

## [0.7.14] - 2026-10-16
### Added
- Stats notification: equipping or unequipping gear pops a bottom-center
  readout of every stat that moved — gains as `HP: 500 → +550` (green),
  losses as `HP: 550 ← 500` (red) — visible ~3 seconds, then it fades
  out. No popup when the change moves no stats.

## [0.7.13] - 2026-10-16
### Changed
- UI font switched to a smooth system sans (Segoe UI stack) with
  antialiasing and a slightly larger base/label size.
- Empty equipment and elixir slots show a custom tooltip (slot name,
  category, and how to fill it) instead of the slow native title.
### Fixed
- Double-click no longer draws the blue text-selection highlight anywhere
  (inputs remain selectable).

## [0.7.12] - 2026-10-16
### Changed
- Equipment slots renamed to RPG names: Off-Hand, Armament, Mantle,
  Headgear, Spirit Core, Cuirass, Bracers, Warboots, Legguards, Spirit
  Ring I/II, Jade Pendant, Immortal Crown. Empty slots show their
  category on hover.
- Elixir row is now four named slots — Combat Pill, Healing Pill, Qi
  Pill, Protection Pill (offensive / recovery / cultivation / defensive).
  Pills auto-load into their named slot; legacy saves are re-slotted on
  boot.

## [0.7.11] - 2026-10-16
### Changed
- Inventory layout is half/half: Equipment doll on the left half, Bag on
  the right half; doll rows spread evenly across their half.
- Clicking gear in the bag no longer equips it — gear actions are on the
  tooltip buttons only (consumables still use on click).

## [0.7.10] - 2026-10-16
### Changed
- Bag is a real RPG grid: uniform square cells sized to the panel width,
  rarity-colored borders, chip-style stack counts, and a persistent
  48-slot layout with dashed empty cells.
- Equipped items are hidden from the bag: loaded elixir consumables and
  worn gear with no free slot left (a spare ring stays visible while a
  finger is free so it can still be worn).

## [0.7.9] - 2026-10-16
### Changed
- Elixir removal button renamed Unload -> Unequip everywhere (doll slots
  and bag tooltips).
### Fixed
- Bag tooltips for an already-loaded consumable now offer Use + Unequip,
  matching the elixir slot, instead of a misleading Use + Equip.

## [0.7.8] - 2026-10-16
### Fixed
- Elixir loadout deduplicated everywhere, not just on load: normalize
  heals legacy saves (e.g. Healing Pill in all 4 slots) and `/api/sync`
  enforces one slot per consumable server-side. Gear needs no dedup —
  equipping consumes from the stack, so two identical rings are two real
  rings.

## [0.7.7] - 2026-10-16
### Fixed
- Bag tooltips are state-aware: an equipped item with nothing left to
  equip now offers Unequip (with the right slot) instead of a misleading
  Equip; bag clicks follow the same rule.

## [0.7.6] - 2026-10-16
### Changed
- Consumable tooltips now offer Use + Equip (loading an elixir slot is
  equipping it) instead of Use + Elixir.
- Tooltip shows the item type value again (armor/consumable/materials),
  still without the old Type:/Info: labels.

## [0.7.5] - 2026-10-16
### Changed
- Tooltip trimmed to name + rarity, description, stats, and actions —
  Type/Info rows removed and the duplicated effect line is gone
  (descriptions already state the effect).

## [0.7.4] - 2026-10-16
### Changed
- Tooltip layout per spec: name + rarity header, type line (armor /
  consumable / materials), info block, then action buttons.
- Tooltips now appear only where actions exist (bag gear/consumables,
  equipped slots, loaded elixirs) — materials show none.
- Equipped doll slots tooltip an Unequip button; elixir slots tooltip
  Use + Unload.

## [0.7.3] - 2026-10-16
### Fixed
- Tooltips usable again: the tip element now loads before the script so its
  buttons actually wire up (previously the boot wiring silently no-opped,
  leaving dead buttons and a tooltip that always timed out).
- Tooltip wiring is lazy and idempotent, same-item hovers no longer
  re-render the buttons mid-click, and the slot-to-tip grace is 350ms.

## [0.7.2] - 2026-10-16
### Added
- Tooltips are now interactive: hover an item, slide onto the tooltip, and
  use Equip / Use / Elixir buttons right inside it; it hides on hover-out.
### Changed
- Inspect detail box removed; bag clicks act directly (gear equips,
  consumables are used with a waste guard at full HP).
- Loading an elixir already slotted elsewhere moves it instead of
  duplicating it across slots.
### Fixed
- `invSel` selection state fully retired with the detail box.

## [0.7.1] - 2026-10-16
### Added
- Gear rarity (Mortal/Earth/Heaven/Immortal by tier) with rarity-colored
  hover tooltips, including live stat comparison vs the equipped piece
  (green/red deltas, "click to equip" hint).
### Changed
- Inventory fills the tab with no dead space (bag grid scrolls internally).
- Bag gear equips on click; consumables/materials still open the detail box.
- Inspect placeholder removed — the detail box only renders when an item
  with actions is selected.
- Bag tabs are square-cornered like the rest of the UI.
- New characters no longer start with a loaded elixir (pills stay in bag).
### Fixed
- Equipping the last of a stack clears a stale detail selection.

## [0.7.0] - 2026-10-16
### Added
- Inventory + Equipment tab: paper-doll with head/sec weapon/chest, main
  weapon/core/arm, back/boots/legs, 2 rings/necklace/headpiece, and 4
  quick-use elixir slots; bag with All/Gear/Consumable/Materials tabs and
  an inspect/equip/use detail box.
- 91-item database via `GET /api/items` (48 gear pieces across 4 tiers,
  3 consumables, 40 materials); gear stats feed Character and Battle.
- Gear and pill drops merged into hunting loot; kills also fill the bag.
- Consumables: Healing Pill, Qi Pill, Spirit Meal; loadable into elixir
  slots, usable from the bag.
- Persistent HP: fights start at current HP, damage sticks between hunts,
  slow recovery outside combat, full revive on defeat, starter healing kit.

## [0.6.2] - 2026-10-16
### Changed
- Attack log removed from combat; kills and drops stay visible via the
  kill counter and loot log.
- Searching indicator reserves its slot, so appearing/disappearing no
  longer stretches the canvas.
- Attack bars glide via CSS transition instead of stepping each tick.

## [0.6.1] - 2026-10-16
### Added
- Client/server version handshake: `/api/health` reports the server
  version and the client shows a plain-language banner (instead of a bare
  console 404) when the server is unreachable or older than the client.
### Fixed
- `/favicon.ico` now answers 204 instead of serving the app shell.

## [0.6.0] - 2026-10-16
### Added
- Full battle system: Battle -> realm-gated area list (mockup 1) -> enemy
  select with loot previews (mockup 2) -> auto-combat (mockup 3).
- 4 hunting areas x 5 mobs via `GET /api/areas` (Misty Mortal Valley through
  Frostbite Peaks), with per-mob HP/attack/defense/speed, loot tables, and
  Qi rewards.
- Auto-attack bars (player fills in 1s); crits use Character stats; red HP
  bars, attack log, and a persistent aggregated loot log (`Iron 2x` style)
  that is never cleared.
- Kill cycle: enemy dies -> loot drops -> "searching for that same enemy"
  pause -> same enemy respawns; player death force-leaves to enemy select.
### Changed
- Server sync headroom raised to cover battle Qi rewards.

## [0.5.1] - 2026-10-16
### Changed
- Character panel Qi now ticks live every second instead of only on panel
  refreshes.
- Top-bar Qi counter removed (Qi lives in the Cultivate and Character
  panels now).
### Fixed
- Dantian glow recentered on the art: it follows the same 4.1px optical
  nudge as the character, and the image width no longer resolves against
  its own container.

## [0.5.0] - 2026-10-16
### Added
- Character panel now shows derived combat stats (HP, Qi + rate, Attack,
  Defense, Crit chance, Crit dmg) scaling with root foundation and realm.
### Changed
- Breakthrough button reserves its space while hidden (visibility instead
  of display), so the canvas no longer jumps when it appears.
- Raw internal stats (root multipliers, comprehension/physique/fortune sums)
  removed from the Character panel.

## [0.4.4] - 2026-10-16
### Fixed
- Character centering fine-tuned with a 4.1px optical nudge on the art.

## [0.4.3] - 2026-10-16
### Changed
- Cultivate event message line removed for a cleaner panel.
- Character figure explicitly centered (flex + auto margins, block image).
- Dantian glow is smaller (56px) but brighter: hot core, screen blending,
  tighter halo, same nonstop pulse and qi ring.

## [0.4.2] - 2026-10-16
### Added
- Dantian glow over the meditating figure's lower abdomen: warm radial
  pulse plus a slow rotating qi ring, glowing nonstop.
- Breakthrough button stays hidden until the stage threshold is truly met
  (full bar and bottleneck satisfied), then rises in with an animation.
- Cultivate event line now slides in and fades out after ~4 seconds.
### Changed
- UI labels use first-letter casing (Name, Realm, Breakthrough, sidebar
  and panel headings); the character art itself is static again.

## [0.4.1] - 2026-10-16
### Added
- Cultivate panel rebuilt per mockup with provided art: meditating
  character (`assets/character/character_0_meditating.png`, gentle hover
  animation) over the cultivation backdrop (`assets/background/cultivation_panel.png`),
  wide Qi progress bar, `+X/s Qi` rate line, boxed BREAKTHROUGH button, and
  a single-line event message replacing the scrolling log.
### Removed
- Meditate button (pure idle now) and the Seclusion mode + Emerge button;
  battle lock and rate multiplier retired with them.

## [0.4.0] - 2026-10-16
### Changed
- Realm ladder collapsed to 11 stages: Mortal (major tribulation) then Qi
  Refinement Realm I-X, one realm per breakthrough — no more minor layers.
  Costs scale x1.6 per realm (50 -> ~5,498 Qi), bottleneck grinding gates
  Realms VI, VIII, and IX, peak Realm X condenses Dao Insight.

## [0.3.1] - 2026-10-16
### Fixed
- Topbar realm now shows the realm only ("Mortal", "Qi Refinement Realm I"
  ... "Qi Refinement Realm X"); the layer detail ("· Layer N") stays in the
  Cultivate and Character panels.

## [0.3.0] - 2026-10-16
### Added
- New realm ladder: Mortal (major tribulation breakthrough) -> Qi Refinement
  I-X with 10 minor layers each (101 stages), gentle x1.06 cost curve,
  bottleneck grind on realm ascents, Dao Insight condensation at the peak.
### Fixed
- New characters showed "REALM:-": the topbar realm is now set on entering
  the main game and kept in sync by every cultivate panel refresh.
- Qi overflow: gains may exceed the bar; breakthroughs consume only the
  stage cost and surplus carries into the next stage (client + `/api/sync`).
### Changed
- Sidebar starts closed and auto-hides on every panel switch; hamburger
  starts in the collapsed (gold, rotated) state.

## [0.2.0] - 2026-10-16
### Added
- Idle cultivation: passive Qi every second (`1.0 x root x realm x mode`),
  live rate display and breakthrough ETA in the Cultivate panel.
- Offline gains: capped at 8h at 50% efficiency with a welcome-back summary.
- 13-stage realm ladder (Qi Refining I-IX, Foundation I-III, Golden Core I),
  served as single source of truth via `GET /api/realms`, with per-stage
  costs, rate multipliers, and flavor lines.
- Breakthrough depth: bottleneck grinding (insight attempts costing 25% Qi),
  major-realm tribulations (endure 2 of 3 calamities: thunder/heart/body),
  and Dao Insight condensation at the Golden Core peak.
- Closed-door Seclusion mode: x2 Qi rate while battle is forbidden.
- Server sync (`POST /api/sync` every 30s + on tab hide): authoritative
  snapshot with rate-cap anti-cheat clamping; players persist across
  restarts (`players.json` loaded at boot); `GET /api/player` added.
### Changed
- Meditate is now a burst supplement with a 5s cooldown instead of the
  primary Qi source; milestone log lines replace per-action spam.

## [0.1.4] - 2026-10-15
### Changed
- Sidebar is now an overlay above the canvas: it slides in/out with
  translate + fade (with shadow and focus-safe hiding) while `.content`
  keeps its full size and never stretches. Applies on desktop and mobile.

## [0.1.3] - 2026-10-15
### Changed
- Removed the "MAIN GAME OPEN SIDE BAR MENU" placeholder header; the game
  shell now starts directly with the topbar.
- Sidebar open/close is animated: smooth width slide + fade on desktop,
  height collapse + fade on mobile; hamburger icon rotates and turns gold
  when the sidebar is closed.

## [0.1.2] - 2026-10-15
### Changed
- True full-screen layout with no dead space: screens are full-bleed
  (`100vw` x `100dvh`, zero outer padding/margins), Reroll Root Panel and
  Main Game shell stretch edge to edge; side columns widened
  (280px / 1fr / 300px) to fill 1920px widths.

## [0.1.1] - 2026-10-15
### Fixed
- Viewport layout now fits 1920x1080 with no page scroll: screens lock to
  `100dvh`, Reroll Root Panel and Main Game shell use flex column with
  internal scrolling only (roll list, detail, index, content, logs).
- Widened layout container to 1920px; fixed roll stage height; added
  `viewport-fit=cover` to the viewport meta.

## [0.1.0] - 2026-10-15
### Added
- Core game flow: Enter Username -> Select Spiritual Roots -> Main Game.
- Python stdlib-only server (`server.py`): static hosting + JSON API
  (`GET /api/roots`, `POST /api/roll`, `POST /api/create`).
- Spiritual Root system: 21 roots across 6 rarity tiers
  (Mortal 45% / Earth 25% / Heaven 15% / Immortal 8% / Divine 5% / Primordial 2%)
  with weighted 9-roll, pick-3 foundation, and same-element synergy bonus.
- Reroll Root Panel UI: selected-root detail/stats, animated roll stage,
  9x root name + rarity rows, reroll button, full root index with chances.
- Main Game shell: topbar (menu, name, realm, qi), sidebar
  (Character / Cultivate / Battle), Cultivate default panel with
  Meditate/Breakthrough, Character sheet, Battle prototype.
- Dark Wuxia theme (`public/css/style.css`), vanilla JS client (`public/js/app.js`).
