# Changelog

## 1.0.91

- Recherche médecin déclenchée uniquement à partir de 4 caractères.
- Verrouillage temporaire du champ médecin pendant l'autocomplétion pour éviter les saisies concurrentes.
- Mémoïsation courte et bornée des recherches médecin répétées côté popup.

## 1.0.90

- Remplacement du nom de test par `Roger RABBIT`.

## 1.0.89

- Refactor du cache d'autocomplétion médecin vers une abstraction TTL bornée réutilisable.
- Centralisation des états visuels de recherche médecin via `setDoctorStatus`.
- Suppression du code mort de l'ancien fallback direct d'autocomplétion.

## 1.0.88

- Ajout d'un cache court et borné pour l'autocomplétion médecin afin d'éviter les appels Doctolib répétés pendant une même saisie.
- Remplacement des listeners par suggestion par une délégation d'événements unique sur la liste.
- Fermeture des onglets temporaires Doctolib sans promesse non gérée.

## 1.0.87

- La sélection d'une suggestion médecin se fait maintenant sur `pointerdown`, avant le `blur` du champ de recherche.
- Le `blur` de l'input ne relance plus de recherche pendant la sélection d'une suggestion.

## 1.0.86

- La sélection d'une suggestion médecin remplit seulement le champ de recherche et verrouille le profil choisi.
- L'ouverture du profil Doctolib se fait uniquement après clic explicite sur la loupe.

## 1.0.85

- La sélection d'un profil médecin verrouille temporairement la validation pour éviter de relancer une recherche.
- Le nom sélectionné est normalisé dans le champ de recherche avant ouverture du profil.

## 1.0.84

- Suppression de la coche avant sélection même quand un seul profil médecin est trouvé.
- Tout profil retourné est désormais affiché comme suggestion à sélectionner explicitement.

## 1.0.83

- Suppression de la coche automatique quand plusieurs profils médecins sont retournés.
- La recherche affiche maintenant `sélectionne un profil` jusqu'au clic explicite sur une suggestion.

## 1.0.82

- Le clic sur une suggestion médecin ouvre maintenant directement le profil sélectionné sans repasser par la logique de validation/recherche.
- Les clics sur suggestions stoppent la propagation pour éviter les soumissions involontaires du formulaire.

## 1.0.81

- L'autocomplétion médecin envoie maintenant le header `x-csrf-token` lu depuis la page Doctolib, comme dans le HAR natif.
- Cela aligne l'appel injecté sur les headers observés dans `www.doctolib phillpart.fr.har`.

## 1.0.80

- Ajout d'un diagnostic enrichi sur l'autocomplétion médecin : échantillons de profils, spécialités et organisations reçus depuis Doctolib.

## 1.0.79

- La boucle de variantes d'autocomplétion médecin s'exécute maintenant entièrement dans le monde principal de la page Doctolib en une seule injection.
- Cela évite les états intermédiaires où seule la première requête `philippart` était affichée malgré les variantes suivantes.

## 1.0.78

- La recherche médecin teste plusieurs formes de requête dans le contexte Doctolib (`nom`, `dr nom`, `docteur nom`, casse titre).
- L'état vide affiche maintenant la requête et les clés de réponse reçues pour diagnostiquer précisément les réponses Doctolib sans profils.

## 1.0.77

- La recherche médecin crée maintenant un onglet Doctolib temporaire en arrière-plan si aucun onglet Doctolib existant n'est détecté.
- L'onglet temporaire est fermé après l'autocomplétion pour éviter toute fuite d'onglet/processus.

## 1.0.76

- Suppression du repli trompeur vers le fetch direct extension pour l'autocomplétion médecin.
- La recherche affiche maintenant l'erreur technique réelle ou `Aucun profil reçu`, au lieu d'un faux `Aucun résultat exact`.
- Sélection déterministe de l'onglet Doctolib actif avant exécution du fetch dans le monde principal de la page.

## 1.0.75

- Ajout de la permission `scripting` pour exécuter l'autocomplétion médecin dans le monde JavaScript principal de la page Doctolib.
- La recherche médecin utilise maintenant en priorité `chrome.scripting.executeScript` sur l'onglet Doctolib ouvert, afin d'éviter le `403` observé hors contexte page.

## 1.0.74

- La recherche médecin utilise maintenant exactement la requête du HAR Doctolib pour un nom seul : `search=dr philippart`.
- Ajout d'un test automatisé basé sur le HAR `www.doctolib phillpart.fr.har` vérifiant que `Dr Frederic PHILIPPART` est bien présent.

## 1.0.73

- L'autocomplétion médecin passe désormais en priorité par l'onglet Doctolib ouvert, afin d'appeler `/api/searchbar/autocomplete.json` depuis le contexte Doctolib natif.
- Ajout de la permission `tabs` pour trouver l'onglet Doctolib et éviter les différences de comportement entre popup extension et page Doctolib.

## 1.0.72

- La recherche de médecin interroge maintenant l'autocomplétion Doctolib comme le champ natif, en testant d'abord une requête préfixée `Dr`.
- Affichage de la version dans le popup pour vérifier immédiatement le dossier réellement chargé par Chrome.

## 1.0.71

- Ajout d'une liste de spécialités beaucoup plus complète, dont `Chirurgien oral`.
- La spécialité par défaut est maintenant vide (`Toutes spécialités`) pour ne pas filtrer les médecins sans choix explicite.
- Les suggestions de médecins sont filtrées par spécialité et par lieu quand ces filtres sont renseignés.

## 1.0.70

- Correction du repli sur nom seul : l'extension retente toujours `Dr + nom` quand aucun profil médecin n'est retourné.
- Les autres catégories d'autocomplétion Doctolib ne bloquent plus l'affichage de la liste de médecins.

## 1.0.69

- Correction de l'autocomplétion sur nom seul : si `Philippart` ne retourne aucun profil, l'extension retente automatiquement la requête Doctolib au format `Dr Philippart`.
- La liste de profils peut maintenant apparaître même quand l'utilisateur ne tape que le nom de famille.

## 1.0.68

- Ajout d'une liste de profils Doctolib sélectionnables quand une recherche médecin retourne plusieurs résultats.
- Le bouton recherche ne choisit plus un profil ambigu : l'ouverture Doctolib se fait après sélection explicite dans l'extension.

## 1.0.67

- Correction des recherches médecin ambiguës : un nom seul comme `Philippart` n'est plus validé arbitrairement sur le premier profil.
- La validation demande maintenant de préciser le prénom quand plusieurs profils Doctolib correspondent.

## 1.0.66

- Suppression de l'erreur Chrome `Cannot find menu item` lors de l'installation du menu contextuel.
- Création du menu clic droit rendue idempotente pour les redémarrages du service worker.

## 1.0.65

- Correction de la validation du champ `Nom du médecin` avec le vrai endpoint Doctolib `/api/searchbar/autocomplete.json`.
- Prise en charge des suggestions `profiles`, dont le lien direct vers la fiche médecin comme `Dr Frederic PHILIPPART`.

## 1.0.64

- La vérification du champ `Nom du médecin` utilise maintenant l'autocomplétion Doctolib `/patient_app/search_doctors.json`.
- La coche ouvre directement la fiche du médecin quand une suggestion Doctolib existe.

## 1.0.63

- Ajout d'une action contextuelle clic droit sur texte sélectionné pour rechercher un médecin sur Doctolib.
- Nettoyage automatique des préfixes `Dr` / `Docteur` avant ouverture de la recherche.

## 1.0.62

- Correction de la recherche par nom de médecin : conversion des arrondissements au format Doctolib `75007-paris`.
- Nettoyage automatique des préfixes `Dr` / `Docteur` dans le champ nom.

## 1.0.61

- Ajout d'un champ `Nom du médecin` dans la recherche rapide.
- Si un nom est saisi, la recherche ouvre `/search?keyword=...&location=...`; sinon elle conserve la recherche spécialité + arrondissement.

## 1.0.60

- Extraction d'un client API Doctolib partagé pour centraliser fetch, CSRF, annulation, RDV et disponibilités.
- Extraction des helpers purs de recherche rapide et ajout de tests unitaires.
- Ajout d'un TTL de 5 minutes au cache des disponibilités affichées au survol.
- Passage des favoris/recherches récentes en chips horizontales scrollables pour éviter l'empilement visuel.

## 1.0.59

- Correction de la spécialité sélectionnée par défaut dans la recherche rapide : suppression du slug invalide `chirurgien-dentiste` au profit de `dentiste`.

## 1.0.58

- Normalisation de l'affichage du patient en `Prénom Nom` dans les cards RDV.

## 1.0.57

- Correction du bouton loupe de recherche rapide : clic direct explicite et ouverture immédiate du nouvel onglet.
- L'historique de recherche n'attend plus avant l'ouverture de l'onglet.

## 1.0.56

- Correction de l'ouverture de la recherche rapide quand aucune sélection explicite n'est active.
- Ouverture de l'onglet Doctolib avant l'enregistrement de l'historique pour conserver le geste utilisateur Chrome.

## 1.0.55

- Suppression des doublons entre favoris de recherche et recherches récentes dans le popup.

## 1.0.54

- Ajout d'un tooltip au survol des cards RDV affichant le prochain créneau disponible pour le même praticien/motif/lieu.
- Stockage des IDs `agenda`, `practice` et `visit_motive` dans le cache RDV pour les appels de disponibilité lecture seule.
- Cache et annulation propre des requêtes de disponibilité au départ du survol.

## 1.0.53

- Ajout d'un script local de test lecture seule pour `GET /availabilities.json`.
- Garde explicite contre toute commande destructive dans le script de test d'endpoints.

## 1.0.52

- Masquage automatique de la spécialité `Gynéco` dans la recherche rapide quand le patient filtré semble masculin.

## 1.0.51

- Tri alphabétique des spécialités dans la recherche rapide du popup.

## 1.0.50

- Suppression du bandeau `Départ à surveiller`, trop vague et peu utile dans le popup.

## 1.0.49

- Ajout de favoris de recherche et d'un historique des 5 dernières recherches Doctolib.
- Ajout de raccourcis d'arrondissements favoris dans la recherche rapide.
- Ajout d'un badge Chrome indiquant le nombre de RDV à venir.
- Ajout d'une alerte de départ pour les RDV dans les prochaines 36 heures.
- Ajout du mode d'affichage `Compact` / `Confortable` pour le popup.

## 1.0.48

- Ajout d'une recherche rapide Doctolib dans le popup : spécialité + arrondissement parisien.
- La recherche ouvre les résultats Doctolib dans un nouvel onglet normal.

## 1.0.47

- `Annuler` affiche maintenant une confirmation dans le popup de l'extension, sans ouvrir Doctolib.
- L'annulation confirmée appelle directement l'endpoint Doctolib `DELETE /account/appointments/{id}` avec le motif `cancelled_after_booking`.
- La card annulée est retirée localement puis la liste des RDV est rafraîchie depuis Doctolib.

## 1.0.46

- `Déplacer` ouvre maintenant le flow Doctolib direct dans un nouvel onglet normal, sans fenêtre popup.

## 1.0.45

- `Déplacer` ouvre maintenant directement le flow Doctolib `/appointments/{id}/move/new` découvert dans le HAR.
- Suppression du passage par la page détail pour l'action `Déplacer`.

## 1.0.44

- Correction du crash `root.querySelectorAll is not a function` quand Doctolib ajoute des noeuds non-éléments.
- Forçage de la fenêtre d'action Doctolib en mode normal avec position et dimensions explicites.

## 1.0.43

- Les actions `Déplacer` et `Annuler` ouvrent maintenant une fenêtre d'action Doctolib compacte au lieu d'un nouvel onglet.
- Le déclenchement automatique utilise l'activation native du bouton Doctolib pour afficher sa popup de confirmation ou de déplacement.

## 1.0.42

- Les actions `Déplacer` et `Annuler` déclenchent maintenant une séquence de clic UI plus proche d'un clic utilisateur sur le bouton Doctolib.
- Détection étendue aux liens et boutons pour afficher correctement les popups natives de déplacement ou d'annulation selon le rendu Doctolib.

## 1.0.41

- Les actions `Déplacer` et `Annuler` du popup enregistrent maintenant l'action demandée pour le RDV ciblé avant ouverture.
- La page détail déclenche automatiquement le vrai bouton Doctolib correspondant dès qu'il est disponible, puis nettoie l'action en attente.
- Ajout d'une expiration courte pour éviter tout clic tardif après navigation ou rechargement.

## 1.0.40

- Les actions `Déplacer` et `Annuler` du popup déclenchent maintenant le bouton Doctolib correspondant sur la page détail.
- Suppression du hash d'action après déclenchement pour éviter un second clic accidentel au rechargement.

## 1.0.39

- Ajout des actions `Déplacer` et `Annuler` sur chaque card RDV du popup.
- Les actions ouvrent la page détail du RDV et mettent en évidence le bouton correspondant sans cliquer dessus.

## 1.0.38

- Versionnement du cache local des RDV pour ignorer les anciennes cards sans remplaçant.
- Forçage d'un rafraîchissement API quand le cache RDV vient d'un ancien modèle.

## 1.0.37

- Affichage prioritaire du praticien remplaçant (`substitute_name`) dans les cards RDV.
- Ajout du libellé de remplacement (`substitution_wording`) dans la ligne de détail du RDV.

## 1.0.36

- Protection du content script contre `Extension context invalidated` après rechargement de l'extension.
- Repli silencieux sur les réglages par défaut quand `chrome.storage` n'est plus accessible.

## 1.0.35

- Ajout d'un lien `Options` dans le popup pour ouvrir la configuration de l'extension.

## 1.0.34

- Ajout d'icônes dans la liste des modes de transport des Options.

## 1.0.33

- Validation de l'adresse de départ via l'API Adresse de la Base Adresse Nationale.
- Refus de sauvegarde si l'adresse n'est pas trouvée avec un score suffisant.
- Cache de la dernière validation d'adresse pour éviter les appels répétés.

## 1.0.32

- Suppression du header interne redondant dans la page Options.
- Resserrement visuel de la configuration : champs, espacements et typographies plus compacts.

## 1.0.31

- La page détail récupère maintenant l'adresse du cabinet et l'heure du RDV via l'API `/appointments/{id}`.
- Suppression du parsing DOM pour l'adresse et la date du RDV.
- Le DOM sert uniquement de point d'accroche pour injecter la carte, la météo et les actions.

## 1.0.30

- Suppression du fallback de lecture des RDV depuis les cards DOM.
- La liste du popup repose uniquement sur l'API Doctolib `/account/appointments.json`.
- Alignement des liens stockés par le content script sur `/account/appointments/details/{id}`.

## 1.0.29

- Séparation du popup et de la page Options : l'icône affiche uniquement les RDV à venir.
- Refonte visuelle de la configuration dans un style plus proche des cartes Doctolib.
- Le script partagé active seulement la partie présente sur la page ouverte.

## 1.0.28

- Correction du lien des cards RDV vers la route Doctolib compte `/account/appointments/details/{id}`.

## 1.0.27

- Ouverture explicite des cards RDV avec `chrome.tabs.create` vers `/appointments/{id}`.
- Encodage de l'identifiant signé Doctolib avant construction de l'URL.
- Resynchronisation de l'horodatage local du cache RDV dans le popup.

## 1.0.26

- Suppression d'une boucle potentielle de refresh du popup entre `storage.onChanged` et l'API Doctolib.
- Déduplication des refreshs RDV pendant que le popup est ouvert.
- Ajout d'un timeout réseau aux fetchs du popup.

## 1.0.25

- Remplacement du filtre patient libre par une liste des personnes du compte Doctolib.
- Ajout de la photo du praticien sur les cards RDV du popup.
- Clic sur une card RDV vers la page détail `/appointments/{id}`.

## 1.0.24

- Ajout d'un filtre de patient dans la configuration du popup.
- Affichage du patient sur les cards RDV.
- Ajout d'un spinner pendant le chargement de la liste des RDV.

## 1.0.23

- Alignement de la liste popup sur la section Doctolib `Rendez-vous à venir`.
- Suppression du filtre local `start_date > maintenant`, trop agressif par rapport à l'affichage Doctolib.
- Ajout d'un fallback DOM qui lit les cards visibles dans la colonne `Rendez-vous à venir`.

## 1.0.22

- Correction du popup RDV à venir : filtrage strict par date réelle `start_date > maintenant`.
- Le popup rafraîchit directement `/account/appointments.json?page=0` quand il s'ouvre.
- Les anciens RDV stockés localement sont filtrés avant affichage.

## 1.0.21

- Remplacement de l'extraction DOM des RDV par l'appel `/account/appointments.json?page=0` observé dans le HAR.
- Filtrage strict des RDV à venir uniquement.
- Affichage en colonne gauche dans le popup, sous forme de cards cliquables.

## 1.0.20

- Ajout d'une liste locale des RDV à venir dans le popup de l'extension.
- Extraction des RDV depuis les pages Doctolib déjà ouvertes/connectées.
- Clic sur un RDV pour ouvrir la page Doctolib dans un nouvel onglet.
- Aucun stockage d'identifiants Doctolib.

## 1.0.19

- Optimisation de la recherche de la carte établissement pour ne scanner que les cartes Doctolib.

## 1.0.18

- Ajout d'un espacement visuel entre la carte RDV et la carte établissement déplacée.

## 1.0.17

- Détection plus robuste de la carte `Informations du rendez-vous` via les actions `Déplacer le RDV` et `Annuler le RDV` quand la classe Doctolib attendue n'est pas disponible.

## 1.0.16

- Correction du déplacement de la carte établissement quand elle est dans une autre colonne ou un autre parent DOM que la carte RDV.

## 1.0.15

- Déplacement de la carte `Détails de l'établissement de santé` juste après la carte principale du RDV Doctolib.

## 1.0.14

- Correction du format Doctolib `Lundi 18 mai 09h15`, sans `à` entre la date et l'heure.

## 1.0.13

- Détection de l'heure et de la date depuis le header Doctolib du RDV, par exemple `Lundi 18 mai 09h15`.
- Recherche élargie au niveau de la carte complète du rendez-vous.
- Correction du calcul d'année quand Doctolib n'affiche pas l'année.

## 1.0.12

- Correction Google Calendar avec fuseau `Europe/Paris`.
- Génération des dates Calendar en heure locale française, sans conversion UTC visible.
- Désactivation du bouton calendrier si la date et l'heure du RDV ne sont pas détectées sur Doctolib.
- Meilleure prise en compte du jour de semaine Doctolib quand il est présent.

## 1.0.11

- Suppression du message inutile `Trajet estimé · marge` quand l'heure du RDV n'est pas détectée.

## 1.0.10

- Correction de l'heure de départ quand l'heure du RDV n'est pas détectée.
- Normalisation robuste des anciens réglages stockés.
- Amélioration du lien `Voir l'entrée` vers le mode Street View de Google Maps quand les coordonnées sont récupérables.
- Mention explicite `RDV` ou `Actuelle` sur la météo affichée.

## 1.0.9

- Ajout de l'heure de départ conseillée avec marge configurable.
- Ajout du bouton de copie de l'adresse du cabinet.
- Ajout du lien Google Calendar.
- Ajout du lien `Voir l'entrée` vers Google Maps.
- Conservation de Google Maps comme unique service de carte.

## 1.0.8

- Remplacement visuel du bouton carte par la mini-carte cliquable.

## 1.0.7

- Ajout des icônes météo inline.
