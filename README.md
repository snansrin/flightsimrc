# FlightSimRC

Tarayıcıda RC uçuş eğitimi için geliştirilen prototip. React, TypeScript ve React Three Fiber kullanır. Pervaneli trainer, EDF jet, dört rotorlu drone ve RC helikopter için seçilebilir özgün sahne modelleri ve ayrı eğitim dinamikleri; pist çevresi, beş hava sahası teması, isteğe bağlı sentezlenmiş motor sesi, klavye/Gamepad girişi, eksen eşleme, HUD, takip/pilot kamerası, duraklatma ve sıfırlama içerir.

## Yerel çalıştırma

Node.js 22 kullanın. `npm install`, ardından `npm run dev`. Supabase bağlantısı için `.env.example` dosyasını `.env.local` olarak kopyalayıp yalnızca proje URL'sini ve publishable anahtarı girin. Doğrulama için `npm test` ve `npm run build`. Gamepad cihazını USB ile bağlayıp tarayıcı sayfasına odaklanın. W/S gaz; oklar pitch/roll; A/D roll; Q/E rudder. Kumanda ayarlarından 0–7 eksenlerini eşleyin. Her cihazın throttle yönü farklı olabilir; mevcut prototipte −1 tam gazdır. Cihaz desteği tarayıcı ve işletim sistemine bağlıdır.

## Mimari ve mevcut sınırlar

- `src/flight.ts`: 60 Hz sabit adımlı trainer dinamiği; hava hızına bağlı kaldırma/sürükleme, yan rüzgâr, stall, açısal hız, yatışa bağlı dönüş, yan kayma ve yer teması. Hız vektörü dönüşte aniden döndürülmez. Katsayılar uçuş testiyle doğrulanmadı; tam 6DoF fizik iddiası yoktur.
- `src/vehicles.ts`: jet için farklı itki/kaldırma/stall profili; drone ve helikopter için ayrı, stabilize edilmiş hover ve yönelim tepkisi. Bunlar uçuş eğitimi prototipleridir; gerçek rotor, EDF, motor veya ESC performansıyla kalibre edilmemiştir.
- `src/audio.ts`: kullanıcı ses düğmesine bastığında başlayan Web Audio motor/rotor/EDF sentezi. Sesler gerçek motor kayıtları veya akustik ölçüm değildir.
- `src/input.ts`: Gamepad kanal eşlemesi, kanal tersleme, ölü bölge, expo ve ölçülen min/orta/maks değerlerine göre eksen normalizasyonu. Profiller cihaz kimliğine göre bu tarayıcıda saklanır. Gerçek kumandalarla uyumluluk ve kalibrasyon doğrulaması henüz yapılmadı.
- `src/scene/Trainer.tsx`: özgün kodla oluşturulmuş trainer geometrisi, kanat oranları, iniş takımı ve hareketli kontrol yüzeyleri. [Apprentice STS kılavuzundaki](https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL3700-Manual-EN.pdf) 1500 mm kanat açıklığı / 1080 mm gövde uzunluğu sınıfı referans alındı; marka modeli veya çizimi kopyalanmadı.
- `src/scene/Vehicles.tsx`: özgün kodla oluşturulmuş quad, helikopter ve EDF jet görselleri; hareketli rotorlar. Ayrıntılı lisanslı 3D modeller ve gerçek materyal/livery çalışması sonraki aşamadır.
- `src/scene/Airfield.tsx`: dokulu pist, hangar, rüzgâr tulumu, ağaçlar, ufuk tepeleri ve beş renk/rüzgâr teması. Beş saha henüz ayrı coğrafi veriler veya gerçek havaalanları değildir.
- `src/main.tsx`: kamera, hava hızı/irtifa/yatış/burun açısı HUD'u, stall uyarısı, tam ekran ve kullanıcı arayüzü. Pilot kamerası sabit RC pilot görüşü, takip kamerası uçuşu öğrenme görüşü sağlar.
- `src/cloud.ts`: Supabase bağlantısı; istemcide yalnızca publishable anahtar kullanılır. E-posta bağlantısıyla giriş ve kullanıcının açıkça seçtiği uçuşu kaydetme akışı `src/main.tsx` içindedir. Uçuş sırasında sürekli veritabanı yazımı yapılmaz.
- `supabase/migrations`: profil ve eğitim uçuşları için RLS korumalı şema. FlightSimRC projesinde tablolar ve politikalar kurulmuş, iki tabloda da RLS açık olduğu kontrol edilmiştir.

## Sonraki uygulama aşamaları

1. Trainer aerodinamiği ve çarpışmayı ölçümlerle doğrulama; JSBSim gibi referans FDM ile karşılaştırma, rüzgâr türbülansı, hasar ve uçuş tekrarı. [JSBSim kuvvet/moment yaklaşımı](https://jsbsim-team.github.io/jsbsim-reference-manual/user/concepts/forces-and-moments/) incelendi; bu prototipte henüz kullanılmıyor.
2. Gerçek USB kumandalarla kalibrasyonun uçtan uca doğrulanması; otomatik eksen algılama, birden fazla aynı model cihaz ayrımı ve daha yönlendirmeli kalibrasyon akışı.
3. Trainer, jet, drone ve helikopteri gerçek üretici/ölçüm verileriyle kalibre etme; helikopter collective/cyclic/rotor dinamiği, multikopter ESC/motor ve jet EDF gecikmesi. Planör ve akrobasi uçağı sonraki araçlardır.
4. Beş ayrı arazi/pist, eğitim görevleri, ilerleme puanı ve erişilebilir arayüz.
5. E-posta giriş akışını gerçek bir pilot hesabıyla uçtan uca doğrulama; görev ilerlemesi ve uçuş geçmişi ekranı. Service role veya secret anahtarı istemciye konmamalı.
6. Colyseus ile ayrı otoriter oda sunucusu, durum senkronizasyonu, hız sınırları ve hile/uyumsuz sürüm önlemleri. Multiplayer henüz yoktur.
7. Ayrı WebSocket hosting; dağıtım sonrası performans, mobil arayüz, gizlilik ve lisans kontrolleri.

## Lisans ve kaynaklar

Bu depodaki özgün kod MIT lisanslıdır. Paketler ve yerel CC0 sahne dokularının kaynakları [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) dosyasında listelenir. Harici 3D model, ses veya uzaktan yüklenen yazı tipi kullanılmaz. Yeni varlık eklenmeden önce kullanım ve dağıtım izni doğrulanmalıdır.

Ücretsiz Supabase projesi ayrı FlightSimRC kuruluşunda oluşturuldu. Proje bölgesi Singapur'dur; Türkiye kullanıcıları için gecikme ölçülmeli. GitHub Pages ana yayın adresi `https://snansrin.github.io/flightsimrc/` olacaktır. GitHub Actions için `VITE_SUPABASE_URL` ve `VITE_SUPABASE_PUBLISHABLE_KEY` adlı depo değişkenleri ayarlanmıştır. E-posta girişini kullanıcı hesabıyla canlıda denemeden tamamlanmış saymayın.

Teknik kararlar için birincil kaynaklar: [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Colyseus](https://docs.colyseus.io/), [Three.js](https://threejs.org/), [React Three Fiber](https://r3f.docs.pmnd.rs/). Gerçek RC eğitiminin güvenlik ve yerel mevzuat koşulları ayrıca doğrulanmalıdır.
