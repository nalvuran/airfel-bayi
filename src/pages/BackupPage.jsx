// src/pages/BackupPage.jsx — sadece sahip
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BACKUP_DUE_DAYS, BACKUP_STEPS, runBackup, useLastBackup, useLastPhotoBackup } from '../utils/backup';
import { Alert, Card, PageHeader, fmtNum } from '../components/ui';

const fmtDate = (d) => (d ? d.toLocaleDateString('tr-TR') : '');
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

function Choice({ name, value, current, onChange, title, desc, disabled }) {
  const active = value === current;
  return (
    <label className={`choice ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}>
      <input type="radio" name={name} value={value} checked={active} disabled={disabled} onChange={() => onChange(value)} />
      <span>
        <span className="choice-title">{title}</span>
        {desc && <span className="choice-desc">{desc}</span>}
      </span>
    </label>
  );
}

export default function BackupPage() {
  const { user } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const last = useLastBackup(true, refresh);
  const lastPhoto = useLastPhotoBackup(refresh);
  const [kind, setKind] = useState('data');      // 'data' | 'photos'
  const [range, setRange] = useState('all');     // 'all' | 'new'
  const [steps, setSteps] = useState({});
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const canIncremental = !!lastPhoto?.until;
  const start = async () => {
    setState('working'); setError(''); setResult(null); setSteps({});
    const photos = kind === 'data' ? 'none' : range === 'new' && canIncremental ? 'new' : 'all';
    try {
      const res = await runBackup({
        user, photos, photosSince: photos === 'new' ? lastPhoto.until : null,
        onStep: (s) => setSteps((x) => ({ ...x, [s.key]: s })),
      });
      setResult(res); setState('done'); setRefresh((x) => x + 1);
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'İzin hatası. Firestore kurallarını güncellediğinden emin ol.' : e.message);
      setState('error');
    }
  };

  const lastText = !last.loaded ? 'Yükleniyor…'
    : last.days === null ? 'Henüz hiç yedek alınmadı.'
      : `Son yedek ${fmtDate(last.at)} tarihinde alındı (${last.days === 0 ? 'bugün' : `${last.days} gün önce`}).`;
  const stepList = [...BACKUP_STEPS, ...(kind === 'photos' ? [{ key: 'photos', label: 'Fotoğraflar' }, { key: 'zip', label: 'ZIP dosyası hazırlanıyor' }] : [])];
  const working = state === 'working';

  return (
    <div className="page-narrow">
      <PageHeader title="Yedek al" back={{ to: '/admin', label: 'Yönetim' }} />

      <Alert tone={last.due ? 'warn' : 'success'}>{lastText}{last.due && ` ${BACKUP_DUE_DAYS} günde bir yedek alman önerilir.`}</Alert>

      <Card title="Yedek türü" className="mt-16">
        <div className="stack" style={{ gap: 10 }}>
          <Choice name="kind" value="data" current={kind} onChange={setKind} disabled={working}
            title="Sadece veriler" desc="Bayiler, kayıtlar, değişiklik geçmişleri, notlar, kullanıcılar. Birkaç MB, birkaç saniye sürer. Sık alınması önerilir." />
          <Choice name="kind" value="photos" current={kind} onChange={setKind} disabled={working}
            title="Veriler + fotoğraflar"
            desc={`Tek bir ZIP dosyası; fotoğraflar ay ve bayi klasörlerine ayrılmış olarak. Büyük dosya, bilgisayardan alınması önerilir.${lastPhoto?.at ? ` Son fotoğraflı yedek: ${fmtDate(lastPhoto.at)}.` : lastPhoto === null ? ' Henüz fotoğraflı yedek alınmadı.' : ''}`} />
        </div>

        {kind === 'photos' && (
          <div className="stack mt-16" style={{ gap: 10, paddingLeft: 12, borderLeft: '3px solid var(--border)' }}>
            <Choice name="range" value="all" current={range} onChange={setRange} disabled={working}
              title="Tüm fotoğraflar" desc="Sistemdeki bütün saha fotoğrafları. Birkaç dakika sürebilir." />
            <Choice name="range" value="new" current={range} onChange={setRange} disabled={working || !canIncremental}
              title="Sadece yeni fotoğraflar"
              desc={canIncremental
                ? `Son fotoğraflı yedekten (${fmtDate(lastPhoto.at)}) sonra eklenen fotoğraflar. Daha küçük dosya.`
                : 'İlk fotoğraflı yedeği aldıktan sonra kullanılabilir.'} />
          </div>
        )}

        <button className="btn btn-primary mt-16" onClick={start} disabled={working}>
          {working ? 'Yedek hazırlanıyor…' : kind === 'data' ? 'Veri yedeğini indir' : 'Fotoğraflı yedeği indir'}
        </button>

        {Object.keys(steps).length > 0 && (
          <ul className="backup-steps">
            {stepList.map((s) => {
              const st = steps[s.key];
              return (
                <li key={s.key} className={st?.status || 'waiting'}>
                  <span>{st?.status === 'done' ? '✓' : st?.status === 'running' ? '…' : '·'}</span>
                  {s.label}
                  {st?.count !== undefined && <span className="muted"> · {fmtNum(st.count)}{st.total !== undefined && st.status === 'running' ? ` / ${fmtNum(st.total)}` : ''}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {working && kind === 'photos' && <p className="text-xs muted mt-8">Bu sırada sayfayı kapatma ve bilgisayarı uyku moduna alma.</p>}
        {result && (
          <Alert tone="success" style={{ marginTop: 14 }}>
            ✓ Yedek indirildi ({mb(result.sizeBytes)}{result.photos !== undefined ? `, ${fmtNum(result.photos)} fotoğraf` : ''}). Dosyayı bilgisayarında ve tercihen ayrıca bir bulut klasöründe sakla.
          </Alert>
        )}
        {error && <Alert tone="danger" style={{ marginTop: 14 }}>Yedek alınamadı: {error}</Alert>}
      </Card>

      <Card title="Bilmen gerekenler" className="mt-16">
        <ul className="text-sm" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>Veri yedeği her hafta ya da iki haftada bir, fotoğraflı yedek birkaç ayda bir yeterli.</li>
          <li>Yedeği bilgisayardan almanı öneririm; telefonda indirilen dosyayı bulmak zor olabilir.</li>
          <li>Veriler JSON biçimindedir; okumak için değil, bir sorun olduğunda geri yüklemek için saklanır. Okunabilir liste için Kayıtlar ve Bayiler sayfalarındaki "Excel'e aktar"ı kullan.</li>
          <li>Veri yedeği yaklaşık {fmtNum(5000)} okuma harcar; fotoğraflı yedekte her fotoğraf için bir okuma daha eklenir. Arada bir almak ücretsiz kotayı etkilemez.</li>
          <li>Eski sistemin fotoğraflarının orijinalleri Google Drive'da duruyor; onları silme.</li>
        </ul>
      </Card>
    </div>
  );
}
