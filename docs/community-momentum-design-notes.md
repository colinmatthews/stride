# Community momentum design notes

## Thesis

Challenge completion should feel less like a private receipt and more like adding energy to a
living, local effort. The flow keeps Stride's utilitarian bone, ink, and signal-orange visual
language, while the map turns individual finishes into a shared field of activity. The prototype
stays with one signed-in athlete: a bundled local update brings them back to another participant's
badge, and their own later contribution closes the loop. Motion is reserved for the notification
arrival, the deep-linked badge, and the user's badge landing so celebration remains purposeful.

## Usage

- The default state is a push-style local momentum notification for the signed-in athlete. It
  summarizes a meaningful cluster of Boulder contributions rather than firing once per activity.
- Opening the alert deep-links to Maya's badge and keeps her contribution selected. The user never
  changes identity.
- "Local" is based on the participant's chosen home metro. It does not use live device location.
- Signal orange marks the user's earned badge and the primary contribution actions.
- Thin borders, modest corners, mono labels, and compact stats maintain the existing product
  density.
- The shared map uses Leaflet with OpenStreetMap tiles, visible attribution, native pan and zoom,
  and a metric scale so the experience feels grounded in a real place.
- Map pins remain approximate neighborhood or city-area markers. Route traces use static,
  street-snapped OpenStreetMap geometry generated for the prototype, with no start-point marker,
  timestamped coordinates, or real recorded activity data.
- Every visible activity has a trace on the map. Selecting a participant emphasizes their route,
  while the remaining traces stay visible at lower contrast to convey collective movement.
- Selecting a pin opens a compact activity popup and keeps the matching community post in sync.
  The All activity and Following controls filter the visible local contributions without changing
  the signed-in user.
- The contribution pin appears only after the completion modal clears, then drops into place with a
  short bounce, two map ripples, and a temporary distance confirmation. The map centers before the
  entrance begins so the contribution moment remains visible.
- Community reactions remain lightweight: a single kudos action and comments count.
- Map pins reveal a compact post preview on hover or keyboard focus, with the like action available
  in place so participants do not need to leave the map.
- Completion always precedes public posting, and the dialog states exactly what will be shared.
- The completion dialog combines the badge, note, and public post into one clear primary action.
- After the user's badge lands, a status message explains that it may be included in the next local
  update once enough momentum builds; the interface never claims an immediate notification blast.

## Review states

- `?state=notification` (and the route with no query) shows the bundled local push.
- `?state=returned` opens the map with Maya selected and her contribution preview visible.
- `?state=completion` opens the eligible-activity confirmation for the same signed-in athlete.
- `?state=badge-added` shows that athlete's badge, updated totals, and the next-update explanation.
