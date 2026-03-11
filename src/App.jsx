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
          <SettingsTab employees={dbEmployees} dispos={dbDispos} onRefresh={loadFromSupabase}/>
        )}
      </main>
    </div>
  );
}
