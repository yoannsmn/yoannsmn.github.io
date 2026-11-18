# Portfolio de Yoann SIMONNEAU (version 2 : éditeur visuel)

Ton site se modifie **directement sur la page**, depuis `https://tonpseudo.github.io/admin.html`, sur ordinateur comme sur téléphone.

## Modifier le site

| Ce que tu veux faire | Comment |
|---|---|
| Changer un texte | Clique dedans et écris. Sélectionne des mots pour les mettre en gras, en italique, en lien, en couleur ou en liste (barre noire au-dessus). |
| Changer une image | Clique dessus : panneau « Image ». Double-clic : la remplacer directement. |
| Modifier une section | Survole-la, puis **✎ Modifier** (contenu) ou **Style** (fond, marges, bordure, position…). |
| Ajouter une section | Survole une section, puis **+ Ajouter une section** en haut ou en bas. |
| Déplacer une section ou une image | Attrape **⠿** et glisse. |
| Agrandir une image (puzzle ou grille) | Tire la poignée **⇲** dans son coin. |
| Déplacer le texte d’une couverture | Attrape **✥** à gauche du texte. |
| Placer librement textes et images | Section « Composition libre » : **✥** pour déplacer, **⇲** pour la largeur, ⬆/⬇ pour l’ordre des couches. |
| Pages, projets, genres, rôles | Bouton **☰ Pages**. |
| Couleurs, polices, menu, pied de page ©, réseaux | Bouton **⚙ Réglages du site**. |
| Voir le rendu téléphone | Bouton **📱 Mobile**. |
| Voir avant de publier | **Aperçu**. |
| Mettre en ligne | **Publier** (visible en 1 à 2 minutes). |
| Annuler | **↶** ou Ctrl/Cmd + Z. |

Tout est sauvegardé automatiquement sur ton appareil tant que tu n’as pas publié.

## Sections disponibles

Couverture (image ou vidéo + texte par-dessus), En-tête de page, Texte, Encadré « Mon rôle », Texte + image, Image, Galerie (puzzle, grille, mosaïque, bande, diaporama, empilées, duo), Vidéo (YouTube, Vimeo, mp4), Grille de projets (avec filtres par genre), Fiche projet, Infos en lignes, Générique / crédits, Parcours, Mots-clés, Contact, Réseaux sociaux, Boutons d’action, Téléchargements (tout type de fichier), Spotify, Espace / ligne, Composition libre.

## Organisation des fichiers

```
index.html, projet.html, photos.html, a-propos.html, contact.html   Pages du site
admin.html          Éditeur visuel
data/contenu.js     TOUT le contenu (géré par l’éditeur)
images/, documents/ Images et fichiers envoyés
assets/js/          modele.js, site.js (affichage), admin-base.js + admin.js (éditeur)
assets/css/         style.css (site), admin.css (éditeur), edit.css (couche d’édition)
```

Ne supprime jamais `data/contenu.js` : c’est ton contenu.
