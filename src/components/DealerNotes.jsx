// src/components/DealerNotes.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { NOTE_MAX, addNote, editNote, loadNotes, removeNote } from '../utils/notes';
import { useRepProfiles } from '../utils/repProfiles';
import { Alert, Avatar, Badge, Card, Skeleton } from './ui';

const fmtDateTime = (v) => {
  const d = v?.toDate ? v.toDate() : v instanceof Date ? v : null;
  return d ? d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'şimdi';
};
const errMsg = (e) => (e.code === 'permission-denied' ? 'Bu işlem için iznin yok.' : e.message);

function NoteEditor({ initial = '', placeholder, submitLabel, busy, onSubmit, onCancel }) {
  const [text, setText] = useState(initial);
  const left = NOTE_MAX - text.length;
  const clean = text.trim();
  return (
    <div>
      <textarea
        className="input textarea" value={text} maxLength={NOTE_MAX} placeholder={placeholder}
        onChange={(e) => setText(e.target.value)} rows={3}
      />
      <div className="row mt-8" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <button className="btn btn-primary btn-sm" disabled={busy || !clean || clean === initial.trim()}
            onClick={async () => { if (await onSubmit(clean)) setText(''); }}>
            {busy ? 'Kaydediliyor…' : submitLabel}
          </button>
          {onCancel && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={onCancel}>Vazgeç</button>}
        </div>
        {left < 300 && <span className="text-xs muted">{left} karakter kaldı</span>}
      </div>
    </div>
  );
}

const MANAGER_LABEL = { regionManager: 'Bölge müdürü notu', deptManager: 'Departman müdürü notu' };

function Note({ note, dealerId, canEdit, canDelete, photo, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (text) => {
    setBusy(true); setError('');
    try { await editNote(db, dealerId, note.id, text); setEditing(false); onChanged(); return true; }
    catch (e) { setError(errMsg(e)); return false; } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm('Bu not silinsin mi?')) return;
    setBusy(true); setError('');
    try { await removeNote(db, dealerId, note.id); onChanged(); } catch (e) { setError(errMsg(e)); setBusy(false); }
  };

  return (
    <div className={`note ${MANAGER_LABEL[note.byRole] ? 'note-manager' : ''}`}>
      <Avatar name={note.byName} src={photo} size={34} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row" style={{ gap: 6 }}>
          <strong className="text-sm">{note.byName}</strong>
          {MANAGER_LABEL[note.byRole] && <Badge tone="klima">{MANAGER_LABEL[note.byRole]}</Badge>}
          <span className="text-xs muted num">{fmtDateTime(note.createdAt)}{note.editedAt && ' · düzenlendi'}</span>
        </div>
        {editing
          ? <div className="mt-8"><NoteEditor initial={note.text} submitLabel="Kaydet" busy={busy} onSubmit={save} onCancel={() => setEditing(false)} /></div>
          : <div className="note-text">{note.text}</div>}
        {!editing && (canEdit || canDelete) && (
          <div className="row mt-8" style={{ gap: 14 }}>
            {canEdit && <button className="btn-link text-xs" disabled={busy} onClick={() => setEditing(true)}>Düzenle</button>}
            {canDelete && <button className="btn-link text-xs" style={{ color: 'var(--muted)' }} disabled={busy} onClick={del}>Sil</button>}
          </div>
        )}
        {error && <Alert tone="danger" style={{ marginTop: 8 }}>{error}</Alert>}
      </div>
    </div>
  );
}

export default function DealerNotes({ dealerId }) {
  const { user, userProfile, userRole, isOwner } = useAuth();
  const profiles = useRepProfiles(db);
  const [notes, setNotes] = useState(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [info, setInfo] = useState('');

  useEffect(() => {
    loadNotes(db, dealerId).then(setNotes).catch((e) => setError(e.message));
  }, [dealerId, reload]);

  const add = async (text) => {
    setBusy(true); setError('');
    try {
      const { queued } = await addNote(db, dealerId, { text, user, profile: userProfile, role: userRole });
      setInfo(queued ? 'Not telefonda saklandı; bağlantı gelince otomatik gönderilecek.' : '');
      setReload((x) => x + 1); return true;
    }
    catch (e) { setError(errMsg(e)); return false; } finally { setBusy(false); }
  };

  const visible = notes && !showAll ? notes.slice(0, 5) : notes;

  return (
    <Card title={`Notlar${notes?.length ? ` (${notes.length})` : ''}`}>
      <NoteEditor placeholder="Bu bayiyle ilgili bir not yaz…" submitLabel="Not ekle" busy={busy} onSubmit={add} />
      {error && <Alert tone="danger" style={{ marginTop: 10 }}>{error}</Alert>}
      {info && <Alert tone="success" style={{ marginTop: 10 }}>{info}</Alert>}
      <div className="mt-16">
        {!notes && !error && <Skeleton height={48} />}
        {notes?.length === 0 && <div className="text-sm muted">Henüz not yok.</div>}
        {visible?.map((n) => (
          <Note key={n.id} note={n} dealerId={dealerId}
            canEdit={n.byUid === user?.uid} canDelete={n.byUid === user?.uid || isOwner}
            photo={n.byRepKey ? profiles[n.byRepKey]?.url : null}
            onChanged={() => setReload((x) => x + 1)} />
        ))}
        {notes && notes.length > 5 && (
          <button className="btn-link text-sm mt-8" onClick={() => setShowAll((x) => !x)}>
            {showAll ? 'Daha az göster' : `Tüm notları göster (${notes.length})`}
          </button>
        )}
      </div>
    </Card>
  );
}
