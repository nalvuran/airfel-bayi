// src/components/DealerExtras.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { REQUEST_STATUS, requestSummary } from '../utils/catalog';
import { addToCalendar, clearFollowUp, fmtDay, followUpState, loadOpenFollowUps, setFollowUp, todayStr } from '../utils/followUps';
import { closeRequest, createRequest, loadRequests, requestAgeDays, validateRequestDraft } from '../utils/requests';
import { declineInfo } from '../utils/decline';
import { RequestDraftEditor, emptyDraft, marketShare } from './FeatureFields';
import { Photo } from './Photos';
import { Alert, Badge, Card } from './ui';

const errMsg = (e) => (e?.code === 'permission-denied' ? 'Bu işlem için iznin yok.' : e?.message || String(e));
const toD = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);
const fmtDate = (d) => (toD(d) ? toD(d).toLocaleDateString('tr-TR') : '');
const ageText = (q) => { const n = requestAgeDays(q); return n === 0 ? 'bugün açıldı' : `${n} gündür açık`; };

/* ---------- Devreye alım trendi (tablonun altında) ---------- */

export function TrendLine({ sales }) {
  if (!sales) return null;
  const v = ['fy24', 'fy25', 'fy26'].flatMap((y) => [sales[y]?.cb || 0, sales[y]?.ac || 0]);
  const info = declineInfo({ v });
  if (info.fy24 === 0 && info.fy25 === 0) return null;
  return (
    <div className="row mt-12" style={{ gap: 8 }}>
      {info.pct !== null && (
        <Badge tone={info.pct <= -25 ? 'danger' : info.pct >= 0 ? 'success' : 'warn'}>
          FY25, FY24'e göre {info.pct > 0 ? '▲ +' : info.pct < 0 ? '▼ ' : ''}%{Math.abs(info.pct)}
        </Badge>
      )}
      {info.silent && <Badge tone="danger">Bu mali yıl henüz devreye alım yok</Badge>}
    </div>
  );
}

/* ---------- Takip ---------- */

export function DealerFollowUp({ dealer }) {
  const { user, userProfile, canRegister } = useAuth();
  const [fu, setFu] = useState(undefined);
  const [date, setDate] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    loadOpenFollowUps(db, { force: reload > 0 }).then((l) => setFu(l.find((f) => f.dealerId === dealer.i) || null)).catch(() => setFu(null));
  }, [dealer.i, reload]);

  if (fu === undefined) return null;
  if (!fu && !canRegister) return null;

  const save = async () => {
    if (!date) { setMsg({ tone: 'danger', text: 'Bir tarih seç.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const { queued } = await setFollowUp(db, { dealer, date, user, profile: userProfile });
      setEditing(false); setReload((x) => x + 1);
      if (queued) setMsg({ tone: 'success', text: 'Telefonda saklandı; bağlantı gelince gönderilecek.' });
    } catch (e) { setMsg({ tone: 'danger', text: errMsg(e) }); } finally { setBusy(false); }
  };
  const clear = async () => {
    if (!window.confirm('Takip kapatılsın mı?')) return;
    setBusy(true); setMsg(null);
    try { await clearFollowUp(db, { dealer, user, profile: userProfile }); setReload((x) => x + 1); }
    catch (e) { setMsg({ tone: 'danger', text: errMsg(e) }); } finally { setBusy(false); }
  };
  const st = fu ? followUpState(fu) : null;

  return (
    <Card title="Takip">
      {fu && !editing && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800 }}>Tekrar uğra: {fmtDay(fu.date)} <Badge tone={st.tone}>{st.label}</Badge></div>
            <div className="text-xs muted" style={{ fontWeight: 600, marginTop: 2 }}>{fu.byName} kurdu{fu.note ? ` · ${fu.note}` : ''}</div>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <button className="btn-link text-sm" onClick={() => addToCalendar({ dealerName: dealer.n, date: fu.date, url: window.location.href })}>📅 Takvime ekle</button>
            {canRegister && <button className="btn-link text-sm" onClick={() => { setDate(fu.date); setEditing(true); }} disabled={busy}>Değiştir</button>}
            {canRegister && <button className="btn-link text-sm" style={{ color: 'var(--muted)' }} onClick={clear} disabled={busy}>Kapat</button>}
          </div>
        </div>
      )}
      {!fu && !editing && (
        <button className="btn btn-secondary btn-sm" onClick={() => { setDate(''); setEditing(true); }}>+ Tekrar uğra tarihi ekle</button>
      )}
      {editing && (
        <div className="row">
          <input type="date" className="input" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} disabled={busy}>Vazgeç</button>
        </div>
      )}
      {msg && <Alert tone={msg.tone} style={{ marginTop: 10 }}>{msg.text}</Alert>}
    </Card>
  );
}

/* ---------- Sattığı markalar (en son ziyaret kaydından) ---------- */

export function DealerBrands({ regs, sales }) {
  const last = (regs || []).find((r) => Array.isArray(r.brands));
  if (!regs) return null;
  const q = last?.brandQty || {};
  const airfelFy25 = (sales?.fy25?.cb || 0) + (sales?.fy25?.ac || 0);
  const share = last ? marketShare(airfelFy25, last) : null;
  return (
    <Card title="Sattığı markalar">
      {!last ? (
        <p className="text-sm muted">Henüz işaretlenmedi. Bir sonraki ziyaret kaydında temsilci işaretleyecek.</p>
      ) : (
        <>
          <div className="chips" style={{ marginTop: 0 }}>
            {last.brands.length === 0 && !last.brandsOther && <span className="text-sm muted">Listedeki markalardan hiçbiri işaretlenmemiş.</span>}
            {last.brands.map((b) => (
              <span key={b} className={`chip ${b === 'Airfel' ? 'on' : ''}`} style={{ cursor: 'default' }}>
                {b}{q[b] ? <span className="muted" style={{ fontWeight: 600 }}> · ~{q[b].toLocaleString('tr-TR')}/yıl</span> : null}
              </span>
            ))}
            {last.brandsOther && (
              <span className="chip" style={{ cursor: 'default' }}>
                {last.brandsOther}{last.brandsOtherQty ? <span className="muted" style={{ fontWeight: 600 }}> · ~{last.brandsOtherQty.toLocaleString('tr-TR')}/yıl</span> : null}
              </span>
            )}
          </div>
          {share && (
            <div className="share-box mt-12">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800 }}>Tahmini pazar payı</span>
                <span className="num" style={{ fontWeight: 800, fontSize: 18, color: 'var(--red)' }}>%{share.pct}</span>
              </div>
              <div className="progress mt-8"><span style={{ width: `${share.pct}%` }} /></div>
              <div className="text-xs muted mt-8" style={{ fontWeight: 600 }}>
                Airfel FY25 devreye alım: {share.airfel.toLocaleString('tr-TR')} adet · Rakiplerin yıllık tahmini: ~{share.rival.toLocaleString('tr-TR')} adet
              </div>
            </div>
          )}
          <div className="text-xs muted mt-8" style={{ fontWeight: 600 }}>
            {fmtDate(last.date || last.createdAt)} tarihli ziyaretten · {last.salesRep}. Değişiklikler ziyaret kaydından yapılır.
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------- Talepler ---------- */

function RequestRow({ q, canClose, onChanged, onOpenPhoto }) {
  const { user, userProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const st = REQUEST_STATUS[q.status] || REQUEST_STATUS.open;

  const close = async (status) => {
    const note = window.prompt(status === 'done' ? 'Tamamlandı notu (isteğe bağlı), örn. "Kargoya verildi":' : 'İptal sebebi (isteğe bağlı):', '');
    if (note === null) return;
    setBusy(true); setError('');
    try { await closeRequest(db, { request: q, status, note, user, profile: userProfile }); onChanged(); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className={`req-row ${q.status !== 'open' ? 'closed' : ''}`}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{requestSummary(q)}</div>
          <div className="text-xs muted" style={{ fontWeight: 600, marginTop: 2 }}>
            {q.createdByName} · {fmtDate(q.date)}{q.status === 'open' && ` · ${ageText(q)}`}
          </div>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      {q.text && <div className="text-sm mt-8" style={{ whiteSpace: 'pre-wrap' }}>{q.text}</div>}
      {q.photo?.photoId && (
        <div className="mt-8" style={{ maxWidth: 160 }}>
          <Photo info={q.photo} label="Servis fotoğrafı" onOpen={onOpenPhoto} />
        </div>
      )}
      {q.status !== 'open' && (
        <div className="text-xs muted mt-8" style={{ fontWeight: 600 }}>
          {st.label}: {q.closedByName} · {fmtDate(q.closedDate)}{q.closeNote ? ` · "${q.closeNote}"` : ''}
        </div>
      )}
      {q.status === 'open' && canClose && (
        <div className="row mt-8" style={{ gap: 16 }}>
          <button className="btn-link text-sm" disabled={busy} onClick={() => close('done')}>✓ Tamamlandı</button>
          <button className="btn-link text-sm" style={{ color: 'var(--muted)' }} disabled={busy} onClick={() => close('cancelled')}>İptal et</button>
        </div>
      )}
      {error && <Alert tone="danger" style={{ marginTop: 8 }}>{error}</Alert>}
    </div>
  );
}

// Talebi kim kapatabilir: sahip, talebi açan ya da bayinin temsilcisi
export function useCanCloseRequest() {
  const { user, userProfile, isOwner, userRole } = useAuth();
  const myKey = userProfile?.salesRepKey;
  return (q, dealerRepKey) => isOwner || (userRole === 'rep' && (
    q.createdByUid === user?.uid || (myKey && (q.createdByRepKey === myKey || dealerRepKey === myKey))));
}

export function DealerRequests({ dealer, dealerRepKey, onOpenPhoto }) {
  const { user, userProfile, canRegister } = useAuth();
  const canClose = useCanCloseRequest();
  const [list, setList] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    loadRequests(db, { force: reload > 0 }).then((l) => setList(l.filter((q) => q.dealerId === dealer.i))).catch((e) => setMsg({ tone: 'danger', text: errMsg(e) }));
  }, [dealer.i, reload]);

  const save = async () => {
    const m = validateRequestDraft(draft);
    if (m) { setMsg({ tone: 'danger', text: m }); return; }
    setBusy(true); setMsg(null);
    try {
      const { queued } = await createRequest(db, { draft, dealer, user, profile: userProfile });
      setDraft(null); setReload((x) => x + 1);
      if (queued) setMsg({ tone: 'success', text: 'Talep telefonda saklandı; bağlantı gelince gönderilecek.' });
    } catch (e) { setMsg({ tone: 'danger', text: errMsg(e) }); } finally { setBusy(false); }
  };

  const open = (list || []).filter((q) => q.status === 'open');
  const closed = (list || []).filter((q) => q.status !== 'open');

  return (
    <Card title={`Talepler${open.length ? ` (${open.length} açık)` : ''}`}
      actions={canRegister && !draft ? <button className="btn btn-secondary btn-sm" onClick={() => setDraft(emptyDraft())}>+ Talep ekle</button> : null}>
      {draft && (
        <div className="mb-16">
          <RequestDraftEditor draft={draft} onChange={setDraft} disabled={busy} />
          <div className="row mt-12">
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Talebi kaydet'}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setDraft(null); setMsg(null); }} disabled={busy}>Vazgeç</button>
          </div>
        </div>
      )}
      {msg && <Alert tone={msg.tone} style={{ marginBottom: 12 }}>{msg.text}</Alert>}
      {list && list.length === 0 && !draft && <p className="text-sm muted">Bu bayi için talep yok.</p>}
      {[...open, ...closed].map((q) => (
        <RequestRow key={q.id} q={q} canClose={canClose(q, dealerRepKey)} onChanged={() => setReload((x) => x + 1)} onOpenPhoto={onOpenPhoto} />
      ))}
    </Card>
  );
}
