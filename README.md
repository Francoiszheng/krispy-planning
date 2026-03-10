# 🌶️ Krispy Planning v8

Générateur automatique de plannings pour Krispy Korean Chicken.

## Déploiement rapide

### 1. GitHub
```bash
cd krispy-planning
git init
git add .
git commit -m "Krispy Planning v8"
gh repo create krispy-planning --public --push
```

Ou crée le repo manuellement sur github.com, puis :
```bash
git remote add origin https://github.com/TON-USER/krispy-planning.git
git push -u origin main
```

### 2. Vercel
1. Va sur [vercel.com](https://vercel.com)
2. "Add New Project" → importe le repo `krispy-planning`
3. Framework : **Vite** (auto-détecté)
4. Clique "Deploy"
5. C'est en ligne en 30 secondes ✅

### Dev local
```bash
npm install
npm run dev
```

## Stack
- React 18
- Vite 5
- Zero dépendances externes (pas de Tailwind, pas de UI lib)
- Montserrat via Google Fonts CDN
