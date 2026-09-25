// src/pages/SyncPage.jsx
import { useState } from 'react';
import { collection, doc, writeBatch, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { parseCustomerData } from '../utils/importers';
import { PageHeader } from '../components/ui';
import { buildMissingThumbs } from '../utils/thumbs';
import { toIndexEntry, writeDealerIndex, rebuildDealerIndexFromFirestore, clearDealerIndexCache, loadDealerIndex, dealerHash } from '../utils/dealerIndex';

const C = {
  red: 'var(--red)', redBg: 'var(--red-soft)', text: 'var(--ink)', muted: 'var(--muted)',
  border: 'var(--border)', soft: 'var(--surface-2)', ok: 'var(--green)', okBg: 'var(--green-soft)', warn: 'var(--amber)', warnBg: 'var(--amber-soft)',
};
const BATCH_SIZE = 400;

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 };
const btn = (primary, disabled) => ({
  background: disabled ? '#DCD8D3' : primary ? 'var(--red)' : 'var(--surface)',
  color: primary || disabled ? '#fff' : 'var(--ink)',
  border: `1.5px solid ${disabled ? '#DCD8D3' : primary ? 'var(--red)' : 'var(--border)'}`,
  borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 800,
  cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
});

async function writeInBatches(coll, items, { merge, extra }, onProgress) {
  let done = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ id, data }) => {
      const ref = doc(db, coll, id);
      if (merge) batch.set(ref, { ...data, ...extra }, { merge: true });
      else batch.set(ref, { ...data, ...extra });
    });
    await batch.commit();
    done += chunk.length;
    onProgress(done);
  }
  return done;
}

function Stat({ label, value, tone }) {
  const bg = tone === 'warn' ? C.warnBg : tone === 'ok' ? C.okBg : '#f8f7f5';
  const fg = tone === 'warn' ? C.warn : tone === 'ok' ? C.ok : C.text;
  return (
    <div style={{ background: bg, borderRadius: 8, padding: '12px 16px', minWidth: 140 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: fg }}>{value}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: C.red, transition: 'width .2s' }} />
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>{done} / {total} kayıt yazıldı</div>
    </div>
  );
}

function Message({ tone, children }) {
  const bg = tone === 'error' ? C.redBg : tone === 'ok' ? C.okBg : C.warnBg;
  const fg = tone === 'error' ? C.red : tone === 'ok' ? C.ok : C.warn;
  return <div style={{ background: bg, color: fg, borderRadius: 8, padding: '12px 16px', fontSize: 14, marginTop: 16 }}>{children}</div>;
}

function FilePicker({ onFile, disabled, fileName }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <span style={{ ...btn(false, disabled), display: 'inline-block' }}>Excel dosyası seç</span>
      <span style={{ fontSize: 13, color: C.muted, wordBreak: 'break-all' }}>{fileName || 'Dosya seçilmedi'}</span>
      <input
        type="file" accept=".xlsx,.xls" disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
        style={{ display: 'none' }}
      />
    </label>
  );
}

/* ---------- 1) Bayi listesi ---------- */

function CustomerDataSection({ user }) {
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [state, setState] = useState('idle'); // idle | writing | done | error
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState(null);
  const [toWrite, setToWrite] = useState(null);

  const onFile = async (file) => {
    setMsg(null); setState('idle'); setProgress(0); setFileName(file.name); setToWrite(null);
    try {
      const res = parseCustomerData(await file.arrayBuffer());
      if (res.error) { setParsed(null); setMsg({ tone: 'error', text: res.error }); return; }
      setParsed(res);
    } catch (e) {
      setParsed(null); setMsg({ tone: 'error', text: `Dosya okunamadı: ${e.message}` });
    }
  };

  const onWrite = async () => {
    setState('writing'); setProgress(0); setMsg(null);
    const syncId = `sync-${Date.now()}`;
    let written = 0;
    const onProg = (n) => { written = n; setProgress(n); };
    try {
      // Sadece bilgisi değişen bayileri yaz (günlük/haftalık yüklemede kota ve süre tasarrufu)
      const current = await loadDealerIndex(db).catch(() => ({ entries: [] }));
      const oldMap = new Map(current.entries.map((e) => [e.i, e]));
      const changed = parsed.dealers.filter((d) => oldMap.get(d.id)?.h !== dealerHash(d.data));
      setToWrite(changed.length);
      const n = await writeInBatches('dealers', changed,
        { merge: true, extra: { syncedAt: serverTimestamp(), lastSyncId: syncId } }, onProg);

      // Dizin: dosyadaki bayiler + dosyada olmayan (eski) bayiler aynen korunur
      const inFile = new Set(parsed.dealers.map((d) => d.id));
      const kept = current.entries.filter((e) => !inFile.has(e.i)).map(({ search, ...e }) => e); // eslint-disable-line no-unused-vars
      await writeDealerIndex(db, [...parsed.dealers.map((d) => toIndexEntry(d.id, d.data)), ...kept]);
      clearDealerIndexCache();

      // Bu yüklemenin fotoğrafı: bayi başına FY26 [kombi, klima]. İleride dönemsel karşılaştırma için.
      const day = new Date().toISOString().slice(0, 10);
      const snap = Object.fromEntries(parsed.dealers.map((d) => [d.id, [d.data.sales?.fy26?.cb ?? 0, d.data.sales?.fy26?.ac ?? 0]]));
      await setDoc(doc(db, 'snapshots', day), { at: serverTimestamp(), by: user.email, fy: 'FY26', count: parsed.dealers.length, data: JSON.stringify(snap) });

      await addDoc(collection(db, 'syncLogs'), {
        type: 'customerData', syncId, fileName, by: user.email, at: serverTimestamp(),
        written: n, unchanged: parsed.dealers.length - n, stats: { ...parsed.stats, duplicateIds: parsed.stats.duplicateIds.length },
      });
      setState('done');
      setMsg({ tone: 'ok', text: n
        ? `${n} bayinin bilgisi değişmişti, güncellendi. ${parsed.dealers.length - n} bayi aynı kaldığı için yeniden yazılmadı. Toplam ${parsed.dealers.length + kept.length} bayi.`
        : `Hiçbir bayinin bilgisi değişmemiş; yazma yapılmadı. Toplam ${parsed.dealers.length + kept.length} bayi.` });
    } catch (e) {
      setState('error');
      setMsg({ tone: 'error', text: `Yazma yarıda kaldı (${written} kayıt yazıldı): ${e.message}. Aynı dosyayı tekrar yüklemek güvenli, kopya oluşmaz.` });
    }
  };

  const s = parsed?.stats;
  return (
    <section style={card}>
      <h2 className="card-title">Bayi listesini güncelle</h2>
      <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 16px' }}>
        Customer Data Excel dosyasını seç. Sadece bilgisi değişen bayiler yazılır, yeniler eklenir; uygulamada girilen bilgiler (kayıtlar, notlar, talepler) silinmez. Günlük ya da haftalık yüklemen önerilir.
      </p>
      <FilePicker onFile={onFile} disabled={state === 'writing'} fileName={fileName} />

      {s && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            <Stat label="Yüklenecek bayi" value={s.dealers} />
            <Stat label="Platform ID'li" value={s.withPlatformId} tone="ok" />
            <Stat label="Platform ID'siz" value={s.withoutPlatformId} tone={s.withoutPlatformId ? 'warn' : undefined} />
            <Stat label="Atlanan satır" value={s.skipped} />
          </div>
          {s.withoutPlatformId > 0 && (
            <p style={{ fontSize: 13, color: C.muted, marginTop: 12 }}>
              Platform ID'si olmayan bayilere ad, il ve ilçeden türetilen sabit bir kod (NOID-…) verilir.
            </p>
          )}
          {parsed.skipped.length > 0 && (
            <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
              Atlanan satırlar: {parsed.skipped.map((r) => `${r.excelRow}. satır (${r.value ?? 'boş'})`).join(', ')}
            </p>
          )}
          {s.duplicateIds.length > 0 && (
            <Message tone="warn">
              Dosyada tekrar eden Platform ID var, sadece ilk satır alındı: {s.duplicateIds.map((d) => `${d.id} (${d.excelRow}. satır)`).join(', ')}
            </Message>
          )}
          <div style={{ marginTop: 20 }}>
            <button style={btn(true, state === 'writing')} disabled={state === 'writing'} onClick={onWrite}>
              {state === 'writing' ? 'Yükleniyor…' : 'Bayi listesini güncelle'}
            </button>
          </div>
          {(state === 'writing' || state === 'done') && toWrite > 0 && <Progress done={progress} total={toWrite} />}
        </>
      )}
      {msg && <Message tone={msg.tone}>{msg.text}</Message>}
    </section>
  );
}

/* ---------- 3) Bayi dizini ---------- */

function IndexSection() {
  const [state, setState] = useState('idle');
  const [msg, setMsg] = useState(null);
  const onBuild = async () => {
    setState('working'); setMsg(null);
    try {
      const res = await rebuildDealerIndexFromFirestore(db);
      clearDealerIndexCache();
      setState('done');
      setMsg({ tone: 'ok', text: `Bayi dizini oluşturuldu: ${res.count} bayi, ${res.parts} parça. Bayiler sayfası artık bu dizini kullanıyor.` });
    } catch (e) {
      setState('error'); setMsg({ tone: 'error', text: `Dizin oluşturulamadı: ${e.message}` });
    }
  };
  return (
    <section style={card}>
      <h2 className="card-title">Bayi dizinini oluştur</h2>
      <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 16px' }}>
        Bayiler sayfası, hızlı açılması için bayilerin özetini tek bir dizinden okur. Bayi listesi yüklendiğinde dizin kendiliğinden güncellenir; bu butona sadece dizin eksik ya da bozuk görünürse ihtiyaç var.
      </p>
      <button style={btn(true, state === 'working')} disabled={state === 'working'} onClick={onBuild}>
        {state === 'working' ? 'Oluşturuluyor…' : 'Bayi dizinini oluştur'}
      </button>
      {msg && <Message tone={msg.tone}>{msg.text}</Message>}
    </section>
  );
}

/* ---------- 4) Kart önizlemeleri ---------- */

function ThumbsSection({ user }) {
  const [state, setState] = useState('idle');
  const [prog, setProg] = useState(null);
  const [msg, setMsg] = useState(null);

  const run = async () => {
    setState('working'); setMsg(null); setProg(null);
    try {
      const res = await buildMissingThumbs(db, { uid: user.uid, onProgress: setProg });
      setState('done');
      if (res.total === 0) {
        setMsg({ tone: 'ok', text: `Tüm kayıtların önizlemesi zaten var (${res.alreadyDone} kayıt).` });
      } else if (res.failed === 0) {
        setMsg({ tone: 'ok', text: `${res.done} kaydın önizlemesi oluşturuldu. Kayıtlar sayfasındaki kartlarda artık fotoğraflar görünüyor.` });
      } else {
        setMsg({ tone: 'error', text: `${res.done} kayıt tamam, ${res.failed} kayıtta sorun çıktı. Butona tekrar basınca sadece eksikler denenir. İlk hata: ${res.errors[0]}` });
      }
    } catch (e) {
      setState('error');
      setMsg({ tone: 'error', text: `İşlem yarıda kaldı: ${e.message}. Tekrar basınca kaldığı yerden devam eder.` });
    }
  };

  return (
    <section style={card}>
      <h2 className="card-title">Kart önizlemelerini oluştur</h2>
      <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 16px' }}>
        Kayıtlar sayfasındaki kartlarda fotoğrafların küçük kopyaları gösterilir. Yeni kayıtlarda bunlar kendiliğinden oluşur; bu buton, önizlemesi olmayan eski kayıtlar içindir. Tek seferlik bir işlemdir ve birkaç dakika sürebilir; bu sırada sayfayı kapatma.
      </p>
      <button style={btn(true, state === 'working')} disabled={state === 'working'} onClick={run}>
        {state === 'working' ? 'Oluşturuluyor…' : 'Önizlemeleri oluştur'}
      </button>
      {prog && prog.total > 0 && <Progress done={prog.done + prog.failed} total={prog.total} />}
      {msg && <Message tone={msg.tone}>{msg.text}</Message>}
    </section>
  );
}

export default function SyncPage() {
  const { user } = useAuth();
  return (
    <div className="page-narrow" style={{ maxWidth: 900 }}>
      <PageHeader title="Veri yükle" />
      <CustomerDataSection user={user} />
      <details className="maintenance">
        <summary>Bakım araçları</summary>
        <p className="text-sm muted" style={{ margin: '10px 0 14px' }}>
          Bunlar bir kez kullanılıp işi biten araçlar. Normalde ihtiyaç yok; sadece bir sorun olursa kullan.
        </p>
        <IndexSection />
        <ThumbsSection user={user} />
      </details>
    </div>
  );
}
