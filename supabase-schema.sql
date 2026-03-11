-- ══════════════════════════════════════════════════════
-- KRISPY PLANNING — Schema Supabase
-- ══════════════════════════════════════════════════════

-- Table des employés
CREATE TABLE employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Équipier',
  team TEXT NOT NULL CHECK (team IN ('resto', 'ft')),
  color TEXT NOT NULL DEFAULT '#003f87',
  contract_hours NUMERIC NOT NULL DEFAULT 39,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_meeting_only BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Disponibilités générales par jour de la semaine
CREATE TABLE disponibilites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche')),
  is_available BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  UNIQUE(employee_id, day_of_week)
);

-- Activer Row Level Security (bonne pratique)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE disponibilites ENABLE ROW LEVEL SECURITY;

-- Policies : accès public en lecture/écriture pour le moment
-- (on ajoutera l'auth plus tard pour le multi-clients)
CREATE POLICY "Public read employees" ON employees FOR SELECT USING (true);
CREATE POLICY "Public insert employees" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employees" ON employees FOR UPDATE USING (true);
CREATE POLICY "Public delete employees" ON employees FOR DELETE USING (true);

CREATE POLICY "Public read disponibilites" ON disponibilites FOR SELECT USING (true);
CREATE POLICY "Public insert disponibilites" ON disponibilites FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update disponibilites" ON disponibilites FOR UPDATE USING (true);
CREATE POLICY "Public delete disponibilites" ON disponibilites FOR DELETE USING (true);

-- ══════════════════════════════════════════════════════
-- Données initiales — Équipe Krispy actuelle
-- ══════════════════════════════════════════════════════

-- Restaurant Biot
INSERT INTO employees (slug, name, initials, role, team, color, contract_hours, sort_order, is_meeting_only) VALUES
  ('vy',      'Vy',      'Vy', 'Assist. Manager', 'resto', '#7c3aed', 35, 1, false),
  ('justin',  'Justin',  'Ju', 'Manager (form.)', 'resto', '#2563eb', 39, 2, false),
  ('kevin_r', 'Kévin',   'Kv', 'Responsable',     'resto', '#dc2626', 39, 3, true),
  ('mathieu', 'Mathieu', 'Ma', 'Équipier',        'resto', '#16a34a', 39, 4, false),
  ('ashit',   'Ashit',   'As', 'Équipier',        'resto', '#d97706', 39, 5, false);

-- FT / Labo
INSERT INTO employees (slug, name, initials, role, team, color, contract_hours, sort_order) VALUES
  ('aaron',    'Aaron',    'Aa', 'Chauffeur / FT',  'ft', '#0891b2', 39, 1),
  ('jeremy',   'Jérémy',   'Jé', 'FT + Labo',       'ft', '#7c3aed', 39, 2),
  ('kevin',    'Kévin',    'Kv', 'Labo (variable)', 'ft', '#dc2626', 39, 3),
  ('vanessa',  'Vanessa',  'Va', 'Labo (variable)', 'ft', '#db2777', 39, 4),
  ('francois', 'François', 'Fr', 'FT / Labo var.',  'ft', '#64748b', 39, 5),
  ('jimmy',    'Jimmy',    'Ji', 'Labo (L PM + D)', 'ft', '#059669', 35, 6),
  ('william',  'William',  'Wi', 'Labo (L/Ma/D)',   'ft', '#ca8a04', 10, 7);

-- Disponibilités FT (jours où ils ne sont PAS dispo)
-- Jimmy : indispo Mardi à Samedi
INSERT INTO disponibilites (employee_id, day_of_week, is_available, note)
SELECT id, d, false, 'Indisponible fixe'
FROM employees, unnest(ARRAY['Mardi','Mercredi','Jeudi','Vendredi','Samedi']) AS d
WHERE name = 'Jimmy' AND team = 'ft';

-- William : indispo Mercredi à Samedi
INSERT INTO disponibilites (employee_id, day_of_week, is_available, note)
SELECT id, d, false, 'Indisponible fixe'
FROM employees, unnest(ARRAY['Mercredi','Jeudi','Vendredi','Samedi']) AS d
WHERE name = 'William' AND team = 'ft';
