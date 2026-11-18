# FlightSimRC kurtarılan fizik motoru denetimi

- `src/sim/` içinde yeni 6DoF uçuş fiziği motoru, ortam, katalog, uçuş alanları ve doğrulama kodları mevcut.
- `src/main.tsx` hâlen eski `flight.ts` ve `vehicles.ts` kodlarını çağırıyor. Yeni motor uygulamaya bağlanmadı.
- `tsc --strict` ile test dışı `src/sim/` modülleri kontrol edildi ve hatasız derlendi.
- Doğrudan Node doğrulamasında trainer1500 için 7/8, extra330 için 5/8, edf90 için 5/8, glider2000 için 7/8 senaryo başarılı.
- Quad, sinema drone'u ve helikopter hover kontrolleri başarısız. Stall hızları da doğrulama ölçütlerini sağlamıyor.
- Offline `npm ci` için `zustand-5.1.0.tgz` eksik olduğundan tam `npm test` / `npm run build` henüz koşulamadı.
- Önce fizik testleri düzeltilecek, ardından eski arayüze adaptör ile güvenle entegre edilecek.

GitHub'daki `feat/physics-engine-wip` dalına bulgu raporu gönderildi; 13 yeni kaynak dosyanın tamamı henüz GitHub'a aktarılmadı. Bu arşiv söz konusu kaynak dosyaların tamamını içerir.


## Sonraki geliştirme (2026-11-19)

- `src/sim/bridge.ts`, `src/main.tsx`: aktif görünüm, kumanda ve multiplayer uçuş durumunu 240 Hz fizik motoruna bağlar; eski gövde simülasyonu artık ana uçuş döngüsünde kullanılmaz.
- `src/sim/rotor.ts`: drone loiter pitch dönüşüm işareti düzeltildi; helikopter için kuyruk rotorunun yan kuvvetine karşı ana rotor diski trim dengesi eklendi.
- `src/sim/verify.ts` ve `physics.test.ts`: rotor hover ölçümleri doğru uçuş kipi, dengeli kolektif ve hücum açısı koşullarına göre revize edildi.
- `src/sim/bridge.test.ts`: model/pist seçimleri ve görüntü dönüşümü için regresyon testleri eklendi.
- Yerel TypeScript derlemesi (fizik ve adaptör) geçti, fakat tam Vite build ve Vitest CI üzerinde ayrıca doğrulanmalıdır.
- Uçak performans kataloğu gerçek uçuş verisiyle kalibre edilmemiştir; ölçüm raporunda kalan başarısız senaryolar geçerli uyarılardır.
