// src/utils/scope.js
// Sayfaların "kimi göstereyim" kapsamı: Benim / Ekibim / Tümü / belirli bir bölge müdürünün ekibi.
import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { repKeysUnder, useTeam } from './team';

/**
 * defaults: rol başına varsayılan kapsam, ör. { rep: 'mine', regionManager: 'team', deptManager: 'all', owner: 'all' }
 */
export function useScope(defaults = {}, initial = null) {
  const { user, userRole, userProfile, personKey } = useAuth();
  const team = useTeam();
  const myRepKey = userProfile?.salesRepKey || null;

  const options = useMemo(() => {
    const o = [];
    if (myRepKey) o.push({ value: 'mine', label: 'Benim' });
    if (userRole === 'regionManager') o.push({ value: 'team', label: 'Ekibim' });
    o.push({ value: 'all', label: 'Tümü' });
    // Sahip ve müdürler bölge ekiplerini ayrı ayrı seçebilir (bölge müdürünün kendi ekibi "Ekibim" olarak zaten var)
    if (userRole === 'owner' || userRole === 'deptManager' || userRole === 'regionManager') {
      team.managers.filter((m) => m.key !== personKey).forEach((m) => o.push({ value: `mgr:${m.key}`, label: `${m.name} ekibi` }));
    }
    return o;
  }, [myRepKey, userRole, team.managers, personKey]);

  const fallback = defaults[userRole] || 'all';
  const [scope, setScope] = useState(initial || fallback);
  const valid = options.some((o) => o.value === scope) ? scope : (options.some((o) => o.value === fallback) ? fallback : 'all');

  // Kapsamdaki temsilci anahtarları; null = herkes
  const repKeys = useMemo(() => {
    if (valid === 'all') return null;
    if (valid === 'mine') return new Set(myRepKey ? [myRepKey] : []);
    const mgr = valid === 'team' ? personKey : valid.slice(4);
    const set = repKeysUnder(team.people, mgr);
    return set.size ? set : null; // ekip tanımlı değilse herkesi göster
  }, [valid, myRepKey, personKey, team.people]);

  const isMine = valid === 'mine';
  return {
    scope: valid, setScope, options, repKeys, isMine,
    teamUndefined: valid === 'team' && !repKeys,
    matchDealer: (e) => !repKeys || repKeys.has(e.k),
    matchReg: (r) => !repKeys || (isMine && r.createdByUid === user.uid) || repKeys.has(r.salesRepKey),
    matchRequest: (q, dealerRepKey) => !repKeys || (isMine && q.createdByUid === user.uid)
      || repKeys.has(q.createdByRepKey) || repKeys.has(dealerRepKey),
  };
}
