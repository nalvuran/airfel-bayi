// src/utils/kvkk.js
// Aydınlatma metni: settings/kvkk { text, version }. Kullanıcının onayı users/{uid}.kvkkVersion ve kvkkAcceptedAt.
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logActivity } from './activity';

const REF = () => doc(db, 'settings', 'kvkk');

export async function loadKvkk() {
  const s = await getDoc(REF());
  return s.exists() ? s.data() : null;
}

export async function publishKvkk({ text, by }) {
  const cur = await loadKvkk().catch(() => null);
  const version = (cur?.version || 0) + 1;
  await setDoc(REF(), { text, version, updatedAt: serverTimestamp(), updatedBy: by });
  return version;
}

export async function acceptKvkk(uid, version) {
  await updateDoc(doc(db, 'users', uid), { kvkkVersion: version, kvkkAcceptedAt: serverTimestamp() });
  logActivity('kvkk.accept', { detail: `Sürüm ${version}` });
}

// Taslak: hukuk biriminin gözden geçirmesi ve köşeli parantezlerin doldurulması gerekir
export const KVKK_DRAFT = `KİŞİSEL VERİLERİN İŞLENMESİNE İLİŞKİN AYDINLATMA METNİ
Segment Bayi Takip Uygulaması Kullanıcıları İçin

Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun ("KVKK") 10. maddesi uyarınca, veri sorumlusu sıfatıyla [ŞİRKET UNVANI] ("Şirket") tarafından, Segment uygulamasını kullanan çalışanlarımızı bilgilendirmek amacıyla hazırlanmıştır.

1. İşlenen kişisel veriler
- Kimlik ve iletişim bilgileri: ad, soyad, şirket e-posta adresi, görev ve bağlı olunan yönetici
- Görsel veriler: profil fotoğrafı ve saha ziyaretlerinde çekilen fotoğraflar
- Konum verileri: yalnızca saha kaydı girilirken veya bayi konumu kaydedilirken, kullanıcının işlemi sırasında alınan konum
- Uygulama kullanım verileri: giriş zamanları, uygulamanın kullanıldığı günler, uygulama içinde görüntülenen sayfalar ve yapılan işlemlerin kayıtları (kayıt girme, düzenleme, talep, not, dışa aktarma ve benzeri işlemler; işlemi yapan kişi ve zamanı)
- Uygulamaya girilen iş içerikleri: bayi ziyaret kayıtları, notlar, talepler, pano paylaşımları

2. İşleme amaçları
Saha satış faaliyetlerinin planlanması, yürütülmesi ve raporlanması; bayi ilişkilerinin yönetimi; iş süreçlerinin denetimi, bilgi güvenliğinin sağlanması ve kayıtların doğruluğunun ve izlenebilirliğinin temini; yetkisiz işlemlerin önlenmesi; hukuki yükümlülüklerin yerine getirilmesi.

3. Hukuki sebepler
Kişisel verileriniz, KVKK'nın 5/2 maddesinde yer alan; iş sözleşmesinin kurulması veya ifasıyla doğrudan ilgili olması (c), veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi (ç) ve temel hak ve özgürlüklerinize zarar vermemek kaydıyla Şirket'in meşru menfaatleri (f) hukuki sebeplerine dayanılarak işlenmektedir.

4. Aktarım
Uygulama altyapısı, hizmet sağlayıcılar Google (Firebase) ve Cloudflare tarafından sağlanmakta olup verileriniz bu sağlayıcıların yurt dışında bulunan sunucularında saklanabilir. Bu aktarım KVKK'nın 9. maddesine uygun olarak gerçekleştirilir. Verileriniz ayrıca yetkili kamu kurum ve kuruluşlarına, yalnızca hukuki yükümlülükler kapsamında aktarılabilir.

5. Saklama süresi
Uygulama içi işlem kayıtları 30 gün, kullanım günleri 60 gün saklanır. Diğer veriler, işleme amacının gerektirdiği süre ve ilgili mevzuatta öngörülen süreler boyunca saklanır ve sonrasında silinir, yok edilir veya anonim hale getirilir.

6. Haklarınız
KVKK'nın 11. maddesi uyarınca; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini, şartları oluştuğunda silinmesini veya yok edilmesini isteme, bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz. Başvurularınızı [BAŞVURU ADRESİ / E-POSTA] üzerinden iletebilirsiniz.`;
