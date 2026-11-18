# FlightSimRC

**Tarayıcıda RC uçuş pratiği ve birlikte serbest uçuş.**

**Canlı site:** https://snansrin.github.io/flightsimrc/

FlightSimRC; model uçak, drone, helikopter ve EDF jet kontrolünü öğrenmek için geliştirilen açık kaynaklı bir web simülatörüdür. Klavye veya tarayıcının tanıdığı USB kumandayla uçabilir, kumanda eksenlerini eşleyip kalibre edebilir, pist ve rüzgâr koşullarını seçebilir, aynı oda koduyla arkadaşlarınızın araçlarını canlı sahnede görebilirsiniz. Proje hâlâ gelişmektedir: uçuş katsayıları gerçek araç ölçümleriyle doğrulanmış değildir ve çok oyunculu sürüm serbest uçuş içindir.

## Hemen dene

1. [FlightSimRC'yi aç](https://snansrin.github.io/flightsimrc/).
2. Trainer 1500 ve Anadolu Eğitim Pisti ile başla. Klavyede **W/S gaz**, **yön tuşları ve A/D yatış**, **yukarı/aşağı burun**, **Q/E dümen**.
3. USB RC kumandanı veya joystick'ini tak. **Kumanda ayarları** bütün bağlı cihazları ve her birinin eksen/düğme sayısını gösterir; otomatik seçimde ilk görünen cihaz kullanılır. Birden fazla cihaz bağlıysa listeden istediğini seç. Kanal paneli seçilen cihazın tarayıcıya sunduğu girdi sayısı kadar açılır; sabit 12 kanal sınırı yoktur. Her kanal için **Ekseni bul/Kanalı bul** düğmesine basıp ilgili kolu veya anahtarı hareket ettir; ardından min/orta/maks değerlerini kaydet. Gaz sıfırdayken **Kumandayı etkinleştir**. İlk dört kanal uçuşa bağlıdır; ek kanallar şimdilik izleme ve cihaz profili içindir.
4. Arkadaşınla uçmak için **Çok oyunculu** panelinde pilot adını yaz, istersen en az 8 karakterlik oda şifresi belirle ve **Yeni oda oluştur**. Davet bağlantısını paylaş; şifre koyduysan onu ayrıca ilet. Diğer pilot aynı kod ve şifreyle katılır. Pilot adları ve kurucu odada listelenir. Oda en fazla dört pilot içindir.

### RadioLink T12D görünmüyorsa

T12D'nin bilgisayarda oyun kumandası olarak görünmesi gerekir. [RadioLink'in T12D kılavuzu](https://radiolink.com/en/t12d_manual), dahili simülatör işlevi için uygun firmware gerektiğini söylüyor; [üreticinin SSS sayfası](https://www.radiolink.com/en/t12d_faq) Type-C ile dahili simülatör veya dongle kullanımını anlatıyor. Veri taşıyan USB-C kablosu ve üreticinin simülatör kipini kullan. Windows'ta **Win+R → joy.cpl** ile kumandanın ve hareket eden eksenlerin görünüp görünmediğini kontrol et. Windows'ta hiç oyun kumandası olarak görünmeyen bir cihazı web sayfası Gamepad API üzerinden otomatik tanıyamaz. Cihaz görünüyorsa sayfayı odaklayıp kumandada bir düğmeye bas veya kolu oynat; ardından ayarlarda **Cihazları yeniden tara**. Birden fazla joystick bağlıysa listeden T12D'yi seç.

Tarayıcı bir kumandanın yalnızca işletim sisteminin ve Gamepad API'nin sunduğu eksen/düğmelerini okuyabilir. 12 RF kanalının tarayıcıda otomatik olarak 12 eksen olarak çıkacağı garanti değildir. [RadioLink'in resmi T12D firmware notlarına](https://radiolink.com/en/t12d_firmwares) göre V2.0.4 sürümünde gamepad joystick 16 kanala genişletildi. Kumandadaki sürümü kontrol et; güncelleme gerekiyorsa üreticinin modeline uygun resmi yönergesini ve yedekleme adımlarını izle. Site firmware'i değiştirmez. T12D'nin farklı firmware ve bağlantı kipleri gerçek donanımla henüz uçtan uca doğrulanmadı.

## Neler çalışıyor?

| Alan | Mevcut durum |
| --- | --- |
| Uçuş | 60 Hz sabit adımlı trainer/jet kuvvet modeli; ayrı stabilize drone ve helikopter davranışı; stall, rüzgâr ve yer teması |
| Görsel | Kodla oluşturulmuş dört araç, dokulu pist, hangar, HDR gökyüzü, HUD, takip ve sabit pilot kamerası |
| Kumanda | Gamepad API, cihaz seçimi, cihaz bazlı profil, eksen eşleme, tersleme, ölü bölge, expo, min/orta/maks kalibrasyonu, sıfır gaz güvenlik adımı |
| Canlı oda | Supabase Realtime ile oda kodu, isteğe bağlı şifre, pilot adı/listesi, yaklaşık 5 Hz konum paylaşımı ve diğer araçların sahnede gösterimi |
| Yayın | Her `main` güncellemesinde GitHub Actions test/derleme ve GitHub Pages yayını |

Beş uçuş alanı şu an farklı hava/renk temalarıdır; beş ayrı gerçek coğrafi saha değildir. Oda şifresi tarayıcıda PBKDF2 ile kanal adına dönüştürülür; şifre sunucuya açık metin olarak gönderilmez veya bağlantıya eklenmez. Supabase Realtime kanalları teknik olarak herkese açıktır: doğru kanal adını bilen biri erişebilir. Şifresiz odada kodu bilen herkes bağlanabilir. Bu, sunucu tarafında doğrulanan bir hesap/oda erişim sistemi değildir; güçlü bir oda şifresi kullan. Pilot adları doğrulanmış kimlik değildir. Bu serbest uçuş sürümünde yetkili sunucu, çarpışma mutabakatı, yarış hakemliği ve hile önleme yoktur.

## Yerel geliştirme

Node.js 22 ile `npm ci`, ardından `npm run dev`. `.env.example` dosyasını `.env.local` olarak kopyalayıp Supabase proje URL'si ve **publishable** anahtarını gir. Gizli/secret anahtarı tarayıcı koduna koyma. Testler: `npm test`; üretim derlemesi: `npm run build`.

Kodun ana parçaları: [uçuş fiziği](src/flight.ts), [araç dinamikleri](src/vehicles.ts), [kumanda girişi](src/input.ts), [çok oyunculu iletişim](src/multiplayer.ts), [3B sahne](src/scene), [arayüz](src/main.tsx), [RLS şeması](supabase/migrations/0001_initial.sql). [Uçuş modelinin dayanakları ve sınırları](docs/flight-model.md) ile [adım adım geliştirme yol haritası](docs/development-roadmap.md) ayrıca belgelenmiştir.

## Geliştirme doğrulaması ve sınırlar

Otomatik testler kalkış, süzülme, stall, dönüş toparlanması, iniş, girdi dönüşümü ve ağ paketi doğrulamasını kapsar. Gerçek T12D, model uçak ve ağ gecikmesiyle uçtan uca kullanım ayrıca ölçülmelidir. Fizik katsayıları üretici verisi değildir; eğitim sonucunu resmî pilot sertifikası olarak sunmuyoruz.

Öncelikli sonraki işler: somut RC trainer verisiyle fizik kalibrasyonu; T12D ve diğer kumandalarla donanım testleri; beş ayrı saha; görev/puanlama ve uçuş analizi; yetkili Colyseus sunucusuyla daha tutarlı ve güvenli çok oyunculu oturumlar.

## Lisans ve kaynaklar

Özgün kod [MIT lisanslıdır](LICENSE). Dokuların, gökyüzünün ve paketlerin kaynakları [üçüncü taraf bildirimlerinde](THIRD_PARTY_NOTICES.md) listelenir. Realtime ve Gamepad uygulaması için [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Presence](https://supabase.com/docs/guides/realtime/presence) ve [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API) belgeleri temel alınmıştır.

Arama motorları için site başlığı, açıklaması, canonical adresi ve [site haritası](https://snansrin.github.io/flightsimrc/sitemap.xml) eklenmiştir. Bu, Google'da görünmeyi garanti etmez; indeksleme Google'ın tarama ve değerlendirmesine bağlıdır.
