# Kurtarılan fizik motoru — doğrulama ve entegrasyon durumu

Bu rapor, kullanıcının `workspace (2).tar.gz` arşivi ile `main` dalının karşılaştırılmasından üretilmiştir. Arşivdeki deneysel fizik motoru henüz canlı arayüzde kullanılmıyor.

## Arşivde bulunan ve GitHub main'de olmayan dosyalar

- `src/sim/aero.ts`, `atmosphere.ts`, `catalog.ts`, `fields.ts`, `math.ts`
- `src/sim/rigidBody.ts`, `rotor.ts`, `simulation.ts`, `types.ts`, `verify.ts`
- `src/sim/physics.test.ts`, `debug.test.ts`
- `docs/gelistirme-plani.md`

Bunların tamamının repoya taşındığı **iddia edilmez**: yalnızca bu rapor, bu geliştirme dalına ilk güvenli kayıt olarak eklendi. Kaynak arşiv ayrıca yerel çalışma alanında muhafaza edildi.

## Yapılan kontroller

- GitHub `main` başı (inceleme sırasında): `0a7ec62a3a656928f161f8f0a356eed3b04a8e52`.
- Arşivdeki mevcut site dosyalarının çoğu aynı Git blob SHA'larına sahip; `package-lock.json` farklı.
- Yeni `src/sim` modülleri, test dosyaları hariç, küresel `tsc` ile **strict TypeScript derlemesinden geçti**.
- `npm ci --offline` başarısız oldu: `zustand-5.1.0.tgz` yerel önbellekte yok. Bu nedenle uygulamanın tam `npm test` ve `npm run build` kontrolleri yapılmadı.
- Test harness derlenip Node üzerinde doğrudan çalıştırıldı: trainer1500 senaryoları 8'de 7 başarılı; extra330 8'de 5; edf90 8'de 5; glider2000 8'de 7. quad5 ve heli500 hover kontrolleri başarısız; cinedrone hover kontrolü de başarısız.
- Stall hızı ölçüm doğrulaması dört sabit kanatlı modelin tamamında başarısız. Bu durum fizik motorunun doğru stall davranışı üretmediğini tek başına ispatlamaz; doğrulama senaryolarının da gözden geçirilmesi gerekir.
- `src/main.tsx` eski `flight.ts` ve `vehicles.ts` modüllerini kullanıyor; yeni `src/sim/simulation.ts` henüz bağlanmamış.

## Öncelikli sıradaki işler

1. Arşivdeki 13 yeni dosyayı eksiksiz olarak bu dala aktar; ana dalı zorla güncelleme.
2. `npm ci`, `npm test`, `npm run build` ile CI doğrulaması yap.
3. Hover, stall, EDF inişi ve Extra330 trim/tırmanma senaryolarındaki sorunları ölçerek düzelt.
4. Yeni fizik motoruna kontrollü bir adaptör ekle; mevcut kullanıcı arayüzü, joystick ve oda akışını koru.
5. Gerçek kumanda/RC model ölçümleri ile uçuş karakteristiğini kalibre et.
6. Bütün senaryolar doğrulanmadan üretim `main` dalına birleştirme.

Not: Bu çalışma kurtarılmış bir deneysel modülün **ilk incelemesidir**, üretim kalitesinde veya gerçek RC modeliyle doğrulanmış uçuş fiziği değildir.
