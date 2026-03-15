import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const JOURS = [
  {code:'Lundi',label:'Lun'},{code:'Mardi',label:'Mar'},{code:'Mercredi',label:'Mer'},
  {code:'Jeudi',label:'Jeu'},{code:'Vendredi',label:'Ven'},{code:'Samedi',label:'Sam'},{code:'Dimanche',label:'Dim'},
];
const TYPES_ETABLISSEMENT = [
  {value:'restaurant',label:'Restaurant'},{value:'foodtruck',label:'Food Truck'},
  {value:'lab',label:'Laboratoire de production'},{value:'autre',label:'Autre'},
];
const STATUTS_EMPLOYE = ['Salarié','Associé','Gérant'];

const TACHES_PREDEFINIES = [
  {nom:'Ouverture',icone:'🔑'},{nom:'Mise en place',icone:'🍽️'},{nom:'Préparation cuisine',icone:'🔪'},
  {nom:'Service',icone:'👨‍🍳'},{nom:'Nettoyage',icone:'🧹'},{nom:'Rangement',icone:'📦'},
  {nom:'Fermeture',icone:'🔒'},{nom:'Livraison',icone:'🚚'},{nom:'Production',icone:'🏭'},
];

const B = {bleusto:'#b8d5e0',bluck:'#003f87',gochu:'#ed1548',corail:'#f26f63',white:'#fff9f3',black:'#000000',bleustoLight:'#ddedf3',bleustoDark:'#9cc5d4'};

const S = {
  page:{fontFamily:"'Montserrat',Arial,sans-serif",color:B.black,minHeight:'100%'},
  subTabs:{display:'flex',gap:'4px',borderBottom:`2px solid ${B.bluck}`,marginBottom:'24px',overflowX:'auto'},
  subTab:a=>({padding:'10px 18px',fontSize:'14px',fontWeight:a?'700':'500',color:a?B.white:B.bluck,backgroundColor:a?B.bluck:'transparent',border:'none',borderRadius:'8px 8px 0 0',cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.2s'}),
  card:{backgroundColor:B.white,borderRadius:'10px',padding:'16px',marginBottom:'12px',border:`1px solid ${B.bleusto}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'},
  cardHeader:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'},
  cardTitle:{fontSize:'16px',fontWeight:'700',color:B.bluck,margin:0},
  badge:(c=B.bleusto)=>({display:'inline-block',padding:'2px 10px',borderRadius:'12px',fontSize:'12px',fontWeight:'600',backgroundColor:c,color:(c===B.bleusto||c===B.bleustoLight||c===B.white||c==='#ccc')?B.bluck:B.white,marginRight:'6px',marginBottom:'4px'}),
  btnPrimary:{padding:'10px 20px',backgroundColor:B.gochu,color:B.white,border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:'600',cursor:'pointer'},
  btnSecondary:{padding:'8px 16px',backgroundColor:'transparent',color:B.bluck,border:`1px solid ${B.bluck}`,borderRadius:'8px',fontSize:'13px',fontWeight:'500',cursor:'pointer'},
  btnDanger:{padding:'6px 12px',backgroundColor:'transparent',color:B.gochu,border:`1px solid ${B.gochu}`,borderRadius:'6px',fontSize:'12px',cursor:'pointer'},
  btnSmall:{padding:'4px 10px',fontSize:'12px',borderRadius:'6px',cursor:'pointer',border:'none',fontWeight:'500'},
  input:{width:'100%',padding:'10px 12px',border:`1px solid ${B.bleustoDark}`,borderRadius:'8px',fontSize:'14px',fontFamily:"'Montserrat',Arial,sans-serif",outline:'none',boxSizing:'border-box'},
  select:{width:'100%',padding:'10px 12px',border:`1px solid ${B.bleustoDark}`,borderRadius:'8px',fontSize:'14px',fontFamily:"'Montserrat',Arial,sans-serif",outline:'none',backgroundColor:B.white,boxSizing:'border-box'},
  label:{display:'block',fontSize:'13px',fontWeight:'600',color:B.bluck,marginBottom:'4px'},
  field:{marginBottom:'14px'},
  row:{display:'flex',gap:'12px',flexWrap:'wrap'},
  emptyState:{textAlign:'center',padding:'40px 20px',color:B.bleustoDark,fontSize:'14px'},
  overlay:{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000},
  modal:{backgroundColor:B.white,borderRadius:'14px',padding:'24px',width:'90%',maxWidth:'600px',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,0.2)'},
  modalTitle:{fontSize:'18px',fontWeight:'700',color:B.bluck,marginBottom:'20px',fontFamily:"'Helvetica Neue',Arial,sans-serif"},
  topBar:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'},
  chipRow:{display:'flex',flexWrap:'wrap',gap:'6px'},
  chip:s=>({padding:'6px 14px',borderRadius:'20px',fontSize:'13px',fontWeight:'600',border:`2px solid ${s?B.bluck:B.bleustoDark}`,backgroundColor:s?B.bleusto:'transparent',color:B.bluck,cursor:'pointer',transition:'all 0.15s'}),
  infoText:{fontSize:'12px',color:'#888',marginTop:'4px'},
  tag:{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 10px',borderRadius:'14px',fontSize:'12px',fontWeight:'600',backgroundColor:B.bleustoLight,color:B.bluck,marginRight:'4px',marginBottom:'4px'},
  checkbox:{display:'flex',alignItems:'center',gap:'10px',padding:'8px 12px',borderRadius:'8px',cursor:'pointer',transition:'all 0.15s'},
  collapsible:(open)=>({display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',padding:'10px 0',userSelect:'none'}),
  collapsibleIcon:{fontSize:'10px',color:B.bluck,transition:'transform 0.2s'},
  collapsibleLabel:{fontSize:'14px',fontWeight:'700',color:B.bluck},
};

// ─── UTILS ───────────────────────────────────────────────────
function Modal({title,onClose,children}){return(<div style={S.overlay} onClick={onClose}><div style={S.modal} onClick={e=>e.stopPropagation()}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}><h3 style={S.modalTitle}>{title}</h3><button onClick={onClose} style={{...S.btnSmall,color:B.bluck,backgroundColor:B.bleustoLight}}>✕</button></div>{children}</div></div>);}
function JoursPicker({value=[],onChange}){const toggle=c=>onChange(value.includes(c)?value.filter(j=>j!==c):[...value,c]);return<div style={S.chipRow}>{JOURS.map(j=><button key={j.code} type="button" style={S.chip(value.includes(j.code))} onClick={()=>toggle(j.code)}>{j.label}</button>)}</div>;}
function CapacitesPicker({allCapacites,selected=[],onChange}){const toggle=id=>onChange(selected.includes(id)?selected.filter(c=>c!==id):[...selected,id]);if(!allCapacites.length)return<p style={S.infoText}>Aucune capacité</p>;return<div style={S.chipRow}>{allCapacites.map(c=><button key={c.id} type="button" style={S.chip(selected.includes(c.id))} onClick={()=>toggle(c.id)}>{c.icone} {c.nom}</button>)}</div>;}
function ConfirmDelete({message,onConfirm,onCancel}){return<Modal title="Confirmer" onClose={onCancel}><p style={{marginBottom:'20px',fontSize:'14px'}}>{message}</p><div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}><button style={S.btnSecondary} onClick={onCancel}>Annuler</button><button style={{...S.btnPrimary,backgroundColor:B.gochu}} onClick={onConfirm}>Supprimer</button></div></Modal>;}
function Collapsible({label,icon,open,onToggle,count,children}){return(<div>
  <div style={S.collapsible(open)} onClick={onToggle}>
    <span style={{...S.collapsibleIcon,transform:open?'rotate(90deg)':'rotate(0deg)'}}>▶</span>
    <span style={S.collapsibleLabel}>{icon} {label}</span>
    {count!==undefined&&<span style={{fontSize:'12px',color:'#888'}}>({count})</span>}
  </div>
  {open&&<div style={{paddingLeft:'4px',paddingBottom:'8px'}}>{children}</div>}
</div>);}

// ═══════════════════════════════════════════════════════════════
// TAB 1 : ÉTABLISSEMENTS & SERVICES
// ═══════════════════════════════════════════════════════════════
function TabEtablissements({onRefresh}){
  const [etablissements,setEtablissements]=useState([]);const [services,setServices]=useState([]);const [capacites,setCapacites]=useState([]);const [loading,setLoading]=useState(true);
  const [editingEtab,setEditingEtab]=useState(null);const [deletingEtab,setDeletingEtab]=useState(null);
  const [editingService,setEditingService]=useState(null);const [editingSlot,setEditingSlot]=useState(null);
  const [deletingService,setDeletingService]=useState(null);const [deletingSlot,setDeletingSlot]=useState(null);
  const [expandedEtab,setExpandedEtab]=useState(null);
  const [showHoraires,setShowHoraires]=useState({});

  const fetch_=useCallback(async()=>{const[etR,srvR,capR]=await Promise.all([supabase.from('etablissements').select('*').order('sort_order'),supabase.from('services').select('*, slots(*)').order('sort_order'),supabase.from('capacites').select('*').order('sort_order')]);setEtablissements(etR.data||[]);setServices((srvR.data||[]).map(s=>({...s,slots:(s.slots||[]).sort((a,b)=>a.sort_order-b.sort_order)})));setCapacites(capR.data||[]);setLoading(false);},[]);
  useEffect(()=>{fetch_();},[fetch_]);

  const saveEtab=async f=>{const p={nom:f.nom,type:f.type,horaires_ouverture:f.horaires_ouverture,notes:f.notes,updated_at:new Date().toISOString()};if(f.id)await supabase.from('etablissements').update(p).eq('id',f.id);else await supabase.from('etablissements').insert({...p,sort_order:etablissements.length});setEditingEtab(null);fetch_();if(onRefresh)onRefresh();};
  const removeEtab=async()=>{if(deletingEtab){await supabase.from('etablissements').delete().eq('id',deletingEtab.id);setDeletingEtab(null);fetch_();if(onRefresh)onRefresh();}};
  const saveService=async f=>{const p={etablissement_id:f.etablissement_id,nom:f.nom,jours:f.jours,heure_debut:f.heure_debut,heure_fin:f.heure_fin,effectif_min:f.effectif_min,capacites_requises:f.capacites_requises||[],notes:f.notes,updated_at:new Date().toISOString()};if(f.id)await supabase.from('services').update(p).eq('id',f.id);else await supabase.from('services').insert({...p,sort_order:services.length});setEditingService(null);fetch_();};
  const removeService=async()=>{if(deletingService){await supabase.from('services').delete().eq('id',deletingService.id);setDeletingService(null);fetch_();}};
  const saveSlot=async f=>{const p={service_id:f.service_id,nom:f.nom,nb_personnes:f.nb_personnes,heure_debut:f.heure_debut,heure_fin:f.heure_fin,capacites_requises:f.capacites_requises||[],est_optionnel:f.est_optionnel,notes:f.notes};if(f.id)await supabase.from('slots').update(p).eq('id',f.id);else{const c=services.find(s=>s.id===f.service_id)?.slots?.length||0;await supabase.from('slots').insert({...p,sort_order:c});}setEditingSlot(null);fetch_();};
  const removeSlot=async()=>{if(deletingSlot){await supabase.from('slots').delete().eq('id',deletingSlot.id);setDeletingSlot(null);fetch_();}};

  const CapBadges=({ids})=>{if(!ids?.length)return null;return ids.map(cid=>{const cap=capacites.find(c=>c.id===cid);return cap?<span key={cid} style={S.tag}>{cap.icone} {cap.nom}</span>:null;});};
  const toggleHoraires=(id)=>setShowHoraires(h=>({...h,[id]:!h[id]}));

  if(loading)return<p style={S.emptyState}>Chargement…</p>;
  return(<div>
    <div style={S.topBar}><p style={{margin:0,fontSize:'13px',color:'#666'}}>{etablissements.length} établissement{etablissements.length>1?'s':''}</p><button style={S.btnPrimary} onClick={()=>setEditingEtab('new')}>+ Établissement</button></div>
    {!etablissements.length&&<p style={S.emptyState}>Aucun établissement. Créez-en un pour commencer.</p>}

    {etablissements.map(et=>{const isExp=expandedEtab===et.id;const etSrv=services.filter(s=>s.etablissement_id===et.id);const totalSlots=etSrv.reduce((n,s)=>n+s.slots.length,0);return(
      <div key={et.id} style={{...S.card,borderLeft:`4px solid ${B.bluck}`,padding:0}}>
        {/* ── Header ── */}
        <div style={{padding:'16px',cursor:'pointer'}} onClick={()=>setExpandedEtab(isExp?null:et.id)}>
          <div style={S.cardHeader}>
            <div>
              <h4 style={{...S.cardTitle,display:'flex',alignItems:'center',gap:'8px'}}><span style={{fontSize:'12px'}}>{isExp?'▼':'▶'}</span> {et.nom}</h4>
              <div style={{marginTop:'4px'}}>
                <span style={S.badge()}>{TYPES_ETABLISSEMENT.find(t=>t.value===et.type)?.label||et.type}</span>
                <span style={{fontSize:'12px',color:'#888'}}>{etSrv.length} service{etSrv.length>1?'s':''} · {totalSlots} tâche{totalSlots>1?'s':''}</span>
              </div>
            </div>
            <div style={{display:'flex',gap:'6px'}} onClick={e=>e.stopPropagation()}>
              <button style={S.btnSecondary} onClick={()=>setEditingEtab(et)}>Modifier</button>
              <button style={S.btnDanger} onClick={()=>setDeletingEtab(et)}>Suppr.</button>
            </div>
          </div>
        </div>

        {/* ── Expanded content ── */}
        {isExp&&(<div style={{padding:'0 16px 16px',borderTop:`1px solid ${B.bleusto}`}}>

          {/* ── Section 1 : Horaires (collapsible, fermé par défaut) ── */}
          <Collapsible label="Horaires d'ouverture" icon="🕐" open={!!showHoraires[et.id]} onToggle={()=>toggleHoraires(et.id)}>
            <div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                {JOURS.map(j=>{const pl=et.horaires_ouverture?.[j.code];return(
                  <div key={j.code} style={{padding:'4px 10px',borderRadius:'6px',fontSize:'12px',backgroundColor:pl?B.bleustoLight:'#f8f8f8',color:pl?B.bluck:'#bbb',border:`1px solid ${pl?B.bleusto:'#eee'}`}}>
                    <strong>{j.label}</strong>{pl?pl.map((p,i)=><span key={i}>{i>0?' + ':' '}{p.debut}–{p.fin}</span>):' Fermé'}
                  </div>);})}
              </div>
              <div style={{marginTop:'8px'}}><button style={S.btnSecondary} onClick={()=>setEditingEtab(et)}>Modifier les horaires</button></div>
            </div>
          </Collapsible>

          <div style={{borderTop:`1px solid ${B.bleusto}`,marginTop:'4px'}}/>

          {/* ── Section 2 : Services & Tâches (ouvert par défaut) ── */}
          <div style={{marginTop:'12px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
              <span style={{fontSize:'14px',fontWeight:'700',color:B.bluck}}>📅 Services & Tâches</span>
              <button style={{...S.btnSmall,backgroundColor:B.bleusto,color:B.bluck,padding:'6px 14px'}} onClick={()=>setEditingService({_etabId:et.id})}>+ Service</button>
            </div>
            {!etSrv.length&&<p style={{fontSize:'13px',color:'#999',fontStyle:'italic'}}>Ajoutez un service (ex: Midi, Soir) puis configurez les tâches de chaque service.</p>}

            {etSrv.map(srv=>(
              <div key={srv.id} style={{backgroundColor:B.bleustoLight,borderRadius:'8px',padding:'12px',marginBottom:'10px'}}>
                {/* Service header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <span style={{fontWeight:'700',fontSize:'14px',color:B.bluck}}>{srv.nom}</span>
                    <div style={{marginTop:'3px'}}>
                      {srv.jours.map(j=><span key={j} style={{...S.badge(B.white),fontSize:'10px',padding:'1px 6px'}}>{JOURS.find(d=>d.code===j)?.label||j}</span>)}
                      <span style={{fontSize:'12px',color:'#555',marginLeft:'6px'}}>{srv.heure_debut}→{srv.heure_fin} · min {srv.effectif_min}</span>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:'4px'}}>
                    <button style={{...S.btnSmall,color:B.bluck,backgroundColor:B.white}} onClick={()=>setEditingService(srv)}>✎</button>
                    <button style={{...S.btnSmall,color:B.gochu,backgroundColor:'#fee'}} onClick={()=>setDeletingService(srv)}>✕</button>
                  </div>
                </div>
                {(srv.capacites_requises||[]).length>0&&<div style={{marginTop:'6px'}}><CapBadges ids={srv.capacites_requises}/></div>}

                {/* Tâches (slots) — always visible */}
                <div style={{marginTop:'10px',paddingTop:'8px',borderTop:`1px dashed ${B.bleustoDark}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
                    <span style={{fontSize:'12px',fontWeight:'600',color:B.bluck}}>Tâches ({srv.slots.length})</span>
                    <button style={{...S.btnSmall,backgroundColor:B.white,color:B.bluck,border:`1px solid ${B.bleustoDark}`,padding:'4px 12px'}} onClick={()=>setEditingSlot({serviceId:srv.id,slot:null})}>+ Tâche</button>
                  </div>
                  {!srv.slots.length&&<p style={{fontSize:'12px',color:'#999',fontStyle:'italic'}}>Aucune tâche. Ajoutez les étapes de ce service (mise en place, nettoyage…).</p>}
                  {srv.slots.map(slot=>(
                    <div key={slot.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',marginBottom:'4px',borderRadius:'6px',backgroundColor:B.white,border:`1px solid ${B.bleusto}`}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                        <span style={{fontSize:'16px'}}>{TACHES_PREDEFINIES.find(t=>t.nom===slot.nom)?.icone||'📋'}</span>
                        <span style={{fontWeight:'600',fontSize:'13px',color:B.bluck}}>{slot.nom}</span>
                        <span style={{fontSize:'12px',color:'#666'}}>{slot.heure_debut}→{slot.heure_fin}</span>
                        <span style={{fontSize:'12px',color:'#888'}}>{slot.nb_personnes} pers.</span>
                        {slot.est_optionnel&&<span style={{...S.badge(B.corail),fontSize:'10px'}}>optionnel</span>}
                        <CapBadges ids={slot.capacites_requises}/>
                      </div>
                      <div style={{display:'flex',gap:'3px',flexShrink:0}}>
                        <button style={{...S.btnSmall,color:B.bluck,backgroundColor:B.bleustoLight,fontSize:'11px'}} onClick={()=>setEditingSlot({serviceId:srv.id,slot})}>✎</button>
                        <button style={{...S.btnSmall,color:B.gochu,backgroundColor:'#fee',fontSize:'11px'}} onClick={()=>setDeletingSlot(slot)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>)}
      </div>);})}

    {editingEtab&&<EtablissementForm initial={editingEtab==='new'?null:editingEtab} onSave={saveEtab} onClose={()=>setEditingEtab(null)}/>}
    {editingService&&<ServiceForm initial={editingService._etabId?null:editingService} defaultEtabId={editingService._etabId||editingService.etablissement_id} etablissements={etablissements} capacites={capacites} onSave={saveService} onClose={()=>setEditingService(null)}/>}
    {editingSlot&&<SlotForm initial={editingSlot.slot} serviceId={editingSlot.serviceId} capacites={capacites} onSave={saveSlot} onClose={()=>setEditingSlot(null)}/>}
    {deletingEtab&&<ConfirmDelete message={`Supprimer « ${deletingEtab.nom} » et tous ses services/tâches ?`} onConfirm={removeEtab} onCancel={()=>setDeletingEtab(null)}/>}
    {deletingService&&<ConfirmDelete message={`Supprimer « ${deletingService.nom} » et ses tâches ?`} onConfirm={removeService} onCancel={()=>setDeletingService(null)}/>}
    {deletingSlot&&<ConfirmDelete message={`Supprimer « ${deletingSlot.nom} » ?`} onConfirm={removeSlot} onCancel={()=>setDeletingSlot(null)}/>}
  </div>);
}

// ── Forms ──
function EtablissementForm({initial,onSave,onClose}){
  const [form,setForm]=useState({id:initial?.id||null,nom:initial?.nom||'',type:initial?.type||'restaurant',horaires_ouverture:initial?.horaires_ouverture||{},notes:initial?.notes||''});
  const toggleJour=j=>{const h={...form.horaires_ouverture};if(h[j])delete h[j];else h[j]=[{debut:'12:00',fin:'14:15'},{debut:'19:00',fin:'22:00'}];setForm({...form,horaires_ouverture:h});};
  const updatePlage=(j,i,f,v)=>{const h={...form.horaires_ouverture};const p=[...(h[j]||[])];p[i]={...p[i],[f]:v};h[j]=p;setForm({...form,horaires_ouverture:h});};
  const addPlage=j=>{const h={...form.horaires_ouverture};h[j]=[...(h[j]||[]),{debut:'19:00',fin:'22:00'}];setForm({...form,horaires_ouverture:h});};
  const removePlage=(j,i)=>{const h={...form.horaires_ouverture};const p=[...(h[j]||[])];p.splice(i,1);if(!p.length)delete h[j];else h[j]=p;setForm({...form,horaires_ouverture:h});};
  return(
    <Modal title={initial?"Modifier l'établissement":'Nouvel établissement'} onClose={onClose}>
      <div style={S.field}><label style={S.label}>Nom</label><input style={S.input} value={form.nom} onChange={e=>setForm({...form,nom:e.target.value})} placeholder="Nom de l'établissement"/></div>
      <div style={S.field}><label style={S.label}>Type</label><select style={S.select} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{TYPES_ETABLISSEMENT.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      <div style={S.field}><label style={S.label}>Horaires d'ouverture</label><p style={S.infoText}>Activez un jour, puis ajoutez des plages</p>
        <div style={{display:'flex',flexDirection:'column',gap:'6px',marginTop:'8px'}}>
          {JOURS.map(j=>{const plages=form.horaires_ouverture[j.code];const isO=!!plages;return(
            <div key={j.code} style={{padding:'6px 8px',borderRadius:'6px',backgroundColor:isO?B.bleustoLight:'transparent',border:`1px solid ${isO?B.bleusto:'#eee'}`}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <button type="button" style={{...S.chip(isO),minWidth:'44px',padding:'4px 10px',fontSize:'12px'}} onClick={()=>toggleJour(j.code)}>{j.label}</button>
                {!isO&&<span style={{fontSize:'11px',color:'#bbb'}}>Fermé</span>}
                {isO&&plages.map((p,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'4px'}}>
                    {i>0&&<span style={{color:'#ccc',fontSize:'11px'}}>+</span>}
                    <input type="time" style={{...S.input,width:'95px',padding:'3px 6px',fontSize:'12px'}} value={p.debut} onChange={e=>updatePlage(j.code,i,'debut',e.target.value)}/>
                    <span style={{color:'#999',fontSize:'11px'}}>→</span>
                    <input type="time" style={{...S.input,width:'95px',padding:'3px 6px',fontSize:'12px'}} value={p.fin} onChange={e=>updatePlage(j.code,i,'fin',e.target.value)}/>
                    {plages.length>1&&<button type="button" style={{...S.btnSmall,color:B.gochu,backgroundColor:'#fee',padding:'2px 6px',fontSize:'10px'}} onClick={()=>removePlage(j.code,i)}>✕</button>}
                  </div>))}
                {isO&&<button type="button" style={{...S.btnSmall,color:B.bluck,backgroundColor:B.white,border:`1px dashed ${B.bleustoDark}`,padding:'2px 8px',fontSize:'10px'}} onClick={()=>addPlage(j.code)}>+</button>}
              </div>
            </div>);})}
        </div>
      </div>
      <div style={S.field}><label style={S.label}>Notes</label><textarea style={{...S.input,minHeight:'50px',resize:'vertical'}} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
      <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'16px'}}><button style={S.btnSecondary} onClick={onClose}>Annuler</button><button style={S.btnPrimary} disabled={!form.nom.trim()} onClick={()=>onSave(form)}>{initial?'Enregistrer':'Créer'}</button></div>
    </Modal>
  );
}

function ServiceForm({initial,defaultEtabId,etablissements,capacites,onSave,onClose}){
  const [form,setForm]=useState({id:initial?.id||null,etablissement_id:initial?.etablissement_id||defaultEtabId||etablissements[0]?.id||'',nom:initial?.nom||'',jours:initial?.jours||['Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],heure_debut:initial?.heure_debut||'09:00',heure_fin:initial?.heure_fin||'14:30',effectif_min:initial?.effectif_min||2,capacites_requises:initial?.capacites_requises||[],notes:initial?.notes||''});
  return(
    <Modal title={initial?'Modifier le service':'Nouveau service'} onClose={onClose}>
      {etablissements.length>1&&<div style={S.field}><label style={S.label}>Établissement</label><select style={S.select} value={form.etablissement_id} onChange={e=>setForm({...form,etablissement_id:e.target.value})}>{etablissements.map(et=><option key={et.id} value={et.id}>{et.nom}</option>)}</select></div>}
      <div style={S.field}><label style={S.label}>Nom du service</label><input style={S.input} value={form.nom} onChange={e=>setForm({...form,nom:e.target.value})} placeholder="Ex: Midi, Soir…"/></div>
      <div style={S.field}><label style={S.label}>Jours</label><JoursPicker value={form.jours} onChange={jours=>setForm({...form,jours})}/></div>
      <div style={S.row}>
        <div style={{...S.field,flex:1}}><label style={S.label}>Début</label><input type="time" style={S.input} value={form.heure_debut} onChange={e=>setForm({...form,heure_debut:e.target.value})}/></div>
        <div style={{...S.field,flex:1}}><label style={S.label}>Fin</label><input type="time" style={S.input} value={form.heure_fin} onChange={e=>setForm({...form,heure_fin:e.target.value})}/></div>
        <div style={{...S.field,flex:1}}><label style={S.label}>Effectif min</label><input type="number" min={1} style={S.input} value={form.effectif_min} onChange={e=>setForm({...form,effectif_min:parseInt(e.target.value)||1})}/></div>
      </div>
      <div style={S.field}><label style={S.label}>Capacités requises</label><p style={S.infoText}>Au moins 1 personne avec cette capacité doit être présente</p><CapacitesPicker allCapacites={capacites} selected={form.capacites_requises} onChange={c=>setForm({...form,capacites_requises:c})}/></div>
      <div style={S.field}><label style={S.label}>Notes</label><textarea style={{...S.input,minHeight:'50px',resize:'vertical'}} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
      <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'16px'}}><button style={S.btnSecondary} onClick={onClose}>Annuler</button><button style={S.btnPrimary} disabled={!form.nom.trim()} onClick={()=>onSave(form)}>{initial?'Enregistrer':'Créer'}</button></div>
    </Modal>
  );
}

function SlotForm({initial,serviceId,capacites,onSave,onClose}){
  const [form,setForm]=useState({id:initial?.id||null,service_id:serviceId,nom:initial?.nom||'',nb_personnes:initial?.nb_personnes||1,heure_debut:initial?.heure_debut||'09:00',heure_fin:initial?.heure_fin||'14:30',capacites_requises:initial?.capacites_requises||[],est_optionnel:initial?.est_optionnel||false,notes:initial?.notes||''});
  const [customName,setCustomName]=useState(!TACHES_PREDEFINIES.find(t=>t.nom===initial?.nom)&&initial?.nom?true:false);

  return(
    <Modal title={initial?'Modifier la tâche':'Nouvelle tâche'} onClose={onClose}>
      <div style={S.field}>
        <label style={S.label}>Type de tâche</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'8px'}}>
          {TACHES_PREDEFINIES.map(t=>(
            <button key={t.nom} type="button" style={{...S.chip(form.nom===t.nom&&!customName),display:'flex',alignItems:'center',gap:'4px'}}
              onClick={()=>{setForm({...form,nom:t.nom});setCustomName(false);}}>
              <span>{t.icone}</span> {t.nom}
            </button>
          ))}
          <button type="button" style={{...S.chip(customName),display:'flex',alignItems:'center',gap:'4px'}}
            onClick={()=>{setCustomName(true);setForm({...form,nom:''});}}>
            ✏️ Autre
          </button>
        </div>
        {customName&&<input style={S.input} value={form.nom} onChange={e=>setForm({...form,nom:e.target.value})} placeholder="Nom de la tâche"/>}
      </div>
      <div style={S.row}>
        <div style={{...S.field,flex:1}}><label style={S.label}>Personnes</label><input type="number" min={1} style={S.input} value={form.nb_personnes} onChange={e=>setForm({...form,nb_personnes:parseInt(e.target.value)||1})}/></div>
        <div style={{...S.field,flex:1}}><label style={S.label}>Début</label><input type="time" style={S.input} value={form.heure_debut} onChange={e=>setForm({...form,heure_debut:e.target.value})}/></div>
        <div style={{...S.field,flex:1}}><label style={S.label}>Fin</label><input type="time" style={S.input} value={form.heure_fin} onChange={e=>setForm({...form,heure_fin:e.target.value})}/></div>
      </div>
      <div style={S.field}><label style={S.label}>Capacités requises</label><CapacitesPicker allCapacites={capacites} selected={form.capacites_requises} onChange={c=>setForm({...form,capacites_requises:c})}/></div>
      <div style={S.field}><label style={{...S.label,display:'flex',alignItems:'center',gap:'8px'}}><input type="checkbox" checked={form.est_optionnel} onChange={e=>setForm({...form,est_optionnel:e.target.checked})}/> Optionnel (rempli seulement si assez de personnel)</label></div>
      <div style={S.field}><label style={S.label}>Notes</label><textarea style={{...S.input,minHeight:'40px',resize:'vertical'}} value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
      <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'16px'}}><button style={S.btnSecondary} onClick={onClose}>Annuler</button><button style={S.btnPrimary} disabled={!form.nom.trim()} onClick={()=>onSave(form)}>{initial?'Enregistrer':'Créer'}</button></div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 2 : PROFILS
// ═══════════════════════════════════════════════════════════════
function TabProfils(){
  const [profils,setProfils]=useState([]);const [capacites,setCapacites]=useState([]);const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState(null);const [deleting,setDeleting]=useState(null);
  const fetch_=useCallback(async()=>{const[pR,cR]=await Promise.all([supabase.from('profils').select('*').order('sort_order'),supabase.from('capacites').select('*').order('sort_order')]);setProfils(pR.data||[]);setCapacites(cR.data||[]);setLoading(false);},[]);
  useEffect(()=>{fetch_();},[fetch_]);
  const save=async f=>{const p={nom:f.nom,description:f.description,capacite_ids:f.capacite_ids||[]};if(f.id)await supabase.from('profils').update({...p,updated_at:new Date().toISOString()}).eq('id',f.id);else await supabase.from('profils').insert({...p,sort_order:profils.length});setEditing(null);fetch_();};
  const remove=async()=>{if(deleting){await supabase.from('profils').delete().eq('id',deleting.id);setDeleting(null);fetch_();}};
  if(loading)return<p style={S.emptyState}>Chargement…</p>;
  return(<div>
    <div style={S.topBar}><p style={{margin:0,fontSize:'13px',color:'#666'}}>{profils.length} profil{profils.length>1?'s':''}</p><button style={S.btnPrimary} onClick={()=>setEditing('new')}>+ Nouveau profil</button></div>
    <p style={{...S.infoText,marginTop:'-12px',marginBottom:'16px'}}>Créez vos typologies d'employés et cochez les capacités de chacun.</p>
    {!profils.length&&<p style={S.emptyState}>Aucun profil. Créez vos typologies d'employés.</p>}
    {profils.map(prof=>{const caps=capacites.filter(c=>(prof.capacite_ids||[]).includes(c.id));return(
      <div key={prof.id} style={{...S.card,borderLeft:`4px solid ${B.corail}`}}>
        <div style={S.cardHeader}><div><h4 style={{...S.cardTitle,fontSize:'15px'}}>{prof.nom}</h4>{prof.description&&<p style={{fontSize:'12px',color:'#666',margin:'2px 0 0'}}>{prof.description}</p>}</div>
          <div style={{display:'flex',gap:'4px'}}><button style={S.btnSecondary} onClick={()=>setEditing(prof)}>Modifier</button><button style={S.btnDanger} onClick={()=>setDeleting(prof)}>Suppr.</button></div>
        </div>
        <div style={{marginTop:'6px'}}>{caps.length?caps.map(c=><span key={c.id} style={S.tag}>{c.icone} {c.nom}</span>):<span style={{fontSize:'12px',color:'#999',fontStyle:'italic'}}>Aucune capacité — cliquez Modifier</span>}</div>
      </div>);})}
    {editing&&<ProfilForm initial={editing==='new'?null:editing} capacites={capacites} onSave={save} onClose={()=>setEditing(null)}/>}
    {deleting&&<ConfirmDelete message={`Supprimer « ${deleting.nom} » ?`} onConfirm={remove} onCancel={()=>setDeleting(null)}/>}
  </div>);
}
function ProfilForm({initial,capacites,onSave,onClose}){
  const [form,setForm]=useState({id:initial?.id||null,nom:initial?.nom||'',description:initial?.description||'',capacite_ids:initial?.capacite_ids||[]});
  const toggleCap=capId=>setForm({...form,capacite_ids:form.capacite_ids.includes(capId)?form.capacite_ids.filter(c=>c!==capId):[...form.capacite_ids,capId]});
  return(<Modal title={initial?`Modifier « ${initial.nom} »`:'Nouveau profil'} onClose={onClose}>
    <div style={S.field}><label style={S.label}>Nom du profil</label><input style={S.input} value={form.nom} onChange={e=>setForm({...form,nom:e.target.value})} placeholder="Ex: Manager, Équipier polyvalent…"/></div>
    <div style={S.field}><label style={S.label}>Description</label><input style={S.input} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Optionnel"/></div>
    <div style={S.field}><label style={{...S.label,fontSize:'14px',marginBottom:'10px'}}>Capacités</label>
      <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>{capacites.map(cap=>{const checked=form.capacite_ids.includes(cap.id);return(
        <div key={cap.id} style={{...S.checkbox,backgroundColor:checked?B.bleustoLight:'transparent',border:`1px solid ${checked?B.bleusto:'#eee'}`,borderRadius:'8px'}} onClick={()=>toggleCap(cap.id)}>
          <input type="checkbox" checked={checked} onChange={()=>{}} style={{accentColor:B.bluck,width:'18px',height:'18px',cursor:'pointer'}}/><span style={{fontSize:'20px'}}>{cap.icone}</span>
          <div><span style={{fontWeight:'600',fontSize:'14px',color:B.bluck}}>{cap.nom}</span>{cap.description&&<span style={{fontSize:'12px',color:'#888',marginLeft:'8px'}}>{cap.description}</span>}</div>
        </div>);})}</div>
    </div>
    <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'16px'}}><button style={S.btnSecondary} onClick={onClose}>Annuler</button><button style={S.btnPrimary} disabled={!form.nom.trim()} onClick={()=>onSave(form)}>{initial?'Enregistrer':'Créer'}</button></div>
  </Modal>);
}

// ═══════════════════════════════════════════════════════════════
// TAB 3 : ÉQUIPE
// ═══════════════════════════════════════════════════════════════
function TabEquipe({onRefresh}){
  const [employees,setEmployees]=useState([]);const [etablissements,setEtablissements]=useState([]);const [profils,setProfils]=useState([]);
  const [loading,setLoading]=useState(true);const [editing,setEditing]=useState(null);const [deleting,setDeleting]=useState(null);const [showDispos,setShowDispos]=useState(null);
  const fetch_=useCallback(async()=>{const[eR,etR,pR]=await Promise.all([supabase.from('employees').select('*').order('sort_order'),supabase.from('etablissements').select('*').order('sort_order'),supabase.from('profils').select('*').order('sort_order')]);setEmployees(eR.data||[]);setEtablissements(etR.data||[]);setProfils(pR.data||[]);setLoading(false);},[]);
  useEffect(()=>{fetch_();},[fetch_]);
  const save=async form=>{const fullName=`${form.prenom} ${form.nom}`.trim();const p={name:fullName,contract_hours:form.contract_hours,is_active:form.is_active,statut:form.statut,etablissement_id:form.etablissement_id||null,profil_id:form.profil_id||null};
    if(form.id){await supabase.from('employees').update(p).eq('id',form.id);}
    else{const initials=`${(form.prenom||'')[0]||''}${(form.nom||'')[0]||''}`.toUpperCase();await supabase.from('employees').insert({...p,slug:fullName.toLowerCase().replace(/\s+/g,'-'),initials,color:'#b8d5e0',sort_order:employees.length});}
    setEditing(null);fetch_();if(onRefresh)onRefresh();};
  const remove=async()=>{if(deleting){await supabase.from('employees').delete().eq('id',deleting.id);setDeleting(null);fetch_();if(onRefresh)onRefresh();}};
  if(loading)return<p style={S.emptyState}>Chargement…</p>;
  return(<div>
    <div style={S.topBar}><p style={{margin:0,fontSize:'13px',color:'#666'}}>{employees.filter(e=>e.is_active).length} actif{employees.filter(e=>e.is_active).length>1?'s':''}</p><button style={S.btnPrimary} onClick={()=>setEditing('new')}>+ Ajouter</button></div>
    {!employees.length&&<p style={S.emptyState}>Aucun employé. Ajoutez votre équipe.</p>}
    {employees.map(emp=>{const etab=etablissements.find(e=>e.id===emp.etablissement_id);const prof=profils.find(p=>p.id===emp.profil_id);return(
      <div key={emp.id} style={{...S.card,opacity:emp.is_active?1:0.5,borderLeft:`4px solid ${B.bleusto}`}}>
        <div style={S.cardHeader}><div>
          <h4 style={{...S.cardTitle,fontSize:'15px'}}>{emp.name}{!emp.is_active&&<span style={{...S.badge('#ccc'),marginLeft:'8px'}}>Inactif</span>}</h4>
          <div style={{marginTop:'4px',fontSize:'12px',color:'#666'}}>{prof&&<span style={S.badge(B.corail)}>{prof.nom}</span>}<span style={{marginRight:'12px'}}>{emp.contract_hours||'?'}h</span><span style={S.badge()}>{emp.statut||'Salarié'}</span>{etab&&<span style={S.badge(B.bleustoLight)}>{etab.nom}</span>}</div>
        </div>
        <div style={{display:'flex',gap:'4px',flexShrink:0}}><button style={S.btnSecondary} onClick={()=>setShowDispos(showDispos===emp.id?null:emp.id)}>Dispos</button><button style={S.btnSecondary} onClick={()=>setEditing(emp)}>Modifier</button><button style={S.btnDanger} onClick={()=>setDeleting(emp)}>Suppr.</button></div></div>
        {showDispos===emp.id&&<DispoGrid employeeId={emp.id} onRefresh={onRefresh}/>}
      </div>);})}
    {editing&&<EmployeeForm initial={editing==='new'?null:editing} etablissements={etablissements} profils={profils} onSave={save} onClose={()=>setEditing(null)}/>}
    {deleting&&<ConfirmDelete message={`Supprimer « ${deleting.name} » ?`} onConfirm={remove} onCancel={()=>setDeleting(null)}/>}
  </div>);
}
function EmployeeForm({initial,etablissements,profils,onSave,onClose}){
  const parts=(initial?.name||'').split(' ');
  const [form,setForm]=useState({id:initial?.id||null,prenom:initial?parts[0]||'':'',nom:initial?parts.slice(1).join(' ')||'':'',contract_hours:initial?.contract_hours||39,is_active:initial?.is_active??true,statut:initial?.statut||'Salarié',etablissement_id:initial?.etablissement_id||'',profil_id:initial?.profil_id||''});
  return(<Modal title={initial?`Modifier ${initial.name}`:'Nouvel employé'} onClose={onClose}>
    <div style={S.row}><div style={{...S.field,flex:1}}><label style={S.label}>Nom</label><input style={S.input} value={form.nom} onChange={e=>setForm({...form,nom:e.target.value})} placeholder="Nom"/></div><div style={{...S.field,flex:1}}><label style={S.label}>Prénom</label><input style={S.input} value={form.prenom} onChange={e=>setForm({...form,prenom:e.target.value})} placeholder="Prénom"/></div></div>
    <div style={S.field}>
      <label style={{...S.label,fontSize:'14px',marginBottom:'8px'}}>👤 Profil</label>
      {!profils.length?<p style={{...S.infoText,color:B.gochu}}>Créez d'abord des profils dans l'onglet Profils.</p>:
        <select style={S.select} value={form.profil_id} onChange={e=>setForm({...form,profil_id:e.target.value})}><option value="">— Choisir un profil —</option>{profils.map(p=><option key={p.id} value={p.id}>{p.nom}</option>)}</select>}
    </div>
    <div style={S.row}><div style={{...S.field,flex:1}}><label style={S.label}>Statut</label><select style={S.select} value={form.statut} onChange={e=>setForm({...form,statut:e.target.value})}>{STATUTS_EMPLOYE.map(s=><option key={s} value={s}>{s}</option>)}</select></div><div style={{...S.field,flex:1}}><label style={S.label}>Heures contrat</label><input type="number" min={0} max={48} style={S.input} value={form.contract_hours} onChange={e=>setForm({...form,contract_hours:parseFloat(e.target.value)||0})}/></div></div>
    <div style={S.field}><label style={S.label}>Établissement</label><select style={S.select} value={form.etablissement_id} onChange={e=>setForm({...form,etablissement_id:e.target.value})}><option value="">— Aucun —</option>{etablissements.map(et=><option key={et.id} value={et.id}>{et.nom}</option>)}</select></div>
    <div style={S.field}><label style={{...S.label,display:'flex',alignItems:'center',gap:'6px'}}><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> Actif</label></div>
    <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'16px'}}><button style={S.btnSecondary} onClick={onClose}>Annuler</button><button style={S.btnPrimary} disabled={!form.prenom.trim()} onClick={()=>onSave(form)}>{initial?'Enregistrer':'Créer'}</button></div>
  </Modal>);
}
function DispoGrid({employeeId,onRefresh}){
  const [dispos,setDispos]=useState([]);const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{const{data}=await supabase.from('disponibilites').select('*').eq('employee_id',employeeId);setDispos(data||[]);setLoading(false);})();},[employeeId]);
  const toggle=async dayCode=>{const existing=dispos.find(d=>d.day_of_week===dayCode);
    if(existing){const nv=!existing.is_available;await supabase.from('disponibilites').update({is_available:nv}).eq('id',existing.id);setDispos(dispos.map(d=>d.id===existing.id?{...d,is_available:nv}:d));}
    else{const{data}=await supabase.from('disponibilites').insert({employee_id:employeeId,day_of_week:dayCode,is_available:false,note:'Indisponible fixe'}).select().single();if(data)setDispos([...dispos,data]);}
    if(onRefresh)onRefresh();};
  if(loading)return<p style={{fontSize:'12px',color:'#999'}}>Chargement…</p>;
  return(<div style={{marginTop:'10px',paddingTop:'10px',borderTop:`1px dashed ${B.bleusto}`}}>
    <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>{JOURS.map(j=>{const d=dispos.find(x=>x.day_of_week===j.code);const ok=!d||d.is_available;return(
      <button key={j.code} type="button" style={{padding:'6px 12px',borderRadius:'8px',fontSize:'12px',fontWeight:'600',border:`2px solid ${ok?'#2ecc71':B.gochu}`,backgroundColor:ok?'#eafaf1':'#fdeaea',color:ok?'#27ae60':B.gochu,cursor:'pointer',transition:'all 0.15s'}} onClick={()=>toggle(j.code)}>{j.label} {ok?'✓':'✗'}</button>);})}</div>
    <p style={S.infoText}>Vert = disponible · Rouge = indisponible fixe</p>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
const SUB_TABS=[{id:'etablissement',label:'Établissements & Services',icon:'🏪'},{id:'profils',label:'Profils',icon:'👤'},{id:'equipe',label:'Équipe',icon:'👥'}];
export default function Settings({onRefresh}){
  const [activeTab,setActiveTab]=useState('etablissement');
  return(<div style={S.page}>
    <nav style={S.subTabs}>{SUB_TABS.map(tab=><button key={tab.id} style={S.subTab(activeTab===tab.id)} onClick={()=>setActiveTab(tab.id)}>{tab.icon} {tab.label}</button>)}</nav>
    {activeTab==='etablissement'&&<TabEtablissements onRefresh={onRefresh}/>}
    {activeTab==='profils'&&<TabProfils/>}
    {activeTab==='equipe'&&<TabEquipe onRefresh={onRefresh}/>}
  </div>);
}
