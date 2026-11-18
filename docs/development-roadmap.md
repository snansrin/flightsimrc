# FlightSimRC geliştirme yol haritası

## Araştırma bulguları

- [World Flight Sim](https://worldflightsim.com/) dünya ölçeğinde arazi, uçak hangarı, eğitim ve görevleri öne çıkarıyor. FlightSimRC'nin odağı RC kumanda eğitimi ve pist çevresindeki düşük irtifa uçuşu olmalı; aynı görsel kapsamı hazır varsaymıyoruz.
- [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API) tarayıcının eksen ve düğmeleri ayrı dizilerde sunduğunu, cihazın ilk kullanıcı hareketinden önce görünmeyebileceğini belirtiyor. RC kumandanın RF kanal sayısı, Gamepad API'de sunulan giriş sayısıyla aynı olmak zorunda değil.
- [RadioLink T12D sürüm notları](https://radiolink.com/en/t12d_firmwares) V2.0.4'te gamepad joystick desteğinin 16 kanala çıktığını bildiriyor. T12D'nin farklı firmware/USB kipleri gerçek cihazda ayrıca ölçülmeli.
- [Supabase Realtime](https://supabase.com/docs/guides/realtime/concepts) public kanala, konu adını bilen herkesin bağlanabildiğini belirtiyor. Şimdiki parola temelli kanal seçimi hafif bir erişim katmanıdır; gerçek yetkilendirme için sunucu ve private kanal politikası gerekir.
- [NASA'nın kaldırma ve sürükleme ilişkileri](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-to-drag-ratio/) ve [JSBSim 6DoF denklemleri](https://jsbsim-team.github.io/jsbsim-reference-manual/formulation/equations-of-motion/) fizik modelinin referanslarıdır. Mevcut katsayılar ölçülmüş bir RC uçağa göre doğrulanmadı.

## Uygulama sırası ve kabul ölçütleri

1. **Kumanda bağlantısı ve kalibrasyon — sürüyor.** Tüm Gamepad aygıtlarını göster; seçilen cihazın bütün eksen ve düğmelerini canlı izle; uçuş kontrollerini her girdiye eşle; fiziksel alt/orta/üst uçlarını ve ters yönü doğru uygula. Test: sanal 7/12/16 giriş, düğme girdisi ve ters uç noktaları. Son kabul: T12D ve en az bir standart joystick ile Windows `joy.cpl` ve tarayıcı yan yana ölçülerek dört ana kontrolün hareketi doğrulanmalı.
2. **Oda deneyimi — bu sürüm.** Hesap girişi olmadan pilot adı, oda kodu, isteğe bağlı şifre, pilot listesi ve kurucu devri. Yanlış şifre bağlı durumuna geçmemeli. Son pilot ayrıldığında Realtime varlığı sıfırlanır; kalıcı oda kaydı yoktur. Gerçek erişim denetimi için sonraki sunucu aşaması gerekir.
3. **Uçuş fiziği.** Bir somut trainer modelinin kütle, kanat alanı, itki, kontrol yüzeyi ve stall hızı verilerini belirle. Kalkış mesafesi, tırmanma, süzülüş, dönüş, stall ve iniş hızını ölçümlere karşı otomatik senaryolarla karşılaştır. Rotor ve jet için ayrı parametreli kuvvet/moment modelleri oluştur; eğitim kolaylaştırmalarını ayrı modda tut.
4. **Görüş, harita ve sahne.** RC pilot yer görüşü, takip, araç üstü görüş ve yakınlaştırma ekle; uçak uzaklığında okunabilirliği ölç. Beş alanın her birine ayrı arazi silueti, pist yerleşimi ve yaklaşma engelleri ver. Harita/3B veri kullanımı için lisans ve bant genişliği bütçesini doğrula; gerçek dünya haritası vaadini bundan sonra değerlendir.
5. **Modeller ve ses.** Lisansı açık, ölçülü glTF modelleri veya ayrıntılı kendi modellerimizi kullan; parçalar, animasyonlar, LOD ve gölgeleri geliştir. Motor/pervane/rotor sesini araç ve devirle eşle. Varlıkların kaynak, lisans ve maliyetini depoda tut.
6. **Üretim çok oyunculu sistemi.** Sunucu tarafından doğrulanan üyelik, parola deneme sınırı, private Realtime veya yetkili oturum sunucusu, kurucu devri, oda kapasitesi ve istemci veri doğrulaması. İki tarayıcı ve gecikmeli ağ koşullarında katılma/ayrılma testleri.

Her aşamanın bitişi için cihaz/tarayıcı testi, otomatik senaryo, görsel inceleme ve yayımlanmış sitede doğrulama kaydı gerekir. Bugünkü otomatik testler gerçek T12D veya aerodinamik doğruluğun kanıtı değildir.
