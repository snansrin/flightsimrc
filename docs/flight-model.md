# FlightSimRC uçuş modeli ve doğrulama durumu

## Mevcut model

Trainer ve EDF, dünya koordinatlarında hız ve konum entegre eder. Uçağın burnu döndüğünde hız vektörü yapay olarak döndürülmez. Hava hızı, dünya hızından rüzgâr hızını çıkararak hesaplanır. Kaldırma ve sürükleme hava hızının karesiyle ölçeklenir; kaldırma açısı hücum açısına bağlıdır ve stall eşiği sonrasında keskin sıçrama yerine kademeli düşer. Yatışın kaldırma yönüne etkisi, sönümlü roll/pitch/yaw hızları, pistte yuvarlanma ve yan lastik tutuşu modellenir. 60 Hz sabit simülasyon adımı kullanılır.

Bu yaklaşım [NASA'nın kaldırma/sürükleme denklemleri](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-to-drag-ratio/) ve [JSBSim'in kuvvet/moment ayrımı](https://jsbsim-team.github.io/jsbsim-reference-manual/user/concepts/forces-and-moments/) ile aynı fiziksel ilişkileri temel alır. Ancak katsayılar üretici ölçümleri değildir; bu çekirdek sertifikalı veya ölçümle doğrulanmış 6DoF model değildir. Helikopter ve drone hâlâ stabilize edilmiş eğitim yaklaşımlarıdır.

## Otomatik senaryolar

- Gazsız pistte sabit kalma; gazla hızlanma ve elevator ile kalkış.
- Motorsuz ileri süzülme ve irtifa kaybı.
- Düşük hızda stall ve kaldırma kaybı.
- Yatıştan sonra stick bırakıldığında kanatların toparlanması.
- Yön değişiminde hızın aniden yön değiştirmemesi; yan rüzgârda hızın sıçramaması.
- Uzun nötr uçuşta sayısal değerlerin sonlu ve hızın makul sınırda kalması.

## Gerçek RC eşlemesi için gereken ölçümler

Her somut model için kütle, ağırlık merkezi, kanat alanı/profili, kontrol yüzeyi hareketi, itki eğrisi, stall hızı ve pil/ESC tepkisi gerekir. Sonra gerçek veya güvenilir referans uçuşundan kalkış mesafesi, tırmanma, süzülüş oranı, sabit dönüş, stall ve iniş hızı ölçülerek parametreler ayarlanmalıdır. Gerçek kumanda kanalları da cihaz üzerinde doğrulanmalıdır. Bu ölçümler olmadan “gerçek uçuşla aynı” iddiası yapılmamalıdır.

JSBSim'in [hareket denklemleri](https://jsbsim-team.github.io/jsbsim-reference-manual/formulation/equations-of-motion/) tam 6DoF referansı sağlar. FlightSimRC'nin sonraki fizik aşaması, ölçülmüş bir trainer modeliyle bu referansa karşı karşılaştırmalı senaryolar kurmaktır.
