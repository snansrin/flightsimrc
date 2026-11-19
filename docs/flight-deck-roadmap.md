# FlightSimRC — Flight Deck 2.0

This iteration preserves the working RadioLink T12D Gamepad/WebHID input, calibration-free flight, and reverse-switch settings.

## Implemented

- **ADI / attitude director-style display:** Roll/bank and pitch are rendered from the actual six-degree-of-freedom simulation attitude. Speed, altitude above local terrain and vertical speed are shown alongside it. There is no autopilot flight director command bar yet.
- **HSI / local navigation:** Rotating heading card, true bearing-to-fix pointer, manually selectable course, cross-track CDI, TO/FROM indicator, ground track, distance and closing-speed ETA. Course controls include ±5°, runway course (RWY) and direct-to the selected fix (DCT).
- **Tactical map:** Scales to show the aircraft and the selected local waypoint, with a line between them.
- **Waypoints:** Two **local simulator** fixes per airfield: runway centre and an approach waypoint 220 m before the runway threshold. No live GNSS, published ILS, certified radio beacon, airport database or geographic georeferencing is claimed.
- **Selectable flight-assist modes:** Model-specific defaults, student/SAFE, sport, manual/ACRO and wind-free studio (from existing simulation physics).
- **Procedural audio:** Separate prop/rotor/EDF harmonics, blade pulses, turbine tones and speed-dependent wind, driven by throttle, simulated RPM and airspeed. Synthesized locally with WebAudio.
- **Model refinement:** Drone/heli/EDF procedural meshes use refined surface materials and navigation light accents. No third-party asset copies.
- **Responsive cockpit UI:** A collapsible instrument panel under the 3D viewport, with large readable labels and interactive course controls.

## Validity and conventions

All coordinates are **local simulation metres**, not latitude/longitude. The display bridge mirrors physics Z to match the scene renderer. Heading zero is simulator north (+Z in display space), 90° points east (+X). Bearing and course use these display coordinates. Cross-track is the perpendicular displacement from a line through the selected local waypoint at the selected course (40 m per CDI dot). ETA uses positive **closing speed** along the vector to the fix; otherwise no ETA is displayed.

**Not for flight training, operational navigation, flight planning or safety decisions.** The ADI/HSI follow simulated data, not real-world sensor feeds.

## Next iterations for a world-scale competitor

1. **Georeferenced world:** Choose a licensed terrain / imagery / vector-tile / elevation provider, respect its map attribution and API quotas, and build a terrain tile streamer with LOD/caching and a world-coordinate origin.
2. **Genuine nav database:** Add licensed/open aviation waypoints, airport data and nav procedures with updates. Separate magnetic from true bearings; implement flight plans, waypoint sequencing and magnetic variation.
3. **Terrain & world fidelity:** Buildings, water, roads, ground materials, runway lighting and weather layers with performance budgets for mid-range mobile/desktop hardware.
4. **Flight dynamics:** Model-specific inertia, aerodynamic tuning, mass / battery / fuel, wind/turbulence presets and comparison tests against published reference values where available.
5. **Aircraft & sound:** Higher-detail original meshes/LODs, interior cockpits, aircraft-specific telemetry and optional properly licensed recordings with spatialized audio.
6. **Community:** Shared routes, multiplayer fleet rules, landing challenges and recorded flight replay; privacy and moderation features.

## Reference material

For general architecture/design inspiration only (no source code or assets copied):

- skyhop/react-flight-indicators (React/SVG aircraft instruments)
- gideon-jacob/react-drone-hud (MIT-licensed React UAV HUD reference)
- webgl-games/flight-sim (MIT-licensed WebGL / WebAudio architecture)
- worldflightsim.com (public product benchmark)

