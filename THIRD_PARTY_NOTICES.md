# Third-party notices

FlightSimRC özgün kaynak kodu kökteki MIT lisansı altında yayımlanır. Aşağıdaki doğrudan bağımlılıkların kurulu sürümlerinin `package.json` lisans alanları kontrol edildi (18 Kasım 2026):

| Paket | Kurulu sürüm | Lisans |
| --- | --- | --- |
| React | 19.3.1 | MIT |
| React DOM | 19.3.1 | MIT |
| Three.js | 0.180.0 | MIT |
| React Three Fiber | 9.8.2 | MIT |
| Supabase JS | 2.119.0 | MIT |
| MapLibre GL JS | 6.19.0 | BSD-3-Clause |
| @mapbox/vector-tile | 3.0.0 | BSD-3-Clause |
| pbf | 5.2.0 | BSD-3-Clause |

Bu liste transitif bağımlılıkların tümünü kapsamaz. Dağıtımda `package-lock.json` ve her paketin lisans metni esas alınır. `Supabase JS` şimdilik kodda kullanılmaz; canlı bağlantı kurulduğunda etkinleştirilecektir.

## Sahne varlıkları

| Varlık | Kaynak | Lisans |
| --- | --- | --- |
| Grass001 renk, normal ve pürüzlülük haritaları | [ambientCG Grass001](https://ambientcg.com/view?id=Grass001) | [CC0](https://docs.ambientcg.com/license/) |
| Road001 renk, normal ve pürüzlülük haritaları | [ambientCG Road001](https://ambientcg.com/view?id=Road001) | [CC0](https://docs.ambientcg.com/license/) |
| farm_field_puresky 1K HDRI | [Poly Haven](https://polyhaven.com/a/farm_field_puresky) | [CC0](https://polyhaven.com/license) |

Dosyalar `public/textures/` altında tutulur. Uçak ve saha geometrisi proje içinde oluşturulmuştur.

## Chatfield RC sahası

- Hava fotoğrafı `public/terrain/chatfield-naip.jpg` için USDA NAIP doğal renkli ortofoto, USGS The National Map Imagery Only servisi üzerinden alınmıştır. Colorado’daki bu kapsama kamu malıdır. [USGS NAIP veri kaydı](https://doi.org/10.5066/F7QN651G)
- `src/sim/chatfield-data.ts` için USGS 3DEP yükseklik verisi kullanılmıştır. Örnekler 129 × 129 ızgarada, pist referansına göre desimetreye yuvarlanarak saklanır. [USGS 3DEP yükseklik servisi](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer)

## Dünya Keşfi veri servisleri

- EOxCloudless by EOX IT Services GmbH, modified Copernicus Sentinel data 2016. [CC BY 4.0 ve servis şartları](https://cloudless.eox.at/documentation/license)
- Mapzen/AWS Terrain Tiles sayısal yükseklik. [Terrain Tiles kaynak atıfları](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)
- Bina ayak izleri ve yükseklikleri OpenFreeMap üzerinden alınır. [OpenFreeMap](https://openfreemap.org/) · [OpenMapTiles](https://openmaptiles.org/) · [OpenStreetMap katkıcıları](https://www.openstreetmap.org/copyright)
- ABD ortofotosu ve yedi eğitim alanındaki WebP kırpmaları USDA NAIP kaynaklıdır. [USGS Imagery Only](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer) · [Kamu malı NAIP görüntüleri](https://www.usgs.gov/programs/national-geospatial-program/supporting-themes)
- ABD ana karası görüntü kapsaması için kullanılan sadeleştirilmiş sınır Natural Earth kamu malı verisinden türetilmiştir. [Natural Earth kullanım şartları](https://www.naturalearthdata.com/about/terms-of-use/)
