// src/utils/team.js
// Ekip ağacı: departman müdürü → bölge müdürleri → temsilciler.
// Kişi anahtarı Customer Data'daki yazılışın büyük harfli halidir (ör. "DOĞAN ORHAN").
import { useMemo } from 'react';
import { db } from '../firebase';
import { useRepProfiles, savePerson } from './repProfiles';

export const TEAM_ROLES = { deptManager: 'Departman Müdürü', regionManager: 'Bölge Müdürü', rep: 'Temsilci' };
export const personKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');

// İlk kurulum için ekip (Ekip sayfasındaki "Ekibi oluştur" butonu)
export const SEED_TEAM = [
  { name: 'Ömer Selçuk Evecen', role: 'deptManager', manager: null },
  { name: 'Doğan Orhan', role: 'regionManager', manager: 'Ömer Selçuk Evecen' },
  { name: 'Selman Acar', role: 'regionManager', manager: 'Ömer Selçuk Evecen' },
  { name: 'Abdulkadir Önder', role: 'regionManager', manager: 'Ömer Selçuk Evecen' },
  { name: 'Rüya Savaştürk', role: 'regionManager', manager: 'Ömer Selçuk Evecen' },
  { name: 'Mustafa Kemal Nalvuran', role: 'rep', manager: 'Doğan Orhan' },
  { name: 'Özer Doğukan Erilli', role: 'rep', manager: 'Doğan Orhan' },
  { name: 'Mahsum Bal', role: 'rep', manager: 'Selman Acar' },
  { name: 'Yunus Yakar', role: 'rep', manager: 'Abdulkadir Önder' },
  { name: 'Veysel Yunus Göloğlu', role: 'rep', manager: 'Abdulkadir Önder' },
  { name: 'Atakan Bediz', role: 'rep', manager: 'Abdulkadir Önder' },
  { name: 'Tuğçe Yıldırıcı', role: 'rep', manager: 'Rüya Savaştürk' },
  { name: 'Uğur Akgün', role: 'rep', manager: 'Rüya Savaştürk' },
  { name: 'Sinan Aydın', role: 'rep', manager: 'Rüya Savaştürk' },
];

export async function seedTeam(by) {
  for (const p of SEED_TEAM) {
    await savePerson(db, { key: personKey(p.name), name: p.name, role: p.role, managerKey: p.manager ? personKey(p.manager) : null, by });
  }
}

// Bir müdürün altındaki temsilcilerin anahtarları (departman müdürü için bütün temsilciler)
export function repKeysUnder(people, managerKey) {
  const out = new Set();
  const walk = (k) => people.forEach((p) => {
    if (p.managerKey !== k) return;
    if (p.role === 'rep') out.add(p.key); else walk(p.key);
  });
  walk(managerKey);
  return out;
}

export function useTeam() {
  const profiles = useRepProfiles(db);
  return useMemo(() => {
    const people = Object.values(profiles).filter((p) => p.inTeam && p.role);
    const byKey = Object.fromEntries(people.map((p) => [p.key, p]));
    const sort = (a, b) => a.name.localeCompare(b.name, 'tr');
    return {
      people,
      byKey,
      profiles,
      dept: people.filter((p) => p.role === 'deptManager').sort(sort),
      managers: people.filter((p) => p.role === 'regionManager').sort(sort),
      reps: people.filter((p) => p.role === 'rep').sort(sort),
      defined: people.length > 0,
    };
  }, [profiles]);
}
