# PLAN_PREPARATOIRE_DE_DEVELOPPEMENT

**But :** ordre de réalisation proposé à partir du cahier des charges du 8 novembre 2026 et de l’état statique du dépôt. Ce plan ne modifie rien et ne constitue pas une autorisation de coder, manipuler des données, exécuter des migrations ou déployer.

## Principes directeurs

1. Sauvegarder et comprendre les données réelles avant de toucher à leur stockage.
2. Construire une fondation locale fiable avant les modules financiers.
3. Conserver les identifiants et historiques; toute conversion est prévisualisée, vérifiable et réversible.
4. Séparer « code présent », « comportement testé » et « prêt au lancement ».
5. La cible Cloudflare/SaaS reste une décision ultérieure; le lancement validé est mono-appareil et hors ligne.
6. Les modifications, scripts d’import/migration et déploiements ne commencent qu’après validation explicite de ce plan et des étapes de données.

## Phases et dépendances

### Étape 0 — Protéger et inventorier les sources de données

- **Objectif :** établir une copie de référence indépendante pour chaque appareil/source et conserver séparément la sauvegarde locale et celle de production du 3 novembre.
- **Prérequis :** accès contrôlé par le propriétaire aux appareils et aux deux fichiers historiques; inventaire des emplacements explicitement autorisés.
- **Fichiers concernés :** `js/students.js` (`cap-savoir-students-v1`, lignes 5–20); `js/attendance.js` (`cap-savoir-attendance-v1`, lignes 4–18); les deux sauvegardes lorsqu’elles seront fournies. Pas de modification de ces fichiers à cette étape.
- **Risques :** l’état navigateur n’est pas dans Git; deux sources peuvent diverger; lecture/écriture accidentelle ou fusion prématurée.
- **Critères d’acceptation :** chaque source identifiée, copie de référence conservée, taille/dates/empreinte consignées; aucune fusion, import ou normalisation; anomalies documentées.
- **Tests nécessaires :** vérifier les copies avec parsing non destructif; comparer les deux sauvegardes sur copies; confirmer que les originaux restent inchangés par empreintes avant/après.
- **Validation :** propriétaire confirme l’inventaire et la stratégie de conservation avant toute intervention sur données.

### Étape 1 — Spécifier les modèles métier et le stockage local

- **Objectif :** adopter un dictionnaire de données canonique pour élèves, responsables, niveaux/formations, groupes/affectations, séances/présences, tarifs/cycles, opérations financières, prospects, utilisateurs et paramètres.
- **Prérequis :** Étape 0; clarification des règles non couvertes (ex. politique de crédit, sens exact de « date d’inscription », séquence de reçus, départ de la trésorerie, fuseau, cycle de fin de mois).
- **Fichiers concernés :** modèle actuel `js/students.js`, `js/attendance.js`, `index.html`; schémas `migration/001_core.sql` à `005_security_sync.sql`; éventuelles décisions documentées. Aucun SQL appliqué.
- **Risques :** modèle relationnel et JSON divergent; mauvais choix obligerait conversions répétées.
- **Critères d’acceptation :** entités, champs, types, identifiants, dates, relations, archivage, règles d’immuabilité et versions documentés; compatibilité avec usage hors connexion décidée.
- **Tests nécessaires :** revue de modèle avec scénarios de changement de groupe, tarifs modifiés, archivage, séances historiques, paiements partiels et import de sauvegardes.
- **Validation :** validation métier du dictionnaire et de la stratégie de stockage avant code.

### Étape 2 — Fiabiliser lecture/écriture et sauvegardes/restaurations

- **Objectif :** traiter les données comme une source critique : stockage transactionnel local (IndexedDB cible à arbitrer), migrations locales contrôlées, sauvegarde complète vérifiable et restauration avec aperçu/rollback.
- **Prérequis :** Étapes 0–1; couverture exacte des données réelles connue.
- **Fichiers concernés :** remplaçants/adaptations futurs de `js/students.js` et `js/attendance.js`; logique d’export/restauration aujourd’hui dans `students.js` 267–388; `service-worker.js` seulement si besoin de cache lié à une version.
- **Risques :** écrasement de données illisibles, incompatibilité entre versions, restoration partielle, quota de navigateur, double clé non atomique.
- **Critères d’acceptation :** lecture corrompue bloque toute écriture; sauvegarde comprend tous domaines explicitement listés; version et empreinte vérifiées; sauvegarde préalable automatiquement confirmée; restauration atomique; version remplacée conservée; retour arrière documenté.
- **Tests nécessaires :** export-import sans perte sur copie, données invalides/tronquées/version inconnue, doublons/références cassées, quota, arrêt pendant restauration, redémarrage et reprise hors ligne.
- **Validation :** rapport de comparaison et restauration sur copies approuvé avant reprise de données réelles.

### Étape 3 — Gestion scolaire (élèves, niveaux, groupes, affectations)

- **Objectif :** compléter le module déjà présent en réutilisant le formulaire, fiche, archivage, affichage actifs/archives et identifiants au lieu de reconstruire sans analyse.
- **Prérequis :** Étapes 1–2; tarification et niveaux validés; règles de responsables légaux.
- **Fichiers concernés :** `index.html` 31–93; `js/students.js` 23–265; `css/style.css`; futur stockage local canonique; schéma `migration/002_school.sql`.
- **Risques :** écrasement du groupe courant, perte d’historique lors d’édition ou d’archivage; régression des fonctions actuelles.
- **Critères d’acceptation :** groupes/niveaux configurables, horaires, affectations à effet daté, changement non destructif; fiche distingue inscription et début de prise en charge; archives gardent historiques; champs tarif/parent selon règles validées.
- **Tests nécessaires :** créer/éditer/archiver/restaurer/consulter; affecter puis changer groupe; vérifier historique aux dates avant/après; navigation téléphone/ordinateur.
- **Validation :** responsable métier vérifie les dossiers et les historiques sur jeu de test avant reprise réelle.

### Étape 4 — Présences et historique de séance

- **Objectif :** étendre le module déjà présent aux séances prévues/réalisées/annulées avec heure, groupe et participants figés à la séance.
- **Prérequis :** Étape 3; décision sur récurrence et horaires des groupes.
- **Fichiers concernés :** `js/attendance.js` 38–404; `index.html` section `attendance-section`; schéma `migration/002_school.sql` tables `sessions`/`attendance_records`; stockage canonique.
- **Risques :** correction écrase ancienne valeur; listes historiques se basent sur groupe courant; calcul de présence incorrect si séances annulées incluses.
- **Critères d’acceptation :** correction garde avant/après, auteur, date, motif; taux basé uniquement séances réalisées; aucune réalisée affiche « Non disponible »; absence ne modifie pas facture.
- **Tests nécessaires :** les quatre statuts élève, séance annulée, séance réalisée, aucune séance réalisée, correction, changement de groupe, archivage, hors ligne.
- **Validation :** règles de présence et dénominateur statistique signés par responsable métier.

### Étape 5 — Tarifs, cycles et facturation

- **Objectif :** créer des frais dus calculés par élève/période, conserver tarifs et factures historiques, couvrir tolérance et échéance.
- **Prérequis :** étapes 1–3; tarifs XOF et règles d’exception validés; règle des dates 29/30/31 et comptabilisation validée.
- **Fichiers concernés :** futur module facturation; `migration/001_core.sql` `tariff_versions`; `migration/002_school.sql` `enrolments`; `migration/003_billing.sql`; liens fiche et tableau de bord.
- **Risques :** charges rétroactives incorrectes, tarifs historiques écrasés, erreurs de dates/calendrier, réduction indue liée aux absences.
- **Critères d’acceptation :** périodes indépendantes; calcul fin de mois stable; frais inscription et exemptions explicites; snapshot du tarif dans charge/cycle; rappel à J-3 et tolérance de 15 jours selon règle approuvée.
- **Tests nécessaires :** dates d’entrée 28/29/30/31, février/année bissextile, frontière année, modification tarif, exemption, absence, période comptable basée sur fin de cycle.
- **Validation :** rapprochement de calculs sur exemples approuvés avant génération de vrais frais.

### Étape 6 — Paiements, affectations, reçus, annulations, remboursements et crédits

- **Objectif :** sécuriser la chaîne financière avant saisie de production, avec opérations append-only/compensatoires et idempotence.
- **Prérequis :** Étape 5; procédure validée pour reçu physique 009/010 et valeurs financières historiques; règles de crédit et remboursements précisées.
- **Fichiers concernés :** futurs modules financiers; `migration/004_finance.sql`; `migration/005_security_sync.sql` audit; reçus papier/digital.
- **Risques :** double encaissement, montant suralloué, reçu réutilisé, remboursement excessif, historique effacé.
- **Critères d’acceptation :** répétition même opération idempotente; allocation ≤ encaissement reçu et ≤ solde dû; reçu attribué une fois, annulé sans libérer numéro; motif obligatoire; remboursements limités au disponible; crédit unique et consommable une fois; reçu distingue date argent reçu/date saisie.
- **Tests nécessaires :** paiement complet/partiel/hors ligne/retry, double clic, allocation cumulée concurrente, reçus générés et annulés, trop-perçu, remboursement cumulé exact/dépassé, changement de tarif après paiement.
- **Validation :** responsable financier rapproche résultats aux reçus physiques et confirme séquence avant toute opération réelle.

### Étape 7 — Dépenses, autres recettes, trésorerie et rapports

- **Objectif :** calculer le cash effectivement reçu/payé et publier états vérifiables.
- **Prérequis :** Étape 6; définition solde initial et catégories; règles d’inclusion des remboursements et recettes validées.
- **Fichiers concernés :** futur module comptabilité/rapports; `migration/004_finance.sql`; futurs écrans de tableau de bord et export.
- **Risques :** factures impayées ou dépenses engagées traitées comme flux réels; confusion recettes/paiements d’élèves.
- **Critères d’acceptation :** trésorerie = initiale + encaissements réels − décaissements réels; remboursements retranchés quand payés; autres inflows séparés; rapports affichent facturé, reçu, dû, dépenses payées.
- **Tests nécessaires :** dépenses unpaid→paid, recette don, remboursement, période frontière, rapprochement calcul manuel et états PDF/XLSX/CSV.
- **Validation :** rapprochement métier signé, formats de rapport acceptés.

### Étape 8 — Prospects, tableau de bord et exports

- **Objectif :** compléter les fonctions de pilotage, conversion prospect sans ressaisie et rapports par dimension.
- **Prérequis :** modèles scolaires et financiers stables (étapes 3–7).
- **Fichiers concernés :** `index.html` tableau de bord actuel 23–26; export CSV actuel dans `js/students.js` 285–322; nouveau module prospects/rapports; styles.
- **Risques :** indicateurs fictifs, chiffres divergents des grands livres, injection de formule en CSV.
- **Critères d’acceptation :** indicateurs dérivés uniquement des enregistrements; prospects configurables et convertibles; PDF imprimable, XLSX véritable, CSV neutralisé; export filtré et auditable.
- **Tests nécessaires :** comparaison des chiffres au calcul manuel, conversion préservant coordonnées/historique, ouverture des fichiers avec caractères/formules malicieuses dans tableurs cibles.
- **Validation :** utilisateurs confirment les rapports et indicateurs.

### Étape 9 — Authentification, permissions, audit et protection

- **Objectif :** contrôler les opérations sensibles et protéger données et sauvegardes.
- **Prérequis :** choix formel architecture mono-appareil/serveur; périmètre de rôles; flux métier identifiés.
- **Fichiers concernés :** futur module auth/API; tables `users`, `device_sessions`, `audit_events`; intégration client à décider; aucune configuration serveur actuelle n’est fournie.
- **Risques :** rôle uniquement visuel, compte partagé, événements incomplets, exposition de données personnelles.
- **Critères d’acceptation :** autorisation vérifiée au point d’exécution; audit auteur/date/action/objet/avant-après/motif; secrets hors dépôt; erreurs sans données sensibles; sauvegardes protégées.
- **Tests nécessaires :** matrice rôle×action, session expirée/révoquée, accès refusé côté serveur, audit de chaque opération sensible, revue d’injection et protection des exports.
- **Validation :** revue sécurité et métier approuvée avant utilisation opérationnelle.

### Étape 10 — Comparer les historiques, reprendre et valider le lancement

- **Objectif :** rapprocher sans fusion automatique les deux ensembles du 3 novembre, puis décider d’une reprise contrôlée.
- **Prérequis :** étapes 0–9 prêtes et testées; fichiers originaux disponibles; procédure et environnement de test validés.
- **Fichiers concernés :** fichiers de sauvegarde explicitement fournis, rapports de différence, scripts d’import temporairement proposés ultérieurement (aucun n’existe à ce stade).
- **Risques :** doublons, valeur contradictoire, perte d’identifiants, écrasement d’un historique, montant reçu mal reporté.
- **Critères d’acceptation :** comparaison documentée par entité; écarts résolus explicitement; totaux sources et cible réconciliés; sauvegarde restaurable avant/après; aucune fusion implicite.
- **Tests nécessaires :** dry-run sur copies, rapport d’import, contrôle de comptages et sommes, restauration de backup, tests hors ligne/redémarrage sur appareil de test.
- **Validation :** approbation écrite de la stratégie et des écarts par propriétaire et responsable financier avant import réelle.

### Étape 11 — Architecture multi-appareil/SaaS et déploiement éventuel

- **Objectif :** étudier synchronisation, Worker, D1/R2 et déploiement comme évolution séparée du lancement local.
- **Prérequis :** fonctionnement local éprouvé, modèle stable, besoin multi-appareil confirmé, sécurité et conflits spécifiés.
- **Fichiers concernés :** aucun fichier Worker/configuration visible actuellement; `migration/005_security_sync.sql` est un schéma seulement.
- **Risques :** divergence locale/distante, doublons d’opérations financières, divulgation de secrets, impact de production.
- **Critères d’acceptation :** architecture et stratégie de conflits documentées; idempotence, contrôle d’accès serveur, sauvegarde/retour arrière; environnements distincts.
- **Tests nécessaires :** coupure/reprise sync, conflit, retry, authentification et autorisations, restauration, test préproduction puis vérification post-déploiement.
- **Validation :** autorisation explicite distincte pour accès Cloudflare et chaque déploiement; aucune action production dans les étapes précédentes.

## Dépendances transversales

- **Données :** copie de référence et formats connus avant modification de stockage.
- **Métier :** cycle, seuils, recibos, crédit, trésorerie, corrections et rôles doivent être déterminés par CAP SAVOIR.
- **Technique :** choix du stockage local; schéma cohérent entre interface et SQL; sauvegarde/versionnement; opérations financières atomiques et idempotentes.
- **Validation :** tests avec copies/données synthétiques clairement distinguées des données réelles; tests documentés; revue métier avant import.
- **Production :** aucun accès, migration ou déploiement sans autorisation explicite ultérieure.

## État préparatoire actuel

- Le formulaire/listing/archivage d’élèves, présence simple, export CSV/JSON et shell PWA existent en code et sont à préserver/évaluer.
- Les migrations 001–005 sont présentes localement mais non suivies par Git; aucun dossier `migrations/` ni `006_integrity.sql` n’a été trouvé.
- Aucune fonction n’a été exécutée dans le cadre de cet audit approfondi; tests à planifier avant de qualifier une étape de fonctionnelle.
- La mission ne lance aucune étape de développement : chaque changement attend la validation explicite des rapports et du périmètre.
