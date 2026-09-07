# Hustle Cab: After Hours

## Direction

Rebuild the supplied Hustle Cab browser game as an atmospheric, approachable taxi simulator. The supplied workspace is empty; this is a new implementation, not a patch to the deployed game's source repository. Keep the yellow-cab identity and New York setting, but make professional driving the main source of reward.

## Implementation plan

1. Build a consistent evening city: layered masonry and glazed façades, cornices, fire escapes, storefront signs and awnings, planted sidewalks, a park, streetlights, water towers, and distant architecture. Batch static geometry to control draw calls.
2. Model a rounded yellow sedan with glass, trim, lights, wheels, taxi identification, and suspension response. Use acceleration, speed-sensitive steering, braking, reverse, collisions, and chase / bonnet / overhead cameras.
3. Implement dispatch acceptance, road-following navigation, low-speed curbside pickup, passenger comfort, metered fares, destination arrival, tips, rating, and a persistent best shift.
4. Populate the streets with traffic obeying intersection phases and walking pedestrians. Add selectable evening rain and night lighting, engine sound, and a horn.
5. Create a restrained cream / forest / taxi-yellow interface, with contextual controls, a navigation map, touch driving controls, pause settings, and recoverable error states.
6. Validate the build, navigation and fare rules, browser console, main controls, pickup-to-payment flow, and desktop / mobile layouts. Capture the actual rendered game.

## Scope and tradeoffs

This is a compact fictional Manhattan neighbourhood, not a geospatial reconstruction. Architecture, vehicle models, surface textures, and sound are authored procedurally; no third-party model downloads or asset licensing dependencies. The handling is accessible simulation-inspired handling, not a full rigid-body tire simulation. Road navigation uses the street grid. Traffic and pedestrians are local simulations. No backend or accounts are required. Publishing to the original Vercel project requires access to that project.
