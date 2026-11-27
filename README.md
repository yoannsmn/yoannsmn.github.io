# Portfolio de Yoann SIMONNEAU (version 5 : groupes, mosaïque automatique, déplacement libre)

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
| Déplacer un élément | Attrape la poignée jaune **⠿** à sa gauche (ou son nom dans la barre jaune) et glisse-le, même dans une autre section ou colonne. |
| Mettre deux éléments côte à côte | Glisse un élément (⠿) sur le **bord gauche ou droit** d’un autre. |
| Décaler librement un élément | Barre jaune → maintiens **✥** et glisse. Double-clic sur ✥ : retour à sa place. |
| Grouper (titre + texte dans un cadre) | Barre jaune → **⊞ Grouper**, ou élément tout prêt **« Mon travail (encadré) »** dans ＋ Ajouter. Cadre au choix : encadré joli, carte, trait, fond sombre, sans cadre. **⊟** pour dégrouper. |
| Ajouter un élément ou une section | Bouton **＋ Ajouter** en haut à gauche, puis glisse-le dans la page (ou clique dessus). Ou rond jaune **+** sous un élément. |
| Changer une taille à la souris | **↔** à droite d’un élément, **⇲** / **↕** sur une image, **⇕** en haut/bas d’une section, **⇔** entre deux colonnes, **↔** à droite du contenu d’une section, **↕** sous une galerie ou une couverture. |
| Plusieurs pastilles sur une ligne | Petit **+** à droite des pastilles. Survole une pastille : ⠿ ↑ ↓ ⧉ 🗑. |
| Lignes de parcours, infos, crédits | **+ Ajouter une ligne** sous la liste, sur la page. Survole une ligne pour la déplacer ou la supprimer. |
| Parcours projets / formations | **+ Section → Parcours : projets \| formations** (deux colonnes). |
| Typologies de projets (filtres) | Accueil → **+ Typologie** au bout des filtres, ou ☰ Pages → Projets. Autant que tu veux, plusieurs par projet. |
| Survol des vignettes | Accueil → Grille de projets → ✎ → « Animation du texte au survol » (mêmes choix que l’apparition). |
| Légende d’une photo | Facultative : bouton **Légende** sur l’image pour l’ajouter ou la retirer. |
| Photos de formats différents | Disposition **Mosaïque automatique** : chaque photo garde son format (horizontale, verticale, carrée), chaque rangée remplit la largeur. Taille : poignée ↕ sous la galerie. |
| Imposer un format à une photo | Clique sur la photo → **Format de cette photo** (16:9, 9:16, 4:3, 1:1…), puis **✋ Cadrer** pour choisir la partie visible. |
| Version téléphone différente | Bouton **📱 Mobile** : les tailles, espacements, positions et colonnes réglés à ce moment ne changent que sur téléphone. |
| Retrouver une ancienne version | Menu **⋯ → 🕘 Historique des publications**. Modifications mises de côté : **⋯ → 🛟**. |
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

Tout est sauvegardé automatiquement sur ton appareil tant que tu n’as pas publié, et repris automatiquement à la prochaine ouverture (même après une mise à jour du code).

## Affichage

La disposition ne change pas quand la fenêtre rétrécit : sur ordinateur, la page se réduit proportionnellement en dessous de 1200 px de large. Sur téléphone, la version téléphone garde la même disposition quel que soit le modèle de téléphone.

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

Ne supprime jamais `data/contenu.js` : c’est ton contenu. Les mises à jour du code ne contiennent jamais `data/`, `images/` ni `documents/`. Les anciennes versions du contenu sont converties automatiquement à l’ouverture de l’éditeur.
