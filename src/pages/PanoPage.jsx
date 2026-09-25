// src/pages/PanoPage.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  POST_MAX, addComment, addPost, editComment, editPost, lastSeenPosts, linkify, loadComments, loadPosts,
  markPostsSeen, removeComment, removePost, setPinned,
} from '../utils/posts';
import { useRepProfiles } from '../utils/repProfiles';
import { Alert, Avatar, Badge, Empty, PageHeader, SkeletonRows } from '../components/ui';

const errMsg = (e) => (e?.code === 'permission-denied' ? 'Bu işlem için iznin yok.' : e?.message || String(e));
const ago = (d) => {
  if (!d) return 'şimdi';
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  const g = Math.floor(h / 24);
  if (g < 7) return `${g} gün önce`;
  return d.toLocaleDateString('tr-TR');
};

export function RichText({ text }) {
  return <>{linkify(text || '').map((p, i) => (p.url ? <a key={i} href={p.url} target="_blank" rel="noreferrer">{p.t}</a> : <span key={i}>{p.t}</span>))}</>;
}

function Composer({ initial = '', placeholder, submitLabel, onSubmit, onCancel, rows = 3 }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clean = text.trim();
  const submit = async () => {
    setBusy(true); setError('');
    try { await onSubmit(clean); setText(''); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div>
      <textarea className="input textarea" rows={rows} maxLength={POST_MAX} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      <div className="row mt-8">
        <button className="btn btn-primary btn-sm" disabled={busy || !clean || clean === initial.trim()} onClick={submit}>{busy ? 'Kaydediliyor…' : submitLabel}</button>
        {onCancel && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={onCancel}>Vazgeç</button>}
        {POST_MAX - text.length < 200 && <span className="text-xs muted">{POST_MAX - text.length} karakter kaldı</span>}
      </div>
      {error && <Alert tone="danger" style={{ marginTop: 8 }}>{error}</Alert>}
    </div>
  );
}

function Comments({ post, photoOf, onCountChange }) {
  const { user, userProfile, isOwner } = useAuth();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => { loadComments(db, post.id).then(setItems).catch(() => setItems([])); }, [post.id, reload]);
  const refresh = () => { setReload((x) => x + 1); onCountChange(); };

  return (
    <div className="comments">
      {!items && <div className="text-sm muted">Yükleniyor…</div>}
      {items?.map((c) => {
        const mine = c.byUid === user.uid;
        return (
          <div key={c.id}>
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <Avatar name={c.byName} src={photoOf(c.byRepKey)} size={26} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="text-sm"><strong>{c.byName}</strong> <span className="text-xs muted">{ago(c.date)}{c.editedAt ? ' · düzenlendi' : ''}</span></div>
                {editing === c.id ? (
                  <div className="mt-8"><Composer initial={c.text} rows={2} submitLabel="Kaydet" onCancel={() => setEditing(null)}
                    onSubmit={async (t) => { await editComment(db, post.id, c.id, t); setEditing(null); refresh(); }} /></div>
                ) : (
                  <div className="post-text" style={{ fontSize: 14, marginTop: 2 }}><RichText text={c.text} /></div>
                )}
                {editing !== c.id && (mine || isOwner || post.byUid === user.uid) && (
                  <div className="row" style={{ gap: 12, marginTop: 4 }}>
                    {mine && <button className="btn-link text-xs" onClick={() => setEditing(c.id)}>Düzenle</button>}
                    <button className="btn-link text-xs" style={{ color: 'var(--muted)' }}
                      onClick={async () => { if (window.confirm('Yorum silinsin mi?')) { await removeComment(db, post.id, c.id); refresh(); } }}>Sil</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <Composer rows={2} placeholder="Yorum yaz…" submitLabel="Yorum yap"
        onSubmit={async (t) => { await addComment(db, { postId: post.id, text: t, user, profile: userProfile }); refresh(); }} />
    </div>
  );
}

function Post({ post, isNew, photoOf, onChanged }) {
  const { user, isOwner } = useAuth();
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [error, setError] = useState('');
  const mine = post.byUid === user.uid;

  const run = async (fn) => { setError(''); try { await fn(); onChanged(); } catch (e) { setError(errMsg(e)); } };

  return (
    <article className={`post ${post.pinned ? 'pinned' : ''}`}>
      <div className="row" style={{ flexWrap: 'nowrap', gap: 10, alignItems: 'flex-start' }}>
        <Avatar name={post.byName} src={photoOf(post.byRepKey)} size={38} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6 }}>
            <strong>{post.byName}</strong>
            <span className="text-xs muted">{ago(post.date)}{post.editedAt ? ' · düzenlendi' : ''}</span>
            {post.pinned && <Badge tone="warn">📌 Sabitlendi</Badge>}
            {isNew && <span className="new-dot" title="Yeni" />}
          </div>
          {editing ? (
            <div className="mt-8"><Composer initial={post.text} submitLabel="Kaydet" onCancel={() => setEditing(false)}
              onSubmit={async (t) => { await editPost(db, post.id, t); setEditing(false); onChanged(); }} /></div>
          ) : (
            <div className="post-text"><RichText text={post.text} /></div>
          )}
          {!editing && (
            <div className="row mt-8" style={{ gap: 14 }}>
              <button className="btn-link text-sm" onClick={() => setShowComments((x) => !x)}>
                {showComments ? 'Yorumları gizle' : post.commentCount ? `Yorumlar (${post.commentCount})` : 'Yorum yap'}
              </button>
              {mine && <button className="btn-link text-sm" style={{ color: 'var(--muted)' }} onClick={() => setEditing(true)}>Düzenle</button>}
              {isOwner && <button className="btn-link text-sm" style={{ color: 'var(--muted)' }} onClick={() => run(() => setPinned(db, post.id, !post.pinned))}>{post.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}</button>}
              {(mine || isOwner) && (
                <button className="btn-link text-sm" style={{ color: 'var(--muted)' }}
                  onClick={() => { if (window.confirm('Yazı yorumlarıyla birlikte silinsin mi?')) run(() => removePost(db, post.id)); }}>Sil</button>
              )}
            </div>
          )}
          {error && <Alert tone="danger" style={{ marginTop: 8 }}>{error}</Alert>}
          {showComments && <Comments post={post} photoOf={photoOf} onCountChange={onChanged} />}
        </div>
      </div>
    </article>
  );
}

export default function PanoPage() {
  const { user, userProfile } = useAuth();
  const profiles = useRepProfiles(db);
  const photoOf = (k) => (k ? profiles[k]?.url : null);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [seenBefore] = useState(lastSeenPosts());

  useEffect(() => {
    loadPosts(db, { force: reload > 0 }).then((p) => { setPosts(p); markPostsSeen(); }).catch((e) => setError(e.message));
  }, [reload]);

  return (
    <div className="page-narrow">
      <PageHeader title="Pano" subtitle="Duyurular, kampanyalar ve ekipten paylaşımlar" />
      <div className="card mb-16">
        <Composer placeholder="Ekiple bir şey paylaş… Bağlantılar tıklanabilir olur." submitLabel="Paylaş"
          onSubmit={async (t) => { await addPost(db, { text: t, user, profile: userProfile }); setReload((x) => x + 1); }} />
      </div>
      {error && <Alert tone="danger">Pano yüklenemedi: {error}</Alert>}
      {!posts && !error && <SkeletonRows rows={4} />}
      {posts && (posts.length === 0 ? (
        <div className="card"><Empty title="Henüz paylaşım yok">İlk duyuruyu sen yaz.</Empty></div>
      ) : (
        <div className="card">
          {posts.map((p) => (
            <Post key={p.id} post={p} photoOf={photoOf}
              isNew={p.byUid !== user.uid && p.date && p.date.getTime() > seenBefore}
              onChanged={() => setReload((x) => x + 1)} />
          ))}
        </div>
      ))}
    </div>
  );
}
