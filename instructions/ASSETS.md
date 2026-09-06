# PENTILIUS — Visual Asset Strategy

## Principle
Development must not wait for final artwork.

Use placeholders during early implementation and replace them later.

## Asset categories
Expected categories include:
- robot;
- robot parts/modules;
- Pentili;
- lands/zones;
- buildings;
- resources;
- research icons;
- race symbols;
- upgrade stones;
- boxes/caches;
- UI backgrounds and decorative elements.

## Robot equipment visuals
Because the robot is defined by its equipped parts, visual parts should eventually use a consistent master canvas/perspective (a fixed humanoid frame: head, left arm, right arm, armor/torso, core, left leg, right leg).

Do not generate arbitrary equipment images in incompatible perspectives.

Potential future approach:
- base frame layer;
- head layer;
- arm layers (left/right);
- armor/torso layer;
- core/effect layer;
- leg layers (left/right).

Exact layering and coordinates are **UNDEFINED**.

## Backend rule
The backend must never depend on a specific image filename.

Game definitions should reference stable asset IDs or asset URLs.

Example:

```text
asset_id: item.plasma_cannon_t2.icon
```

The visual file can later be replaced without changing game logic.

## First milestone
Placeholder assets are sufficient.

Recommended initial placeholder set:
- 1 robot;
- several equipment icons;
- 3–5 Pentili;
- 2 lands;
- core resource icons;
- basic building icons.
