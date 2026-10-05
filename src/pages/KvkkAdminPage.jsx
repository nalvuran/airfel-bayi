// src/pages/KvkkAdminPage.jsx — aydınlatma metni ve onay durumu (sadece sahip)
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { KVKK_DRAFT, loadKvkk, publishKvkk } from '../utils/kvkk';
import { Alert, Badge, Card, PageHeader } from '../components/ui';

export default function KvkkAdminPage() {
  const { user } = useAuth();
  const [kvkk, setKvkk] = useState(undefined);
  const [text, setText] = useState('');
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const reload = () => loadKvkk().then((k) => { setKvkk(k); setText(k?.text || KVKK_DRAFT); }).catch((e) => {
    setText((t) => t || KVKK_DRAFT); // okunamasa da taslak gelsin
    setMsg({ tone: 'danger', text: e.code === 'permission-denied'
      ? 'Firestore kuralları güncel değil: metin okunamadı. Kuralları yayınladıktan sonra sayfayı yenile.'
      : `Metin okunamadı: ${e.message}` });
  });
  useEffect(() => {
    reload();
    getDocs(collection(db, 'users')).then((s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.active !== false))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unfilled = /\[[^\]]+\]/.test(text);
  const changed = text.trim() !== (kvkk?.text || '').trim();
  const publish = async () => {
    if (!window.confirm(kvkk ? 'Yeni sürüm yayınlansın mı? Bütün kullanıcılar metni yeniden onaylayacak.' : 'Metin yayınlansın mı? Bütün kullanıcılar bir sonraki açılışta metni onaylayacak.')) return;
    setBusy(true); setMsg(null);
    try { const v = await publishKvkk({ text: text.trim(), by: user.email }); setMsg({ tone: 'success', text: `Sürüm ${v} yayınlandı.` }); reload(); }
    catch (e) { setMsg({ tone: 'danger', text: e.code === 'permission-denied' ? 'İzin hatası. Firestore kurallarını yayınladığından emin ol.' : e.message }); }
    finally { setBusy(false); }
  };

  const status = useMemo(() => users.map((u) => ({ ...u, ok: kvkk && (u.kvkkVersion || 0) >= kvkk.version, at: u.kvkkAcceptedAt?.toDate?.() }))
    .sort((a, b) => a.ok - b.ok || (a.name || '').localeCompare(b.name || '', 'tr')), [users, kvkk]);

  return (
    <div className="page-narrow" style={{ maxWidth: 860 }}>
      <PageHeader title="Aydınlatma Metni" back={{ to: '/admin', label: 'Yönetim' }}
        subtitle={kvkk ? `Yayında: sürüm ${kvkk.version}` : 'Henüz yayınlanmadı; kullanıcılara bir şey gösterilmiyor'} />
      <Card title="Metin" desc="Kullanıcılar uygulamayı açtığında bu metni görür ve 'Okudum ve anladım' diyerek devam eder. Taslak metni şirketin hukuk birimine kontrol ettirmeni öneririm.">
        {unfilled && <Alert tone="warn" style={{ marginBottom: 10 }}>Metinde doldurulmamış alanlar var: köşeli parantez içindeki yerleri (ör. [ŞİRKET UNVANI]) düzenle.</Alert>}
        <textarea className="input textarea" rows={18} value={text} onChange={(e) => setText(e.target.value)} style={{ fontSize: 13.5 }} />
        <div className="row mt-12">
          <button className="btn btn-primary" disabled={busy || !text.trim() || !changed || unfilled} onClick={publish}>
            {busy ? 'Yayınlanıyor…' : kvkk ? 'Yeni sürümü yayınla' : 'Yayınla'}
          </button>
          {kvkk && changed && <button className="btn btn-secondary" disabled={busy} onClick={() => setText(kvkk.text)}>Değişiklikleri geri al</button>}
        </div>
        {msg && <Alert tone={msg.tone} style={{ marginTop: 10 }}>{msg.text}</Alert>}
      </Card>
      {kvkk && (
        <Card title={`Onay Durumu (${status.filter((u) => u.ok).length} / ${status.length})`} className="mt-16" flush>
          {status.map((u) => (
            <div key={u.id} className="list-row" style={{ cursor: 'default' }}>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{u.name || u.email}</div>
                  <div className="text-xs muted">{u.email}</div>
                </div>
                {u.ok ? <Badge tone="success">Onayladı · {u.at ? u.at.toLocaleDateString('tr-TR') : ''}</Badge> : <Badge tone="warn">Bekliyor</Badge>}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
