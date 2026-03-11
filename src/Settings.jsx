import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const TEAMS = [
  { id:'resto', label:'🍽️ Restaurant', color:'#ed1548' },
  { id:'ft',    label:'🚐 FoodTruck / Labo', color:'#003f87' },
];
const COLORS = ['#ed1548','#003f87','#7c3aed','#2563eb','#dc2626','#16a34a','#d97706','#0891b2','#db2777','#64748b','#059669','#ca8a04'];

const card = { background:'#dce9ef',border:'1px solid #b0cdd9',borderRadius:10 };
const inp  = { background:'#edf4f8',color:'#1e293b',border:'1px solid #a3c4d4',borderRadius:6,padding:'7px 10px',fontSize:12,width:'100%',boxSizing:'border-box',outline:'none',fontFamily:"'Montserrat',system-ui,sans-serif" };

export default function SettingsTab({ employees, dispos, onRefresh }) {
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [newForm, setNewForm] = useState({ name:'', initials:'', role:'Équipier', team:'resto', color:'#003f87', contract_hours:39 });
  const [saving, setSaving] = useState(false);
  const [activeTeam, setActiveTeam] = useState('resto');

  const teamEmployees = employees.filter(e => e.team === activeTeam).sort((a,b) => a.sort_order - b.sort_order);

  // ── Add employee ─────────────────────────────────────────
  const handleAdd = async () => {
    if (!newForm.name.trim() || !newForm.initials.trim()) return;
    setSaving(true);
    const slug = newForm.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'_');
    const maxOrder = Math.max(0, ...employees.filter(e=>e.team===activeTeam).map(e=>e.sort_order));
    const { error } = await supabase.from('employees').insert({
      ...newForm,
      team: activeTeam,
      slug: slug + '_' + Date.now().toString(36),
      sort_order: maxOrder + 1,
      is_active: true,
      is_meeting_only: false,
    });
    if (error) { alert('Erreur: ' + error.message); }
    else {
      setNewForm({ name:'', initials:'', role:'Équipier', team:activeTeam, color:'#003f87', contract_hours:39 });
      onRefresh();
    }
    setSaving(false);
  };

  // ── Update employee ──────────────────────────────────────
  const handleSave = async (emp) => {
    setSaving(true);
    const updates = form;
    const { error } = await supabase.from('employees').update(updates).eq('id', emp.id);
    if (error) alert('Erreur: ' + error.message);
    else { setEditId(null); onRefresh(); }
    setSaving(false);
  };

  // ── Delete employee ──────────────────────────────────────
  const handleDelete = async (emp) => {
    if (!confirm(`Supprimer ${emp.name} de l'équipe ? Cette action est irréversible.`)) return;
    const { error } = await supabase.from('employees').delete().eq('id', emp.id);
    if (error) alert('Erreur: ' + error.message);
    else onRefresh();
  };

  // ── Toggle active ────────────────────────────────────────
  const handleToggleActive = async (emp) => {
    await supabase.from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id);
    onRefresh();
  };

  // ── Toggle dispo ─────────────────────────────────────────
  const handleToggleDispo = async (emp, day) => {
    const existing = dispos.find(d => d.employee_id === emp.id && d.day_of_week === day);
    if (existing) {
      await supabase.from('disponibilites').update({ is_available: !existing.is_available }).eq('id', existing.id);
    } else {
      await supabase.from('disponibilites').insert({
        employee_id: emp.id,
        day_of_week: day,
        is_available: false,
      });
    }
    onRefresh();
  };

  const getDispo = (emp, day) => {
    const d = dispos.find(x => x.employee_id === emp.id && x.day_of_week === day);
    return d ? d.is_available : true;
  };

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <span style={{fontSize:28}}>⚙️</span>
        <div>
          <h2 style={{margin:0,color:'#003f87',fontSize:20,fontWeight:800}}>Paramètres équipe</h2>
          <p style={{margin:0,color:'#64748b',fontSize:12}}>Ajouter, modifier ou supprimer des membres · Gérer les disponibilités</p>
        </div>
      </div>

      {/* Team tabs */}
      <div style={{display:'flex',gap:6,marginBottom:16}}>
        {TEAMS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTeam(t.id)} style={{
            padding:'10px 20px',borderRadius:10,border:'none',cursor:'pointer',fontFamily:'inherit',
            fontWeight:activeTeam===t.id?800:500, fontSize:13,
            background:activeTeam===t.id?'#fff':'#c8dce5',
            color:activeTeam===t.id?t.color:'#64748b',
            border:activeTeam===t.id?`2px solid ${t.color}`:'2px solid transparent',
            boxShadow:activeTeam===t.id?'0 2px 8px rgba(0,63,135,.1)':'none',
          }}>{t.label} <span style={{
            background:activeTeam===t.id?t.color:'#94a3b8',color:'#fff',
            borderRadius:5,padding:'2px 7px',fontSize:11,marginLeft:4,
          }}>{employees.filter(e=>e.team===t.id).length}</span></button>
        ))}
      </div>

      {/* Employee list */}
      <div style={{...card, padding:'16px', marginBottom:16}}>
        <div style={{color:'#003f87',fontSize:11,fontWeight:700,letterSpacing:.5,marginBottom:12}}>
          MEMBRES DE L'ÉQUIPE
        </div>

        {teamEmployees.map(emp => {
          const isEditing = editId === emp.id;
          return (
            <div key={emp.id} style={{
              padding:'10px 12px', marginBottom:8, borderRadius:8,
              background: emp.is_active ? '#edf4f8' : '#e8ecf0',
              border: isEditing ? '2px solid #ed1548' : '1px solid #c8dce5',
              opacity: emp.is_active ? 1 : 0.5,
            }}>
              {isEditing ? (
                /* ── Edit mode ── */
                <div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 80px 1fr 80px',gap:8,marginBottom:8}}>
                    <div>
                      <div style={{color:'#64748b',fontSize:9,marginBottom:2}}>Nom</div>
                      <input value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} style={inp}/>
                    </div>
                    <div>
                      <div style={{color:'#64748b',fontSize:9,marginBottom:2}}>Initiales</div>
                      <input value={form.initials||''} onChange={e=>setForm({...form,initials:e.target.value})} style={inp} maxLength={3}/>
                    </div>
                    <div>
                      <div style={{color:'#64748b',fontSize:9,marginBottom:2}}>Poste</div>
                      <input value={form.role||''} onChange={e=>setForm({...form,role:e.target.value})} style={inp}/>
                    </div>
                    <div>
                      <div style={{color:'#64748b',fontSize:9,marginBottom:2}}>Heures</div>
                      <input type="number" value={form.contract_hours||0} onChange={e=>setForm({...form,contract_hours:+e.target.value})} style={inp}/>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,marginBottom:8}}>
                    <div style={{color:'#64748b',fontSize:9,marginRight:4,paddingTop:4}}>Couleur</div>
                    {COLORS.map(c=>(
                      <div key={c} onClick={()=>setForm({...form,color:c})} style={{
                        width:20,height:20,borderRadius:5,background:c,cursor:'pointer',
                        border:form.color===c?'2px solid #1e293b':'2px solid transparent',
                      }}/>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>handleSave(emp)} disabled={saving} style={{
                      padding:'6px 16px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:'inherit',
                      background:'#16a34a',color:'#fff',fontWeight:700,fontSize:11,
                    }}>✓ Enregistrer</button>
                    <button onClick={()=>setEditId(null)} style={{
                      padding:'6px 12px',borderRadius:6,border:'1px solid #a3c4d4',cursor:'pointer',fontFamily:'inherit',
                      background:'transparent',color:'#64748b',fontSize:11,
                    }}>Annuler</button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{
                    width:32,height:32,borderRadius:8,flexShrink:0,
                    background:emp.color+'20',border:`2px solid ${emp.color}`,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:11,fontWeight:800,color:emp.color,
                  }}>{emp.initials}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:'#1e293b'}}>
                      {emp.name}
                      {emp.is_meeting_only && <span style={{color:'#94a3b8',fontSize:10,marginLeft:6}}>(meetings only)</span>}
                    </div>
                    <div style={{color:'#64748b',fontSize:10}}>{emp.role} · {emp.contract_hours}h</div>
                  </div>
                  <button onClick={()=>handleToggleActive(emp)} title={emp.is_active?'Désactiver':'Activer'} style={{
                    background:'transparent',border:'none',cursor:'pointer',fontSize:16,padding:0,
                  }}>{emp.is_active ? '👁️' : '👁️‍🗨️'}</button>
                  <button onClick={()=>{setEditId(emp.id);setForm({name:emp.name,initials:emp.initials,role:emp.role,contract_hours:emp.contract_hours,color:emp.color});}} style={{
                    background:'transparent',border:'1px solid #a3c4d4',borderRadius:5,cursor:'pointer',
                    color:'#003f87',padding:'3px 8px',fontSize:10,fontFamily:'inherit',fontWeight:600,
                  }}>✏️ Modifier</button>
                  <button onClick={()=>handleDelete(emp)} style={{
                    background:'transparent',border:'1px solid #a3c4d4',borderRadius:5,cursor:'pointer',
                    color:'#dc2626',padding:'3px 8px',fontSize:10,fontFamily:'inherit',
                  }}>🗑️</button>
                </div>
              )}
            </div>
          );
        })}

        {/* Add new */}
        <div style={{padding:'12px',borderRadius:8,background:'#c8dce5',marginTop:12}}>
          <div style={{color:'#003f87',fontSize:10,fontWeight:700,marginBottom:8}}>+ AJOUTER UN MEMBRE</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 70px 1fr 70px',gap:8,marginBottom:8}}>
            <div>
              <div style={{color:'#64748b',fontSize:9,marginBottom:2}}>Nom</div>
              <input value={newForm.name} onChange={e=>setNewForm({...newForm,name:e.target.value})} placeholder="Prénom" style={inp}/>
            </div>
            <div>
              <div style={{color:'#64748b',fontSize:9,marginBottom:2}}>Initiales</div>
              <input value={newForm.initials} onChange={e=>setNewForm({...newForm,initials:e.target.value})} placeholder="Ab" style={inp} maxLength={3}/>
            </div>
            <div>
              <div style={{color:'#64748b',fontSize:9,marginBottom:2}}>Poste</div>
              <input value={newForm.role} onChange={e=>setNewForm({...newForm,role:e.target.value})} placeholder="Équipier" style={inp}/>
            </div>
            <div>
              <div style={{color:'#64748b',fontSize:9,marginBottom:2}}>Heures</div>
              <input type="number" value={newForm.contract_hours} onChange={e=>setNewForm({...newForm,contract_hours:+e.target.value})} style={inp}/>
            </div>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:8}}>
            <span style={{color:'#64748b',fontSize:9}}>Couleur</span>
            {COLORS.map(c=>(
              <div key={c} onClick={()=>setNewForm({...newForm,color:c})} style={{
                width:18,height:18,borderRadius:4,background:c,cursor:'pointer',
                border:newForm.color===c?'2px solid #1e293b':'2px solid transparent',
              }}/>
            ))}
          </div>
          <button onClick={handleAdd} disabled={saving || !newForm.name.trim()} style={{
            padding:'8px 20px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:'inherit',
            background: newForm.name.trim() ? '#003f87' : '#94a3b8',
            color:'#fff',fontWeight:700,fontSize:12,
          }}>+ Ajouter à l'équipe {activeTeam==='resto'?'Restaurant':'FT/Labo'}</button>
        </div>
      </div>

      {/* Disponibilités grid */}
      <div style={{...card, padding:'16px'}}>
        <div style={{color:'#003f87',fontSize:11,fontWeight:700,letterSpacing:.5,marginBottom:12}}>
          DISPONIBILITÉS GÉNÉRALES
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',width:'100%'}}>
            <thead>
              <tr>
                <th style={{padding:'6px 10px',textAlign:'left',color:'#003f87',fontSize:10,fontWeight:700,fontFamily:'inherit'}}>Employé</th>
                {DAYS.map(d=>(
                  <th key={d} style={{padding:'6px 8px',textAlign:'center',color:'#003f87',fontSize:10,fontWeight:700,fontFamily:'inherit',minWidth:50}}>{d.slice(0,3)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamEmployees.filter(e=>e.is_active).map(emp=>(
                <tr key={emp.id} style={{borderTop:'1px solid #c8dce5'}}>
                  <td style={{padding:'6px 10px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:20,height:20,borderRadius:5,background:emp.color+'20',border:`1.5px solid ${emp.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:800,color:emp.color}}>{emp.initials}</div>
                      <span style={{fontSize:12,fontWeight:600,color:'#1e293b'}}>{emp.name}</span>
                    </div>
                  </td>
                  {DAYS.map(day=>{
                    const avail = getDispo(emp, day);
                    return (
                      <td key={day} style={{padding:'4px',textAlign:'center'}}>
                        <button onClick={()=>handleToggleDispo(emp, day)} style={{
                          width:32,height:28,borderRadius:6,border:'none',cursor:'pointer',
                          fontSize:14,
                          background: avail ? '#dcfce7' : '#fef2f2',
                          color: avail ? '#16a34a' : '#dc2626',
                        }}>
                          {avail ? '✓' : '✕'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{color:'#64748b',fontSize:10,marginTop:8}}>
          Cliquez sur une case pour basculer la disponibilité. <span style={{color:'#16a34a'}}>✓ Disponible</span> · <span style={{color:'#dc2626'}}>✕ Indisponible</span>
        </div>
      </div>
    </div>
  );
}
