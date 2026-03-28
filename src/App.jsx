import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from './supabase';
import SettingsTab from './Settings';
import { usePlanning } from './usePlanningEngine';

// ══════════════════════════════════════════════════════════════
// CONSTANTS & UTILS
// ══════════════════════════════════════════════════════════════
const DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const B = { bleusto:'#b8d5e0', bluck:'#003f87', gochu:'#ed1548', corail:'#f26f63', white:'#fff9f3', black:'#000' };

const fmtD = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
const toLocalISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function getMonday(iso) {
  const [y,m,d] = iso.split('-').map(Number);
  const date = new Date(y, m-1, d, 12, 0, 0);
  const dow = date.getDay();
  date.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1));
  return date;
}

const card = { background:'#fff', borderRadius:10, boxShadow:'0 1px 6px rgba(0,0,0,.06)', padding:16, marginBottom:12 };

// Niveau de warning → couleurs
const WL = {
  CRITIQUE: { bg:'#fef2f2', border:'#ef4444', text:'#b91c1c', badge:'#ef4444' },
  ATTENTION: { bg:'#fffbeb', border:'#f59e0b', text:'#92400e', badge:'#f59e0b' },
  INFO:     { bg:'#eff6ff', border:'#3b82f6', text:'#1e40af', badge:'#3b82f6' },
};

// ══════════════════════════════════════════════════════════════
// PLANNING TAB — moteur générique
// ══════════════════════════════════════════════════════════════
function PlanningTab({ etablissement, weekDates }) {
  const { result, loading, error, reload } = usePlanning(etablissement.id, weekDates);

  if (loading) return (
    <div style={{textAlign:'center', padding:'60px 20px', color:B.bluck}}>
      <div style={{fontSize:24, marginBottom:12}}>⏳</div>
      <p style={{fontSize:14}}>Génération du planning…</p>
    </div>
  );

  if (error) return (
    <div style={{...card, borderLeft:'4px solid #ef4444'}}>
      <p style={{color:'#b91c1c', fontSize:13, margin:0}}>Erreur : {error}</p>
      <button onClick={reload} style={{marginTop:8, fontSize:12, padding:'4px 12px', cursor:'pointer'}}>Réessayer</button>
    </div>
  );

  if (!result) return null;
  const { days, warnings, employeeHours, employees } = result;
  const hasServices = days.some(d => d.services.length > 0);

  return (
    <div>
      {/* ── Header établissement ── */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16}}>
        <h2 style={{margin:0, fontSize:16, fontWeight:800, color:B.bluck}}>{etablissement.nom}</h2>
        <button onClick={reload} style={{
          background:'transparent', border:`1px solid ${B.bluck}`, borderRadius:6,
          padding:'5px 14px', fontSize:12, fontWeight:600, color:B.bluck, cursor:'pointer',
        }}>↺ Régénérer</button>
      </div>

      {/* ── Warnings ── */}
      {warnings.length > 0 && (
        <div style={{marginBottom:16}}>
          {['CRITIQUE','ATTENTION','INFO'].map(level => {
            const wList = warnings.filter(w => w.level === level);
            if (!wList.length) return null;
            const c = WL[level];
            return (
              <div key={level} style={{...card, background:c.bg, border:`1px solid ${c.border}`, marginBottom:8, padding:'10px 14px'}}>
                <div style={{fontWeight:700, fontSize:12, color:c.text, marginBottom:4}}>
                  <span style={{background:c.badge, color:'#fff', borderRadius:4, padding:'1px 7px', marginRight:8, fontSize:11}}>{level}</span>
                  {wList.length} alerte{wList.length > 1 ? 's' : ''}
                </div>
                {wList.map((w,i) => (
                  <div key={i} style={{fontSize:12, color:c.text, padding:'2px 0'}}>• {w.message}</div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Grille 7 jours ── */}
      {!hasServices ? (
        <div style={{...card, background:B.white, border:`2px dashed ${B.bleusto}`, textAlign:'center', padding:'40px 20px'}}>
          <div style={{fontSize:32, marginBottom:12}}>📋</div>
          <h3 style={{color:B.bluck, margin:'0 0 8px', fontSize:16}}>Aucun service configuré</h3>
          <p style={{color:'#888', fontSize:13, margin:0}}>
            Ajoutez des services dans Paramètres pour générer un planning.
          </p>
        </div>
      ) : (
        <div style={{overflowX:'auto', marginBottom:16}}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(7, minmax(130px, 1fr))', gap:8, minWidth:910}}>
            {days.map(day => {
              const d = new Date(day.isoDate + 'T12:00:00');
              const label = fmtD(d);
              const isEmpty = day.services.length === 0;
              return (
                <div key={day.dayIdx} style={{
                  ...card, margin:0, padding:10, minHeight:80,
                  background: isEmpty ? '#f8fafc' : '#fff',
                  border: `1px solid ${isEmpty ? '#e2e8f0' : B.bleusto}`,
                }}>
                  {/* En-tête jour */}
                  <div style={{borderBottom:`2px solid ${B.bluck}`, paddingBottom:5, marginBottom:8}}>
                    <div style={{fontWeight:800, fontSize:12, color:B.bluck}}>{DAYS[day.dayIdx]}</div>
                    <div style={{fontSize:11, color:'#64748b'}}>{label}</div>
                  </div>

                  {isEmpty && <div style={{fontSize:11, color:'#94a3b8', textAlign:'center', marginTop:12}}>Fermé</div>}

                  {/* Services */}
                  {day.services.map(svc => (
                    <div key={svc.id} style={{marginBottom:10}}>
                      <div style={{
                        fontWeight:700, fontSize:11, color:B.bluck,
                        background:'#e0ecf7', borderRadius:4, padding:'2px 6px', marginBottom:4,
                      }}>
                        {svc.nom}
                        <span style={{fontWeight:400, color:'#64748b', marginLeft:4, fontSize:10}}>
                          {svc.heure_ouverture_clients}–{svc.heure_fermeture_clients}
                        </span>
                      </div>

                      {/* Slots */}
                      {svc.slots.map(slot => (
                        <div key={slot.id} style={{marginBottom:4}}>
                          <div style={{fontSize:10, color:'#64748b', marginBottom:2}}>
                            {slot.nom}{' '}
                            <span style={{color:'#94a3b8'}}>{slot.startLabel}→{slot.endLabel}</span>
                          </div>
                          <div style={{display:'flex', flexWrap:'wrap', gap:3}}>
                            {slot.assignedEmployees.map(emp => (
                              <span key={emp.id} style={{
                                background: emp.couleur || '#6B7280',
                                color:'#fff', borderRadius:4,
                                padding:'1px 6px', fontSize:11, fontWeight:700,
                              }}>{emp.initiales}</span>
                            ))}
                            {slot.missing > 0 && Array.from({length: slot.missing}).map((_, i) => (
                              <span key={i} style={{
                                background: slot.optionnel ? '#e2e8f0' : '#fecaca',
                                color: slot.optionnel ? '#94a3b8' : '#b91c1c',
                                borderRadius:4, padding:'1px 6px', fontSize:11, fontWeight:700,
                              }}>{slot.optionnel ? '?' : '!'}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Récap heures ── */}
      {employees.length > 0 && (
        <div style={{...card}}>
          <h3 style={{margin:'0 0 12px', fontSize:14, fontWeight:700, color:B.bluck}}>Récap heures semaine</h3>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
              <thead>
                <tr style={{background:'#f1f5f9'}}>
                  <th style={{padding:'6px 10px', textAlign:'left', fontWeight:600, color:'#475569'}}>Employé</th>
                  <th style={{padding:'6px 10px', textAlign:'center', fontWeight:600, color:'#475569'}}>Assignées</th>
                  <th style={{padding:'6px 10px', textAlign:'center', fontWeight:600, color:'#475569'}}>Contrat</th>
                  <th style={{padding:'6px 10px', textAlign:'center', fontWeight:600, color:'#475569'}}>Écart</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const h = employeeHours[emp.id];
                  if (!h) return null;
                  const diffColor = h.diff < -3 ? '#ef4444' : h.diff > 3 ? '#f59e0b' : '#16a34a';
                  return (
                    <tr key={emp.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                      <td style={{padding:'6px 10px'}}>
                        <div style={{display:'flex', alignItems:'center', gap:6}}>
                          <span style={{
                            background: emp.couleur || '#6B7280', color:'#fff',
                            borderRadius:4, padding:'1px 7px', fontSize:11, fontWeight:700,
                          }}>{emp.initiales}</span>
                          <span style={{fontWeight:600}}>{emp.prenom} {emp.nom}</span>
                          {emp.statut !== 'salarie' && (
                            <span style={{fontSize:10, color:'#94a3b8'}}>{emp.statut}</span>
                          )}
                        </div>
                      </td>
                      <td style={{padding:'6px 10px', textAlign:'center', fontWeight:700}}>{h.assigned.toFixed(1)}h</td>
                      <td style={{padding:'6px 10px', textAlign:'center', color:'#64748b'}}>{h.contract > 0 ? `${h.contract}h` : '—'}</td>
                      <td style={{padding:'6px 10px', textAlign:'center', fontWeight:700, color: h.contract > 0 ? diffColor : '#94a3b8'}}>
                        {h.contract > 0 ? `${h.diff >= 0 ? '+' : ''}${h.diff.toFixed(1)}h` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════════
export default function App() {
  const today = toLocalISO(new Date());
  const [tab, setTab]             = useState('settings');
  const [weekType, setWeekType]   = useState('A');
  const [weekStart, setWeekStart] = useState(today);

  // ── Supabase state ──
  const [dbEtablissements, setDbEtablissements] = useState([]);
  const [dbLoading, setDbLoading]               = useState(true);

  const loadFromSupabase = useCallback(async () => {
    const { data } = await supabase.from('etablissements').select('*');
    if (data) setDbEtablissements(data);
    setDbLoading(false);
  }, []);

  useEffect(() => { loadFromSupabase(); }, [loadFromSupabase]);

  // ── Date & week logic ──
  const monday = useMemo(() => getMonday(weekStart), [weekStart]);

  // weekDates = ISO "YYYY-MM-DD" — format requis par le moteur
  const weekDates = useMemo(() => DAYS.map((_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i, 12);
    return toLocalISO(d);
  }), [monday]);

  // weekLabel = affichage "DD/MM → DD/MM"
  const weekLabel = useMemo(() => {
    const end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 12);
    return `${fmtD(monday)} → ${fmtD(end)}`;
  }, [monday]);

  // ── Build dynamic tabs ──
  const etabTabs = dbEtablissements.map(et => ({
    id: `etab-${et.id}`,
    label: et.nom,
    icon: et.type === 'restaurant' ? '🍽️' : et.type === 'foodtruck' ? '🚐' : et.type === 'lab' ? '🏭' : '🏪',
    color: B.gochu,
    etab: et,
  }));

  const allTabIds = [...etabTabs.map(t => t.id), 'settings'];
  const currentTab = allTabIds.includes(tab) ? tab : (etabTabs.length > 0 ? etabTabs[0].id : 'settings');
  if (currentTab !== tab) setTab(currentTab);

  const activeEtab = etabTabs.find(t => t.id === tab)?.etab || null;

  return (
    <div style={{background:B.bleusto,minHeight:'100vh',color:'#1e293b',fontFamily:"'Montserrat','DM Sans','Segoe UI',system-ui,sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      <header style={{borderBottom:'1px solid #a3c4d4',background:B.bluck,padding:'0 24px',position:'sticky',top:0,zIndex:10,boxShadow:'0 2px 12px rgba(0,63,135,.2)'}}>
        <div style={{maxWidth:1500,margin:'0 auto'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 0 10px'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{fontSize:17,fontWeight:900,letterSpacing:-.5,color:'#fff',display:'flex',alignItems:'center',gap:6}}>
                <img src="data:image/png;base64,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" alt="Krispy" style={{width:36,height:36,borderRadius:10,objectFit:'cover'}}/>
                <span>KRISPY</span>
              </div>
              <div style={{width:1,height:18,background:'rgba(255,255,255,.2)'}}/>
              <span style={{color:B.bleusto,fontSize:11,fontWeight:500,letterSpacing:.5}}>PLANNING</span>
            </div>
            {tab !== 'settings' && (
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <button
                  onClick={() => setWeekType(t => t === 'A' ? 'B' : 'A')}
                  style={{background:'rgba(255,255,255,.12)',color:'#fff',border:'1px solid rgba(255,255,255,.2)',borderRadius:6,padding:'5px 9px',fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>
                  Sem {weekType}
                </button>
                <input type="date" value={weekStart}
                  onChange={e=>setWeekStart(e.target.value)}
                  style={{background:'rgba(255,255,255,.12)',color:'#fff',border:'1px solid rgba(255,255,255,.2)',borderRadius:6,padding:'5px 9px',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}/>
                <span style={{color:B.bleusto,fontSize:11}}>{weekLabel}</span>
              </div>
            )}
          </div>

          <nav style={{display:'flex'}}>
            {etabTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding:'8px 22px',border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',
                color:tab===t.id?'#fff':'#8bb8cc',fontWeight:tab===t.id?700:500,fontSize:13,
                borderBottom:tab===t.id?`2px solid ${t.color}`:'2px solid transparent',
                marginBottom:-1,transition:'all .15s',whiteSpace:'nowrap',
              }}>{t.icon}  {t.label}</button>
            ))}
            <button onClick={() => setTab('settings')} style={{
              padding:'8px 22px',border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',
              color:tab==='settings'?'#fff':'#8bb8cc',fontWeight:tab==='settings'?700:500,fontSize:13,
              borderBottom:tab==='settings'?`2px solid ${B.bleusto}`:'2px solid transparent',
              marginBottom:-1,transition:'all .15s',marginLeft:'auto',
            }}>⚙️  Paramètres</button>
          </nav>
        </div>
      </header>

      <main style={{maxWidth:1500,margin:'0 auto',padding:'20px 24px'}}>
        {dbLoading ? (
          <div style={{textAlign:'center',padding:'60px 20px',color:B.bluck}}>
            <p style={{fontSize:14}}>Chargement…</p>
          </div>
        ) : (
          <>
            {activeEtab && tab !== 'settings' && (
              <PlanningTab
                etablissement={activeEtab}
                weekDates={weekDates}
              />
            )}
            {tab === 'settings' && (
              <SettingsTab onRefresh={loadFromSupabase} />
            )}
            {!activeEtab && tab !== 'settings' && (
              <div style={{textAlign:'center',padding:'60px 20px'}}>
                <p style={{color:B.bluck,fontSize:14}}>Créez un établissement dans les paramètres pour commencer.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
