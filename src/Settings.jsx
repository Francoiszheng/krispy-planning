import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ─── CONSTANTES ──────────────────────────────────────────────
const JOURS = [
  { code: 'lun', label: 'Lun' },
  { code: 'mar', label: 'Mar' },
  { code: 'mer', label: 'Mer' },
  { code: 'jeu', label: 'Jeu' },
  { code: 'ven', label: 'Ven' },
  { code: 'sam', label: 'Sam' },
  { code: 'dim', label: 'Dim' },
];

const TYPES_ETABLISSEMENT = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'foodtruck', label: 'Food Truck' },
  { value: 'lab', label: 'Labo de production' },
  { value: 'autre', label: 'Autre' },
];

const STATUTS_EMPLOYE = ['Salarié', 'Associé', 'Gérant'];

const B = {
  bleusto: '#b8d5e0',
  bluck: '#003f87',
  gochu: '#ed1548',
  corail: '#f26f63',
  white: '#fff9f3',
  black: '#000000',
  bleustoLight: '#ddedf3',
  bleustoDark: '#9cc5d4',
};

// ─── STYLES ──────────────────────────────────────────────────
const S = {
  page: {
    fontFamily: "'Montserrat', Arial, sans-serif",
    color: B.black,
    minHeight: '100%',
  },
  subTabs: {
    display: 'flex',
    gap: '4px',
    borderBottom: `2px solid ${B.bluck}`,
    marginBottom: '24px',
    overflowX: 'auto',
  },
  subTab: (active) => ({
    padding: '10px 18px',
    fontSize: '14px',
    fontWeight: active ? '700' : '500',
    color: active ? B.white : B.bluck,
    backgroundColor: active ? B.bluck : 'transparent',
    border: 'none',
    borderRadius: '8px 8px 0 0',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  }),
  card: {
    backgroundColor: B.white,
    borderRadius: '10px',
    padding: '16px',
    marginBottom: '12px',
    border: `1px solid ${B.bleusto}`,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: B.bluck,
    margin: 0,
  },
  badge: (color = B.bleusto) => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: color,
    color: color === B.bleusto ? B.bluck : B.white,
    marginRight: '6px',
    marginBottom: '4px',
  }),
  btnPrimary: {
    padding: '10px 20px',
    backgroundColor: B.gochu,
    color: B.white,
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  btnSecondary: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: B.bluck,
    border: `1px solid ${B.bluck}`,
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    color: B.gochu,
    border: `1px solid ${B.gochu}`,
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  btnSmall: {
    padding: '4px 10px',
    fontSize: '12px',
    borderRadius: '6px',
    cursor: 'pointer',
    border: 'none',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${B.bleustoDark}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: "'Montserrat', Arial, sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${B.bleustoDark}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: "'Montserrat', Arial, sans-serif",
    outline: 'none',
    backgroundColor: B.white,
    boxSizing: 'border-box',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: B.bluck,
    marginBottom: '4px',
  },
  field: {
    marginBottom: '14px',
  },
  row: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
    color: B.bleustoDark,
    fontSize: '14px',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: B.white,
    borderRadius: '14px',
    padding: '24px',
    width: '90%',
    maxWidth: '540px',
    maxHeight: '85vh',
    overflowY: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: B.bluck,
    marginBottom: '20px',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: B.bluck,
    marginBottom: '10px',
    marginTop: '16px',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  chip: (selected) => ({
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    border: `2px solid ${selected ? B.bluck : B.bleustoDark}`,
    backgroundColor: selected ? B.bleusto : 'transparent',
    color: B.bluck,
    cursor: 'pointer',
    transition: 'all 0.15s',
  }),
  infoText: {
    fontSize: '12px',
    color: '#888',
    marginTop: '4px',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 10px',
    borderRadius: '14px',
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: B.bleustoLight,
    color: B.bluck,
    marginRight: '4px',
    marginBottom: '4px',
  },
};

// ─── COMPOSANTS UTILITAIRES ──────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={S.modalTitle}>{title}</h3>
          <button onClick={onClose} style={{ ...S.btnSmall, color: B.bluck, backgroundColor: B.bleustoLight }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function JoursPicker({ value = [], onChange }) {
  const toggle = (code) => {
    onChange(value.includes(code) ? value.filter((j) => j !== code) : [...value, code]);
  };
  return (
    <div style={S.chipRow}>
      {JOURS.map((j) => (
        <button key={j.code} type="button" style={S.chip(value.includes(j.code))} onClick={() => toggle(j.code)}>
          {j.label}
        </button>
      ))}
    </div>
  );
}

function CapacitesPicker({ allCapacites, selected = [], onChange }) {
  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]);
  };
  if (!allCapacites.length) return <p style={S.infoText}>Aucune capacité créée</p>;
  return (
    <div style={S.chipRow}>
      {allCapacites.map((c) => (
        <button key={c.id} type="button" style={S.chip(selected.includes(c.id))} onClick={() => toggle(c.id)}>
          {c.icone} {c.nom}
        </button>
      ))}
    </div>
  );
}

function ConfirmDelete({ message, onConfirm, onCancel }) {
  return (
    <Modal title="Confirmer la suppression" onClose={onCancel}>
      <p style={{ marginBottom: '20px', fontSize: '14px' }}>{message}</p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button style={S.btnSecondary} onClick={onCancel}>Annuler</button>
        <button style={{ ...S.btnPrimary, backgroundColor: B.gochu }} onClick={onConfirm}>Supprimer</button>
      </div>
    </Modal>
  );
}

// ─── TAB 1 : ÉTABLISSEMENTS ──────────────────────────────────

function TabEtablissements() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | object
  const [deleting, setDeleting] = useState(null);

  const fetch_ = useCallback(async () => {
    const { data } = await supabase.from('etablissements').select('*').order('sort_order');
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const save = async (form) => {
    if (form.id) {
      await supabase.from('etablissements').update({
        nom: form.nom, type: form.type, horaires_ouverture: form.horaires_ouverture,
        alternance_ab: form.alternance_ab, notes: form.notes, updated_at: new Date().toISOString(),
      }).eq('id', form.id);
    } else {
      await supabase.from('etablissements').insert({
        nom: form.nom, type: form.type, horaires_ouverture: form.horaires_ouverture,
        alternance_ab: form.alternance_ab, notes: form.notes, sort_order: items.length,
      });
    }
    setEditing(null);
    fetch_();
  };

  const remove = async () => {
    if (deleting) {
      await supabase.from('etablissements').delete().eq('id', deleting.id);
      setDeleting(null);
      fetch_();
    }
  };

  if (loading) return <p style={S.emptyState}>Chargement…</p>;

  return (
    <div>
      <div style={S.topBar}>
        <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>{items.length} établissement{items.length > 1 ? 's' : ''}</p>
        <button style={S.btnPrimary} onClick={() => setEditing('new')}>+ Ajouter</button>
      </div>

      {!items.length && <p style={S.emptyState}>Aucun établissement configuré. Commencez par en créer un.</p>}

      {items.map((et) => (
        <div key={et.id} style={S.card}>
          <div style={S.cardHeader}>
            <h4 style={S.cardTitle}>{et.nom}</h4>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button style={S.btnSecondary} onClick={() => setEditing(et)}>Modifier</button>
              <button style={S.btnDanger} onClick={() => setDeleting(et)}>Suppr.</button>
            </div>
          </div>
          <div>
            <span style={S.badge()}>{TYPES_ETABLISSEMENT.find((t) => t.value === et.type)?.label || et.type}</span>
            {et.alternance_ab && <span style={S.badge(B.corail)}>A/B</span>}
          </div>
          {et.horaires_ouverture && Object.keys(et.horaires_ouverture).length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              {JOURS.map((j) => {
                const h = et.horaires_ouverture[j.code];
                return h ? (
                  <span key={j.code} style={{ marginRight: '10px' }}>
                    <strong>{j.label}</strong> {h.ouverture}–{h.fermeture}
                  </span>
                ) : null;
              })}
            </div>
          )}
          {et.notes && <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>{et.notes}</p>}
        </div>
      ))}

      {editing && (
        <EtablissementForm
          initial={editing === 'new' ? null : editing}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDelete
          message={`Supprimer « ${deleting.nom} » ? Les services et slots associés seront aussi supprimés.`}
          onConfirm={remove}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function EtablissementForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    nom: initial?.nom || '',
    type: initial?.type || 'restaurant',
    horaires_ouverture: initial?.horaires_ouverture || {},
    alternance_ab: initial?.alternance_ab || false,
    notes: initial?.notes || '',
  });

  const setH = (jourCode, field, val) => {
    const h = { ...form.horaires_ouverture };
    if (!h[jourCode]) h[jourCode] = { ouverture: '12:00', fermeture: '22:00' };
    h[jourCode][field] = val;
    setForm({ ...form, horaires_ouverture: h });
  };

  const toggleJour = (jourCode) => {
    const h = { ...form.horaires_ouverture };
    if (h[jourCode]) {
      delete h[jourCode];
    } else {
      h[jourCode] = { ouverture: '12:00', fermeture: '22:00' };
    }
    setForm({ ...form, horaires_ouverture: h });
  };

  return (
    <Modal title={initial ? 'Modifier l\'établissement' : 'Nouvel établissement'} onClose={onClose}>
      <div style={S.field}>
        <label style={S.label}>Nom</label>
        <input style={S.input} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex: Restaurant Biot" />
      </div>
      <div style={S.field}>
        <label style={S.label}>Type</label>
        <select style={S.select} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {TYPES_ETABLISSEMENT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div style={S.field}>
        <label style={S.label}>Jours d'ouverture</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
          {JOURS.map((j) => {
            const isOpen = !!form.horaires_ouverture[j.code];
            return (
              <div key={j.code} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button type="button" style={S.chip(isOpen)} onClick={() => toggleJour(j.code)}>
                  {j.label}
                </button>
                {isOpen && (
                  <>
                    <input type="time" style={{ ...S.input, width: '120px', padding: '6px 8px' }}
                      value={form.horaires_ouverture[j.code]?.ouverture || '12:00'}
                      onChange={(e) => setH(j.code, 'ouverture', e.target.value)} />
                    <span style={{ color: '#999' }}>→</span>
                    <input type="time" style={{ ...S.input, width: '120px', padding: '6px 8px' }}
                      value={form.horaires_ouverture[j.code]?.fermeture || '22:00'}
                      onChange={(e) => setH(j.code, 'fermeture', e.target.value)} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={S.field}>
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={form.alternance_ab}
            onChange={(e) => setForm({ ...form, alternance_ab: e.target.checked })} />
          Alternance Semaine A / Semaine B
        </label>
      </div>
      <div style={S.field}>
        <label style={S.label}>Notes</label>
        <textarea style={{ ...S.input, minHeight: '60px', resize: 'vertical' }}
          value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button style={S.btnSecondary} onClick={onClose}>Annuler</button>
        <button style={S.btnPrimary} disabled={!form.nom.trim()} onClick={() => onSave(form)}>
          {initial ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </Modal>
  );
}

// ─── TAB 2 : CAPACITÉS ───────────────────────────────────────

function TabCapacites() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const fetch_ = useCallback(async () => {
    const { data } = await supabase.from('capacites').select('*').order('sort_order');
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const save = async (form) => {
    if (form.id) {
      await supabase.from('capacites').update({
        nom: form.nom, description: form.description, icone: form.icone,
        types_etablissement: form.types_etablissement?.length ? form.types_etablissement : null,
      }).eq('id', form.id);
    } else {
      await supabase.from('capacites').insert({
        nom: form.nom, description: form.description, icone: form.icone,
        types_etablissement: form.types_etablissement?.length ? form.types_etablissement : null,
        sort_order: items.length,
      });
    }
    setEditing(null);
    fetch_();
  };

  const remove = async () => {
    if (deleting) {
      await supabase.from('capacites').delete().eq('id', deleting.id);
      setDeleting(null);
      fetch_();
    }
  };

  if (loading) return <p style={S.emptyState}>Chargement…</p>;

  return (
    <div>
      <div style={S.topBar}>
        <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>{items.length} capacité{items.length > 1 ? 's' : ''}</p>
        <button style={S.btnPrimary} onClick={() => setEditing('new')}>+ Ajouter</button>
      </div>

      {!items.length && <p style={S.emptyState}>Aucune capacité. Exécutez le schéma SQL pour charger les capacités standard.</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {items.map((cap) => (
          <div key={cap.id} style={{ ...S.card, flex: '1 1 240px', maxWidth: '320px' }}>
            <div style={S.cardHeader}>
              <h4 style={{ ...S.cardTitle, fontSize: '15px' }}>
                {cap.icone} {cap.nom}
              </h4>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button style={{ ...S.btnSmall, color: B.bluck, backgroundColor: B.bleustoLight }} onClick={() => setEditing(cap)}>✎</button>
                {!cap.is_standard && (
                  <button style={{ ...S.btnSmall, color: B.gochu, backgroundColor: '#fee' }} onClick={() => setDeleting(cap)}>✕</button>
                )}
              </div>
            </div>
            {cap.description && <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0' }}>{cap.description}</p>}
            {cap.types_etablissement && (
              <div style={{ marginTop: '6px' }}>
                {cap.types_etablissement.map((t) => (
                  <span key={t} style={S.badge(B.bleustoLight)}>{t}</span>
                ))}
              </div>
            )}
            {cap.is_standard && <span style={{ ...S.badge(B.bleusto), marginTop: '6px' }}>Standard</span>}
          </div>
        ))}
      </div>

      {editing && (
        <CapaciteForm initial={editing === 'new' ? null : editing} onSave={save} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <ConfirmDelete
          message={`Supprimer la capacité « ${deleting.nom} » ? Elle sera retirée de tous les employés.`}
          onConfirm={remove} onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function CapaciteForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    nom: initial?.nom || '',
    description: initial?.description || '',
    icone: initial?.icone || '🏷️',
    types_etablissement: initial?.types_etablissement || [],
  });

  const EMOJIS = ['👑', '🔑', '🔒', '🚛', '🍳', '☕', '🎂', '🔥', '⭐', '🏷️', '🛠️', '📋'];

  return (
    <Modal title={initial ? 'Modifier la capacité' : 'Nouvelle capacité'} onClose={onClose}>
      <div style={S.field}>
        <label style={S.label}>Icône</label>
        <div style={S.chipRow}>
          {EMOJIS.map((e) => (
            <button key={e} type="button"
              style={{ ...S.chip(form.icone === e), fontSize: '18px', padding: '6px 10px' }}
              onClick={() => setForm({ ...form, icone: e })}>{e}</button>
          ))}
        </div>
      </div>
      <div style={S.field}>
        <label style={S.label}>Nom</label>
        <input style={S.input} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex: Barista" />
      </div>
      <div style={S.field}>
        <label style={S.label}>Description</label>
        <input style={S.input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optionnel" />
      </div>
      <div style={S.field}>
        <label style={S.label}>Visible pour quels types d'établissement ?</label>
        <p style={S.infoText}>Laissez vide pour afficher partout</p>
        <div style={{ ...S.chipRow, marginTop: '6px' }}>
          {TYPES_ETABLISSEMENT.map((t) => (
            <button key={t.value} type="button"
              style={S.chip(form.types_etablissement.includes(t.value))}
              onClick={() => {
                const arr = form.types_etablissement.includes(t.value)
                  ? form.types_etablissement.filter((x) => x !== t.value)
                  : [...form.types_etablissement, t.value];
                setForm({ ...form, types_etablissement: arr });
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button style={S.btnSecondary} onClick={onClose}>Annuler</button>
        <button style={S.btnPrimary} disabled={!form.nom.trim()} onClick={() => onSave(form)}>
          {initial ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </Modal>
  );
}

// ─── TAB 3 : SERVICES & SLOTS ────────────────────────────────

function TabServices() {
  const [etablissements, setEtablissements] = useState([]);
  const [services, setServices] = useState([]);
  const [capacites, setCapacites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingService, setEditingService] = useState(null);
  const [editingSlot, setEditingSlot] = useState(null); // { serviceId, slot }
  const [deletingService, setDeletingService] = useState(null);
  const [deletingSlot, setDeletingSlot] = useState(null);
  const [expandedService, setExpandedService] = useState(null);

  const fetch_ = useCallback(async () => {
    const [etRes, srvRes, capRes] = await Promise.all([
      supabase.from('etablissements').select('*').order('sort_order'),
      supabase.from('services').select('*, slots(*)').order('sort_order'),
      supabase.from('capacites').select('*').order('sort_order'),
    ]);
    setEtablissements(etRes.data || []);
    setServices((srvRes.data || []).map((s) => ({
      ...s,
      slots: (s.slots || []).sort((a, b) => a.sort_order - b.sort_order),
    })));
    setCapacites(capRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const saveService = async (form) => {
    const payload = {
      etablissement_id: form.etablissement_id,
      nom: form.nom, jours: form.jours,
      heure_debut: form.heure_debut, heure_fin: form.heure_fin,
      effectif_min: form.effectif_min,
      capacites_requises: form.capacites_requises || [],
      notes: form.notes, updated_at: new Date().toISOString(),
    };
    if (form.id) {
      await supabase.from('services').update(payload).eq('id', form.id);
    } else {
      await supabase.from('services').insert({ ...payload, sort_order: services.length });
    }
    setEditingService(null);
    fetch_();
  };

  const removeService = async () => {
    if (deletingService) {
      await supabase.from('services').delete().eq('id', deletingService.id);
      setDeletingService(null);
      fetch_();
    }
  };

  const saveSlot = async (form) => {
    const payload = {
      service_id: form.service_id,
      nom: form.nom, nb_personnes: form.nb_personnes,
      heure_debut: form.heure_debut, heure_fin: form.heure_fin,
      capacites_requises: form.capacites_requises || [],
      est_optionnel: form.est_optionnel, notes: form.notes,
    };
    if (form.id) {
      await supabase.from('slots').update(payload).eq('id', form.id);
    } else {
      const slotsCount = services.find((s) => s.id === form.service_id)?.slots?.length || 0;
      await supabase.from('slots').insert({ ...payload, sort_order: slotsCount });
    }
    setEditingSlot(null);
    fetch_();
  };

  const removeSlot = async () => {
    if (deletingSlot) {
      await supabase.from('slots').delete().eq('id', deletingSlot.id);
      setDeletingSlot(null);
      fetch_();
    }
  };

  if (loading) return <p style={S.emptyState}>Chargement…</p>;
  if (!etablissements.length) return <p style={S.emptyState}>Créez d'abord un établissement dans l'onglet « Établissement ».</p>;

  const grouped = etablissements.map((et) => ({
    ...et,
    services: services.filter((s) => s.etablissement_id === et.id),
  }));

  return (
    <div>
      <div style={S.topBar}>
        <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>{services.length} service{services.length > 1 ? 's' : ''}</p>
        <button style={S.btnPrimary} onClick={() => setEditingService('new')}>+ Ajouter un service</button>
      </div>

      {grouped.map((et) => (
        <div key={et.id} style={{ marginBottom: '24px' }}>
          <h3 style={{ ...S.sectionTitle, fontSize: '16px', marginTop: 0 }}>{et.nom}</h3>

          {!et.services.length && (
            <p style={{ ...S.emptyState, padding: '20px', textAlign: 'left' }}>Aucun service pour cet établissement.</p>
          )}

          {et.services.map((srv) => {
            const isExpanded = expandedService === srv.id;
            return (
              <div key={srv.id} style={{ ...S.card, borderLeft: `4px solid ${B.bluck}` }}>
                <div style={{ ...S.cardHeader, cursor: 'pointer' }} onClick={() => setExpandedService(isExpanded ? null : srv.id)}>
                  <div>
                    <h4 style={{ ...S.cardTitle, fontSize: '14px', margin: 0 }}>
                      {isExpanded ? '▼' : '▶'} {srv.nom}
                    </h4>
                    <div style={{ marginTop: '4px' }}>
                      {srv.jours.map((j) => (
                        <span key={j} style={{ ...S.badge(B.bleustoLight), fontSize: '11px' }}>
                          {JOURS.find((d) => d.code === j)?.label || j}
                        </span>
                      ))}
                      <span style={{ fontSize: '12px', color: '#666', marginLeft: '8px' }}>
                        {srv.heure_debut}→{srv.heure_fin} · min {srv.effectif_min} pers.
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                    <button style={S.btnSecondary} onClick={() => setEditingService(srv)}>Modifier</button>
                    <button style={S.btnDanger} onClick={() => setDeletingService(srv)}>Suppr.</button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${B.bleusto}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: B.bluck }}>
                        Slots ({srv.slots.length})
                      </span>
                      <button style={{ ...S.btnSmall, backgroundColor: B.bleusto, color: B.bluck }}
                        onClick={() => setEditingSlot({ serviceId: srv.id, slot: null })}>
                        + Slot
                      </button>
                    </div>

                    {!srv.slots.length && (
                      <p style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                        Aucun slot — le moteur utilisera l'effectif min du service.
                      </p>
                    )}

                    {srv.slots.map((slot) => (
                      <div key={slot.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', marginBottom: '4px', borderRadius: '6px',
                        backgroundColor: slot.est_optionnel ? '#fafafa' : B.bleustoLight,
                      }}>
                        <div>
                          <span style={{ fontWeight: '600', fontSize: '13px' }}>{slot.nom}</span>
                          <span style={{ fontSize: '12px', color: '#666', marginLeft: '8px' }}>
                            {slot.heure_debut}→{slot.heure_fin} · {slot.nb_personnes} pers.
                          </span>
                          {slot.est_optionnel && <span style={{ ...S.badge(B.corail), fontSize: '10px', marginLeft: '6px' }}>optionnel</span>}
                          {(slot.capacites_requises || []).map((cid) => {
                            const cap = capacites.find((c) => c.id === cid);
                            return cap ? <span key={cid} style={S.tag}>{cap.icone} {cap.nom}</span> : null;
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button style={{ ...S.btnSmall, color: B.bluck, backgroundColor: B.white }}
                            onClick={() => setEditingSlot({ serviceId: srv.id, slot })}>✎</button>
                          <button style={{ ...S.btnSmall, color: B.gochu, backgroundColor: '#fee' }}
                            onClick={() => setDeletingSlot(slot)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {editingService && (
        <ServiceForm
          initial={editingService === 'new' ? null : editingService}
          etablissements={etablissements}
          capacites={capacites}
          onSave={saveService}
          onClose={() => setEditingService(null)}
        />
      )}
      {editingSlot && (
        <SlotForm
          initial={editingSlot.slot}
          serviceId={editingSlot.serviceId}
          capacites={capacites}
          onSave={saveSlot}
          onClose={() => setEditingSlot(null)}
        />
      )}
      {deletingService && (
        <ConfirmDelete message={`Supprimer « ${deletingService.nom} » et tous ses slots ?`}
          onConfirm={removeService} onCancel={() => setDeletingService(null)} />
      )}
      {deletingSlot && (
        <ConfirmDelete message={`Supprimer le slot « ${deletingSlot.nom} » ?`}
          onConfirm={removeSlot} onCancel={() => setDeletingSlot(null)} />
      )}
    </div>
  );
}

function ServiceForm({ initial, etablissements, capacites, onSave, onClose }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    etablissement_id: initial?.etablissement_id || etablissements[0]?.id || '',
    nom: initial?.nom || '',
    jours: initial?.jours || ['mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
    heure_debut: initial?.heure_debut || '09:00',
    heure_fin: initial?.heure_fin || '14:30',
    effectif_min: initial?.effectif_min || 2,
    capacites_requises: initial?.capacites_requises || [],
    notes: initial?.notes || '',
  });

  return (
    <Modal title={initial ? 'Modifier le service' : 'Nouveau service'} onClose={onClose}>
      <div style={S.field}>
        <label style={S.label}>Établissement</label>
        <select style={S.select} value={form.etablissement_id}
          onChange={(e) => setForm({ ...form, etablissement_id: e.target.value })}>
          {etablissements.map((et) => <option key={et.id} value={et.id}>{et.nom}</option>)}
        </select>
      </div>
      <div style={S.field}>
        <label style={S.label}>Nom du service</label>
        <input style={S.input} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })}
          placeholder="Ex: Midi, Soir, FT Défense…" />
      </div>
      <div style={S.field}>
        <label style={S.label}>Jours</label>
        <JoursPicker value={form.jours} onChange={(jours) => setForm({ ...form, jours })} />
      </div>
      <div style={S.row}>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Heure début</label>
          <input type="time" style={S.input} value={form.heure_debut}
            onChange={(e) => setForm({ ...form, heure_debut: e.target.value })} />
        </div>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Heure fin</label>
          <input type="time" style={S.input} value={form.heure_fin}
            onChange={(e) => setForm({ ...form, heure_fin: e.target.value })} />
        </div>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Effectif min</label>
          <input type="number" min={1} style={S.input} value={form.effectif_min}
            onChange={(e) => setForm({ ...form, effectif_min: parseInt(e.target.value) || 1 })} />
        </div>
      </div>
      <div style={S.field}>
        <label style={S.label}>Capacités requises sur ce service</label>
        <p style={S.infoText}>Au moins 1 personne avec cette capacité doit être présente</p>
        <CapacitesPicker allCapacites={capacites} selected={form.capacites_requises}
          onChange={(c) => setForm({ ...form, capacites_requises: c })} />
      </div>
      <div style={S.field}>
        <label style={S.label}>Notes</label>
        <textarea style={{ ...S.input, minHeight: '50px', resize: 'vertical' }}
          value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button style={S.btnSecondary} onClick={onClose}>Annuler</button>
        <button style={S.btnPrimary} disabled={!form.nom.trim() || !form.etablissement_id}
          onClick={() => onSave(form)}>
          {initial ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </Modal>
  );
}

function SlotForm({ initial, serviceId, capacites, onSave, onClose }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    service_id: serviceId,
    nom: initial?.nom || '',
    nb_personnes: initial?.nb_personnes || 1,
    heure_debut: initial?.heure_debut || '09:00',
    heure_fin: initial?.heure_fin || '14:30',
    capacites_requises: initial?.capacites_requises || [],
    est_optionnel: initial?.est_optionnel || false,
    notes: initial?.notes || '',
  });

  return (
    <Modal title={initial ? 'Modifier le slot' : 'Nouveau slot'} onClose={onClose}>
      <div style={S.field}>
        <label style={S.label}>Nom du slot</label>
        <input style={S.input} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })}
          placeholder="Ex: Mise en place, Renfort service, Journée complète…" />
      </div>
      <div style={S.row}>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Nb personnes</label>
          <input type="number" min={1} style={S.input} value={form.nb_personnes}
            onChange={(e) => setForm({ ...form, nb_personnes: parseInt(e.target.value) || 1 })} />
        </div>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Début</label>
          <input type="time" style={S.input} value={form.heure_debut}
            onChange={(e) => setForm({ ...form, heure_debut: e.target.value })} />
        </div>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Fin</label>
          <input type="time" style={S.input} value={form.heure_fin}
            onChange={(e) => setForm({ ...form, heure_fin: e.target.value })} />
        </div>
      </div>
      <div style={S.field}>
        <label style={S.label}>Capacités requises pour ce slot</label>
        <CapacitesPicker allCapacites={capacites} selected={form.capacites_requises}
          onChange={(c) => setForm({ ...form, capacites_requises: c })} />
      </div>
      <div style={S.field}>
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={form.est_optionnel}
            onChange={(e) => setForm({ ...form, est_optionnel: e.target.checked })} />
          Slot optionnel (rempli seulement si assez de personnel)
        </label>
      </div>
      <div style={S.field}>
        <label style={S.label}>Notes</label>
        <textarea style={{ ...S.input, minHeight: '50px', resize: 'vertical' }}
          value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button style={S.btnSecondary} onClick={onClose}>Annuler</button>
        <button style={S.btnPrimary} disabled={!form.nom.trim()} onClick={() => onSave(form)}>
          {initial ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </Modal>
  );
}

// ─── TAB 4 : ÉQUIPE ──────────────────────────────────────────

function TabEquipe() {
  const [employees, setEmployees] = useState([]);
  const [etablissements, setEtablissements] = useState([]);
  const [capacites, setCapacites] = useState([]);
  const [empCapacites, setEmpCapacites] = useState([]); // employee_capacites rows
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showDispos, setShowDispos] = useState(null); // employee id

  const fetch_ = useCallback(async () => {
    const [empRes, etRes, capRes, ecRes] = await Promise.all([
      supabase.from('employees').select('*').order('sort_order'),
      supabase.from('etablissements').select('*').order('sort_order'),
      supabase.from('capacites').select('*').order('sort_order'),
      supabase.from('employee_capacites').select('*'),
    ]);
    setEmployees(empRes.data || []);
    setEtablissements(etRes.data || []);
    setCapacites(capRes.data || []);
    setEmpCapacites(ecRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const getEmpCaps = (empId) => {
    const capIds = empCapacites.filter((ec) => ec.employee_id === empId).map((ec) => ec.capacite_id);
    return capacites.filter((c) => capIds.includes(c.id));
  };

  const save = async (form, selectedCapIds) => {
    const payload = {
      name: form.name, initials: form.initials, role: form.role,
      team: form.team, color: form.color, contract_hours: form.contract_hours,
      is_active: form.is_active, is_meeting_only: form.is_meeting_only,
      statut: form.statut, etablissement_id: form.etablissement_id || null,
    };
    let empId = form.id;
    if (form.id) {
      await supabase.from('employees').update(payload).eq('id', form.id);
    } else {
      const { data } = await supabase.from('employees').insert({
        ...payload, slug: form.name.toLowerCase().replace(/\s+/g, '-'),
        sort_order: employees.length,
      }).select('id').single();
      empId = data?.id;
    }

    // Sync capacités
    if (empId) {
      await supabase.from('employee_capacites').delete().eq('employee_id', empId);
      if (selectedCapIds.length) {
        await supabase.from('employee_capacites').insert(
          selectedCapIds.map((cid) => ({ employee_id: empId, capacite_id: cid }))
        );
      }
    }

    setEditing(null);
    fetch_();
  };

  const remove = async () => {
    if (deleting) {
      await supabase.from('employees').delete().eq('id', deleting.id);
      setDeleting(null);
      fetch_();
    }
  };

  if (loading) return <p style={S.emptyState}>Chargement…</p>;

  return (
    <div>
      <div style={S.topBar}>
        <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>
          {employees.filter((e) => e.is_active).length} actif{employees.filter((e) => e.is_active).length > 1 ? 's' : ''} / {employees.length} total
        </p>
        <button style={S.btnPrimary} onClick={() => setEditing('new')}>+ Ajouter</button>
      </div>

      {employees.map((emp) => {
        const caps = getEmpCaps(emp.id);
        const etab = etablissements.find((e) => e.id === emp.etablissement_id);
        return (
          <div key={emp.id} style={{
            ...S.card,
            opacity: emp.is_active ? 1 : 0.5,
            borderLeft: `4px solid ${emp.color || B.bleusto}`,
          }}>
            <div style={S.cardHeader}>
              <div>
                <h4 style={{ ...S.cardTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '30px', height: '30px', borderRadius: '50%',
                    backgroundColor: emp.color || B.bleusto, color: B.white,
                    fontSize: '12px', fontWeight: '700',
                  }}>{emp.initials || '?'}</span>
                  {emp.name}
                  {emp.is_meeting_only && <span style={S.badge(B.corail)}>Réunions seul.</span>}
                  {!emp.is_active && <span style={S.badge('#ccc')}>Inactif</span>}
                </h4>
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                  {emp.role && <span style={{ marginRight: '12px' }}>{emp.role}</span>}
                  <span style={{ marginRight: '12px' }}>{emp.contract_hours || '?'}h</span>
                  <span style={S.badge()}>{emp.statut || 'Salarié'}</span>
                  {etab && <span style={S.badge(B.bleustoLight)}>{etab.nom}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button style={S.btnSecondary} onClick={() => setShowDispos(showDispos === emp.id ? null : emp.id)}>Dispos</button>
                <button style={S.btnSecondary} onClick={() => setEditing(emp)}>Modifier</button>
                <button style={S.btnDanger} onClick={() => setDeleting(emp)}>Suppr.</button>
              </div>
            </div>
            {caps.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                {caps.map((c) => <span key={c.id} style={S.tag}>{c.icone} {c.nom}</span>)}
              </div>
            )}
            {showDispos === emp.id && <DispoGrid employeeId={emp.id} />}
          </div>
        );
      })}

      {editing && (
        <EmployeeForm
          initial={editing === 'new' ? null : editing}
          etablissements={etablissements}
          capacites={capacites}
          initialCapIds={editing !== 'new' ? empCapacites.filter((ec) => ec.employee_id === editing.id).map((ec) => ec.capacite_id) : []}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDelete message={`Supprimer « ${deleting.name} » ? Cette action est irréversible.`}
          onConfirm={remove} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}

function EmployeeForm({ initial, etablissements, capacites, initialCapIds, onSave, onClose }) {
  const COLORS = ['#b8d5e0', '#003f87', '#ed1548', '#f26f63', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22', '#95a5a6'];
  const [form, setForm] = useState({
    id: initial?.id || null,
    name: initial?.name || '',
    initials: initial?.initials || '',
    role: initial?.role || '',
    team: initial?.team || '',
    color: initial?.color || COLORS[0],
    contract_hours: initial?.contract_hours || 39,
    is_active: initial?.is_active ?? true,
    is_meeting_only: initial?.is_meeting_only || false,
    statut: initial?.statut || 'Salarié',
    etablissement_id: initial?.etablissement_id || '',
  });
  const [capIds, setCapIds] = useState(initialCapIds);

  return (
    <Modal title={initial ? `Modifier ${initial.name}` : 'Nouvel employé'} onClose={onClose}>
      <div style={S.row}>
        <div style={{ ...S.field, flex: 2 }}>
          <label style={S.label}>Nom</label>
          <input style={S.input} value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              const auto = name.split(' ').map((w) => w[0] || '').join('').toUpperCase().slice(0, 3);
              setForm({ ...form, name, initials: form.id ? form.initials : auto });
            }} />
        </div>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Initiales</label>
          <input style={S.input} value={form.initials} maxLength={3}
            onChange={(e) => setForm({ ...form, initials: e.target.value.toUpperCase() })} />
        </div>
      </div>
      <div style={S.row}>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Rôle</label>
          <input style={S.input} value={form.role} placeholder="Ex: Manager, Équipier…"
            onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </div>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Statut</label>
          <select style={S.select} value={form.statut}
            onChange={(e) => setForm({ ...form, statut: e.target.value })}>
            {STATUTS_EMPLOYE.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div style={S.row}>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Heures contrat</label>
          <input type="number" min={0} max={48} style={S.input} value={form.contract_hours}
            onChange={(e) => setForm({ ...form, contract_hours: parseFloat(e.target.value) || 0 })} />
        </div>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Établissement principal</label>
          <select style={S.select} value={form.etablissement_id}
            onChange={(e) => setForm({ ...form, etablissement_id: e.target.value })}>
            <option value="">— Aucun —</option>
            {etablissements.map((et) => <option key={et.id} value={et.id}>{et.nom}</option>)}
          </select>
        </div>
      </div>
      <div style={S.field}>
        <label style={S.label}>Couleur</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {COLORS.map((c) => (
            <button key={c} type="button"
              style={{
                width: '32px', height: '32px', borderRadius: '50%', backgroundColor: c,
                border: form.color === c ? `3px solid ${B.black}` : '2px solid transparent',
                cursor: 'pointer',
              }}
              onClick={() => setForm({ ...form, color: c })} />
          ))}
        </div>
      </div>
      <div style={S.field}>
        <label style={S.label}>Capacités</label>
        <CapacitesPicker allCapacites={capacites} selected={capIds} onChange={setCapIds} />
      </div>
      <div style={{ ...S.field, display: 'flex', gap: '20px' }}>
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input type="checkbox" checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Actif
        </label>
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input type="checkbox" checked={form.is_meeting_only}
            onChange={(e) => setForm({ ...form, is_meeting_only: e.target.checked })} /> Réunions uniquement
        </label>
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button style={S.btnSecondary} onClick={onClose}>Annuler</button>
        <button style={S.btnPrimary} disabled={!form.name.trim()} onClick={() => onSave(form, capIds)}>
          {initial ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </Modal>
  );
}

function DispoGrid({ employeeId }) {
  const [dispos, setDispos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('disponibilites')
        .select('*').eq('employee_id', employeeId);
      setDispos(data || []);
      setLoading(false);
    })();
  }, [employeeId]);

  const toggle = async (dayCode) => {
    const existing = dispos.find((d) => d.day_of_week === dayCode);
    if (existing) {
      const newVal = !existing.is_available;
      await supabase.from('disponibilites').update({ is_available: newVal }).eq('id', existing.id);
      setDispos(dispos.map((d) => d.id === existing.id ? { ...d, is_available: newVal } : d));
    } else {
      const { data } = await supabase.from('disponibilites').insert({
        employee_id: employeeId, day_of_week: dayCode, is_available: false,
      }).select().single();
      if (data) setDispos([...dispos, data]);
    }
  };

  if (loading) return <p style={{ fontSize: '12px', color: '#999' }}>Chargement dispos…</p>;

  return (
    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px dashed ${B.bleusto}` }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {JOURS.map((j) => {
          const dispo = dispos.find((d) => d.day_of_week === j.code);
          const available = !dispo || dispo.is_available;
          return (
            <button key={j.code} type="button"
              style={{
                padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                border: `2px solid ${available ? '#2ecc71' : B.gochu}`,
                backgroundColor: available ? '#eafaf1' : '#fdeaea',
                color: available ? '#27ae60' : B.gochu,
                cursor: 'pointer',
              }}
              onClick={() => toggle(j.code)}>
              {j.label} {available ? '✓' : '✗'}
            </button>
          );
        })}
      </div>
      <p style={S.infoText}>Cliquez pour basculer disponible / indisponible</p>
    </div>
  );
}

// ─── COMPOSANT PRINCIPAL ─────────────────────────────────────

const SUB_TABS = [
  { id: 'etablissement', label: 'Établissement', icon: '🏪' },
  { id: 'capacites', label: 'Capacités', icon: '🏷️' },
  { id: 'services', label: 'Services & Slots', icon: '📅' },
  { id: 'equipe', label: 'Équipe', icon: '👥' },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('etablissement');

  return (
    <div style={S.page}>
      <nav style={S.subTabs}>
        {SUB_TABS.map((tab) => (
          <button key={tab.id} style={S.subTab(activeTab === tab.id)}
            onClick={() => setActiveTab(tab.id)}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'etablissement' && <TabEtablissements />}
      {activeTab === 'capacites' && <TabCapacites />}
      {activeTab === 'services' && <TabServices />}
      {activeTab === 'equipe' && <TabEquipe />}
    </div>
  );
}
