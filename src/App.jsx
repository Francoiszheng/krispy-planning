import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from './supabase';
import SettingsTab from './Settings';

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

// Fallback data (used while Supabase loads or if offline)
const DEFAULT_TEAM_RESTAU = [
  { id:'vy',      name:'Vy',      role:'Assist. Manager', color:'#7c3aed', initials:'Vy' },
  { id:'justin',  name:'Justin',  role:'Manager (form.)', color:'#2563eb', initials:'Ju' },
  { id:'kevin',   name:'Kévin',   role:'Responsable',     color:'#dc2626', initials:'Kv', meetingOnly:true },
  { id:'mathieu', name:'Mathieu', role:'Équipier',        color:'#16a34a', initials:'Ma' },
  { id:'ashit',   name:'Ashit',   role:'Équipier',        color:'#d97706', initials:'As' },
];

const DEFAULT_TEAM_FT = [
  { id:'aaron',    name:'Aaron',    role:'Chauffeur / FT',  color:'#0891b2', initials:'Aa' },
  { id:'jeremy',   name:'Jérémy',   role:'FT + Labo',       color:'#7c3aed', initials:'Jé' },
  { id:'kevin',    name:'Kévin',    role:'Labo (variable)', color:'#dc2626', initials:'Kv' },
  { id:'vanessa',  name:'Vanessa',  role:'Labo (variable)', color:'#db2777', initials:'Va' },
  { id:'francois', name:'François', role:'FT / Labo var.',  color:'#64748b', initials:'Fr' },
  { id:'jimmy',    name:'Jimmy',    role:'Labo (L PM + D)', color:'#059669', initials:'Ji' },
  { id:'william',  name:'William',  role:'Labo (L/Ma/D)',   color:'#ca8a04', initials:'Wi' },
];

const FT_LOCATIONS = ['Place de la Défense','Grande Arche','Valmy','Chatou (Labo)','Boulogne','Autre'];
const EXTRA_OFF_OPTIONS = ['Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

const COVERS_PER_KG   = 6;
const COVERS_PER_SAC  = 8.6;
const RESTAU_KG       = 105;
const FT_BUFFER       = 1.2;
const KG_PER_HOUR_FRI = 60;
const ONE_SESSION_MAX = 240;
const KG_PER_HOUR_DEC = 40;   // découpe poulet par personne/heure
const TARGET_H        = 39;
const FRITURE_SETUP   = 0.5;  // 30 min
const FRITURE_CLEAN   = 2.0;  // 2h nettoyage
const DECOUPE_SETUP   = 0.5;  // 30 min
const DECOUPE_CLEAN   = 1.0;  // 1h nettoyage

// ══════════════════════════════════════════════════════════════
// TIME UTILS
// ══════════════════════════════════════════════════════════════

const toMin   = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const fromMin = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const diffH   = (a,b) => { const d = toMin(b)-toMin(a); return Math.round((d<0?d+1440:d)/6)/10; };
const addH    = (t,h) => fromMin(toMin(t)+Math.round(h*60));
const fmtHM   = t => t.replace(':','h');
const sh      = (start,end,label,type,group) => ({ start,end,label,type,hrs:diffH(start,end),group:group||null });
const r       = x => Math.round(x*10)/10;

function getMonday(iso) {
  // Parse ISO string safely in local timezone
  const [y,m,d] = iso.split('-').map(Number);
  const date = new Date(y, m-1, d, 12, 0, 0); // noon local, avoids DST issues
  const dow = date.getDay();
  date.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1));
  return date;
}
const fmtD = d => {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${dd}/${mm}`;
};
// Safe ISO from local date (no UTC shift)
const toLocalISO = d => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
};

// ══════════════════════════════════════════════════════════════
// FRITURE ENGINE
// ══════════════════════════════════════════════════════════════

function calcFriture(services) {
  const ftCovers = services.reduce((s,sv)=>s+(sv.covers||0), 0);
  const ftKgRaw  = ftCovers / COVERS_PER_KG;
  const ftKg     = Math.ceil(ftKgRaw * FT_BUFFER);
  const totalKg  = ftKg + RESTAU_KG;

  const sessionDur = kg => r(kg/KG_PER_HOUR_FRI + FRITURE_SETUP + FRITURE_CLEAN);

  let sessions = [];
  if (totalKg <= ONE_SESSION_MAX) {
    const start='14:00', dur=sessionDur(totalKg), end=addH(start,dur);
    sessions = [{
      label:'Lundi après-midi', day:'Lundi', startTime:start, endTime:end,
      kg:totalKg, sachets:Math.ceil(totalKg/COVERS_PER_SAC),
      fritH:r(totalKg/KG_PER_HOUR_FRI), totalH:dur,
      note:`30min setup · ${r(totalKg/KG_PER_HOUR_FRI)}h friture · 2h nettoyage`,
      window:`${fmtHM(start)} → ${fmtHM(end)}`,
    }];
  } else {
    const half = Math.ceil(totalKg/2);
    const durAM=sessionDur(half), durPM=sessionDur(half);
    const endAM=addH('09:00',durAM), endPM=addH('14:00',durPM);
    sessions = [
      { label:'Lundi matin',   day:'Lundi', startTime:'09:00', endTime:endAM, kg:half,
        sachets:Math.ceil(half/COVERS_PER_SAC), fritH:r(half/KG_PER_HOUR_FRI), totalH:durAM,
        note:`Session 1/2 · 30min setup · ${r(half/KG_PER_HOUR_FRI)}h friture · 2h nettoyage`,
        window:`09h00 → ${fmtHM(endAM)}` },
      { label:'Lundi après-midi', day:'Lundi', startTime:'14:00', endTime:endPM, kg:half,
        sachets:Math.ceil(half/COVERS_PER_SAC), fritH:r(half/KG_PER_HOUR_FRI), totalH:durPM,
        note:`Session 2/2 · 30min setup · ${r(half/KG_PER_HOUR_FRI)}h friture · 2h nettoyage`,
        window:`14h00 → ${fmtHM(endPM)}` },
    ];
  }
  return { ftCovers, ftKgRaw:Math.round(ftKgRaw), ftKg, totalKg, sessions };
}

// ══════════════════════════════════════════════════════════════
// DÉCOUPE ENGINE (Dimanche matin)
// ══════════════════════════════════════════════════════════════

function calcDecoupe(decoupeKg, nbPersonnes=3) {
  const fritH = r(decoupeKg/(KG_PER_HOUR_DEC*nbPersonnes));
  const totalH = r(fritH + DECOUPE_SETUP + DECOUPE_CLEAN);
  const startTime = '09:00';
  const endTime   = addH(startTime, totalH);
  return {
    startTime, endTime, totalH, fritH,
    kg: decoupeKg, nbPersonnes,
    note: `30min setup · ${fritH}h découpe (${nbPersonnes} pers.) · 1h nettoyage`,
    window: `${fmtHM(startTime)} → ${fmtHM(endTime)}`,
  };
}

// ══════════════════════════════════════════════════════════════
// RESTAURANT SCHEDULE ENGINE
// ══════════════════════════════════════════════════════════════
/*
  STRUCTURE PAR JOUR :
  Mardi       midi : 2 personnes à 9h (prépas) + 1 à 12h (service)
  Mer/Jeu/Ven midi : 1 à 9h30 (prépas) + 1 à 11h (finit mise en place) + 1 à 12h (service)
  Sam/Dim     midi : 2 personnes à 10h (prépas)
  Soir à 2        : 1 équipier à 18h (prépas), manager à 19h
  Soir à 3        : équipier/manager à 18h, 2 autres à 19h
  Prépas 18h      : n'importe qui (équipier prioritaire si dispo)

  SPLIT WEEKEND — defaults mathieuOff=Mer, ashitOff=Jeu :
    Samedi  : Vy + Mathieu à 10h  (Ashit soir seulement)
    Dimanche: Justin + Ashit à 10h (Mathieu soir seulement)

  HEURES Sem A (Vy=mi, Justin=so) · defaults :
    Vy 37h  Justin 33.5h (+meetings)  Mathieu 36.5h  Ashit 37.5h  → personne > 39h
*/
function buildRestauSchedule(weekType, cfg, team) {
  const TEAM_RESTAU = team || DEFAULT_TEAM_RESTAU;
  const { mathieuOff='Mercredi', ashitOff='Jeudi', adminHours=3 } = cfg;
  const plan = {};
  TEAM_RESTAU.forEach(p => {
    plan[p.id] = {};
    DAYS.forEach(d => { plan[p.id][d] = { shifts:[],off:null }; });
  });
  const off   = (pid,day,why='Repos') => { if (plan[pid]) plan[pid][day] = { shifts:[],off:why }; };
  const add   = (pid,day,...shifts) => { if (!plan[pid]?.[day] || plan[pid][day].off) return; shifts.forEach(s => plan[pid][day].shifts.push(s)); };
  const dispo = (pid,day) => plan[pid] ? !plan[pid]?.[day]?.off : false;

  TEAM_RESTAU.forEach(p => off(p.id,'Lundi','Fermé'));
  off('justin','Samedi');
  off('vy','Dimanche');
  off('mathieu',mathieuOff);
  off('ashit',ashitOff);

  const A  = weekType === 'A';
  const mi = A ? 'vy' : 'justin';
  const so = A ? 'justin' : 'vy';

  // ── MARDI ─────────────────────────────────────────────────
  // Midi à3 : mi(9h) + Mathieu(9h) + Ashit(12h)
  // Point manager 14h30–15h30 : mi + so + kevin
  // Soir à2 (calme) : Ashit(18h prépas) + so(19h)
  add(mi,       'Mardi', sh('09:00','14:30','Prépas + Service midi','midi'), sh('14:30','15:30','Point manager','meeting'));
  add('kevin',  'Mardi', sh('14:30','15:30','Point manager','meeting'), sh('15:30','16:30','Point Direction','meeting'));
  add(so,       'Mardi', sh('14:30','15:30','Point manager','meeting'), sh('19:00','23:00','Service soir','soir'));
  add('justin', 'Mardi', sh('15:30','16:30','Point Direction','meeting')); // Justin toujours, quelle que soit la semaine
  if (dispo('mathieu','Mardi')) add('mathieu','Mardi', sh('09:00','14:30','Prépas + Service midi','midi'));
  if (dispo('ashit','Mardi'))   add('ashit','Mardi',   sh('12:00','14:30','Service midi','midi'), sh('18:00','23:00','Prépas + Service soir','soir'));


  // ── MERCREDI ──────────────────────────────────────────────
  // Midi : Ashit(9h30 prépas) + mi(11h finit mise en place) + so(12h)
  // → Équipier fait les prépas, mi arrive à 11h pour économiser ses heures
  // Soir à3 : Ashit(18h prépas) + so(19h) + mi(19h)
  // Fallback Ashit off : mi reprend 9h30, Mathieu soir si dispo
  add(so, 'Mercredi', sh('12:00','14:30','Service midi','midi'));
  if (dispo('ashit','Mercredi')) {
    add('ashit','Mercredi', sh('10:00','14:30','Prépas + Service midi','midi'), sh('18:00','23:00','Prépas + Service soir','soir'));
    add(mi, 'Mercredi', sh('11:00','14:30','Mise en place + midi','midi'), sh('19:00','23:00','Service soir','soir'));
    add(so, 'Mercredi', sh('19:00','23:00','Service soir','soir'));
  } else {
    add(mi, 'Mercredi', sh('09:30','14:30','Prépas + Service midi','midi'), sh('19:00','23:00','Service soir','soir'));
    if (dispo('mathieu','Mercredi')) add('mathieu','Mercredi', sh('11:00','14:30','Mise en place + midi','midi'), sh('19:00','23:00','Service soir','soir'));
    add(so, 'Mercredi', sh('18:00','23:00','Prépas + Service soir','soir'));
  }

  // ── JEUDI ─────────────────────────────────────────────────
  // Midi : Mathieu(9h30 prépas) + mi(11h finit mise en place) + so(12h)
  // → Mathieu prend les prépas, mi/Justin libéré du matin pour ≤39h
  // Soir à3 : Mathieu(18h prépas) · mi(19h) · so(19h)
  // Fallback si Mathieu off : mi reprend le 9h30
  add(so, 'Jeudi', sh('12:00','14:30','Service midi','midi'), sh('19:00','23:00','Service soir','soir'));
  if (dispo('mathieu','Jeudi')) {
    add('mathieu','Jeudi', sh('09:30','14:30','Prépas + Service midi','midi'), sh('18:00','23:00','Prépas + Service soir','soir'));
    add(mi, 'Jeudi', sh('11:00','14:30','Mise en place + midi','midi'), sh('19:00','23:00','Service soir','soir'));
    if (dispo('ashit','Jeudi')) add('ashit','Jeudi', sh('12:00','14:30','Service midi','midi'), sh('19:00','23:00','Service soir','soir'));
  } else {
    // Mathieu off : mi reprend le 9h30, Ashit(11h) ou so(12h) complète
    add(mi, 'Jeudi', sh('09:30','14:30','Prépas + Service midi','midi'), sh('19:00','23:00','Service soir','soir'));
    if (dispo('ashit','Jeudi')) add('ashit','Jeudi', sh('11:00','14:30','Mise en place + midi','midi'), sh('18:00','23:00','Prépas + Service soir','soir'));
  }

  // ── VENDREDI ──────────────────────────────────────────────
  // Midi à3 : mi(9h30) + Mathieu(11h) + Ashit(12h)
  // Soir à3 : so(18h prépas) + Mathieu(19h) + Ashit(19h)
  // Point équipe 14h30–15h : tout le monde
  add(mi,      'Vendredi', sh('09:30','14:30','Prépas + Service midi','midi'), sh('14:30','15:30','Point équipe','meeting'));
  add('kevin', 'Vendredi', sh('14:30','15:30','Point équipe','meeting'));
  add(so,      'Vendredi', sh('14:30','15:30','Point équipe','meeting'), sh('18:00','23:30','Prépas + Service soir','soir'));
  if (dispo('mathieu','Vendredi')) add('mathieu','Vendredi', sh('11:00','14:30','Mise en place + midi','midi'), sh('14:30','15:30','Point équipe','meeting'), sh('19:00','23:30','Service soir','soir'));
  if (dispo('ashit','Vendredi'))   add('ashit','Vendredi',   sh('12:00','14:30','Service midi','midi'),         sh('14:30','15:30','Point équipe','meeting'), sh('19:00','23:30','Service soir','soir'));

  // ── ADMIN FLEXIBLE (rôle "soir") ────────────────────────────
  // Distribue les heures admin dans les créneaux PM disponibles
  // pour rapprocher le manager "soir" des 39h
  if (adminHours > 0) {
    let remaining = adminHours;
    const adminSlots = [
      { day:'Mercredi', start:'15:00', maxH:2,   label:'Admin · Commandes & stocks' },
      { day:'Jeudi',    start:'15:00', maxH:2,   label:'Admin · Caisse & inventaire' },
      { day:'Mardi',    start:'16:30', maxH:1.5, label:'Admin · Suivi équipe' },
    ];
    adminSlots.forEach(slot => {
      if (remaining <= 0 || !dispo(so, slot.day)) return;
      const h = Math.min(remaining, slot.maxH);
      const end = addH(slot.start, h);
      add(so, slot.day, sh(slot.start, end, slot.label, 'admin'));
      remaining = r(remaining - h);
    });
  }

  // ── SAMEDI (Justin off — Vy seule manager) ─────────────────
  // Midi à2 (10h) : Vy + Mathieu [si Mathieu off → Ashit]
  // Soir à3 : Vy(18h) + Mathieu(19h) + Ashit(19h)
  add('vy', 'Samedi', sh('10:00','15:30','Prépas + Service midi','midi'), sh('18:00','23:30','Prépas + Service soir','soir'));
  if (dispo('mathieu','Samedi')) {
    add('mathieu','Samedi', sh('10:00','15:30','Prépas + Service midi','midi'), sh('19:00','23:30','Service soir','soir'));
    if (dispo('ashit','Samedi')) add('ashit','Samedi', sh('19:00','23:30','Service soir','soir'));
  } else if (dispo('ashit','Samedi')) {
    add('ashit','Samedi', sh('10:00','15:30','Prépas + Service midi','midi'), sh('19:00','23:30','Service soir','soir'));
  }

  // ── DIMANCHE (Vy off — Justin seul manager) ────────────────
  // Midi à2 (10h) : Justin + Ashit [si Ashit off → Mathieu]
  // Soir à3 : Justin(18h) + Ashit(19h) + Mathieu(19h)
  add('justin', 'Dimanche', sh('10:00','15:30','Prépas + Service midi','midi'), sh('18:00','23:00','Prépas + Service soir','soir'));
  if (dispo('ashit','Dimanche')) {
    add('ashit','Dimanche', sh('10:00','15:30','Prépas + Service midi','midi'), sh('19:00','23:00','Service soir','soir'));
    if (dispo('mathieu','Dimanche')) add('mathieu','Dimanche', sh('19:00','23:00','Service soir','soir'));
  } else if (dispo('mathieu','Dimanche')) {
    add('mathieu','Dimanche', sh('10:00','15:30','Prépas + Service midi','midi'), sh('19:00','23:00','Service soir','soir'));
  }

  // ── Totals & Warnings ──────────────────────────────────────
  TEAM_RESTAU.forEach(p => {
    let t = 0;
    DAYS.forEach(d => (plan[p.id][d].shifts||[]).forEach(s => { t += s.hrs; }));
    plan[p.id]._total = r(t);
  });

  const warnings = [];
  DAYS.filter(d=>d!=='Lundi').forEach(day => {
    const mgrMidi = ['vy','justin'].some(id => dispo(id,day) && plan[id][day]?.shifts?.some(s=>s.type==='midi'));
    const mgrSoir = ['vy','justin'].some(id => dispo(id,day) && plan[id][day]?.shifts?.some(s=>s.type==='soir'));
    if (!mgrMidi) warnings.push(`${day} midi — pas de manager`);
    if (!mgrSoir) warnings.push(`${day} soir — pas de manager`);
  });
  TEAM_RESTAU.filter(p=>!p.meetingOnly).forEach(p => {
    const t = plan[p.id]._total;
    const isMgr = p.id==='vy'||p.id==='justin';
    if (t > TARGET_H)                warnings.push(`${p.name} : ${t}h/sem → dépasse 39h ↑`);
    if (!isMgr && t < TARGET_H-3)    warnings.push(`${p.name} : ${t}h/sem ↓ — ajuster jour off`);
    if (isMgr  && t < TARGET_H-7)    warnings.push(`${p.name} : ${t}h/sem ↓ — vérifier`);
  });
  plan._warnings = warnings;
  return plan;
}

// ══════════════════════════════════════════════════════════════
// FT / LABO SCHEDULE ENGINE
// ══════════════════════════════════════════════════════════════
/*
  SERVICE FT — 3 RÔLES :

  AARON (journée complète 09:00–15:30 pour Défense) :
    09:00–10:00  Mise en place FT au labo
    10:00–10:30  Trajet labo → emplacement (30min Défense, variable ailleurs)
    10:30–11:30  Mise en place sur place
    11:30–11:45  Vérifications
    11:45–13:30  Service
    13:30–14:00  Nettoyage FT avant départ
    14:00–14:30  Retour au labo
    14:30–15:30  Nettoyage + rangement FT/labo

  FRANÇOIS (service léger 11:45–14:00) :
    11:45–13:30  Service
    13:30–14:00  Nettoyage FT avant départ → rentre chez lui

  JÉRÉMY (service + retour labo 11:45–15:30) :
    11:45–13:30  Service
    13:30–14:00  Nettoyage FT avant départ
    14:00–14:30  Retour au labo avec Aaron
    14:30–15:30  Nettoyage + rangement FT/labo

  AARON — EXTRAS HEBDO :
    Découpe dimanche (complément d'heures)
    Nettoyage labo hebdomadaire : 2–3h (configurable)

  PRODUCTION FIXE JEUDI PM :
    Jérémy : 14h00–20h00 (6h — sauces + légumes)
    Aaron  : 14h00–17h00 (3h)

  LIVRAISON JEUDI SOIR :
    Jérémy : 21h30–23h30 (2h aller-retour, 1 restaurant)

  FRITURE LUNDI :
    William (toute la journée) + Jimmy (à partir 14h)
    Variables : Kévin → Vanessa → François (selon dispo)
    Aaron + Jérémy rejoignent après retour FT (~15h30) si session PM

  LIVRAISON LUNDI SOIR :
    Jimmy + Jérémy après la friture
    2h (1 restaurant) ou 3h (2 restaurants)

  DÉCOUPE DIMANCHE MATIN :
    Jérémy + Jimmy + William + Aaron (complément heures)
    Après découpe : Jérémy reste 4h prépas

  DISPONIBILITÉS :
    Jimmy   : Lundi PM (≥14h) + Dimanche
    William : Lundi + Mardi + Dimanche
*/
function buildFTSchedule(services, friture, decoupe, ftParams, team) {
  const TEAM_FT = team || DEFAULT_TEAM_FT;
  const { deuxRestau=false, aaronNettoyageH=2.5, aaronNettoyageDay='Mardi' } = ftParams||{};
  const livraisonLundiH = deuxRestau ? 3 : 2;

  const plan = {};
  TEAM_FT.forEach(p => {
    plan[p.id] = {};
    DAYS.forEach(d => { plan[p.id][d] = { shifts:[],off:null }; });
  });
  const off = (pid,day,why='Indispo') => { if (plan[pid]) plan[pid][day] = { shifts:[],off:why }; };
  const add = (pid,day,...shifts) => {
    if (!plan[pid]?.[day] || plan[pid][day].off) return;
    shifts.forEach(s => plan[pid][day].shifts.push(s));
  };
  // forceAdd: clears off status — used for explicitly assigned FT roles
  const forceAdd = (pid,day,...shifts) => {
    if (!plan[pid]) return;
    if (plan[pid][day]?.off) plan[pid][day] = { shifts:[], off:null };
    shifts.forEach(s => plan[pid][day].shifts.push(s));
  };

  // ── Disponibilités fixes ────────────────────────────────────
  ['Mardi','Mercredi','Jeudi','Vendredi','Samedi'].forEach(d => off('jimmy',d));
  ['Mercredi','Jeudi','Vendredi','Samedi'].forEach(d => off('william',d));

  // ── Point Direction — Mardi 15h30–16h30 ──────────────────────
  add('vanessa',  'Mardi', sh('15:30','16:30','Point Direction','meeting'));
  add('francois', 'Mardi', sh('15:30','16:30','Point Direction','meeting'));

  // ── Services FT (détail par rôle) ───────────────────────────
  services.forEach((sv,svIdx) => {
    const isDefense = sv.loc === 'Place de la Défense';
    const isFriday  = sv.day === 'Vendredi';
    const nbPers    = sv.nbPers || (isDefense ? (isFriday ? 2 : 3) : 2);
    const trajetMin = sv.trajet || (isDefense ? 30 : 30); // minutes
    const locLabel  = isDefense ? 'DÉFENSE' : sv.loc.toUpperCase();
    const gid       = `ft-${sv.day}-${svIdx}`;

    // Rôles assignables (par défaut Aaron/Jérémy/François)
    const roleJournee  = sv.roleJournee  || 'aaron';
    const roleRetour   = sv.roleRetour   || 'jeremy';
    const roleLeger    = sv.roleLeger    || 'francois';

    // Horaires de service (pour Défense : fixe 11:45–13:30, sinon saisi)
    const svcStart = isDefense ? '11:45' : sv.start;
    const svcEnd   = isDefense ? '13:30' : sv.end;

    // ─ Calcul séquentiel à partir de 9h (fixe) ─
    const aaronStart    = '09:00';
    const trajetDepart  = '10:00';                          // après 1h prépa
    const trajetArrivee = addH(trajetDepart, trajetMin/60); // arrivée sur place
    const verifStart    = addH(svcStart, -0.25);            // 15min avant service
    const nettEnd       = addH(svcEnd, 0.5);                // 30min nettoyage
    const retourEnd     = addH(nettEnd, trajetMin/60);      // trajet retour
    const rangementEnd  = addH(retourEnd, 1);               // 1h rangement labo

    // ─ RÔLE JOURNÉE COMPLÈTE (9h → fin rangement) ─
    forceAdd(roleJournee, sv.day,
      sh(aaronStart, trajetDepart, `Prépa FT au labo`, 'ft', gid),
      sh(trajetDepart, trajetArrivee, `Trajet → ${locLabel}`, 'ft', gid),
      sh(trajetArrivee, verifStart, `Installation sur place`, 'ft', gid),
      sh(verifStart, svcStart, `Vérifications`, 'ft', gid),
      sh(svcStart, svcEnd, `Service · ${locLabel}`, 'ft', gid),
      sh(svcEnd, nettEnd, `Nettoyage FT`, 'ft', gid),
      sh(nettEnd, retourEnd, `Retour labo`, 'ft', gid),
      sh(retourEnd, rangementEnd, `Rangement FT + labo`, 'ft', gid),
    );

    // ─ RÔLE SERVICE + RETOUR LABO (service → fin rangement) ─
    forceAdd(roleRetour, sv.day,
      sh(svcStart, svcEnd, `Service · ${locLabel}`, 'ft', gid),
      sh(svcEnd, nettEnd, `Nettoyage FT`, 'ft', gid),
      sh(nettEnd, retourEnd, `Retour labo`, 'ft', gid),
      sh(retourEnd, rangementEnd, `Rangement FT + labo`, 'ft', gid),
    );

    // ─ RÔLE SERVICE LÉGER (service → nettoyage puis rentre) ─
    if (nbPers >= 3) {
      forceAdd(roleLeger, sv.day,
        sh(svcStart, svcEnd, `Service · ${locLabel}`, 'ft', gid),
        sh(svcEnd, nettEnd, `Nettoyage FT (puis rentre)`, 'ft', gid),
      );
    }
  });

  // ── Aaron : Nettoyage labo hebdomadaire ─────────────────────
  if (aaronNettoyageH > 0) {
    const nettStart = '09:00';
    const nettEnd = addH(nettStart, aaronNettoyageH);
    // On place le nettoyage un jour sans FT (par défaut mardi)
    const hasFT = plan['aaron'][aaronNettoyageDay]?.shifts?.some(s=>s.type==='ft');
    if (!hasFT) {
      add('aaron', aaronNettoyageDay, sh(nettStart, nettEnd, `Nettoyage labo hebdo`, 'labo'));
    }
  }

  // ── Production fixe JEUDI PM — sauces & légumes ─────────
  add('jeremy','Jeudi', sh('14:00','20:00','Production · Sauces & légumes','labo'));
  add('aaron', 'Jeudi', sh('14:00','17:00','Production · Sauces & légumes','labo'));

  // ── Livraison JEUDI soir (Jérémy enchaine) ───────────────
  add('jeremy','Jeudi', sh('21:30','23:30','Livraison restaurant','labo'));

  // ── Friture LUNDI ─────────────────────────────────────────
  friture.sessions.forEach(session => {
    if (session.day !== 'Lundi') return;
    const isAM = session.startTime === '09:00';
    const isPM = session.startTime === '14:00';

    // William : dispo toute la journée lundi
    add('william','Lundi', sh(session.startTime, session.endTime, `Friture · ${session.kg}kg`,'labo'));

    // Jimmy : seulement session PM (dispo à partir 14h)
    if (isPM) add('jimmy','Lundi', sh(session.startTime, session.endTime, `Friture · ${session.kg}kg`,'labo'));

    // Variables labo : Kévin → Vanessa → François
    add('kevin',   'Lundi', sh(session.startTime, session.endTime, `Friture · ${session.kg}kg`,'labo'));
    add('vanessa', 'Lundi', sh(session.startTime, session.endTime, `Friture · ${session.kg}kg`,'labo'));

    // Jérémy : rejoint après retour FT si service lundi, sinon dès le début
    if (isPM) {
      const hasFT = plan['jeremy']['Lundi']?.shifts?.some(s=>s.type==='ft');
      const ftEnd = hasFT ? '15:30' : session.startTime;
      if (toMin(ftEnd) < toMin(session.endTime)) {
        add('jeremy','Lundi', sh(ftEnd, session.endTime,
          hasFT?'Friture (retour FT)':`Friture · ${session.kg}kg`,'labo'));
      }
    } else {
      const hasFT = plan['jeremy']['Lundi']?.shifts?.some(s=>s.type==='ft');
      if (!hasFT) add('jeremy','Lundi', sh(session.startTime, session.endTime, `Friture · ${session.kg}kg`,'labo'));
    }

    // Aaron : rejoint après retour FT si service lundi
    if (isPM) {
      const hasFT = plan['aaron']['Lundi']?.shifts?.some(s=>s.type==='ft');
      if (hasFT && toMin('15:30') < toMin(session.endTime)) {
        add('aaron','Lundi', sh('15:30', session.endTime, 'Friture (retour FT)','labo'));
      }
    }

    // François : variable labo — rejoint après retour FT si applicable
    if (isPM) {
      const hasFT = plan['francois']['Lundi']?.shifts?.some(s=>s.type==='ft');
      const ftEnd = hasFT ? '14:00' : session.startTime;
      if (toMin(ftEnd) < toMin(session.endTime)) {
        add('francois','Lundi', sh(ftEnd, session.endTime,
          hasFT?'Friture (retour FT)':`Friture · ${session.kg}kg`,'labo'));
      }
    }
  });

  // ── Livraison LUNDI soir (Jimmy + Jérémy après friture) ─
  const lastSession = friture.sessions.at(-1);
  if (lastSession) {
    const livStart = lastSession.endTime;
    const livEnd   = addH(livStart, livraisonLundiH);
    const livLabel = `Livraison restau${deuxRestau?' (×2 restau)':''}`;
    add('jimmy',  'Lundi', sh(livStart, livEnd, livLabel,'labo'));
    add('jeremy', 'Lundi', sh(livStart, livEnd, livLabel,'labo'));
  }

  // ── Découpe poulet DIMANCHE matin ────────────────────────
  if (decoupe && decoupe.startTime) {
    const decLabel = `Découpe · ${decoupe.kg}kg`;
    add('jeremy', 'Dimanche', sh(decoupe.startTime, decoupe.endTime, decLabel,'labo'));
    add('jimmy',  'Dimanche', sh(decoupe.startTime, decoupe.endTime, decLabel,'labo'));
    add('william','Dimanche', sh(decoupe.startTime, decoupe.endTime, decLabel,'labo'));
    // Aaron participe aussi pour compléter ses heures
    add('aaron',  'Dimanche', sh(decoupe.startTime, decoupe.endTime, `${decLabel} (complément h.)`, 'labo'));
    // Jérémy reste pour 4h prépas après découpe
    const prepEnd = addH(decoupe.endTime, 4);
    add('jeremy','Dimanche', sh(decoupe.endTime, prepEnd, 'Prépas','labo'));
  } else {
    // Dimanche sans découpe : Jimmy et William en labo standard
    add('jimmy',  'Dimanche', sh('09:00','14:00','Labo / Production','labo'));
    add('william','Dimanche', sh('09:00','14:00','Labo / Production','labo'));
  }

  // ── Totals ─────────────────────────────────────────────────
  TEAM_FT.forEach(p => {
    let t = 0;
    DAYS.forEach(d => (plan[p.id][d].shifts||[]).forEach(s => { t += s.hrs; }));
    plan[p.id]._total = r(t);
  });

  return plan;
}

// ══════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ══════════════════════════════════════════════════════════════

const TS = {
  midi:    { bg:'rgba(21,128,61,.10)',    brd:'#166534', dot:'#16a34a', txt:'#15803d' },
  soir:    { bg:'rgba(0,63,135,.10)',     brd:'#003f87', dot:'#003f87', txt:'#1e40af' },
  meeting: { bg:'rgba(237,21,72,.08)',    brd:'#ed1548', dot:'#ed1548', txt:'#be123c' },
  ft:      { bg:'rgba(168,85,247,.10)',   brd:'#7c3aed', dot:'#a855f7', txt:'#6d28d9' },
  labo:    { bg:'rgba(8,145,178,.10)',    brd:'#0e7490', dot:'#0891b2', txt:'#0e7490' },
  admin:   { bg:'rgba(237,21,72,.08)',    brd:'#ed1548', dot:'#ed1548', txt:'#be123c' },
};

const inp = { background:'#edf4f8',color:'#1e293b',border:'1px solid #a3c4d4',borderRadius:6,padding:'7px 10px',fontSize:12,width:'100%',boxSizing:'border-box',outline:'none',fontFamily:"'Montserrat',system-ui,sans-serif" };
const card= { background:'#dce9ef',border:'1px solid #b0cdd9',borderRadius:10 };

// ══════════════════════════════════════════════════════════════
// MICRO-COMPONENTS
// ══════════════════════════════════════════════════════════════

const Pill = ({ s }) => {
  const st = TS[s.type]||TS.midi;
  return (
    <div style={{background:st.bg,border:`1px solid ${st.brd}`,borderLeft:`2.5px solid ${st.dot}`,borderRadius:5,padding:'4px 7px',marginBottom:2}}>
      <div style={{color:st.dot,fontSize:9,fontWeight:800,letterSpacing:.3}}>
        {s.start}–{s.end} <span style={{color:'#64748b',fontWeight:400}}>· {s.hrs}h</span>
      </div>
      <div style={{color:st.txt,fontSize:10,marginTop:1,lineHeight:1.3}}>{s.label}</div>
    </div>
  );
};

const OffCell = ({ reason }) => (
  <td style={{background:'#c8dce5',border:'1px solid #b0cdd9',padding:'8px 5px',verticalAlign:'middle',minWidth:130}}>
    <div style={{textAlign:'center',color:reason==='Fermé'?'#94a3b8':'#64748b',fontSize:11}}>
      {reason==='Fermé'?'🔒':'😴'} {reason}
    </div>
  </td>
);

const ShiftCell = ({ day }) => {
  const [expanded, setExpanded] = useState({});
  const shifts = day.shifts||[];

  // Separate grouped vs ungrouped shifts
  const groups = {};
  const ungrouped = [];
  shifts.forEach((s,i) => {
    if (s.group) {
      if (!groups[s.group]) groups[s.group] = [];
      groups[s.group].push({...s,_idx:i});
    } else {
      ungrouped.push({...s,_idx:i});
    }
  });

  // Build render list in original order
  const rendered = [];
  const seenGroups = new Set();
  shifts.forEach((s,i) => {
    if (s.group) {
      if (seenGroups.has(s.group)) return;
      seenGroups.add(s.group);
      const grp = groups[s.group];
      const isOpen = expanded[s.group];
      const totalH = r(grp.reduce((a,g)=>a+g.hrs,0));
      const first = grp[0], last = grp[grp.length-1];
      // Extract location label from the service shift
      const svcShift = grp.find(g=>g.label.startsWith('Service'));
      const locName = svcShift ? svcShift.label.replace('Service · ','') : 'FT';
      const st = TS.ft;

      rendered.push(
        <div key={s.group}>
          <div
            onClick={()=>setExpanded(p=>({...p,[s.group]:!p[s.group]}))}
            style={{
              background:st.bg, border:`1px solid ${st.brd}`, borderLeft:`2.5px solid ${st.dot}`,
              borderRadius:5, padding:'4px 7px', marginBottom:2, cursor:'pointer',
              transition:'all .15s',
            }}
          >
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{color:st.dot,fontSize:9,fontWeight:800,letterSpacing:.3}}>
                  {first.start}–{last.end} <span style={{color:'#64748b',fontWeight:400}}>· {totalH}h</span>
                </div>
                <div style={{color:st.txt,fontSize:10,marginTop:1,lineHeight:1.3}}>
                  Service {locName}
                </div>
              </div>
              <span style={{color:st.dot,fontSize:10,fontWeight:700,opacity:.7}}>
                {isOpen ? '▲' : `▼ ${grp.length}`}
              </span>
            </div>
          </div>
          {isOpen && grp.map((g,gi) => (
            <div key={gi} style={{
              background:'rgba(168,85,247,.04)', borderLeft:`2px dashed ${st.brd}`,
              borderRadius:3, padding:'2px 6px', marginBottom:1, marginLeft:6,
            }}>
              <div style={{color:st.dot,fontSize:8,fontWeight:700}}>
                {g.start}–{g.end} <span style={{color:'#64748b',fontWeight:400}}>· {g.hrs}h</span>
              </div>
              <div style={{color:'#64748b',fontSize:9}}>{g.label}</div>
            </div>
          ))}
        </div>
      );
    } else {
      rendered.push(<Pill key={i} s={s}/>);
    }
  });

  return (
    <td style={{background:'#e4eff4',border:'1px solid #b0cdd9',padding:'5px 4px',verticalAlign:'top',minWidth:130}}>
      {rendered}
    </td>
  );
};

const HourBadge = ({ total, meetingOnly }) => {
  if (meetingOnly||total===undefined||total===null) return <span style={{color:'#64748b',fontSize:11}}>—</span>;
  const c = total>TARGET_H+2?'#dc2626':total<TARGET_H-3?'#d97706':'#16a34a';
  return <span style={{color:c,fontWeight:800,fontSize:15}}>{total}h</span>;
};

const GenerateBtn = ({ onClick, small }) => (
  <button onClick={onClick} style={{
    padding:small?'8px 16px':'13px 34px',border:'none',borderRadius:8,cursor:'pointer',
    background:'linear-gradient(135deg,#ed1548,#c41240)',color:'#fff',
    fontWeight:800,fontSize:small?12:14,letterSpacing:.3,fontFamily:"'Montserrat',system-ui,sans-serif",
    boxShadow:'0 4px 20px rgba(237,21,72,.25)',
  }}>⚡ Générer</button>
);

function PlanGrid({ team, schedule, weekDates }) {
  const [order, setOrder] = useState(()=>team.map(p=>p.id));
  const [hidden, setHidden] = useState({});
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Sync order when team changes
  const teamIds = team.map(p=>p.id).join(',');
  useMemo(()=>{
    setOrder(prev => {
      const ids = team.map(p=>p.id);
      const filtered = prev.filter(id=>ids.includes(id));
      const missing = ids.filter(id=>!filtered.includes(id));
      return [...filtered, ...missing];
    });
  },[teamIds]);

  const orderedTeam = order.map(id=>team.find(p=>p.id===id)).filter(Boolean);
  const visibleTeam = orderedTeam.filter(p=>!hidden[p.id]);
  const hiddenTeam  = orderedTeam.filter(p=>hidden[p.id]);

  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e, id) => { e.preventDefault(); setDragOver(id); };
  const handleDrop = (targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(null); return; }
    setOrder(prev => {
      const arr = [...prev];
      const fromIdx = arr.indexOf(dragId);
      const toIdx = arr.indexOf(targetId);
      arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, dragId);
      return arr;
    });
    setDragId(null);
    setDragOver(null);
  };

  return (
    <div>
      {/* Hidden employees bar */}
      {hiddenTeam.length > 0 && (
        <div style={{display:'flex',gap:6,marginBottom:8,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{color:'#64748b',fontSize:10,fontWeight:600}}>Masqués :</span>
          {hiddenTeam.map(p=>(
            <button key={p.id} onClick={()=>setHidden(h=>({...h,[p.id]:false}))}
              style={{
                display:'flex',alignItems:'center',gap:4,
                padding:'3px 10px',borderRadius:6,cursor:'pointer',fontFamily:'inherit',
                background:`${p.color}10`,border:`1px solid ${p.color}40`,
                color:p.color,fontSize:10,fontWeight:700,
              }}>
              {p.initials} {p.name} <span style={{fontSize:12}}>+</span>
            </button>
          ))}
        </div>
      )}

      <div style={{overflowX:'auto',borderRadius:10,border:'1px solid #a3c4d4'}}>
        <table style={{borderCollapse:'collapse',width:'100%'}}>
          <thead>
            <tr style={{background:'#003f87'}}>
              <th style={{padding:'10px 12px',textAlign:'left',color:'#b8d5e0',fontSize:11,borderBottom:'1px solid #a3c4d4',position:'sticky',left:0,background:'#003f87',zIndex:2,minWidth:155,fontFamily:"'Montserrat',system-ui,sans-serif"}}>ÉQUIPIER</th>
              {DAYS.map((d,i)=>(
                <th key={d} style={{padding:'10px 8px',fontSize:11,fontWeight:800,textAlign:'left',
                  color:d==='Lundi'?'#b8d5e0':'#fff',
                  borderBottom:'1px solid #a3c4d4',borderRight:'1px solid rgba(255,255,255,.15)',minWidth:130,fontFamily:"'Montserrat',system-ui,sans-serif"}}>
                  {d}
                  <div style={{fontWeight:400,fontSize:10,color:'#8bb8cc',marginTop:2}}>{weekDates[i]}</div>
                </th>
              ))}
              <th style={{padding:'10px 8px',color:'#b8d5e0',fontSize:11,borderBottom:'1px solid #a3c4d4',textAlign:'center',minWidth:60,fontFamily:"'Montserrat',system-ui,sans-serif"}}>H/SEM</th>
            </tr>
          </thead>
          <tbody>
            {visibleTeam.map(person => {
              const pp = schedule[person.id];
              const isDragging = dragId === person.id;
              const isDragTarget = dragOver === person.id && dragId !== person.id;
              return (
                <tr key={person.id}
                  draggable
                  onDragStart={()=>handleDragStart(person.id)}
                  onDragOver={(e)=>handleDragOver(e, person.id)}
                  onDrop={()=>handleDrop(person.id)}
                  onDragEnd={()=>{setDragId(null);setDragOver(null);}}
                  style={{
                    borderBottom:'1px solid #b0cdd9',
                    opacity: isDragging ? 0.4 : 1,
                    borderTop: isDragTarget ? '3px solid #ed1548' : '3px solid transparent',
                    transition: 'opacity .15s',
                  }}>
                  <td style={{padding:'6px 10px',borderRight:'1px solid #b0cdd9',position:'sticky',left:0,background:'#d5e6ed',zIndex:1,cursor:'grab'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{display:'flex',flexDirection:'column',gap:2,opacity:.4,cursor:'grab',flexShrink:0}} title="Glisser pour réordonner">
                        <div style={{width:10,height:2,background:'#64748b',borderRadius:1}}/>
                        <div style={{width:10,height:2,background:'#64748b',borderRadius:1}}/>
                        <div style={{width:10,height:2,background:'#64748b',borderRadius:1}}/>
                      </div>
                      <div style={{width:28,height:28,borderRadius:'50%',border:`2px solid ${person.color}`,background:person.color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color:person.color,flexShrink:0}}>
                        {person.initials}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:'#1e293b',fontWeight:700,fontSize:12}}>{person.name}</div>
                        <div style={{color:'#64748b',fontSize:9}}>{person.role}</div>
                      </div>
                      <button onClick={()=>setHidden(h=>({...h,[person.id]:true}))}
                        title="Masquer"
                        style={{background:'transparent',border:'none',cursor:'pointer',color:'#a3c4d4',fontSize:12,padding:0,lineHeight:1}}>
                        ✕
                      </button>
                    </div>
                  </td>
                  {DAYS.map(day => {
                    const d = pp?.[day]||{shifts:[],off:null};
                    return d.off ? <OffCell key={day} reason={d.off}/> : <ShiftCell key={day} day={d}/>;
                  })}
                  <td style={{padding:'8px 10px',textAlign:'center',minWidth:60,background:'#d5e6ed'}}>
                    <HourBadge total={pp?._total} meetingOnly={person.meetingOnly}/>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// RESTAURANT TAB
// ══════════════════════════════════════════════════════════════

function RestauTab({ weekType, setWeekType, cfg, setCfg, weekDates, generated, onGenerate, lastGen, team }) {
  const TEAM_RESTAU = team || DEFAULT_TEAM_RESTAU;
  const warnings = generated?._warnings||[];
  return (
    <div>
      <div style={{...card,padding:'12px 16px',marginBottom:14,display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}>
        <div>
          <div style={{color:'#003f87',fontSize:10,marginBottom:5,letterSpacing:.5,fontWeight:700}}>TYPE DE SEMAINE</div>
          <div style={{display:'flex',gap:5}}>
            {[['A','🌞 Semaine A — Vy midi'],['B','🌙 Semaine B — Vy soir']].map(([t,lbl])=>(
              <button key={t} onClick={()=>setWeekType(t)} style={{
                padding:'7px 14px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:'inherit',
                background:weekType===t?'#ed1548':'#c8dce5',color:weekType===t?'#fff':'#475569',
                fontWeight:700,fontSize:12,
              }}>{lbl}</button>
            ))}
          </div>
        </div>
        <div style={{width:1,height:38,background:'#a3c4d4'}}/>
        <div>
          <div style={{color:'#003f87',fontSize:10,marginBottom:5,letterSpacing:.5,fontWeight:700}}>JOUR OFF SUPPLÉMENTAIRE</div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {[['Mathieu','#16a34a','mathieuOff'],['Ashit','#d97706','ashitOff']].map(([nm,c,f])=>(
              <div key={f} style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{color:c,fontSize:11,fontWeight:700,minWidth:55}}>{nm} off</span>
                <select value={cfg[f]} onChange={e=>setCfg(p=>({...p,[f]:e.target.value}))}
                  style={{...inp,width:'auto',color:c,borderColor:c+'66',padding:'4px 8px',fontSize:11}}>
                  {EXTRA_OFF_OPTIONS.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div style={{width:1,height:38,background:'#a3c4d4'}}/>
        <div>
          <div style={{color:'#003f87',fontSize:10,marginBottom:5,letterSpacing:.5,fontWeight:700}}>ADMIN MANAGER SOIR</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <input type="range" min={0} max={5} step={0.5} value={cfg.adminHours}
              onChange={e=>setCfg(p=>({...p,adminHours:+e.target.value}))}
              style={{width:80,accentColor:'#ed1548',cursor:'pointer'}}/>
            <span style={{color:'#ed1548',fontWeight:800,fontSize:14}}>{cfg.adminHours}h</span>
            <span style={{color:'#64748b',fontSize:10}}>/sem</span>
          </div>
        </div>
        <div style={{marginLeft:'auto',display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5}}>
          <GenerateBtn onClick={onGenerate} small/>
          {lastGen&&<span style={{color:'#64748b',fontSize:10}}>Généré à {lastGen}</span>}
        </div>
      </div>

      {warnings.length>0&&(
        <div style={{background:'rgba(251,191,36,.08)',border:'1px solid #d97706',borderRadius:8,padding:'10px 14px',marginBottom:12,display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
          <span style={{color:'#b45309',fontSize:11,fontWeight:800}}>⚠️ Attention</span>
          {warnings.map((w,i)=><span key={i} style={{color:'#92400e',fontSize:11,background:'rgba(251,191,36,.12)',borderRadius:4,padding:'2px 7px'}}>{w}</span>)}
        </div>
      )}

      {!generated ? (
        <div style={{textAlign:'center',padding:'60px 0'}}>
          <div style={{fontSize:42,marginBottom:16}}>📋</div>
          <div style={{color:'#475569',fontSize:14,marginBottom:28}}>Configure les paramètres et génère le planning</div>
          <GenerateBtn onClick={onGenerate}/>
        </div>
      ) : (
        <>
          <PlanGrid team={TEAM_RESTAU} schedule={generated} weekDates={weekDates}/>
          <div style={{display:'flex',gap:16,marginTop:10,flexWrap:'wrap',alignItems:'center'}}>
            {[['#16a34a','Midi'],['#003f87','Soir'],['#ed1548','Réunion / Admin']].map(([c,l])=>(
              <div key={l} style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:c}}/>
                <span style={{color:'#475569',fontSize:10}}>{l}</span>
              </div>
            ))}
            <span style={{color:'#64748b',fontSize:10}}>
              · <span style={{color:'#16a34a'}}>🟢 36–41h</span> <span style={{color:'#d97706'}}>🟡 &lt;36h</span> <span style={{color:'#dc2626'}}>🔴 &gt;41h</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// FT / LABO TAB
// ══════════════════════════════════════════════════════════════

const SLOT_COLORS = ['#0891b2','#6366f1'];

const FT_ROLE_OPTIONS = [
  { id:'aaron',    label:'Aaron' },
  { id:'jeremy',   label:'Jérémy' },
  { id:'francois', label:'François' },
  { id:'kevin',    label:'Kévin' },
  { id:'vanessa',  label:'Vanessa' },
  { id:'william',  label:'William' },
];

function FTLaboTab({ services, setServices, weekDates, onGenerate, lastGen, ftSchedule, friture, decoupe, ftParams, setFtParams, team }) {
  const TEAM_FT = team || DEFAULT_TEAM_FT;
  const [form, setForm] = useState({
    day:'Lundi', loc:FT_LOCATIONS[0], start:'11:45', end:'13:30',
    covers:100, nbPers:3,
    roleJournee:'aaron', roleRetour:'jeremy', roleLeger:'francois',
  });
  const dayOpt = (d,i) => weekDates[i] ? `${d} ${weekDates[i]}` : d;

  const updateServiceRole = (svId, field, value) => {
    setServices(p => p.map(s => s.id === svId ? {...s, [field]: value} : s));
  };

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:18,marginBottom:22}}>

        {/* ── Colonne gauche : inputs ── */}
        <div>
          <div style={{color:'#003f87',fontSize:12,fontWeight:800,letterSpacing:.5,marginBottom:10}}>📍 SERVICES FOODTRUCK</div>

          {/* Formulaire service */}
          <div style={{...card,padding:14,marginBottom:10}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
              {[
                ['Jour',<select value={form.day} onChange={e=>setForm({...form,day:e.target.value})} style={inp}>{DAYS.map((d,i)=><option key={d} value={d}>{dayOpt(d,i)}</option>)}</select>],
                ['Emplacement',<select value={form.loc} onChange={e=>setForm({...form,loc:e.target.value})} style={inp}>{FT_LOCATIONS.map(l=><option key={l} value={l}>{l}</option>)}</select>],
                ['Début service',<input type="time" value={form.start} onChange={e=>setForm({...form,start:e.target.value})} style={inp}/>],
                ['Fin service',<input type="time" value={form.end} onChange={e=>setForm({...form,end:e.target.value})} style={inp}/>],
              ].map(([lbl,el])=>(
                <div key={lbl}><div style={{color:'#64748b',fontSize:10,marginBottom:3}}>{lbl}</div>{el}</div>
              ))}
            </div>
            <div style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                <span style={{color:'#64748b',fontSize:10}}>Couverts estimés</span>
                <span style={{color:'#7c3aed',fontWeight:800,fontSize:15}}>{form.covers}</span>
              </div>
              <input type="range" min={0} max={600} step={10} value={form.covers}
                onChange={e=>setForm({...form,covers:+e.target.value})}
                style={{width:'100%',accentColor:'#7c3aed',cursor:'pointer'}}/>
            </div>
            {form.loc==='Place de la Défense'&&(
              <div style={{marginBottom:10}}>
                <div style={{color:'#64748b',fontSize:10,marginBottom:3}}>Nb personnes</div>
                <select value={form.nbPers} onChange={e=>setForm({...form,nbPers:+e.target.value})} style={{...inp,fontSize:11}}>
                  <option value={2}>2 — Vendredi</option>
                  <option value={3}>3 — Standard</option>
                </select>
              </div>
            )}

            {/* ── Rôles ── */}
            <div style={{background:'#c8dce5',borderRadius:6,padding:'8px 10px',marginBottom:10}}>
              <div style={{color:'#003f87',fontSize:9,fontWeight:700,marginBottom:6,letterSpacing:.3}}>RÔLES SERVICE</div>
              {[
                ['Journée complète','roleJournee','9h→fin','#0891b2'],
                ['Service + retour labo','roleRetour','service→fin','#7c3aed'],
                ...(form.nbPers>=3 ? [['Service léger','roleLeger','service→nett.','#64748b']] : []),
              ].map(([lbl,field,hint,c])=>(
                <div key={field} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                  <select value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})}
                    style={{...inp,width:90,padding:'3px 6px',fontSize:10,color:c,fontWeight:700}}>
                    {FT_ROLE_OPTIONS.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  <span style={{color:'#64748b',fontSize:9}}>{lbl} <span style={{color:'#a3c4d4'}}>({hint})</span></span>
                </div>
              ))}
            </div>

            <button onClick={()=>setServices(p=>[...p,{...form,id:Date.now()}])} style={{
              width:'100%',padding:'9px',border:'none',borderRadius:7,cursor:'pointer',fontFamily:'inherit',
              background:'#003f87',color:'#fff',fontWeight:700,fontSize:12,
            }}>+ Ajouter ce service</button>
          </div>

          {/* Liste services */}
          {services.length===0 ? (
            <div style={{color:'#64748b',textAlign:'center',fontSize:12,padding:'12px 0'}}>Aucun service cette semaine</div>
          ) : services.map(sv=>(
            <div key={sv.id} style={{...card,padding:'9px 12px',marginBottom:6}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                <div style={{color:'#7c3aed',fontWeight:700,fontSize:12}}>{sv.day} · {sv.loc}</div>
                <button onClick={()=>setServices(p=>p.filter(s=>s.id!==sv.id))}
                  style={{background:'transparent',border:'1px solid #a3c4d4',borderRadius:5,color:'#dc2626',cursor:'pointer',padding:'3px 8px',fontSize:11}}>✕</button>
              </div>
              <div style={{color:'#64748b',fontSize:10,marginBottom:4}}>
                {sv.loc==='Place de la Défense'
                  ? `Service 11h45–13h30 · ${sv.nbPers||3} pers.`
                  : `Service ${fmtHM(sv.start)}→${fmtHM(sv.end)} · ${sv.covers} cvts`}
              </div>
              {/* Role swappers inline */}
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {[
                  ['roleJournee','Journée','#0891b2'],
                  ['roleRetour','Retour','#7c3aed'],
                  ...((sv.nbPers||3)>=3 ? [['roleLeger','Léger','#64748b']] : []),
                ].map(([field,lbl,c])=>(
                  <div key={field} style={{display:'flex',alignItems:'center',gap:3}}>
                    <select value={sv[field]||{roleJournee:'aaron',roleRetour:'jeremy',roleLeger:'francois'}[field]}
                      onChange={e=>updateServiceRole(sv.id, field, e.target.value)}
                      style={{background:'#edf4f8',border:`1px solid ${c}44`,borderRadius:4,padding:'2px 4px',fontSize:9,color:c,fontWeight:700,fontFamily:'inherit'}}>
                      {FT_ROLE_OPTIONS.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <span style={{color:'#a3c4d4',fontSize:8}}>{lbl}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* ── Paramètres labo ── */}
          <div style={{color:'#003f87',fontSize:12,fontWeight:800,letterSpacing:.5,margin:'16px 0 8px'}}>⚙️ PARAMÈTRES LABO</div>

          <div style={{...card,padding:'12px 14px',marginBottom:8}}>
            <div style={{color:'#003f87',fontSize:10,marginBottom:6}}>DÉCOUPE DIMANCHE — kg à découper</div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{color:'#64748b',fontSize:11}}>Quantité</span>
              <span style={{color:'#0891b2',fontWeight:800,fontSize:15}}>{ftParams.decoupeKg} kg</span>
            </div>
            <input type="range" min={0} max={400} step={10} value={ftParams.decoupeKg}
              onChange={e=>setFtParams(p=>({...p,decoupeKg:+e.target.value}))}
              style={{width:'100%',accentColor:'#0891b2',cursor:'pointer',marginBottom:6}}/>
            <div style={{color:'#475569',fontSize:10}}>
              Équipe : Jérémy + Jimmy + William + Aaron · {r(ftParams.decoupeKg/(KG_PER_HOUR_DEC*3))}h découpe
              · durée totale ≈ {r(ftParams.decoupeKg/(KG_PER_HOUR_DEC*3)+DECOUPE_SETUP+DECOUPE_CLEAN)}h
            </div>
          </div>

          <div style={{...card,padding:'12px 14px',marginBottom:8}}>
            <div style={{color:'#003f87',fontSize:10,marginBottom:8}}>LIVRAISON LUNDI SOIR</div>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <input type="checkbox" checked={ftParams.deuxRestau}
                onChange={e=>setFtParams(p=>({...p,deuxRestau:e.target.checked}))}
                style={{accentColor:'#ed1548',width:14,height:14}}/>
              <span style={{color:'#1e293b',fontSize:12}}>2ème restaurant ouvert</span>
              <span style={{color:'#475569',fontSize:11}}>{ftParams.deuxRestau?'3h AR':'2h AR'}</span>
            </label>
          </div>

          <div style={{...card,padding:'12px 14px',marginBottom:8}}>
            <div style={{color:'#003f87',fontSize:10,marginBottom:6}}>AARON — NETTOYAGE LABO HEBDO</div>
            <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:6}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <span style={{color:'#64748b',fontSize:10}}>Durée</span>
                  <span style={{color:'#0891b2',fontWeight:800,fontSize:13}}>{ftParams.aaronNettoyageH||2.5}h</span>
                </div>
                <input type="range" min={0} max={4} step={0.5} value={ftParams.aaronNettoyageH||2.5}
                  onChange={e=>setFtParams(p=>({...p,aaronNettoyageH:+e.target.value}))}
                  style={{width:'100%',accentColor:'#0891b2',cursor:'pointer'}}/>
              </div>
              <div>
                <div style={{color:'#64748b',fontSize:10,marginBottom:3}}>Jour</div>
                <select value={ftParams.aaronNettoyageDay||'Mardi'}
                  onChange={e=>setFtParams(p=>({...p,aaronNettoyageDay:e.target.value}))}
                  style={{...inp,width:'auto',fontSize:10,padding:'4px 8px'}}>
                  {EXTRA_OFF_OPTIONS.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div style={{color:'#475569',fontSize:10}}>Placé un jour sans service FT</div>
          </div>

          <div style={{...card,padding:'8px 12px',marginBottom:8}}>
            <div style={{color:'#003f87',fontSize:9,fontWeight:700,marginBottom:4}}>LÉGENDE RÔLES</div>
            <div style={{color:'#64748b',fontSize:9,lineHeight:1.5}}>
              <span style={{color:'#0891b2',fontWeight:700}}>Journée</span> = prépa 9h → rangement ~15h30 ·
              <span style={{color:'#7c3aed',fontWeight:700}}> Retour</span> = service → rangement labo ·
              <span style={{fontWeight:700}}> Léger</span> = service → nett. puis rentre
            </div>
          </div>
        </div>

        {/* ── Colonne droite : production ── */}
        <div>
          <div style={{color:'#003f87',fontSize:12,fontWeight:800,letterSpacing:.5,marginBottom:10}}>🍗 CALCUL DE PRODUCTION</div>

          {/* Friture */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
            {[
              {l:'FT · Couverts', v:friture.ftCovers,   u:'',   c:'#7c3aed'},
              {l:'FT · Kg brut',  v:friture.ftKgRaw,    u:'kg', c:'#7c3aed'},
              {l:'FT +20% buffer',v:friture.ftKg,       u:'kg', c:'#d97706'},
              {l:'Restau (fixe)', v:RESTAU_KG,          u:'kg', c:'#16a34a'},
            ].map(item=>(
              <div key={item.l} style={{...card,padding:'12px 14px'}}>
                <div style={{color:'#003f87',fontSize:10,marginBottom:4}}>{item.l}</div>
                <div style={{color:item.c,fontWeight:900,fontSize:20}}>{item.v}<span style={{fontSize:11,marginLeft:2,color:'#64748b'}}>{item.u}</span></div>
              </div>
            ))}
          </div>

          <div style={{background:'rgba(237,21,72,.08)',border:'1px solid #ed1548',borderRadius:10,padding:'14px 20px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{color:'#475569',fontSize:11}}>FRITURE TOTALE</div>
              <div style={{color:'#ed1548',fontWeight:900,fontSize:28,marginTop:3}}>{friture.totalKg} kg</div>
              <div style={{color:'#64748b',fontSize:11,marginTop:3}}>
                {friture.totalKg<=ONE_SESSION_MAX?`✅ 1 session PM`:`⚡ 2 sessions AM+PM`}
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{color:'#475569',fontSize:11}}>SACHETS</div>
              <div style={{color:'#dc2626',fontWeight:800,fontSize:24,marginTop:3}}>~{Math.ceil(friture.totalKg/COVERS_PER_SAC)}</div>
              <div style={{color:'#64748b',fontSize:11,marginTop:2}}>~{r(friture.totalKg/KG_PER_HOUR_FRI)}h friture + 2.5h overhead</div>
            </div>
          </div>

          {friture.sessions.map((s,i)=>(
            <div key={i} style={{...card,borderLeft:`3px solid ${SLOT_COLORS[i]||'#334155'}`,padding:'11px 16px',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{color:'#1e293b',fontWeight:700,fontSize:13}}>{i+1}. {s.label}</div>
                <div style={{color:'#64748b',fontSize:11,marginTop:2}}>{s.day} · <span style={{color:SLOT_COLORS[i]}}>{s.window}</span></div>
                <div style={{color:'#003f87',fontSize:10,marginTop:1}}>{s.note}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{color:SLOT_COLORS[i],fontWeight:800,fontSize:17}}>{s.kg} kg</div>
                <div style={{color:'#475569',fontSize:11}}>~{s.sachets} sachets</div>
                <div style={{color:'#003f87',fontSize:10}}>~{s.totalH}h total</div>
              </div>
            </div>
          ))}

          {/* Découpe résumé */}
          {ftParams.decoupeKg>0&&(
            <div style={{...card,borderLeft:'3px solid #0891b2',padding:'11px 16px',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{color:'#1e293b',fontWeight:700,fontSize:13}}>🔪 Découpe · Dimanche matin</div>
                <div style={{color:'#0891b2',fontSize:11,marginTop:2}}>{decoupe?.window}</div>
                <div style={{color:'#003f87',fontSize:10,marginTop:1}}>{decoupe?.note}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{color:'#0891b2',fontWeight:800,fontSize:17}}>{ftParams.decoupeKg} kg</div>
                <div style={{color:'#475569',fontSize:11}}>Jérémy + Jimmy + William + Aaron</div>
                <div style={{color:'#003f87',fontSize:10}}>+ 4h prépas Jérémy</div>
              </div>
            </div>
          )}

          {/* Livraisons résumé */}
          <div style={{...card,padding:'12px 16px',marginTop:4}}>
            <div style={{color:'#003f87',fontSize:10,marginBottom:8}}>LIVRAISONS FIXES</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:'#64748b',fontSize:11}}>Lundi soir · Jimmy + Jérémy</span>
                <span style={{color:'#0891b2',fontWeight:700,fontSize:11}}>{ftParams.deuxRestau?'~3h':'~2h'} AR</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:'#64748b',fontSize:11}}>Jeudi soir · Jérémy (départ 21h30)</span>
                <span style={{color:'#0891b2',fontWeight:700,fontSize:11}}>~2h AR</span>
              </div>
            </div>
          </div>

          {/* Production jeudi résumé */}
          <div style={{...card,padding:'12px 16px',marginTop:8}}>
            <div style={{color:'#003f87',fontSize:10,marginBottom:8}}>PRODUCTION FIXE JEUDI</div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{color:'#64748b',fontSize:11}}>Jérémy · Sauces & légumes</span>
                <span style={{color:'#7c3aed',fontWeight:700,fontSize:11}}>14h00–20h00 (6h)</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{color:'#64748b',fontSize:11}}>Aaron · Sauces & légumes</span>
                <span style={{color:'#0891b2',fontWeight:700,fontSize:11}}>14h00–17h00 (3h)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Planning équipe FT/Labo ── */}
      <div style={{borderTop:'1px solid #a3c4d4',paddingTop:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div style={{color:'#003f87',fontSize:12,fontWeight:800,letterSpacing:.5}}>🚐 PLANNING ÉQUIPE FT / LABO</div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {lastGen&&<span style={{color:'#64748b',fontSize:10}}>Généré à {lastGen}</span>}
            <GenerateBtn onClick={onGenerate} small/>
          </div>
        </div>
        {!ftSchedule ? (
          <div style={{textAlign:'center',padding:'40px 0',color:'#1e293b',fontSize:13}}>
            Configure les paramètres et génère le planning
          </div>
        ) : (
          <>
            <PlanGrid team={TEAM_FT} schedule={ftSchedule} weekDates={weekDates}/>
            <div style={{display:'flex',gap:16,marginTop:10,flexWrap:'wrap',alignItems:'center'}}>
              {[['#7c3aed','Service FT'],['#0891b2','Production / Labo / Livraison']].map(([c,l])=>(
                <div key={l} style={{display:'flex',alignItems:'center',gap:5}}>
                  <div style={{width:8,height:8,borderRadius:2,background:c}}/>
                  <span style={{color:'#64748b',fontSize:10}}>{l}</span>
                </div>
              ))}
              <span style={{color:'#64748b',fontSize:10}}>Variables labo : <span style={{color:'#dc2626'}}>Kévin</span> → <span style={{color:'#db2777'}}>Vanessa</span> → <span style={{color:'#64748b'}}>François</span></span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// WEEK PREVIEW (compact card for S+1 / S+2)
// ══════════════════════════════════════════════════════════════

function WeekPreview({ weekType, label, dateRange, isActive, onClick, teamRestau }) {
  const team = (teamRestau || DEFAULT_TEAM_RESTAU).filter(p=>!p.meetingOnly);
  return (
    <button onClick={onClick} style={{
      ...card, padding:'10px 14px', cursor:'pointer', flex:1, minWidth:180,
      border: isActive ? '2px solid #ed1548' : '1px solid #b0cdd9',
      background: isActive ? '#fff' : '#dce9ef',
      transition:'all .15s', textAlign:'left', fontFamily:'inherit',
    }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <span style={{color:'#003f87',fontWeight:800,fontSize:13}}>{label}</span>
        <span style={{
          background: weekType==='A' ? '#ed1548' : '#003f87',
          color:'#fff', borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700,
        }}>Sem {weekType}</span>
      </div>
      <div style={{color:'#64748b',fontSize:10,marginBottom:6}}>{dateRange}</div>
      <div style={{display:'flex',gap:4}}>
        {team.map(p=>(
          <div key={p.id} style={{
            width:22,height:22,borderRadius:6,
            background:p.color+'20',border:`1.5px solid ${p.color}`,
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:8,fontWeight:800,color:p.color,
          }}>{p.initials}</div>
        ))}
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// LOCK INDICATOR
// ══════════════════════════════════════════════════════════════

function LockBanner({ lockedDays, onUnlock }) {
  if (lockedDays.length === 0) return null;
  return (
    <div style={{
      background:'rgba(217,119,6,.08)',border:'1px solid #d97706',borderRadius:10,
      padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        <span style={{fontSize:16}}>🔒</span>
        <span style={{color:'#92400e',fontSize:12,fontWeight:700}}>
          {lockedDays.length === 7 ? 'Semaine complète verrouillée (J-5)' :
           `Jours verrouillés (J-5) : ${lockedDays.join(', ')}`}
        </span>
      </div>
      <button onClick={onUnlock} style={{
        padding:'6px 14px',borderRadius:6,border:'1px solid #d97706',
        background:'rgba(217,119,6,.1)',color:'#92400e',fontWeight:700,fontSize:11,
        cursor:'pointer',fontFamily:'inherit',
      }}>🔓 Débloquer (manager)</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD JOUR J
// ══════════════════════════════════════════════════════════════

function DashboardJourJ({ restauPlan, ftPlan, weekType, teamRestau, teamFt }) {
  const TEAM_RESTAU = teamRestau || DEFAULT_TEAM_RESTAU;
  const TEAM_FT = teamFt || DEFAULT_TEAM_FT;
  const now = new Date();
  const currentMin = now.getHours()*60 + now.getMinutes();
  const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const todayName = dayNames[now.getDay()];
  const todayDate = fmtD(now);

  const getStatus = (shifts) => {
    if (!shifts || shifts.length === 0) return { label:'Repos', color:'#94a3b8', icon:'😴' };
    const firstStart = Math.min(...shifts.map(s=>toMin(s.start)));
    const lastEnd = Math.max(...shifts.map(s=>toMin(s.end)));
    if (currentMin < firstStart) return { label:`Arrive à ${fromMin(firstStart).replace(':','h')}`, color:'#d97706', icon:'⏳' };
    if (currentMin > lastEnd) return { label:'Terminé', color:'#64748b', icon:'✅' };
    // Check if in break
    const inShift = shifts.some(s => currentMin >= toMin(s.start) && currentMin <= toMin(s.end));
    if (!inShift) return { label:'En pause', color:'#7c3aed', icon:'☕' };
    return { label:'En service', color:'#16a34a', icon:'🟢' };
  };

  const allTeam = [
    { section:'🍽️ Restaurant', team:TEAM_RESTAU, plan:restauPlan },
    { section:'🚐 FT / Labo', team:TEAM_FT, plan:ftPlan },
  ];

  return (
    <div>
      <div style={{textAlign:'center',marginBottom:20}}>
        <div style={{fontSize:36,marginBottom:4}}>📍</div>
        <div style={{color:'#003f87',fontWeight:900,fontSize:22}}>{todayName} {todayDate}</div>
        <div style={{color:'#64748b',fontSize:12,marginTop:4}}>
          Il est <strong style={{color:'#ed1548'}}>{fromMin(currentMin).replace(':','h')}</strong> · Semaine {weekType}
        </div>
      </div>

      {/* Timeline bar */}
      <div style={{...card,padding:'12px 16px',marginBottom:16}}>
        <div style={{position:'relative',height:24,background:'#c8dce5',borderRadius:6,overflow:'hidden'}}>
          {/* Service blocks */}
          <div style={{position:'absolute',left:`${((10*60-8*60)/(16*60-8*60))*100}%`,width:`${((15*60-10*60)/(16*60-8*60))*100}%`,height:'100%',background:'rgba(22,163,74,.15)',borderLeft:'2px solid #16a34a'}}/>
          <div style={{position:'absolute',left:`${((18*60-8*60)/(16*60-8*60))*100}%`,width:`${((23.5*60-18*60)/(16*60-8*60))*100}%`,height:'100%',background:'rgba(0,63,135,.1)',borderLeft:'2px solid #003f87'}}/>
          {/* Current time needle */}
          {currentMin >= 8*60 && currentMin <= 24*60 && (
            <div style={{
              position:'absolute',left:`${((currentMin-8*60)/(16*60-8*60))*100}%`,
              top:0,bottom:0,width:2,background:'#ed1548',zIndex:2,
            }}>
              <div style={{position:'absolute',top:-6,left:-4,width:10,height:10,borderRadius:'50%',background:'#ed1548'}}/>
            </div>
          )}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
          {['08h','10h','12h','14h','16h','18h','20h','22h','00h'].map(h=>(
            <span key={h} style={{color:'#64748b',fontSize:9}}>{h}</span>
          ))}
        </div>
      </div>

      {allTeam.map(({section,team,plan}) => (
        <div key={section} style={{marginBottom:20}}>
          <div style={{color:'#003f87',fontSize:12,fontWeight:800,letterSpacing:.5,marginBottom:8}}>{section}</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {team.map(person => {
              const dayData = plan?.[person.id]?.[todayName];
              const shifts = dayData?.shifts || [];
              const isOff = dayData?.off;
              const status = isOff ? { label:isOff, color:'#94a3b8', icon:isOff==='Fermé'?'🔒':'😴' } : getStatus(shifts);

              return (
                <div key={person.id} style={{
                  ...card, padding:'10px 14px',
                  display:'flex', alignItems:'center', gap:12,
                  opacity: isOff ? 0.5 : 1,
                }}>
                  {/* Avatar */}
                  <div style={{
                    width:36,height:36,borderRadius:10,flexShrink:0,
                    background:person.color+'20',border:`2px solid ${person.color}`,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:11,fontWeight:800,color:person.color,
                  }}>{person.initials}</div>

                  {/* Name + role */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13,color:'#1e293b'}}>{person.name}</div>
                    <div style={{fontSize:10,color:'#64748b'}}>{person.role}</div>
                  </div>

                  {/* Shifts pills */}
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',flex:2}}>
                    {shifts.map((s,i) => {
                      const active = currentMin >= toMin(s.start) && currentMin <= toMin(s.end);
                      const st = TS[s.type]||TS.midi;
                      return (
                        <div key={i} style={{
                          background: active ? st.dot : st.bg,
                          border:`1px solid ${st.brd}`,
                          borderRadius:6,padding:'4px 8px',
                          animation: active ? 'none' : 'none',
                          boxShadow: active ? `0 0 8px ${st.dot}40` : 'none',
                        }}>
                          <div style={{fontSize:9,fontWeight:800,color:active?'#fff':st.dot}}>
                            {s.start}–{s.end}
                          </div>
                          <div style={{fontSize:9,color:active?'rgba(255,255,255,.8)':st.txt,marginTop:1}}>
                            {s.label}
                          </div>
                        </div>
                      );
                    })}
                    {isOff && <span style={{color:'#94a3b8',fontSize:11}}>{isOff}</span>}
                  </div>

                  {/* Status badge */}
                  <div style={{
                    display:'flex',alignItems:'center',gap:4,
                    background:status.color+'15',borderRadius:6,padding:'4px 10px',
                    flexShrink:0,
                  }}>
                    <span style={{fontSize:12}}>{status.icon}</span>
                    <span style={{color:status.color,fontWeight:700,fontSize:10,whiteSpace:'nowrap'}}>{status.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════════

export default function App() {
  const today = toLocalISO(new Date());

  const [tab,        setTab]        = useState('restau');
  const [weekType,   setWeekType]   = useState('A');
  const [weekStart,  setWeekStart]  = useState(today);
  const [services,   setServices]   = useState([]);
  const [restauPlan, setRestauPlan] = useState(null);
  const [ftPlan,     setFtPlan]     = useState(null);
  const [lastGen,    setLastGen]    = useState(null);
  const [cfg,        setCfg]        = useState({ mathieuOff:'Mercredi', ashitOff:'Jeudi', adminHours:3 });
  const [ftParams,   setFtParams]   = useState({ decoupeKg:120, deuxRestau:false, aaronNettoyageH:2.5, aaronNettoyageDay:'Mardi' });
  const [unlocked,   setUnlocked]   = useState(false);

  // ── Supabase state ──────────────────────────────────────────
  const [dbEmployees, setDbEmployees] = useState([]);
  const [dbDispos,    setDbDispos]    = useState([]);
  const [dbLoading,   setDbLoading]   = useState(true);

  const loadFromSupabase = useCallback(async () => {
    const [empRes, dispRes] = await Promise.all([
      supabase.from('employees').select('*').order('sort_order'),
      supabase.from('disponibilites').select('*'),
    ]);
    if (empRes.data)  setDbEmployees(empRes.data);
    if (dispRes.data) setDbDispos(dispRes.data);
    setDbLoading(false);
  }, []);

  useEffect(() => { loadFromSupabase(); }, [loadFromSupabase]);

  // ── Convert Supabase → engine format ────────────────────────
  const toEngineFormat = (emp) => ({
    id: emp.slug,
    name: emp.name,
    role: emp.role,
    color: emp.color,
    initials: emp.initials,
    contract: emp.contract_hours,
    meetingOnly: emp.is_meeting_only,
  });

  const teamRestau = useMemo(() => {
    const fromDb = dbEmployees.filter(e => e.team === 'resto' && e.is_active).map(toEngineFormat);
    return fromDb.length > 0 ? fromDb : DEFAULT_TEAM_RESTAU;
  }, [dbEmployees]);

  const teamFt = useMemo(() => {
    const fromDb = dbEmployees.filter(e => e.team === 'ft' && e.is_active).map(toEngineFormat);
    return fromDb.length > 0 ? fromDb : DEFAULT_TEAM_FT;
  }, [dbEmployees]);

  // ── Date & week logic ───────────────────────────────────────
  const monday    = useMemo(()=>getMonday(weekStart),[weekStart]);
  const weekDates = useMemo(()=>DAYS.map((_,i)=>{
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()+i, 12);
    return fmtD(d);
  }),[monday]);
  const friture   = useMemo(()=>calcFriture(services),[services]);
  const decoupe   = useMemo(()=>ftParams.decoupeKg>0?calcDecoupe(ftParams.decoupeKg,3):null,[ftParams.decoupeKg]);

  // ── Multi-week helpers ──────────────────────────────────────
  const getWeekInfo = (offset) => {
    const m = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset*7, 12);
    const dates = DAYS.map((_,i) => {
      const d = new Date(m.getFullYear(), m.getMonth(), m.getDate()+i, 12);
      return fmtD(d);
    });
    const wt = offset === 0 ? weekType : ((weekType==='A'?0:1)+offset)%2===0 ? weekType : (weekType==='A'?'B':'A');
    return { monday:m, dates, weekType:wt, label:`${dates[0]} → ${dates[6]}` };
  };
  const weekPlus1 = useMemo(()=>getWeekInfo(1),[monday,weekType]);
  const weekPlus2 = useMemo(()=>getWeekInfo(2),[monday,weekType]);

  // ── J-5 lock logic ─────────────────────────────────────────
  const lockedDays = useMemo(()=>{
    if (unlocked) return [];
    const now = new Date();
    return DAYS.filter((_,i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()+i, 12);
      const diff = (d - now) / (1000*60*60*24);
      return diff < 5 && diff >= -1;
    });
  },[monday, unlocked]);

  const handleUnlock = useCallback(()=>{
    if (confirm('Débloquer le planning pour modifications ?\n\nCette action est réservée aux managers.')) {
      setUnlocked(true);
    }
  },[]);

  const handleGenerate = useCallback(()=>{
    setRestauPlan(buildRestauSchedule(weekType, cfg, teamRestau));
    setFtPlan(buildFTSchedule(services, calcFriture(services), decoupe, ftParams, teamFt));
    setLastGen(new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}));
  },[weekType, cfg, services, decoupe, ftParams, teamRestau, teamFt]);

  const navigateToWeek = (offset) => {
    const info = offset === 1 ? weekPlus1 : weekPlus2;
    const iso = toLocalISO(info.monday);
    setWeekStart(iso);
    setWeekType(info.weekType);
    setRestauPlan(null);
    setFtPlan(null);
    setLastGen(null);
    setUnlocked(false);
  };

  const weekLabel = `${weekDates[0]} → ${weekDates[6]}`;

  return (
    <div style={{background:'#b8d5e0',minHeight:'100vh',color:'#1e293b',fontFamily:"'Montserrat','DM Sans','Segoe UI',system-ui,sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <header style={{borderBottom:'1px solid #a3c4d4',background:'#003f87',padding:'0 24px',position:'sticky',top:0,zIndex:10,boxShadow:'0 2px 12px rgba(0,63,135,.2)'}}>
        <div style={{maxWidth:1500,margin:'0 auto'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 0 10px'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{fontSize:17,fontWeight:900,letterSpacing:-.5,color:'#fff',display:'flex',alignItems:'center',gap:6}}>
                <img src="data:image/png;base64,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" alt="Krispy" style={{width:36,height:36,borderRadius:10,objectFit:'cover'}}/>
                <span>KRISPY</span>
              </div>
              <div style={{width:1,height:18,background:'rgba(255,255,255,.2)'}}/>
              <span style={{color:'#b8d5e0',fontSize:11,fontWeight:500,letterSpacing:.5}}>PLANNING</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <input type="date" value={weekStart}
                onChange={e=>{ setWeekStart(e.target.value); setRestauPlan(null); setFtPlan(null); setLastGen(null); setUnlocked(false); }}
                style={{background:'rgba(255,255,255,.12)',color:'#fff',border:'1px solid rgba(255,255,255,.2)',borderRadius:6,padding:'5px 9px',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}/>
              <span style={{color:'#b8d5e0',fontSize:11}}>{weekLabel}</span>
            </div>
          </div>
          <nav style={{display:'flex'}}>
            {[
              ['restau','🍽️  Restaurant','#ed1548'],
              ['ft','🚐  FoodTruck / Labo','#b8d5e0'],
              ['dashboard','📍  Jour J','#fff'],
              ['settings','⚙️  Paramètres','#b8d5e0'],
            ].map(([id,lbl,c])=>(
              <button key={id} onClick={()=>setTab(id)} style={{
                padding:'8px 22px',border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',
                color:tab===id?'#fff':'#8bb8cc',fontWeight:tab===id?700:500,fontSize:13,
                borderBottom:tab===id?`2px solid ${c}`:'2px solid transparent',
                marginBottom:-1,transition:'all .15s',
              }}>{lbl}</button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{maxWidth:1500,margin:'0 auto',padding:'20px 24px'}}>

        {/* ── J-5 Lock Banner ── */}
        {tab!=='dashboard' && tab!=='settings' && <LockBanner lockedDays={lockedDays} onUnlock={handleUnlock}/>}

        {/* ── Week navigation (S+1, S+2 preview) ── */}
        {tab!=='dashboard' && tab!=='settings' && (
          <div style={{display:'flex',gap:10,marginBottom:16}}>
            <div style={{
              ...card, padding:'8px 14px', flex:'0 0 auto',
              background:'#fff', border:'2px solid #ed1548',
              display:'flex',alignItems:'center',gap:8,
            }}>
              <span style={{color:'#ed1548',fontWeight:800,fontSize:13}}>Sem {weekType}</span>
              <span style={{color:'#64748b',fontSize:11}}>{weekLabel}</span>
              <span style={{background:'#ed1548',color:'#fff',borderRadius:4,padding:'2px 6px',fontSize:9,fontWeight:700}}>active</span>
            </div>
            <WeekPreview
              weekType={weekPlus1.weekType} label="S+1"
              dateRange={weekPlus1.label} isActive={false}
              onClick={()=>navigateToWeek(1)} teamRestau={teamRestau}
            />
            <WeekPreview
              weekType={weekPlus2.weekType} label="S+2"
              dateRange={weekPlus2.label} isActive={false}
              onClick={()=>navigateToWeek(2)} teamRestau={teamRestau}
            />
          </div>
        )}

        {tab==='restau'&&(
          <RestauTab weekType={weekType} setWeekType={setWeekType}
            cfg={cfg} setCfg={setCfg} weekDates={weekDates}
            generated={restauPlan} onGenerate={handleGenerate} lastGen={lastGen}
            team={teamRestau}/>
        )}
        {tab==='ft'&&(
          <FTLaboTab services={services} setServices={setServices}
            weekDates={weekDates} onGenerate={handleGenerate} lastGen={lastGen}
            ftSchedule={ftPlan} friture={friture} decoupe={decoupe}
            ftParams={ftParams} setFtParams={setFtParams}
            team={teamFt}/>
        )}
        {tab==='dashboard'&&(
          <DashboardJourJ restauPlan={restauPlan} ftPlan={ftPlan} weekType={weekType}
            teamRestau={teamRestau} teamFt={teamFt}/>
        )}
        {tab==='settings'&&(
          <SettingsTab onRefresh={loadFromSupabase}/>
        )}
      </main>
    </div>
  );
}
