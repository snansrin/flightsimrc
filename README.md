# FlightSimRC

Tarayıcıda RC uçuş eğitimi için geliştirilen ilk çalışan prototip. React, TypeScript ve React Three Fiber kullanır. Trainer uçak, beş görsel uçuş alanı, klavye/Gamepad girişi, eksen eşleme, HUD, duraklatma ve sıfırlama içerir.

## Yerel çalıştırma

Node.js 22 kullanın. `npm install`, ardından `npm run dev`. Doğrulama için `npm test` ve `npm run build`. Gamepad cihazını USB ile bağlayıp tarayıcı sayfasına odaklanın. W/S gaz; oklar pitch/roll; A/D roll; Q/E rudder. Kumanda ayarlarından 0–7 eksenlerini eşleyin. Her cihazın throttle yönü farklı olabilir; mevcut prototipte −1 tam gazdır. Cihaz desteği tarayıcı ve işletim sistemine bağlıdır.

## Mimari ve mevcut sınırlar

- `src/flight.ts`: 60 Hz sabit adımlı trainer dinamiği; hız, kaldırma, sürükleme, roll, pitch, yaw, yer teması. Bu, eğitime dönük basitleştirilmiş bir modeldir; doğrulanmış gerçek uçuş fiziği değildir.
- `src/input.ts`: Gamepad kanal eşlemesi ve deadzone. Eşleme tarayıcıda saklanır. Kalibrasyon aralığı, kanal tersleme ve cihaz profilleri sonraki aşamadır.
- `src/main.tsx`: sahne, kamera, HUD ve kullanıcı arayüzü. Beş alan şu an farklı renk/rüzgâr konseptidir; gerçek arazi veya pist yerleşimi değildir.
- `supabase/migrations`: ileride giriş ve eğitim kaydı için RLS korumalı şema. Canlı Supabase projesine uygulanmadı; uygulama henüz giriş veya uçuş kaydı yapmaz.

## Sonraki uygulama aşamaları

1. Trainer aerodinamiği ve çarpışmayı ölçümlerle doğrulama; iniş takımı, stall, kumanda yüzeyleri, rüzgâr türbülansı, uçuş tekrarı.
2. Gerçek kalibrasyon sihirbazı: min/merkez/max, tersleme, expo, deadzone, USB kumanda profilleri ve cihaz test ekranı.
3. Araç arayüzü ve ayrı dinamik modelleri: planör, akrobasi, multikopter, helikopter. Bu araçlar mevcut MVP'de uçulabilir değildir.
4. Beş ayrı arazi/pist, eğitim görevleri, ilerleme puanı ve erişilebilir arayüz.
5. Supabase Auth ile hesap/ilerleme; şemanın gerçek projede kurulumu ve RLS testleri. Anahtarlar yalnızca ortam değişkenleri ile saklanmalı; service role anahtarı istemciye konmamalı.
6. Colyseus ile ayrı otoriter oda sunucusu, durum senkronizasyonu, hız sınırları ve hile/uyumsuz sürüm önlemleri. Multiplayer henüz yoktur.
7. HTTPS web hosting ve ayrı WebSocket hosting; dağıtım öncesi performans, mobil arayüz, gizlilik ve lisans kontrolleri.

## Lisans ve kaynaklar

Bu depodaki özgün kod MIT lisanslıdır. Üçüncü taraf paketler kendi lisanslarına tabidir; yayımlamadan önce kilit dosyasından tam bir lisans envanteri çıkarılmalıdır. Harita görüntüsü, 3D model ve ses gibi harici varlıklar kullanılmadı. Google Fonts çevrimiçi yüklenir; çevrimdışı/mahremiyet gereksinimi için yerel barındırma değerlendirilmeli.

Teknik kararlar için birincil kaynaklar: [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Colyseus](https://docs.colyseus.io/), [Three.js](https://threejs.org/), [React Three Fiber](https://r3f.docs.pmnd.rs/). Gerçek RC eğitiminin güvenlik ve yerel mevzuat koşulları ayrıca doğrulanmalıdır.
