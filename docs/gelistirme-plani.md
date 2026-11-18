# FlightSimRC — derin geliştirme planı (v2)

Bu plan, `worldflightsim.com` incelemesi + RC uçuş dinamiği literatürü + tarayıcı cihaz API'leri
araştırmasına dayanır. Her adımın **kabul ölçütü** vardır; ölçüt geçmeden adım "bitti" sayılmaz.

## 1. Araştırma bulguları

### 1.1 Rakip: World Flight Sim (worldflightsim.com)
Siteden doğrudan okunan yapı:
- **Dünya ölçeği**: Google Earth / Photorealistic 3D Tiles ile gerçek şehirler, dağlar, kıyılar. "Fly anywhere on Earth".
- **Uçuş Okulu**: zorunlu *First Flight* (pitch/bank/throttle), *Views & Photo Mode*, *Ring Run Basics*, *Landing Basics* (stabilize yaklaşma, flap, touchdown, rollout). Dersler 2–4 dk, etiketli beceriler.
- **Ring Runs**: ışıklı kapılardan geçen zamanlı parkurlar, kişisel en iyi + liderlik tablosu.
- **Challenges**: baştan sona ATC yönlendirmeli uçuş planları.
- **Career**: rütbe, başarımlar, logbook, uçak kilitleri.
- **Hangar**: her uçak için performans kartı (hız, motor, tavan) ve 3B önizleme.
- **Stability Assist**: Auto-Level, Bank Resistance, Bank Limit, Stall Protection, Wind Effects — hepsi kapatılınca "ACRO".
- **Joystick config**: canlı eksen değerleri, deadzone, invert, bind. **Ama joystick + gelişmiş ayarlar ücretli (Aviator)**.
- Gelir modeli: abonelik ($2.95 / $8.95 / $14.95), ücretsiz planda tek uçak + tek ders.

**Bizim konumlanmamız**: RC (model uçak / drone / heli / EDF) uçuşu + **tamamen ücretsiz, açık kaynak,
kumanda kalibrasyonu ve eğitim katmanı açık**. Rakibin paralı yaptığı joystick/eğitim tarafını biz çekirdekte veriyoruz.
Rakibin güçlü olduğu taraf gerçek dünya görüntüsü; buna kademeli (offline → gerçek yükseklik verisi → isteğe bağlı Google 3D) geçiyoruz.

### 1.2 Uçuş fiziği referansları
- **Selig, "Modeling Full-Envelope Aerodynamics of Small UAVs in Realtime" (AIAA 2010-7635, UIUC)** — FS One simülatörünün temeli. RC uçaklarda klasik kararlılık türevi yaklaşımı **çalışmaz**: %50 chord kontrol yüzeyi, ±50° sapma, 2:1 itki/ağırlık. Önerilen yöntem: **bileşen bazlı (component buildup)** kuvvet/moment, ±180° α ve β, düz levha (flat plate) post-stall harmanı, güçlü pervane arkası (propwash) etkisi.
- **SAE Aero Design — "Estimating R/C Model Aerodynamics and Performance"**: RC ölçeğinde kaldırma eğrisi, 3B stall açısı (~11.5°), statik itki tahmini.
- **JSBSim 6DoF hareket denklemleri**: gövde eksenleri (+x burun, +y sağ kanat, +z aşağı), quaternion tutum, I⁻¹(M − ω×Iω).
- Düşük Reynolds (Re 50k–300k) kanat davranışı: laminar ayrılma, yumuşak stall, düşük CLmax → RC trainer stall hızı ve süzülüş oranı buna göre.

### 1.3 Kumanda / joystick
- **Gamepad API (MDN)**: cihaz ilk kullanıcı hareketinden önce listelenmeyebilir; eksen/düğme sayıları OS sürücüsünün sunduğu kadardır. RF kanal sayısı = tarayıcıdaki eksen sayısı **değildir**.
- **WebHID (Chrome for Developers)**: `navigator.hid.requestDevice()` + `collections[].reportDescriptor` ile cihazın **kendi HID rapor tanımlayıcısı** okunabilir. Tanımlayıcıda Generic Desktop usage'ları (X, Y, Z, Rx, Ry, Rz, Slider, Dial, Hat) ve bit konumları vardır → **markaya özel tablo olmadan** kanal anlamı çözülebilir. Gamepad API'de görünmeyen kumandalar için tek genel yol budur. İlk izin kullanıcı jesti ister (tarayıcı güvenliği, atlanamaz); sonra `getDevices()` ile **sessiz otomatik yeniden bağlanma** olur.
- Sonuç: iki taşıyıcı (Gamepad + WebHID) + **otomatik eşleme/otomatik kalibrasyon** + tanı raporu.

### 1.4 Harita / arazi
- Google Photorealistic 3D Tiles: `3d-tiles-renderer` (NASA-AMMOS) ile three.js'te çalışır, **kendi Map Tiles API anahtarı** gerekir (ücretli/kotalı). İsteğe bağlı katman olarak planlanır.
- Anahtarsız gerçek coğrafya: **AWS Terrain Tiles (Terrarium)** açık veri yükseklik karoları + OSM/Nominatim yer arama (atıf zorunlu). Gerçek dağ/kıyı geometrisi, görüntü dokusu olmadan.

## 2. Mimari kararlar
1. Fizik **gövde eksenli, quaternion, RK4, 240 Hz** sabit adım; render ile ayrık.
2. Uçak = **veri** (kanat/tail/gövde bileşenleri, atalet, motor, pervane, iniş takımı). Yeni uçak eklemek = katalog kaydı.
3. Kumanda = **taşıyıcı → normalize girdi → otomatik eşleme → kalibrasyon → kontrol**. Marka adı koda girmez.
4. Eğitim = **ders tanımı + canlı değerlendirici + uçuş kaydedici + debrief**. Puanlama ölçülebilir eşiklerden.
5. Görsel = parametrik **NACA kanat kesitli** modeller + LOD arazi + shader arazi karışımı.
6. Ağ = oda yaşam döngüsü presence'a bağlı, şifre **AES-GCM ile gerçek doğrulama** (yanlış şifre paketi çözemez).

## 3. Adım adım uygulama ve kabul ölçütleri

| # | Adım | İçerik | Kabul ölçütü |
|---|------|--------|--------------|
| 1 | **Çekirdek fizik** | 6DoF RK4, bileşen bazlı aero, post-stall, propwash, P-faktörü, jiroskopik moment, yer etkisi, tekerlek/skid teması | Trim, stall hızı `√(2W/ρS·CLmax)` ±%10, L/D hedef ±%15, koordineli dönüş `g·tanφ/V` ±%10, kalkış mesafesi ve iniş ölçümleri rapora yazılır |
| 2 | **Uçak çeşitliliği** | 7 sabit kanat + 2 multirotor + heli (11 araç), gerçekçi RC kütle/kanat/itki verileri | Her araç için otomatik senaryo: kalkış/süzülüş/dönüş/hover geçmeli |
| 3 | **Evrensel kumanda** | Gamepad + WebHID tanımlayıcı ayrıştırıcı, otomatik eşleme, otomatik kalibrasyon, sanal cihaz自检, tanı raporu | Sentetik HID tanımlayıcı testleri (8/12/16 eksen, hat switch, report ID), otomatik eşleme doğruluğu, gaz ucu tespiti, ters eksen tespiti |
| 4 | **Eğitim simülatörü** | 12+ ders, canlı hedef değerlendirme, hoca ipuçları, puan, uçuş kaydı + debrief grafikleri, ring run parkuru | Her dersin değerlendiricisi için birim testi (geçen/kalan senaryo) |
| 5 | **Görsel + görüş** | NACA kesitli detaylı modeller, hareketli kontrol yüzeyleri, pervane bulanıklığı, LOD arazi + splat shader, 6 kamera, HUD + minimap | 60 FPS hedefi, üretim derlemesi, sahnede kontrol yüzeyi animasyonu |
| 6 | **Harita** | 8 saha + gerçek yükseklik karolarıyla "dünya" modu, yer arama | Saha başına pist geometrisi, dünya modunda yüklenen karo sayısı ve yükseklik doğrulaması |
| 7 | **Oda** | Şifre AES-GCM doğrulama, presence ile otomatik kapanma, kurucu devri, 8 pilot, isim etiketleri, interpolasyon | Yanlış şifre reddi, son pilot çıkınca odaya girilememesi, kurucu devri testleri |
| 8 | **Yayın + doğrulama** | Test/derleme/CI, canlı önizleme, ölçüm raporu, git paketleme | `npm test` + `npm run build` yeşil, ölçüm tablosu docs'ta |

## 4. Dürüst sınırlar
- Fizik katsayıları literatür tabanlı **mühendislik tahminidir**; gerçek bir RC uçakla uçuş testi yapılmadı. Ölçüm tablosu analitik hedeflere göre doğrulamadır, üretici verisi değildir.
- WebHID yalnızca Chromium tarayıcılarda ve güvenli bağlamda çalışır; ilk cihaz seçimi kullanıcı jesti gerektirir.
- Oda şifresi paket şifreleme ile doğrulanır; yine de yetkili sunucu/hile önleme yoktur.
- Bu simülatör eğitim amaçlıdır, resmî pilot lisansı yerine geçmez.
