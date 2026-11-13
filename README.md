# Portfolio de Yoann SIMONNEAU : guide

Ce dossier contient tout ton site. Tu ne le mets en ligne **qu'une seule fois** (environ 15 minutes, de préférence depuis un ordinateur). Ensuite, tu modifies tout depuis la page **admin.html** de ton site, sur ordinateur comme sur téléphone, sans toucher au code.

---

## 1. Mettre le site en ligne (une seule fois)

### a. Créer un compte GitHub
Va sur [github.com](https://github.com) et clique sur **Sign up**.
⚠️ Choisis bien ton **nom d'utilisateur** : il devient l'adresse de ton site.
Exemple : avec `yoannsimonneau`, ton site sera `https://yoannsimonneau.github.io`.

### b. Créer le dépôt (le « dossier » de ton site sur GitHub)
1. En haut à droite, clique sur **+**, puis **New repository**.
2. **Repository name** : écris exactement `tonpseudo.github.io` (avec ton vrai pseudo).
3. Coche **Public**.
4. Clique sur **Create repository**.

### c. Envoyer les fichiers
1. Sur la page du dépôt, clique sur le lien **uploading an existing file**.
2. Dézippe le dossier du site sur ton ordinateur, ouvre-le, sélectionne **tout son contenu** (les fichiers `index.html`, `admin.html`… et les dossiers `assets`, `data`, `images`) et glisse-le dans la page.
   👉 Glisse bien le *contenu* du dossier, pas le dossier lui-même.
3. Attends la fin du chargement, puis clique sur **Commit changes**.

### d. Activer la publication
1. Dans le dépôt : **Settings** → **Pages** (menu de gauche).
2. **Source** : *Deploy from a branch*. **Branch** : `main`, dossier `/ (root)`. Clique sur **Save**.
3. Attends 1 à 2 minutes, puis ouvre `https://tonpseudo.github.io` : ton site est en ligne 🎉

---

## 2. Activer l'éditeur (une seule fois)

L'éditeur a besoin d'une « clé » (un **jeton**) pour enregistrer tes modifications sur GitHub.

1. Ouvre [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
2. **Token name** : `Portfolio`. **Expiration** : la durée que tu veux (par exemple 1 an).
3. **Repository access** : *Only select repositories*, puis choisis `tonpseudo.github.io`.
4. **Permissions** → **Repository permissions** → **Contents** : *Read and write*.
5. Clique sur **Generate token** et **copie le jeton** (il commence par `github_pat_`).
6. Ouvre `https://tonpseudo.github.io/admin.html`. Ton pseudo et le nom du dépôt sont déjà remplis : colle le jeton puis clique sur **Se connecter**.

💡 Sur ton téléphone, ajoute `admin.html` à l'écran d'accueil (menu du navigateur → *Ajouter à l'écran d'accueil*). Tu l'auras toujours sous la main.

🔒 Le jeton reste enregistré uniquement dans ton navigateur. Ne le partage jamais. S'il expire, crée-en un nouveau (même procédure) et reconnecte-toi.

---

## 3. Modifier ton site au quotidien

1. Ouvre `admin.html`.
2. Modifie ce que tu veux dans les onglets **Films**, **Accueil & réglages**, **Photos**, **À propos** et **Contact**.
3. **Aperçu** : tu vois le résultat avant que les visiteurs le voient.
4. **Publier** : le site est à jour pour tout le monde en 1 à 2 minutes.

Tes modifications sont enregistrées automatiquement sur ton appareil tant que tu n'as pas publié : tu ne perds rien si tu fermes la page.

### Ce que tu peux modifier pour chaque projet
| Élément | Où il apparaît |
|---|---|
| Titre, sous-titre, catégorie (pastille) | En-tête de la page du projet |
| Mes rôles | Sous la vignette (page Films) et dans « Mon travail » |
| Vignette | Liste des films (page d'accueil) |
| Animation au survol | Liste des films |
| Lien YouTube ou Vimeo | Lecteur vidéo en haut de la page du projet |
| Textes (titre + sous-titre + texte, autant que tu veux) | Colonne de gauche |
| Détails (durée, format…) et crédits (fonction + noms) | Colonne de droite |
| Mon travail sur le projet | Encadré sous les textes |
| Photos grand format | Pleine largeur |
| Photos petit format | Collage |
| Masquer | Retire le projet du site sans le supprimer |

### Les animations au survol
*Cinéma* (bandes noires), *Zoom*, *Fondu + « Voir le projet »*, *Balayage de lumière*, *Glitch* ou *Aucune*. Tu choisis un réglage général dans **Accueil & réglages**, et tu peux changer l'animation d'un projet en particulier dans sa fiche. Sur téléphone, l'animation se joue quand le projet passe au milieu de l'écran.

### Mise en forme des textes
- Une **ligne vide** crée un nouveau paragraphe.
- `**gras**` donne **gras**, `*italique*` donne *italique*.
- `[texte du lien](https://exemple.com)` crée un lien.

### Images
- Choisis-les directement depuis ton téléphone ou ton ordinateur : elles sont **automatiquement allégées** avant l'envoi (une photo de 10 Mo devient environ 300 Ko), ce qui garde le site rapide.
- Les vidéos restent sur YouTube ou Vimeo : ne les mets pas dans le site.

---

## 4. À compléter avant de partager le site

- [ ] **Remplacer les images provisoires.** Elles ont été découpées dans tes captures d'écran, elles sont donc en basse résolution. Mets tes vraies images HD (vignettes, photos des projets, image d'accueil, portrait).
- [ ] **Vérifier l'orthographe des noms dans les crédits de FRÈRES.** Je les ai lus sur une capture très petite.
- [ ] Remplir les projets 3 et 4 (titres, textes, rôles…), ou les masquer.
- [ ] Ajouter les liens YouTube ou Vimeo de tes films.
- [ ] Rédiger les blocs « Mon travail sur le projet ».
- [ ] Remplir **À propos** et **Contact** (ton e-mail, tes réseaux).
- [ ] Remplacer les photos d'exemple de la page **Photos**.

---

## 5. Questions fréquentes

**Mes changements n'apparaissent pas ?** Attends 2 minutes puis actualise la page. Dans ton dépôt GitHub, l'onglet **Actions** montre l'avancement de la mise en ligne (pastille verte = terminé).

**C'est vraiment gratuit ?** Oui : GitHub Pages est gratuit pour un dépôt public. « Public » veut dire que les fichiers du site sont visibles, ce qui est normal pour un portfolio. N'y mets rien de privé.

**Je veux une adresse personnalisée (ex. yoannsimonneau.fr) ?** C'est possible plus tard. Achète le nom de domaine chez un registraire (environ 10 €/an), puis indique-le dans **Settings → Pages → Custom domain**.

**Je veux modifier sans l'éditeur ?** Tout le contenu se trouve dans `data/contenu.js`. Sur GitHub, ouvre ce fichier, clique sur le crayon ✏️, modifie le texte entre guillemets, puis clique sur **Commit changes**.

**J'ai tout cassé ?** Dans l'éditeur, menu **⋯** → *Télécharger une sauvegarde* : pense à en faire une de temps en temps. Pour revenir en arrière, utilise *Importer une sauvegarde*. GitHub garde aussi l'historique de toutes les versions (onglet **Commits**).

---

## 6. Organisation des fichiers (pour info)

```
index.html        Page Films (accueil)
projet.html       Page d'un projet (projet.html?id=freres…)
photos.html       Page Photos
a-propos.html     Page À propos
contact.html      Page Contact
admin.html        Éditeur (non référencé sur Google)
data/contenu.js   TOUT le contenu du site (textes, liens, réglages)
images/           Toutes les images
assets/css/       Styles (couleurs, mise en page, animations)
assets/js/        Fonctionnement du site et de l'éditeur
```
