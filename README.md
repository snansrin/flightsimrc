# FlightSimRC

Tarayıcıda RC uçuş eğitimi için geliştirilen prototip. React, TypeScript ve React Three Fiber kullanır. 1,5 m sınıfı yüksek kanatlı trainer modeli, pist çevresi, beş hava sahası teması, klavye/Gamepad girişi, eksen eşleme, HUD, takip/pilot kamerası, duraklatma ve sıfırlama içerir.

## Yerel çalıştırma

Node.js 22 kullanın. `npm install`, ardından `npm run dev`. Doğrulama için `npm test` ve `npm run build`. Gamepad cihazını USB ile bağlayıp tarayıcı sayfasına odaklanın. W/S gaz; oklar pitch/roll; A/D roll; Q/E rudder. Kumanda ayarlarından 0–7 eksenlerini eşleyin. Her cihazın throttle yönü farklı olabilir; mevcut prototipte −1 tam gazdır. Cihaz desteği tarayıcı ve işletim sistemine bağlıdır.

## Mimari ve mevcut sınırlar

- `src/flight.ts`: 60 Hz sabit adımlı trainer dinamiği; hava hızına bağlı kaldırma/sürükleme, yan rüzgâr, stall, açısal hız, yatışa bağlı dönüş, yan kayma ve yer teması. Hız vektörü dönüşte aniden döndürülmez. Katsayılar uçuş testiyle doğrulanmadı; tam 6DoF fizik iddiası yoktur.
- `src/input.ts`: Gamepad kanal eşlemesi, kanal tersleme, ölü bölge ve expo. Ayarlar tarayıcıda saklanır; ayar paneli ham eksen hareketini gösterir. Min/merkez/max kalibrasyon sihirbazı ve cihaz profilleri sonraki aşamadır.
- `src/scene/Trainer.tsx`: özgün kodla oluşturulmuş trainer geometrisi, kanat oranları, iniş takımı ve hareketli kontrol yüzeyleri. [Apprentice STS kılavuzundaki](https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL3700-Manual-EN.pdf) 1500 mm kanat açıklığı / 1080 mm gövde uzunluğu sınıfı referans alındı; marka modeli veya çizimi kopyalanmadı.
- `src/scene/Airfield.tsx`: dokulu pist, hangar, rüzgâr tulumu, ağaçlar, ufuk tepeleri ve beş renk/rüzgâr teması. Beş saha henüz ayrı coğrafi veriler veya gerçek havaalanları değildir.
- `src/main.tsx`: kamera, hava hızı/irtifa/yatış/burun açısı HUD'u, stall uyarısı, tam ekran ve kullanıcı arayüzü. Pilot kamerası sabit RC pilot görüşü, takip kamerası uçuşu öğrenme görüşü sağlar.
- `supabase/migrations`: ileride giriş ve eğitim kaydı için RLS korumalı şema. Canlı Supabase projesine uygulanmadı; uygulama henüz giriş veya uçuş kaydı yapmaz.

## Sonraki uygulama aşamaları

1. Trainer aerodinamiği ve çarpışmayı ölçümlerle doğrulama; JSBSim gibi referans FDM ile karşılaştırma, rüzgâr türbülansı, hasar ve uçuş tekrarı. [JSBSim kuvvet/moment yaklaşımı](https://jsbsim-team.github.io/jsbsim-reference-manual/user/concepts/forces-and-moments/) incelendi; bu prototipte henüz kullanılmıyor.
2. Kalibrasyon sihirbazı: min/merkez/max örnekleme, USB kumanda profilleri ve kaydedilen ayarların cihaza göre ayrılması.
3. Araç arayüzü ve ayrı dinamik modelleri: planör, akrobasi, multikopter, helikopter. Bu araçlar mevcut MVP'de uçulabilir değildir.
4. Beş ayrı arazi/pist, eğitim görevleri, ilerleme puanı ve erişilebilir arayüz.
5. Supabase Auth ile hesap/ilerleme; şemanın gerçek projede kurulumu ve RLS testleri. Anahtarlar yalnızca ortam değişkenleri ile saklanmalı; service role anahtarı istemciye konmamalı.
6. Colyseus ile ayrı otoriter oda sunucusu, durum senkronizasyonu, hız sınırları ve hile/uyumsuz sürüm önlemleri. Multiplayer henüz yoktur.
7. HTTPS web hosting ve ayrı WebSocket hosting; dağıtım öncesi performans, mobil arayüz, gizlilik ve lisans kontrolleri.

## Lisans ve kaynaklar

Bu depodaki özgün kod MIT lisanslıdır. Paketler ve yerel CC0 sahne dokularının kaynakları [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) dosyasında listelenir. Harici 3D model, ses veya uzaktan yüklenen yazı tipi kullanılmaz. Yeni varlık eklenmeden önce kullanım ve dağıtım izni doğrulanmalıdır.

Ücretsiz Supabase planında aynı kuruluştaki iki etkin proje sınırı nedeniyle FlightSimRC veritabanı henüz oluşturulamadı. Mevcut DendroGeo projeleri etkilenmedi. Bu nedenle hesap, ilerleme ve multiplayer özellikleri etkin değildir.

Teknik kararlar için birincil kaynaklar: [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Colyseus](https://docs.colyseus.io/), [Three.js](https://threejs.org/), [React Three Fiber](https://r3f.docs.pmnd.rs/). Gerçek RC eğitiminin güvenlik ve yerel mevzuat koşulları ayrıca doğrulanmalıdır.
