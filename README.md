# Hustle Cab — City Shift

A playable Three.js taxi game set in a sunny, fictional Manhattan neighbourhood. Built as a new implementation in this initially empty workspace, following the redesign in [DESIGN.md](DESIGN.md).

## Run

Requires Node.js 20.19+ or 22.12+ and a browser with WebGL 2.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Choose **Start your shift**, accept a dispatch request, and follow the mint route on the map. Stop within seven metres of the pickup marker and press **E** to board. Drive to the destination and stop again to complete the fare. Smooth steering, sensible braking, and observing red lights preserve passenger comfort and improve tips.

**Just take a drive** starts free driving. Dispatch remains available whenever you want a passenger.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Accelerate, brake / reverse, steer |
| Space | Strong brake |
| E | Accept fare / board / drop off |
| C | Chase, bonnet, overhead camera |
| H | Horn |
| R / sound button | Toggle engine, road, horn, and dispatch audio |
| M | Open / close full map |
| P / Escape | Pause / resume |
| X / Recover | Return to a clear road and repair; costs up to $8 |

Touch devices have steering and accelerator / brake buttons. Hold S / down to brake through zero into reverse. Tap dispatch buttons and the contextual boarding / drop-off prompt. Weather and graphics settings are in the pause menu. Sound starts when you start a shift and includes engine revs, road noise, nearby traffic ambience, birds, horn, and dispatch / fare effects. The sound button toggles mute; your choice is remembered locally.

## Features

- A six-by-six block city with masonry façades, glazed storefronts, awnings, fire escapes, rooftop water tanks, street signs, cafés, umbrellas, flowers, bicycles, newspaper boxes, benches, trees, and a park.
- An authored yellow sedan with sculpted wheel arches, glass, chrome trim, steering wheels, brake / reverse lights, suspension response, and headlights. Traffic includes sedan, compact, and wagon variants.
- Forty-two circulating vehicles with curved intersection turns and yielding, and seventy-six pedestrians with jointed, skinned character models, foot placement, signal-aware crossings, and reactions to nearby cars and horns.
- Five passenger stories with distinct destinations and time allowances; road-grid routing, curbside boarding, live metering, comfort, tips, ratings, receipts, and repeatable shifts.
- Clear blue skies and sunny daylight by default, with optional evening rain and night settings. Rain changes braking and steering response.
- Local best-shift persistence, responsive HUD, two maps, synthesized audio, and automatic graphics reduction on slow devices.

## Validate

```sh
npm test
npm run build
npm run dev
npm run test:browser
node tests/driving.mjs
```

The browser checks require installed Google Chrome and a running development server. They exercise acceleration, accepting and completing a fare, boarding, pause, weather, cameras, the map, and touch input; development-only positioning helpers reach pickup / drop-off locations deterministically. The separate `tests/driving.mjs` test drives from the starting position through pickup, two turns, and drop-off using actual keyboard inputs, without repositioning the cab. Screenshots are written to `artifacts/`. The game debugging interface is omitted from production builds.

Regression checks include reverse engagement at 30–240 physics steps per second, braking into reverse and driving forward again, actual audio output and muting, animated pedestrian joints, and traffic turning. This is local Chrome validation, not a claim of universal device performance.

## Publish

`npm run build` produces `dist/`, suitable for Vercel or any static host. For a Vercel import, choose Vite, build command `npm run build`, output directory `dist`. This workspace is not connected to the original game's Vercel project; no live deployment is changed by building locally.

## Implementation boundaries

This is an accessible simulation-inspired game, not a licensed NYC street reconstruction or a full automotive physics simulator. Traffic follows predefined street circuits; pedestrians follow sidewalk and crosswalk routes. Fares repeat after five stories. Weather is selectable rather than a live forecast. The best shift and sound preference are stored locally and can be cleared by browser storage settings. Google Fonts is optional; system font fallbacks work if it is unavailable. All gameplay, models, and textures run locally without an account or backend.
