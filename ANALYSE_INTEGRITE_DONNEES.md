# ANALYSE_INTEGRITE_DONNEES

**Portée :** analyse des formats définis par le code du dépôt au 8 novembre 2026. Aucun navigateur n’a été inspecté et aucune valeur réelle de `localStorage` n’a été lue ou modifiée. Les exemples ci-dessous décrivent les objets produits par le code; ce ne sont pas des données réelles.

## 1. Résumé des constats

- Deux clés locales sont utilisées : `cap-savoir-students-v1` et `cap-savoir-attendance-v1`.
- Les objets sont stockés comme tableaux JSON non versionnés individuellement, séparément et sans transaction commune.
- Les groupes n’ont pas de structure dédiée côté application : leur nom est recopié comme texte dans les élèves et séances.
- Les sauvegardes JSON ont un champ global `version: 2`, mais ne couvrent que les élèves et présences; la restauration ne restaure que les élèves.
- Les erreurs de lecture localStorage sont converties en tableaux vides. Une sauvegarde ultérieure de ce tableau peut écraser la valeur devenue illisible.
- Aucun contrôle applicatif de cohérence inter-objets, migration de format, empreinte d’intégrité ou restauration atomique n’a été trouvé.

## 2. Clés de stockage observées

| Clé | Propriétaire | Lecture/écriture | Données attendues |
|---|---|---|---|
| `cap-savoir-students-v1` | `StudentManager` | `getAll()` lit; `saveAll()` remplace toute la valeur | Tableau d’élèves JSON |
| `cap-savoir-attendance-v1` | `AttendanceManager` | `getAll()` lit; `saveAll()` remplace toute la valeur | Tableau de séances JSON |

Preuves : [js/students.js](js/students.js#L5), #L9–20 ; [js/attendance.js](js/attendance.js#L4), #L7–18. Le contenu dépend du profil/origine du navigateur et n’est pas présent dans le dépôt. Aucun accès aux clés dans un navigateur n’a été effectué.

## 3. Structures d’objets dérivées du code

### 3.1 Élève

Forme créée dans `StudentManager.add()` ([js/students.js](js/students.js#L23-L40)) :

```json
{
  "id": "UUID généré par crypto.randomUUID()",
  "name": "texte saisi; nom complet",
  "level": "texte choisi dans la liste",
  "parent": "texte, chaîne vide permise",
  "phone": "texte, chaîne vide permise",
  "group": "Groupe 1 ou Groupe 2 dans le formulaire actuel",
  "startDate": "date HTML, normalement YYYY-MM-DD",
  "createdAt": "date ISO produite par new Date().toISOString()",
  "archived": false,
  "archivedAt": null
}
```

`update()` remplace les champs descriptifs tout en conservant les autres propriétés via spread ([js/students.js](js/students.js#L42-L60)). Il n’ajoute pas d’événement d’historique et ne modifie pas `createdAt`. `setArchived()` fixe `archivedAt` à l’instant courant ou le remet à `null` en cas de restauration ([js/students.js](js/students.js#L62-L74)); ainsi, la date d’un archivage antérieur n’est pas conservée après restauration puis nouvel archivage.

Champs absents par rapport au cahier : prénom/nom séparés, date d’inscription séparée, ID du niveau/groupe, tarif appliqué, responsables multiples/coordonnées détaillées, source/prospect, historique d’événements. Les champs requis dans le formulaire sont nom, niveau, groupe, date de début; parent/téléphone sont facultatifs ([index.html](index.html#L31-L65)).

### 3.2 Groupe

Il n’existe pas d’objet groupe dans JavaScript. Le formulaire contraint le groupe à deux chaînes fixes ([index.html](index.html#L55-L60)); `StudentManager` sauvegarde ce libellé directement dans `student.group`. Les séances reprennent aussi le libellé texte (`record.group`, [js/attendance.js](js/attendance.js#L312-L319)). Pas d’identifiant, horaires, actif/inactif, affectations avec dates d’effet ni table locale. Le schéma SQL a une entité groupe et des affectations distinctes, sans lien actif avec ce modèle navigateur (`migration/002_school.sql` #L60–85).

### 3.3 Présence / séance

Forme assemblée dans `AttendanceManager.save()` ([js/attendance.js](js/attendance.js#L271-L335)) :

```json
{
  "id": "UUID ou ID de séance précédente",
  "date": "YYYY-MM-DD",
  "group": "libellé texte du groupe",
  "entries": [
    {
      "studentId": "UUID élève",
      "studentName": "copie du nom au moment de l'enregistrement",
      "status": "present | absent | late | excused",
      "reason": "code de motif ou chaîne vide"
    }
  ],
  "createdAt": "date ISO",
  "updatedAt": "date ISO"
}
```

Les motifs sont `illness`, `travel`, `family`, `appointment`, `other`, `undisclosed`, ou vide ([js/attendance.js](js/attendance.js#L213-L232)). Il n’y a pas d’heure ni de statut séance dans l’objet. `save()` conserve les anciennes entrées non affichées puis écrase celles des élèves visibles; les noms historiques sont copiés pour préserver une étiquette si l’élève change de groupe/archive ([js/attendance.js](js/attendance.js#L278-L307)). Cette logique est en code mais non testée.

### 3.4 Sauvegarde JSON

`exportBackup()` ([js/students.js](js/students.js#L267-L283)) crée un objet global de la forme :

```json
{
  "application": "CAP SAVOIR MANAGER",
  "version": 2,
  "exportedAt": "date ISO",
  "students": [],
  "attendance": []
}
```

Il ne contient pas groupes distincts, affectations, facturation, paiements, reçus, remboursements, crédits, dépenses, recettes, prospects ou paramètres. Ces domaines n’ont pas d’implémentation locale dans le dépôt.

### 3.5 Restauration

`restoreBackup(file)` lit le fichier, fait `JSON.parse`, exige `application` et un tableau `students`, puis valide quelques propriétés des élèves : id/name/level/parent/phone/group/startDate chaînes et `archived` booléen, ainsi que l’unicité des ID d’élève ([js/students.js](js/students.js#L339-L388)).

Constats précis :

- La propriété globale `version` n’est pas vérifiée; `exportedAt`, `createdAt`, `archivedAt` non plus.
- `attendance` n’est ni exigé, ni validé, ni écrit. Une restauration du JSON produit par l’application remplace les élèves mais laisse les présences existantes locales en place, ce qui peut associer des présences à une autre liste d’élèves.
- Le fichier peut être partiellement valide; la validation ne vérifie pas niveau/groupe contre des référentiels, dates calendaires, statut de présence, unicité de séance, présence des étudiants référencés, champs supplémentaires ou longueur maximale.
- La confirmation demande si une sauvegarde actuelle a été téléchargée, mais le code n’en crée pas et n’en vérifie pas l’existence.
- Après confirmation, `saveAll(backup.students)` remplace la clé étudiants directement, sans snapshot, transaction entre deux clés ni rollback.
- Le gestionnaire d’erreur affiche un message général; une erreur de quota à la sauvegarde peut laisser l’ancien stockage intact (localStorage.setItem est atomique pour une valeur donnée dans le navigateur, mais ce comportement n’est pas testé), tandis que les présences demeurent une version indépendante.
- `render()` relit la clé et `attendance` n’est pas rechargé ni `populateGroups()` appelé; l’interface peut rester incohérente après restauration.

## 4. Identifiants, dates, champs et doublons

### Identifiants

- Les ID d’élèves et nouvelles séances sont `crypto.randomUUID()` ([students.js](js/students.js#L27), [attendance.js](js/attendance.js#L313)). Pas de fallback/validation fonctionnelle du contexte navigateur.
- L’export ne vérifie que l’unicité des ID élèves; aucun ID de séance ou `studentId` d’entrée n’est contrôlé à la restauration.
- Le schéma SQL définit des clés primaires et certaines contraintes uniques, mais aucun mapping UUID navigateur → entités relationnelles n’est fourni.
- Pour les paiements, un ID unique évite uniquement une collision d’ID, pas une répétition d’une opération reçue hors ligne avec un nouvel ID.

### Dates

- `startDate` et la date de séance proviennent d’inputs HTML de type date; les événements de création/modification sont ISO UTC.
- Date d’archivage écrasée à chaque archivage; la date d’inscription n’est pas représentée séparément.
- Aucun contrôle de validité calendrier ou cohérence entre dates d’effet n’est exécuté à la restauration.
- Le SQL conserve des dates sous texte sans vérifier un format canonique par CHECK; les dates 29/30/31 ne sont pas calculées dans l’application.

### Doublons et relations

- Aucun contrôle de doublon de personne (même nom/téléphone) ni de doublon sémantique de séance n’est effectué à l’import.
- La présence d’une séance est repérée par égalité texte `(date, group)` lors de `loadStudents`/`save` ([attendance.js](js/attendance.js#L135-L137), #L274-L276); pas de contrainte de date/groupe au stockage ni détection de doublons déjà présents.
- Le groupe étant un libellé texte, renommer un groupe ne met pas à jour les historiques et la variation d’espaces/accents peut créer plusieurs groupes logiques.
- Les enregistrements de présence peuvent faire référence à des étudiants qui n’existent plus; le rendu prévoit « Élève inconnu » ([attendance.js](js/attendance.js#L158-L169)). Ceci évite un crash d’affichage mais ne résout pas l’intégrité.

## 5. Risques de perte et d’altération

| Niveau | Cause et scénario | Conséquence | Protection à prévoir |
|---|---|---|---|
| CRITIQUE | `getAll()` transforme une erreur de parse/lecture en `[]`; utilisateur ajoute ensuite un élève ou enregistre une présence | Le tableau vide retourné est sauvegardé via `saveAll`, remplaçant potentiellement les données illisibles | Distinguer état absent/valide/corrompu; bloquer écriture en erreur; conserver copie brute diagnostique sans exposer données |
| CRITIQUE | Restauration remplace la liste des élèves et ignore attendance | Perte de la liste précédente; désalignement entre présence et fiches; perte d’historique si les références ne retrouvent plus personne | Sauvegarde préalable vérifiée, aperçu différentiel, validation exhaustive, transaction atomique et procédure de retour |
| CRITIQUE | Seules deux clés sont exportées | « Sauvegarde complète » ne permet pas de reprendre le système demandé | Manifeste versionné couvrant explicitement toutes les entités et contrôle d’exhaustivité |
| ÉLEVÉ | Deux clés écrites séparément et sans horodatage de snapshot partagé | Export peut agréger des états pris à des moments différents si écriture simultanée/concurrente ou restauration partielle | Snapshot cohérent, format atomique unique ou mécanisme transactionnel IndexedDB |
| ÉLEVÉ | localStorage uniquement lié à l’origine/profil/appareil et sans sauvegarde automatique | Effacement du navigateur/profil, changement appareil ou panne peut rendre les données inaccessibles | Export régulier vérifié et stockage local structuré/backup externe après politique approuvée |
| ÉLEVÉ | Edition groupe modifie la valeur actuelle d’élève | Perte d’historique d’affectation; présence passée rechargée avec liste actuelle plus anciennes entrées uniquement | Affectations datées et figées à chaque séance |
| ÉLEVÉ | `archivedAt` remis à null sur restauration | L’historique des cycles d’archivage est perdu | Historiser les événements d’archivage au lieu d’un seul champ d’état |
| ÉLEVÉ | Validation restore partielle, ID attendance et dates non vérifiés | Données corrompues ou incohérentes acceptées; références orphelines | Schéma de validation versionné pour chaque entité et vérification des références avant écriture |
| MOYEN | CSV quote les champs mais ne neutralise pas préfixes de formule | Tableur peut interpréter une valeur utilisateur comme formule | Neutralisation des cellules dangereuses et tests dans tableurs cibles |
| MOYEN | Export JSON contient nom/téléphone en clair | Perte/confusion d’un fichier expose données personnelles | Accès restreint, chiffrement/gestion du secret et durée de conservation décidés avant usage |

## 6. Stratégie de protection recommandée (sans exécution)

1. **Inventorier par appareil/origine** : relever les clés, tailles, date de capture et empreinte des exports fournis, sans vider ni réécrire le navigateur. Distinguer données appareil, sauvegarde locale et sauvegarde production.
2. **Créer des copies de travail** : conserver les originaux en lecture seule et calculer leurs empreintes; comparer sans fusion automatique.
3. **Spécifier les formats** : schéma versionné incluant tous les domaines, règles de compatibilité, migrations de données non destructives et identifiants stables.
4. **Valider avant d’écrire** : parse, version supportée, champs requis, unicité, références, formats de date, contraintes métier et checksum. Afficher compteurs/anomalies et prévoir refus propre.
5. **Sauvegarder avant restauration** : créer et vérifier un snapshot des données courantes; exiger confirmation explicite; écrire atomiquement; conserver la version remplacée et fournir un rollback.
6. **Ne jamais convertir les erreurs en base vide** : protéger contre toute sauvegarde lorsque la lecture/validation échoue.
7. **Tester sur copies** : backup → contrôle d’intégrité → restauration vers instance isolée → comparaison des entités et historiques; provoquer fichiers tronqués, versions inconnues, doublons et coupures.

Ces recommandations ne constituent pas une autorisation de manipuler les données. Aucune donnée locale ou sauvegarde originale n’a été consultée pendant cette mission.
