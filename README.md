# Skate Helsinki

A 3D inline-skating game of Helsinki from Kumpula through Kallio, Sörnäinen and Suvilahti to Kalasatama, Korkeasaari and over the Crown Bridges. The city is built in the browser from OpenStreetMap data.

Play: https://joukops.github.io/skate/

Map data © OpenStreetMap contributors, ODbL. Buildings: Helsinki 3D city model (CityGML LOD2), City of Helsinki, CC BY 4.0.

## Graphics engine

The game runs on three.js r170 with the WebGPU renderer; browsers without WebGPU fall back to WebGL 2 automatically. Add `#gl=webgl` to the address to force WebGL 2. `classic.html` is the previous WebGL-only version (three.js r128), kept as a fallback.
