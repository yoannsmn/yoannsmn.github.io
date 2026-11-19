# Portfolio de Yoann SIMONNEAU (version 3 : éditeur visuel, éléments, bibliothèque)

Ton site se modifie **directement sur la page**, depuis `https://tonpseudo.github.io/admin.html`, sur ordinateur comme sur téléphone.

## Sections et éléments

Une **section** (cadre bleu en pointillés) contient des **éléments** : pastille, titre, sous-titre, paragraphe, image, galerie, infos (durée, format…), crédits, parcours, boutons, lien vers un document, réseaux sociaux…
Chaque élément a sa propre barre jaune et ses propres réglages : **Contenu, Style, Texte, Animation**.

## Modifier le site

| Ce que tu veux faire | Comment |
|---|---|
| Changer un texte | Clique dedans et écris. Sélectionne des mots : gras, italique, lien, couleur, liste, **📎 Document** (lien vers ton CV). |
| Régler un seul élément | Survole-le → barre jaune → **✎**. Onglets Contenu, Style, Texte, Animation. |
| Supprimer un élément (ex. la pastille) | Barre jaune → **🗑**. |
| Déplacer un élément | Barre jaune → **↑ ↓**, ou attrape **⠿** et glisse (même dans une autre section ou une autre colonne). |
| Ajouter un élément | Rond jaune **+** sous un élément, ou panneau de la section → **+ Ajouter un élément**. |
| Régler toute une section | Barre blanche → **✎ Section** (mise en page + liste des éléments) ou **Style**. |
| Ajouter une section | **+ Section** en haut ou en bas d’une section. |
| Changer une image | Clique dessus : panneau « Image ». Double-clic ou **Remplacer** : choisir dans la bibliothèque. |
| Rogner une image | Survole-la → **Rogner**, ou ✂ dans la bibliothèque. Une copie recadrée est créée, l’original est gardé. |
| Bibliothèque de photos et documents | Bouton **🖼 Bibliothèque** : envoie tout une fois (glisser-déposer accepté), puis choisis partout. |
| CV ou document à télécharger | Élément **Lien vers un document (CV…)**, bouton « Télécharger un document », ou 📎 dans un texte. |
| Formations avec logos | Section **Parcours / formations** → ✎ sur la liste → « + Logo » sur chaque ligne. Logos en noir & blanc, blanc, noir ou couleur. |
| Icônes des réseaux sociaux | **⚙ Réglages du site → Réseaux sociaux** (icône choisie d’après le lien). Affichage icônes / icône + nom / texte. |
| Animation des vignettes de projets | Accueil → élément **Grille de projets** → ✎ → « Animation d’apparition ». |
| Pages, projets, genres, rôles | Bouton **☰ Pages**. |
| Couleurs, polices, menu, pied de page ©, réseaux | Bouton **⚙ Réglages du site**. |
| Voir le rendu téléphone | **📱 Mobile**. |
| Voir avant de publier | **Aperçu**. |
| Mettre en ligne | **Publier** (visible en 1 à 2 minutes). |
| Annuler | **↶** ou Ctrl/Cmd + Z. |

Tout est sauvegardé automatiquement sur ton appareil tant que tu n’as pas publié.

## Organisation des fichiers

```
index.html, projet.html, photos.html, a-propos.html, contact.html   Pages du site
admin.html          Éditeur visuel
data/contenu.js     TOUT le contenu (géré par l’éditeur)
images/             Photos (images/bibliotheque/ pour celles envoyées par la bibliothèque)
documents/          CV, PDF et autres fichiers à télécharger
assets/js/          modele.js, site.js (affichage), admin-base.js + admin.js (éditeur)
assets/css/         style.css (site), admin.css (éditeur), edit.css (couche d’édition)
```

Ne supprime jamais `data/contenu.js` : c’est ton contenu. Les anciennes versions du contenu sont converties automatiquement à l’ouverture de l’éditeur.
