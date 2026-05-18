# super-doctolib

Extension Chrome personnelle pour améliorer Doctolib : RDV à venir dans le popup, recherche rapide de praticiens, trajet Google Maps depuis une adresse de départ, météo du RDV et raccourcis utiles.

Adresse de départ par défaut :

`11 avenue de Ségur 75007 PARIS`

## Fonctionnalités

- Liste des rendez-vous à venir depuis l'API Doctolib.
- Ouverture d'un RDV dans un nouvel onglet depuis le popup.
- Recherche rapide par spécialité, lieu ou nom de médecin.
- Suggestions de médecins via l'autocomplétion Doctolib native.
- Filtrage des suggestions par spécialité et lieu quand ces champs sont renseignés.
- Mini-carte Google Maps avec trajet depuis l'adresse de départ.
- Météo à l'heure du RDV quand disponible.
- Actions : copier l'adresse, voir l'entrée, ajouter au calendrier.

## Installation

1. Ouvrir Chrome.
2. Aller sur `chrome://extensions`.
3. Activer le `Mode développeur`.
4. Cliquer sur `Charger l'extension non empaquetée`.
5. Sélectionner ce dossier :

`/Users/ft/Documents/Codex/super-doctolib`

Ensuite, ouvrir ou recharger :

`https://www.doctolib.fr/account/appointments`

Le bouton `Ouvrir la carte` est remplacé par une mini-carte avec l'itinéraire.
Cliquer sur cette carte ouvre le trajet complet dans Google Maps.
Le mode par défaut est `À pied`.

## Options

Cliquer sur `Options` dans le popup pour ouvrir la configuration.
L'adresse de départ peut être modifiée et sauvegardée. La valeur par défaut est :

`11 avenue de Ségur 75007 PARIS`

La configuration permet aussi de choisir le mode de trajet et la vitesse de marche.
En mode `À pied`, l'extension essaie d'afficher un temps estimé avec cette vitesse.
Elle essaie aussi d'afficher la météo prévue à l'heure du rendez-vous pour le lieu de consultation.
La carte contient aussi des actions pour copier l'adresse, voir l'entrée sur Google Maps et créer un événement Google Calendar.

Le popup de l'extension affiche les RDV à venir détectés lors de la consultation de la page Doctolib. Cliquer sur un RDV ouvre la page Doctolib dans un nouvel onglet. Aucun identifiant Doctolib n'est stocké.

## Tests

```bash
node tests/unit.js
node tests/smoke.js
```
