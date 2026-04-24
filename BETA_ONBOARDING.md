# Onboarding Beta — Linky

Checklist à envoyer aux 15 beta testeurs. Copie-colle dans tes DM.

---

## Avant de commencer — à lire

> **À tes risques et périls.** Linky envoie des actions (connexions, messages) depuis ton compte LinkedIn. Tu es seul responsable de ton compte. LinkedIn peut restreindre ou bannir un compte qui envoie trop d'actions. Les paramètres par défaut sont conservateurs — ne les augmente que si tu sais ce que tu fais.

---

## 1. Créer ton compte Linky

1. Va sur [URL_APP]
2. Clique sur "S'inscrire"
3. Suis l'onboarding

## 2. Configurer ta clé Google Gemini (pour les messages IA)

Linky utilise **ta clé personnelle Gemini** — pas la mienne. Le tier gratuit suffit largement (15 req/min, 1M tokens/jour).

1. Va sur https://aistudio.google.com/app/apikey
2. "Create API key" → copie la clé (format `AIza...`)
3. Dans Linky → Paramètres → "Clé API Gemini" → colle et sauvegarde

**Sans clé** → les campagnes fonctionnent quand même, mais avec les templates fixes (pas de personnalisation IA).

**Si la clé est invalide / quota atteint** → Linky fallback automatiquement sur le template de la campagne. Rien ne casse.

## 3. Récupérer tes cookies LinkedIn

Linky a besoin de 2 cookies pour agir sur ton compte : `li_at` et `JSESSIONID`.

1. Connecte-toi à LinkedIn dans ton navigateur
2. Ouvre les DevTools (F12) → onglet **Application** → **Cookies** → `https://www.linkedin.com`
3. Copie la valeur de `li_at` (long token)
4. Copie la valeur de `JSESSIONID` (format `ajax:xxxxx`)
5. Dans Linky → Paramètres → colle les deux

⚠️ **Ces cookies donnent accès complet à ton compte LinkedIn.** Linky les stocke chiffrés en base, mais traite-les comme un mot de passe.

**Durée de vie** : ~1 an, mais LinkedIn peut les invalider si comportement suspect détecté. Si Linky te dit "cookies invalides" → refais la manip.

## 4. Warm-up (fortement recommandé si compte neuf ou peu utilisé)

Dans Paramètres → active **Warm-up progressif**.

- Linky commence à 5 actions/jour et monte progressivement jusqu'à ta limite cible (25 par défaut) sur 7 jours.
- Ça réduit le risque de flag LinkedIn.
- Tu peux ajuster les chiffres (start/target/days) selon ton usage.

**Tu peux désactiver**, mais ne t'étonne pas si LinkedIn restreint un compte neuf à 50 DM/jour dès J1.

## 5. Lancer ta première campagne

Commence petit :
- **Une** campagne DM
- **20-30 contacts** max
- Message template simple, pas de full-AI sur le premier run
- Active le schedule (8h-20h Europe/Paris par défaut) pour imiter un humain

Laisse tourner 2-3 jours avant d'en lancer une deuxième.

## 6. Bugs, feedback, support

👉 **Formulaire feedback** : [LIEN_GOOGLE_FORM_OU_TYPEFORM]

Pour tout ce qui casse, bloque, ou te surprend : remplis le form. Pas de DM WhatsApp / Instagram / etc — je perds tout si je réponds pas immédiatement.

Ce que tu peux m'envoyer :
- Screenshot de l'erreur
- Ce que tu faisais juste avant
- ID de campagne si c'est lié à une campagne
- Heure approximative (me permet de retrouver les logs)

## 7. Ce qu'on mesure pendant la beta

- Taux de réponse de tes campagnes
- Taux d'erreurs techniques (côté Linky)
- Temps avant flag LinkedIn (si ça arrive)
- Ton feedback qualitatif sur l'UX

Je te recontacte à **J+7** et **J+14** pour debrief.

---

## Ops — pour toi Thomas uniquement

### Statut scheduler en live
```
curl "https://[URL_BACKEND]/api/admin/scheduler-status?key=$CRON_SECRET" | jq
```
Te donne : nombre de campagnes enregistrées, quand chacune fire ensuite, si le reply_checker dérive.

### Signaux à surveiller
- `reply_checker.overdue: true` → trop de campagnes DM actives, fan-out sature
- Beaucoup de campagnes avec `next_run_in_seconds` négatif → scheduler lag, vérifier RAM Render
- Erreurs Sentry `UnauthorizedException` → cookies LinkedIn d'un user expirés, le contacter

### Plafond actuel (stack gratuite)
- ~40-60 users avec 1-2 campagnes DM chacun
- Au-delà → upgrade Render Starter (7 $/mois)
