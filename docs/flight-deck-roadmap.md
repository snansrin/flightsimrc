# FlightSimRC — Flight Deck 2.0

This iteration preserves the working RadioLink T12D Gamepad/WebHID input, calibration-free flight, and reverse-switch settings.

## World exploration

Open **Dünya haritası**, pick a point on the globe or enter latitude and longitude, then choose **Burada uç**. The map arrow shows the initial heading. Choose a starting altitude from 60 to 600 m above local terrain. A restart reuses the chosen heading and altitude. World flight works in solo mode. Selecting an education field or starting a lesson returns to the existing airfield system. The HSI's direct-to target is the start coordinates in world mode.

The globe uses MapLibre GL JS and the EOX Sentinel‑2 Cloudless 2016 raster tiles. The 3D flight view streams the same raster imagery with 3D relief from the Mapzen/AWS Terrarium DEM. A distance-based tile tree uses a tighter mesh and satellite tiles up to z14 around the aircraft and lower levels toward the horizon. The meshes meet along coarser tile edges and the launch point loads first. Ground contact and the camera use the same elevation source. OpenFreeMap vector tiles provide nearby OpenStreetMap building footprints and approximate heights. Building geometry is for display. This is a local metric approximation of Web Mercator around the launch point, with selectable coordinates between approximately ±85° latitude.

The 2016 Sentinel mosaic has roughly 10 m source imagery. Land cover and building models depend on data coverage, and detailed photogrammetry is outside this dataset. All services are accessed on demand and need an internet connection.

The world picker has a labeled street map alongside the satellite layer. At the closest terrain detail level, tiles wholly inside the contiguous United States request a higher-resolution USGS aerial image using the same Web Mercator bounds. If that request fails or takes too long, the scene uses Sentinel imagery. The coverage check uses a simplified public-domain Natural Earth boundary.

## Training imagery

All eight training scenes use bundled aerial imagery. The seven exercise presets overlay their existing simulator runway dimensions and terrain profiles on the real photographs below. Chatfield also uses a measured elevation model and a reconstruction of the model aircraft strip. The place name in the simulator identifies the photograph's source geography.

| Exercise preset | Source landscape | Centre (lat, lon) | Width |
| --- | --- | --- | --- |
| Anadolu Eğitim Pisti | Boulder Reservoir, Colorado | 40.08539, -105.23270 | 2.8 km |
| Ege Kıyı Pisti | Fort Pierce Inlet, Florida | 27.47652, -80.29210 | 2.8 km |
| Alp Vadisi | Roaring Fork Valley, Colorado | 39.20325, -106.85530 | 3.6 km |
| Çöl Meydanı | Alvord Desert, Oregon | 42.54145, -118.53250 | 3.4 km |
| Kuzey Yaylası | Mount Rainier, Washington | 46.80240, -121.73550 | 3.3 km |
| Şehir Meydanı | Central Park, New York | 40.78165, -73.96657 | 3.0 km |
| Ada Lagünü | Indian River Lagoon, Florida | 27.44375, -80.30980 | 3.3 km |

The crops use the USGS Imagery Only export service in EPSG:3857. They are stored as WebP files and are loaded when the relevant scene is selected. Central Park additionally streams nearby OpenStreetMap building geometry where the vector service is available.

The fixed-wing models use aircraft-specific fuselage cross-sections, swept tail meshes, fitted canopies and independent hinged surfaces. The Viper includes intake and exhaust geometry, the T‑28 has a radial cowling and a three-blade propeller. Select **Model inceleme** in **Görüş** for a close three-quarter view. Aerodynamic and controller settings are shared with the existing aircraft.

- [EOxCloudless data and license](https://cloudless.eox.at/documentation/license)
- [Mapzen/AWS elevation data and attribution](https://registry.opendata.aws/terrain-tiles/)
- [OpenFreeMap](https://openfreemap.org/quick_start/) and [OpenMapTiles building schema](https://openmaptiles.org/docs/schema/#building)
- [Horizon Hobby Viper 90 mm product reference](https://www.horizonhobby.com/product/viper-90mm-edf-jet-bnf-basic-with-as3x-and-safe-select/EFL17750.html)

## Implemented

- **ADI / attitude director-style display:** Roll/bank and pitch are rendered from the actual six-degree-of-freedom simulation attitude. Speed, altitude above local terrain and vertical speed are shown alongside it. There is no autopilot flight director command bar yet.
- **HSI / local navigation:** Rotating heading card, true bearing-to-fix pointer, manually selectable course, cross-track CDI, TO/FROM indicator, ground track, distance and closing-speed ETA. Course controls include ±5°, runway course (RWY) and direct-to the selected fix (DCT).
- **Waypoints:** Two **local simulator** fixes per airfield: runway centre and an approach waypoint 220 m before the runway threshold. No live GNSS, published ILS, certified radio beacon, airport database or geographic georeferencing is claimed.
- **Selectable flight-assist modes:** Model-specific defaults, student/SAFE, sport, manual/ACRO and wind-free studio (from existing simulation physics).
- **Procedural audio:** Separate prop/rotor/EDF harmonics, blade pulses, turbine tones and speed-dependent wind, driven by throttle, simulated RPM and airspeed. Synthesized locally with WebAudio.
- **Model refinement:** Drone/heli/EDF procedural meshes use refined surface materials and navigation light accents. No third-party asset copies.
- **Responsive cockpit UI:** Three circular instruments inside the viewport. The course and waypoint controls remain in a separate section of the toolbar.

## Chatfield and RC systems

- The public [World Flight Sim Explore](https://worldflightsim.com/explore/) experience informed the location and camera workflow. FlightSimRC adds a standalone local scene using the [USDA NAIP orthoimage](https://doi.org/10.5066/F7QN651G) and [USGS 3DEP elevation](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer) for Chatfield Aerodrome. Coverage is 2.7 × 2.7 km around 39.53230° N, 105.06042° W. The image is 2048 × 2048 pixels and the elevation grid is 129 × 129, about 21 m between samples. The simulated eastbound runway uses the club’s published 688 ft length. Its width and center are approximated from the orthoimage, and the local atmospheric datum is 1683.6 m. [Jeffco Aeromod’lers field](https://jeffcoaeromodlers.com/club-info/flying-field/)
- T-28 and Viper accept clean, approach and landing flap configurations. The T-28 stages are 0°, 21° and 42°, with deployment allowed up to 20 m/s in the simulator. Viper stages are 0°, 19° and 38°, up to 27 m/s. Both use a 0.24 s actuator time constant and their configured retractable gear. These are simulation parameters. [FAA flaps and landing configurations](https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/10_afh_ch9.pdf)
- The sound layers use estimated blade passage frequency from blade count and simulated RPM. The ground pilot view applies distance attenuation and a Doppler shift from radial velocity. The sound is synthesized with Web Audio. [FHWA aircraft noise fundamentals](https://www.fhwa.dot.gov/Environment/noise/regulations_and_guidance/predictionabatement.pdf)

## Validity and conventions

Flight state uses local simulation metres. The display bridge mirrors physics Z to match the scene renderer. Heading zero is simulator north (+Z in display space), 90° points east (+X). Bearing and course use these display coordinates. Cross-track is the perpendicular displacement from a line through the selected local waypoint at the selected course (40 m per CDI dot). ETA uses positive closing speed along the vector to the fix.

**Not for flight training, operational navigation, flight planning or safety decisions.** The ADI/HSI follow simulated data, not real-world sensor feeds.

## Next iterations for a world-scale competitor

1. **Georeferenced world:** Add a global position reference suitable for very long flights and support finer-resolution licensed imagery where available.
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

