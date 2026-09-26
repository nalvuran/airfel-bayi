// src/utils/navCounts.js
// Menüdeki sayılar: bayi sayısı, açık talepler, panoda yeni yazı. Önbellekli kaynaklardan okunur.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDealerIndex } from './dealerIndex';
import { loadRequests } from './requests';
import { lastSeenPosts, loadPosts } from './posts';

export function useNavCounts() {
  const { user, userProfile } = useAuth();
  const myKey = userProfile?.salesRepKey || null;
  const { pathname } = useLocation();
  const [c, setC] = useState({ dealers: null, requests: 0, newPosts: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const idx = await getDealerIndex(db);
        const mine = myKey ? idx.entries.filter((e) => e.k === myKey) : [];
        const dealerSet = new Set(mine.map((e) => e.i));
        const [reqs, posts] = await Promise.all([loadRequests(db).catch(() => []), loadPosts(db).catch(() => [])]);
        const seen = lastSeenPosts();
        if (!alive) return;
        setC({
          dealers: myKey ? mine.length : idx.entries.length,
          requests: reqs.filter((q) => q.status === 'open' && (q.createdByUid === user.uid || dealerSet.has(q.dealerId))).length,
          newPosts: posts.filter((p) => p.byUid !== user.uid && p.date && p.date.getTime() > seen).length,
        });
      } catch { /* sayılar olmadan da menü çalışır */ }
    })();
    return () => { alive = false; };
  }, [pathname, myKey, user?.uid]);
  return c;
}
