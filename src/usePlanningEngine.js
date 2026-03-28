import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════════════
// UTILITAIRES TEMPS
// ═══════════════════════════════════════════════════════════════

// "09:30" → 570 (minutes depuis minuit)
function parseHHMM(str) {
  if (!str || typeof str !== 'string') return 0;
  const [h, m] = str.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Résoud une heure absolue ("09:30") ou relative ("-2h30", "+30min")
// baseOpen / baseClose = minutes depuis minuit des horaires clients
function resolveTime(str, baseOpen, baseClose) {
  if (!str) return baseOpen;

  // Heure absolue : "09:30"
  if (/^\d{2}:\d{2}$/.test(str)) return parseHHMM(str);

  // Décalage négatif par rapport à l'ouverture : "-2h30" ou "-0h"
  const negMatch = str.match(/^-(\d+)h(\d+)?$/);
  if (negMatch) {
    const h = parseInt(negMatch[1], 10);
    const m = parseInt(negMatch[2] || '0', 10);
    return baseOpen - h * 60 - m;
  }

  // Décalage positif par rapport à la fermeture : "+30min" ou "+1h30"
  const posHMatch = str.match(/^\+(\d+)h(\d+)?/);
  if (posHMatch) return baseClose + parseInt(posHMatch[1], 10) * 60 + parseInt(posHMatch[2] || '0', 10);
  const posMinMatch = str.match(/^\+(\d+)min/);
  if (posMinMatch) return baseClose + parseInt(posMinMatch[1], 10);

  return parseHHMM(str); // fallback
}

function minsToHHMM(mins) {
  if (!isFinite(mins) || mins < 0) return '--:--';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Noms des jours alignés sur jour_semaine 0=lundi…6=dimanche
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// ═══════════════════════════════════════════════════════════════
// HOOK : usePlanningData
// Charge toutes les données Supabase nécessaires au moteur
// ═══════════════════════════════════════════════════════════════

export function usePlanningData(etablissementId) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!etablissementId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      // Chargement parallèle des 6 tables
      const [empRes, svcRes, slotRes, capRes, dispoRes, profilRes] = await Promise.all([
        supabase.from('employees').select('*')
          .eq('etablissement_id', etablissementId)
          .eq('actif', true)
          .order('ordre_affichage'),
        supabase.from('services').select('*')
          .eq('etablissement_id', etablissementId)
          .eq('actif', true),
        supabase.from('slots').select('*'),
        supabase.from('capacites').select('*').eq('etablissement_id', etablissementId),
        supabase.from('disponibilites').select('*'),
        supabase.from('profils').select('*').eq('etablissement_id', etablissementId),
      ]);

      const serviceIds = new Set((svcRes.data || []).map(s => s.id));
      const empIds     = new Set((empRes.data || []).map(e => e.id));

      setData({
        employees:      empRes.data   || [],
        services:       svcRes.data   || [],
        slots:          (slotRes.data || []).filter(sl => serviceIds.has(sl.service_id)),
        capacites:      capRes.data   || [],
        disponibilites: (dispoRes.data || []).filter(d => empIds.has(d.employee_id)),
        profils:        profilRes.data || [],
      });
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [etablissementId]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ═══════════════════════════════════════════════════════════════
// MOTEUR : buildPlanning
//
// weekDates : tableau de 7 chaînes ISO "YYYY-MM-DD" (lundi→dimanche)
// data      : résultat de usePlanningData
//
// Retourne  : { days, warnings, employeeHours, employees }
// ═══════════════════════════════════════════════════════════════

export function buildPlanning(data, weekDates) {
  const { employees, services, slots, disponibilites, profils } = data;

  // ── Construire l'index profil → ensemble de capacité IDs ──
  const profilCaps = Object.fromEntries(
    profils.map(p => [p.id, new Set(p.capacites_ids || [])])
  );

  // Capacités effectives d'un employé (profil + supplémentaires)
  function getEmpCaps(emp) {
    const caps = new Set(emp.capacites_supplementaires_ids || []);
    if (emp.profil_id && profilCaps[emp.profil_id]) {
      profilCaps[emp.profil_id].forEach(id => caps.add(id));
    }
    return caps;
  }

  // ── ÉTAPE 1 : EXCLURE — jours indisponibles par employé ──
  // unavail[employee_id] = Set<dayIdx 0-6>
  const unavail = {};
  for (const emp of employees) {
    unavail[emp.id] = new Set();
    for (const jourNom of (emp.jours_indisponibles || [])) {
      const idx = DAY_NAMES.indexOf(jourNom.toLowerCase());
      if (idx >= 0) unavail[emp.id].add(idx);
    }
  }
  // Disponibilités saisies manuellement (est_disponible = false)
  for (const d of disponibilites) {
    if (!d.est_disponible) {
      if (!unavail[d.employee_id]) unavail[d.employee_id] = new Set();
      unavail[d.employee_id].add(d.jour_semaine);
    }
  }

  // ── ÉTAPES 2-3 : ASSIGNER ──
  // assignments[employee_id] = [{ dayIdx, serviceId, slotId, startMins, endMins }]
  const assignments = Object.fromEntries(employees.map(e => [e.id, []]));

  const days = weekDates.map((isoDate, dayIdx) => {
    // Services actifs ce jour-là, triés par heure d'ouverture
    const servicesThisDay = services
      .filter(svc => svc.jour_semaine === dayIdx)
      .sort((a, b) => parseHHMM(a.heure_ouverture_clients) - parseHHMM(b.heure_ouverture_clients));

    const dayServices = servicesThisDay.map(svc => {
      const openMins  = parseHHMM(svc.heure_ouverture_clients  || '12:00');
      const closeMins = parseHHMM(svc.heure_fermeture_clients || '14:30');

      const slotsForSvc = slots
        .filter(sl => sl.service_id === svc.id)
        .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

      const filledSlots = slotsForSvc.map(slot => {
        const startMins = resolveTime(slot.heure_debut, openMins, closeMins);
        const endMins   = resolveTime(slot.heure_fin,   openMins, closeMins);
        const required  = new Set(slot.capacites_requises_ids || []);

        // Filtrer les éligibles
        const eligible = employees.filter(emp => {
          // Indisponible ce jour
          if (unavail[emp.id]?.has(dayIdx)) return false;
          // Capacités insuffisantes
          const caps = getEmpCaps(emp);
          for (const capId of required) if (!caps.has(capId)) return false;
          // Conflit de créneau (chevauchement)
          const todayWork = assignments[emp.id].filter(a => a.dayIdx === dayIdx);
          return !todayWork.some(a => startMins < a.endMins && endMins > a.startMins);
        });

        // Trier : salarié d'abord → moins d'heures assignées → ordre_affichage
        eligible.sort((a, b) => {
          const aAssoc = a.statut !== 'salarie' ? 1 : 0;
          const bAssoc = b.statut !== 'salarie' ? 1 : 0;
          if (aAssoc !== bAssoc) return aAssoc - bAssoc;
          const aH = assignments[a.id].reduce((s, x) => s + x.endMins - x.startMins, 0);
          const bH = assignments[b.id].reduce((s, x) => s + x.endMins - x.startMins, 0);
          if (Math.abs(aH - bH) > 5) return aH - bH;
          return (a.ordre_affichage || 0) - (b.ordre_affichage || 0);
        });

        const assigned = eligible.slice(0, slot.nb_personnes);
        for (const emp of assigned) {
          assignments[emp.id].push({ dayIdx, serviceId: svc.id, slotId: slot.id, startMins, endMins });
        }

        return {
          ...slot,
          startMins,
          endMins,
          startLabel: minsToHHMM(startMins),
          endLabel:   minsToHHMM(endMins),
          assignedEmployees: assigned,
          missing: Math.max(0, slot.nb_personnes - assigned.length),
        };
      });

      const assignedSet = new Set(filledSlots.flatMap(sl => sl.assignedEmployees.map(e => e.id)));
      return { ...svc, slots: filledSlots, assignedCount: assignedSet.size };
    });

    return { dayIdx, isoDate, services: dayServices };
  });

  // ── ÉTAPE 4 : ÉQUILIBRER — calcul des heures par employé ──
  const employeeHours = Object.fromEntries(employees.map(emp => {
    const assignedMins = assignments[emp.id].reduce((s, a) => s + a.endMins - a.startMins, 0);
    const assigned = assignedMins / 60;
    const contract = emp.heures_contrat || 0;
    return [emp.id, { assigned, contract, diff: assigned - contract }];
  }));

  // ── ÉTAPE 5 : ALERTER — générer les warnings ──
  const warnings = [];

  for (const day of days) {
    for (const svc of day.services) {
      // CRITIQUE : effectif minimum non atteint
      if (svc.assignedCount < svc.effectif_minimum) {
        warnings.push({
          level: 'CRITIQUE',
          message: `${svc.nom} (${DAY_NAMES[day.dayIdx]}) : ${svc.assignedCount}/${svc.effectif_minimum} employés — effectif minimum non atteint`,
        });
      }
      // CRITIQUE ou INFO : slot non couvert
      for (const slot of svc.slots) {
        if (!slot.optionnel && slot.missing > 0) {
          warnings.push({
            level: 'CRITIQUE',
            message: `${svc.nom} — poste "${slot.nom}" : ${slot.missing} place${slot.missing > 1 ? 's' : ''} non couverte${slot.missing > 1 ? 's' : ''}`,
          });
        } else if (slot.optionnel && slot.missing > 0) {
          warnings.push({
            level: 'INFO',
            message: `${svc.nom} — poste optionnel "${slot.nom}" non couvert`,
          });
        }
      }
    }
  }

  // ATTENTION : employé salarié significativement sous ses heures contrat
  for (const emp of employees) {
    if (emp.statut === 'salarie') {
      const { diff, contract, assigned } = employeeHours[emp.id];
      if (contract > 0 && diff < -3) {
        warnings.push({
          level: 'ATTENTION',
          message: `${emp.prenom} ${emp.nom} : ${assigned.toFixed(1)}h assignées / ${contract}h contrat (écart : ${diff.toFixed(1)}h)`,
        });
      }
    }
  }

  return { days, warnings, employeeHours, employees };
}

// ═══════════════════════════════════════════════════════════════
// HOOK COMBINÉ : usePlanning
// Usage : const { result, loading, error, reload } = usePlanning(etablissementId, weekDates)
// ═══════════════════════════════════════════════════════════════

export function usePlanning(etablissementId, weekDates) {
  const { data, loading, error, reload } = usePlanningData(etablissementId);

  const result = useMemo(() => {
    if (!data || !weekDates || weekDates.length < 7) return null;
    return buildPlanning(data, weekDates);
  }, [data, weekDates]);

  return { result, loading, error, reload };
}
