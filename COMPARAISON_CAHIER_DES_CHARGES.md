# COMPARAISON_CAHIER_DES_CHARGES

**Référence examinée :** Cahier des charges fonctionnel et technique consolidé du 8 novembre 2026
**Dépôt examiné :** CAP SAVOIR MANAGER, état local au moment de l’audit
**Mode d’examen :** inspection statique en lecture seule. Aucune fonctionnalité n’a été exécutée, aucune migration lancée, aucune donnée ni aucun fichier existant modifié. Ce rapport est le seul nouveau fichier produit.

## 1. Synthèse

Le dépôt est actuellement une PWA statique avec gestion locale de fiches élèves et de présence. Il ne constitue pas encore le système scolaire et financier décrit par le cahier des charges. Les migrations SQL prévoient une grande partie du modèle cible, mais elles ne sont ni appelées par l’application ni suivies par Git dans l’état observé.

Les fonctions visibles dans le code n’ont pas été testées dans un navigateur. Par conséquent, **aucune fonction ne peut être déclarée « déjà implémentée et vérifiée » au sens d’un test d’exécution**. Les étiquettes « présente mais incomplète » ci-dessous signifient qu’un code correspondant a été repéré, sans confirmation de fonctionnement à l’exécution.

Risques à traiter avant tout usage opérationnel :

1. Données élèves et présences stockées uniquement dans `localStorage`, avec risque de perte ou de corruption.
2. Restauration JSON partielle : elle restaure les élèves, mais pas les présences pourtant incluses dans l’export.
3. Aucune gestion effective des paiements, reçus, dépenses, facturation, droits d’accès ou historique d’audit dans l’application.
4. Migrations 001 à 005 présentes sur disque mais non suivies par Git ; aucune `006_integrity.sql`.
5. Les sauvegardes de production et locale du 3 novembre 2026, les données de production, l’URL Worker et la configuration Cloudflare n’ont pas été fournies ni consultées ; leur état reste à vérifier.

## 2. Légende des statuts

- **Déjà implémentée et vérifiée** : fonctionnalité exécutée et résultat observé. Aucun cas ne répond à ce niveau dans cet audit.
- **Présente mais incomplète** : code ou schéma correspondant repéré, mais couverture partielle ou dépendance manquante.
- **Absente** : aucun code ou schéma pertinent repéré dans les fichiers examinés.
- **À vérifier** : preuve insuffisante sans données, environnement, décision métier ou exécution contrôlée.

## 3. Comparaison par exigences

| Exigence | Statut | Preuves et écarts |
|---|---|---|
| Interface en français, devise XOF et contexte CAP SAVOIR | Présente mais incomplète | [index.html](index.html#L3) définit `lang="fr"`, le titre et l’interface ; [001_core.sql](migration/001_core.sql#L8) prévoit XOF et le fuseau Africa/Abidjan. La devise et les paramètres ne sont pas utilisés par une logique applicative. L’adresse de Yopougon n’est pas présente. |
| PWA installable, utilisation téléphone et ordinateur | Présente mais incomplète | [manifest.json](manifest.json#L3) et [service-worker.js](service-worker.js#L6) déclarent une PWA et un cache. Aucun test d’installation, d’affichage ou de fonctionnement sur appareils n’a été exécuté. La feuille de style contient des règles responsives ([style.css](css/style.css#L1)), mais l’ergonomie mobile n’a pas été validée. |
| Tableau de bord avec indicateurs calculés | Présente mais incomplète | [index.html](index.html#L23) affiche un titre et un message de bienvenue uniquement. Pas de calcul d’indicateurs, de montants, de trésorerie ou de prospects repéré. |
| Ajouter, consulter et modifier les élèves | Présente mais incomplète | Formulaire et liste dans [index.html](index.html#L31), fonctions `add`, `update`, `render`, `showDetails` et `edit` dans [students.js](js/students.js#L23). Données enregistrées localement ; pas de test navigateur. Le nom et prénom ne sont pas séparés, le tarif et les coordonnées complètes du responsable ne sont pas gérés. |
| Identifiant unique, date d’inscription, date de prise en charge, tarif et historique de l’élève | Présente mais incomplète | [students.js](js/students.js#L26) génère un UUID et conserve `startDate` et `createdAt`. Pas de date d’inscription distincte, de tarif affecté ni d’historique métier. Le dialogue indique explicitement que les historiques de présence et paiement viendront ultérieurement ([students.js](js/students.js#L222)). |
| Archiver sans supprimer les données liées et consulter les archives | Présente mais incomplète | Archivage/restauration par booléen et affichage des archives dans [students.js](js/students.js#L62) et [students.js](js/students.js#L89). Le schéma SQL relie étudiants et historiques ([002_school.sql](migration/002_school.sql#L1), #L88, #L106), mais l’application n’utilise pas ce schéma ; la conservation des historiques liées n’est donc pas démontrée en bout en bout. |
| Groupes configurables, horaires et affectations datées | Présente mais incomplète | L’interface propose seulement « Groupe 1 » et « Groupe 2 » comme valeurs codées en dur ([index.html](index.html#L55)). Le SQL prévoit groupes et affectations avec dates ([002_school.sql](migration/002_school.sql#L60), #L70), mais aucun écran de gestion, horaire, changement daté ou liaison au modèle SQL n’est présent. |
| Niveaux configurables CP1–4e | Présente mais incomplète | Niveaux listés statiquement dans [index.html](index.html#L35). Le SQL prévoit `levels` ([001_core.sql](migration/001_core.sql#L17)), sans gestion de niveaux dans l’interface. |
| Tarifs 5 000 / 10 000 XOF, inscription 2 000 XOF, exemption et historique des tarifs | Présente mais incomplète | `tariff_versions` et montants par défaut sont prévus dans [001_core.sql](migration/001_core.sql#L25). Inscription et exemption sont prévues dans [002_school.sql](migration/002_school.sql#L42). Aucun tarif n’est proposé ou calculé par l’application et aucune facture historique n’est produite. |
| Séances prévues, réalisées, annulées et statuts de présence | Présente mais incomplète | L’interface de présence gère date, groupe et statuts présent/absent/retard/excusé dans [attendance.js](js/attendance.js#L38) et [attendance.js](js/attendance.js#L193). Elle ne gère pas le statut de séance, l’heure ni les élèves planifiés indépendamment des élèves présents/anciens. Le SQL prévoit les statuts de séance ([002_school.sql](migration/002_school.sql#L88)), sans implémentation UI. |
| Taux de présence calculé uniquement sur les séances réalisées, « Non disponible » si aucune | Absente | [attendance.js](js/attendance.js#L338) affiche des nombres bruts par statut ; aucun taux, statut de séance ou libellé « Non disponible » n’est calculé. |
| Correction de présence traçable ; absence sans réduction automatique des frais | Présente mais incomplète | Les présences peuvent être réenregistrées ([attendance.js](js/attendance.js#L248)), mais aucune trace avant/après, auteur ou motif de correction n’est enregistrée par l’application. Aucun lien avec une facturation n’existe, donc la règle d’absence n’est pas modélisée. `audit_events` existe seulement dans le SQL ([005_security_sync.sql](migration/005_security_sync.sql#L15)). |
| Cycles individuels, ancrage des jours 29–31, période comptable par date de fin, tolérance et rappel | Présente mais incomplète | Le schéma `billing_cycles` contient dates, montant, période comptable et unicité élève/début ([003_billing.sql](migration/003_billing.sql#L1)). Aucun calcul de cycle, tolérance de 15 jours ou rappel n’apparaît dans l’application ou les migrations examinées. |
| Paiements complets/partiels, modes, dates de réception et saisie, statut, auteur et fonctionnement hors ligne | Présente mais incomplète | Le SQL contient `payments`, montant, mode, `received_at`, `created_at`, statut de collecte et auteur ([004_finance.sql](migration/004_finance.sql#L1)). `payment_allocations` permet des affectations ([004_finance.sql](migration/004_finance.sql#L24)). Aucune interface, logique hors ligne financière, prévention applicative des doublons ou gestion des références n’est présente. La distinction des dates est partiellement représentée par le schéma, pas appliquée dans un flux utilisateur. |
| États payé / partiellement payé / en retard et soldes calculés par montants affectés | Présente mais incomplète | Le SQL contient frais et allocations ([003_billing.sql](migration/003_billing.sql#L22), [004_finance.sql](migration/004_finance.sql#L24)), mais pas de calcul de solde ou d’état dans l’application. La contrainte ne garantit pas à elle seule que la somme allouée ne dépasse pas le paiement ou les frais. |
| Reçus uniques permanents, impression, historique, prochain numéro 010 après vérification physique | Présente mais incomplète | `paper_receipts` prévoit une référence numérique, une référence digitale unique et une unicité conditionnelle du numéro physique ([004_finance.sql](migration/004_finance.sql#L38)). Pas de génération, interface, impression, compteur, reprise du numéro 009 ni preuve du cahier physique. Le prochain numéro 010 est donc **à vérifier** avant toute mise en place. |
| Annulations, corrections, remboursements et crédits sans suppression définitive | Présente mais incomplète | Le SQL prévoit remboursements ([004_finance.sql](migration/004_finance.sql#L59)) et événements d’audit ([005_security_sync.sql](migration/005_security_sync.sql#L15)), mais ne montre pas de modèle de crédit dédié ni de flux d’annulation/correction dans l’application. Aucun motif obligatoire ou contrainte empêchant un remboursement supérieur au disponible n’est implémenté dans le code. |
| Dépenses, catégories, justificatifs et consultation par période | Présente mais incomplète | `expenses` contient description, montant, date, bénéficiaire, mode, état et notes ([004_finance.sql](migration/004_finance.sql#L79)). Pas de catégorie ni de référence/justificatif explicite, écran, filtre ou calcul de décaissement réel dans l’application. |
| Autres recettes séparées des paiements scolaires | Présente mais incomplète | `other_inflows` existe dans [004_finance.sql](migration/004_finance.sql#L106). Pas de catégorie dédiée, interface ou rapport ; aucune confusion n’est encore possible dans l’UI actuelle puisqu’elle ne traite aucune recette. |
| Trésorerie réelle et rapports distinguant facturé, reçu, dû, dépenses payées et remboursements réalisés | Absente | Aucun calcul financier, état de trésorerie ou rapport repéré dans [index.html](index.html), [students.js](js/students.js) ou [attendance.js](js/attendance.js). Les tables SQL ne constituent pas une logique comptable exécutée. |
| Prospects, suivi de contact et conversion en élève | Absente | Aucune table, interface ou logique prospect repérée dans les fichiers du dépôt. |
| Sauvegarde JSON complète des domaines requis | Présente mais incomplète | [students.js](js/students.js#L267) exporte uniquement `students` et `attendance`; groupes, affectations, cycles, paiements, reçus, remboursements, crédits, dépenses, recettes et paramètres ne sont pas exportés par l’application. |
| Intégrité, versions antérieures, restauration contrôlée et sauvegarde préalable | Présente mais incomplète | L’export a un champ `version: 2`; la restauration valide quelques champs élèves, confirme le remplacement et ne vérifie ni empreinte ni intégrité globale ([students.js](js/students.js#L267), #L339). Elle ne force pas de sauvegarde préalable, ne restaure pas les présences, n’archive pas la version antérieure et ne vérifie pas toutes les données métier. |
| Stockage local durable, mode hors ligne et synchronisation future | Présente mais incomplète | `localStorage` est utilisé par [students.js](js/students.js#L9) et [attendance.js](js/attendance.js#L7) ; le cache PWA est défini dans [service-worker.js](service-worker.js#L6). Aucun usage d’IndexedDB, stratégie de synchronisation ou test de redémarrage/hors connexion n’est présent. `getAll()` masque une erreur de lecture par un tableau vide (students.js #L9–16 ; attendance.js #L7–14), risque d’écrasement si un enregistrement suit une lecture corrompue. |
| PWA adaptée au mobile et ordinateur | Présente mais incomplète | Manifest, viewport et styles responsive existent ([index.html](index.html#L5), [manifest.json](manifest.json#L7), [style.css](css/style.css#L1)). Pas de contrôle d’accessibilité, test tactile, tailles d’écran, contraste ou scénario d’installation. Les couleurs demandées sont partiellement présentes dans CSS ; conformité complète non testée. |
| Contrôle d’accès, rôles, sessions et autorisations côté serveur | Présente mais incomplète | Le SQL prévoit les rôles `admin`, `finance`, `teacher` et sessions appareils ([001_core.sql](migration/001_core.sql#L44), [005_security_sync.sql](migration/005_security_sync.sql#L1)). L’application n’a ni écran d’authentification, ni API, ni contrôle d’accès. Aucune preuve de serveur ou configuration Cloudflare n’est dans le dépôt. |
| Validation, protection contre injections et erreurs sans exposition sensible | Présente mais incomplète | Le formulaire utilise des contraintes HTML et du texte via `textContent` ([index.html](index.html#L31), [students.js](js/students.js#L121)). La section de présence construit un gabarit HTML statique ([attendance.js](js/attendance.js#L42)). Pas de validation métier complète ni tests de sécurité. Données personnelles conservées en clair dans localStorage et export JSON. |
| Historique des opérations avec auteur/date/avant-après | Présente mais incomplète | Table `audit_events` avec valeurs avant/après, action, raison et date dans [005_security_sync.sql](migration/005_security_sync.sql#L15). Aucun enregistrement d’événement par l’application ; aucun auteur connecté. |
| Exports PDF, vrai XLSX, CSV sans injection de formules | Présente mais incomplète | Export CSV seulement ([index.html](index.html#L76), [students.js](js/students.js#L285)). Aucun échappement spécifique contre les formules commençant par `=`, `+`, `-`, `@` ; il protège seulement les guillemets CSV. Aucun PDF ni XLSX. |
| Reprise des sauvegardes production et locale du 3 novembre, comparaison sans fusion automatique | À vérifier | Aucun des deux fichiers de sauvegarde n’est présent dans l’inventaire du dépôt. Aucune donnée n’a été ouverte ni fusionnée. Leur emplacement, intégrité, différences et sauvegarde préalable restent à examiner séparément après fourniture/validation. |
| Tests fonctionnels documentés | Absente | Aucun dossier ou outil de tests n’est présent dans l’inventaire. Aucun test n’a été exécuté pendant cette comparaison ; aucun résultat ne peut être déclaré réussi. |
| Déploiement, Worker, D1, R2, environnement et secrets | À vérifier | Aucun code Worker, configuration D1/R2, URL, secret ou pipeline de déploiement n’est repéré dans les fichiers visibles. L’URL Worker existante mentionnée par le cahier et les paramètres Cloudflare n’ont pas été consultés. Il ne faut pas conclure qu’ils sont absents de l’infrastructure externe. |

## 4. Fonctionnalités existantes à préserver

Ces fonctions et éléments sont déjà présents dans le dépôt ; ils doivent être évalués et réutilisés avant toute reconstruction. Leur exécution n’a pas été testée.

| Élément à préserver | Preuve |
|---|---|
| Formulaire élève : nom, niveau, responsable, téléphone, groupe et date de début | [index.html](index.html#L31) |
| Création UUID, édition et archivage/restauration sans suppression explicite | [students.js](js/students.js#L23), #L42, #L62, #L242 |
| Affichage actif/archivé, fiche détaillée et export CSV | [students.js](js/students.js#L89), #L185, #L285 |
| Export JSON et confirmation avant remplacement des fiches lors d’une restauration | [students.js](js/students.js#L267), #L339 |
| Saisie, réédition et historique sommaire des présences | [attendance.js](js/attendance.js#L119), #L248, #L338 |
| PWA et cache de ressources | [manifest.json](manifest.json), [service-worker.js](service-worker.js) |
| Modèle SQL prévu pour école, cycles, finance, reçus, sessions, audit, synchronisation et sauvegardes | `migration/001_core.sql` à `migration/005_security_sync.sql` |

Les données actuellement contenues dans les navigateurs ne sont pas visibles dans le dépôt et ne sont pas couvertes par le rapport. Ne pas réinitialiser le stockage local, changer les clés de stockage ou remplacer le format de sauvegarde avant inventaire et copie vérifiée des appareils concernés.

## 5. État et cohérence des migrations SQL

### Inventaire

| Script trouvé sur disque | Domaine déclaré par son contenu |
|---|---|
| `migration/001_core.sql` | Réglages, niveaux, tarifs, utilisateurs |
| `migration/002_school.sql` | Élèves, responsables, inscriptions, groupes, affectations, séances, présence |
| `migration/003_billing.sql` | Cycles, frais, ajustements |
| `migration/004_finance.sql` | Paiements, allocations, reçus, remboursements, dépenses, autres recettes |
| `migration/005_security_sync.sql` | Sessions, audit, synchronisation, conflits, sauvegardes |
| `006_integrity.sql` | **Absent** |

Il n’existe pas de dossier `migrations/` dans le dépôt examiné. `rg --files` a trouvé les cinq scripts ci-dessus et aucun autre fichier `.sql`. `git ls-files` ne liste pas les scripts : `git status --short` montre `?? migration/`, donc le dossier complet est non suivi dans l’état Git observé. Ces fichiers sont sur disque local, mais ne sont pas intégrés à l’index Git/commit examiné. Aucun autre SQL non suivi hors de ce dossier n’a été trouvé par la recherche de fichiers SQL.

### Cohérence et limites observées

- Les tables SQL sont plus proches du cahier des charges que l’application, mais aucune couche de persistance SQL, API ou migration runner n’est visible. Le modèle actif reste des objets JSON dans `localStorage`.
- Le modèle SQL « élèves » est relationnel (prénoms/nom, `level_id`, statuts), tandis que le navigateur stocke `name`, `level`, `group`, `archived` sous forme de texte/booléen. Aucune migration des données locales vers SQL n’existe dans le dépôt.
- Des contraintes utiles existent : unicité d’identifiants, références étrangères, statuts autorisés et montants positifs/non négatifs. Elles ne prouvent pas que les règles sont appliquées en production ; aucun schéma n’a été exécuté.
- Le numéro de reçu physique est unique si présent, mais le schéma ne prouve ni séquence permanente, ni reprise de 009/010, ni contrôle du cahier papier.
- Les allocations sont positives et uniques par couple paiement/frais, mais aucune contrainte n’impose que leur total ne dépasse ni le paiement reçu ni le solde dû. Les remboursements positifs ne sont pas bornés par le montant disponible. Le cahier demande ces contrôles ; ils ne sont pas visibles dans une logique applicative.
- Les tables ne semblent pas contenir de table de crédits dédiée, de catégories de dépenses/recettes configurables, de paramètres de rappel ou de prospects. Le schéma actuel peut donc nécessiter une évolution après validation du modèle cible.
- `PRAGMA foreign_keys = ON` apparaît dans `001_core.sql`. Dans SQLite, cette option doit être activée pour chaque connexion ; le dépôt n’inclut pas le code de connexion permettant d’en confirmer l’application.
- Les migrations utilisent principalement `CREATE TABLE/INDEX IF NOT EXISTS`; cela ne remplace ni un historique appliqué fiable, ni une procédure transactionnelle, ni des contrôles d’intégrité. `schema_migrations` est créé en 001, mais aucun runner ne renseigne cette table.

**Aucune migration n’a été lancée et la syntaxe/compatibilité n’a pas été validée par un moteur SQL.**

## 6. Risques de données et de régression

| Risque | Preuve | Mesure préalable recommandée |
|---|---|---|
| Perte lors d’une lecture localStorage invalide puis enregistrement | `getAll()` renvoie `[]` sur erreur (`students.js` #L9–16 ; `attendance.js` #L7–14) | Inventorier/coller une copie brute des clés locales avant tout changement ; ne pas assimiler une erreur à une base vide. |
| Restauration qui remplace les élèves mais omet les présences | Export inclut attendance ; restore n’écrit que students (`students.js` #L267–274, #L339–388) | Corriger et éprouver le format sur copie, avec sauvegarde préalable et validation atomique. |
| Incompatibilité des sauvegardes entre versions | `version: 2`, mais validation ne contrôle ni version ni tous les champs (`students.js` #L267, #L344–367) | Formaliser schéma, version, checksum, compatibilité et prévisualisation avant restauration. |
| Historique présence modifié sans trace | `save()` remplace la séance existante (`attendance.js` #L274–325) sans audit applicatif | Définir les événements et auteur/date/avant-après avant l’usage métier. |
| Doublons ou affectations financières incohérentes | Aucun flux de paiement applicatif ; allocations SQL sans contrôle du total (`004_finance.sql` #L24–35) | Définir identifiant d’idempotence et règles transactionnelles avant activation des paiements. |
| Numéro de reçu réutilisé ou séquence incorrecte | Aucune génération ; aucune vérification du reçu papier 009 | Rapprocher le cahier papier et établir un registre contrôlé avant attribution de 010. |
| Données personnelles accessibles en clair localement et dans JSON | `localStorage` et export local (`students.js` #L9–20, #L267–283) | Définir l’accès à l’appareil, le chiffrement/protection des exports et le modèle de menace avant diffusion. |
| Mises à jour PWA qui servent des fichiers anciens ou suppriment un cache partagé | Cache-first et suppression de tous les caches au nom différent (`service-worker.js` #L27–39, #L42–53) | Vérifier l’environnement d’hébergement et les autres applications partageant l’origine avant changement de stratégie. |
| Données de production/locales non rapprochées | Aucune sauvegarde historique dans le dépôt | Recevoir les deux fichiers via canal contrôlé, faire des copies de travail, produire un diff sans fusion, puis faire valider la stratégie. |

## 7. Plan de développement recommandé et dépendances

Ordre proposé selon les dépendances et les risques. Cet ordre est préparatoire ; aucune étape de code n’est entreprise sans validation.

| Étape | Périmètre | Dépend de | Risque / garde-fou |
|---|---|---|---|
| 0. Préserver et inventorier | Copier les états locaux et les deux sauvegardes historiques ; établir inventaire, tailles, dates et empreintes ; vérifier statut Git et sources de données | Accès contrôlé aux appareils et fichiers | Ne jamais fusionner ni importer. Garder les originaux intacts. |
| 1. Spécifier le modèle local fiable | Choisir IndexedDB, modèles versionnés, contraintes, migrations locales non destructives, erreurs et transactions | Étape 0 ; arbitrage du schéma cible et des règles métier | Aucun changement de clés ou écrasement sans conversion et retour arrière vérifiables. |
| 2. Sauvegarde/restauration | Export complet, versions, empreinte, validation exhaustive, aperçu, sauvegarde préalable, restauration atomique et conservation des versions | Étape 1 ; inventaire des données existantes | Essayer uniquement sur copies synthétiques/copies validées, jamais sur la seule donnée réelle. |
| 3. Fondations scolaires | Modèles configurables de niveaux/formations/groupes, élèves, responsables et affectations datées | Étapes 1–2 | Conserver IDs et historique ; ne pas reconstruire le formulaire ou archivage avant évaluation/réutilisation du module existant. |
| 4. Présences | Séances avec statut/heure, élèves concernés, corrections auditées et statistiques selon séances réalisées | Étape 3 | La correction doit garder l’état précédent ; aucune liaison automatique présence-facturation. |
| 5. Facturation et paiements | Cycles par date d’entrée, règle fin de mois, tarifs immuables, affectations, idempotence et états des soldes | Étapes 1 et 3 ; règles comptables validées | Calculs déterministes et transactions atomiques ; tests de dates 29/30/31, partiels et doublons. |
| 6. Reçus, annulations, remboursements et crédits | Séquence unique, registre, motif obligatoire, opérations compensatoires et contrôle du disponible | Étape 5 ; rapprochement validé du cahier papier | Ne pas attribuer 010 avant vérification du 009 ; aucun effacement définitif. |
| 7. Dépenses, autres recettes et trésorerie | Catégories, date/mode/justificatif, états payés, flux réels et rapports | Étape 1 ; définitions comptables validées | Factures et dépenses non réglées exclues des flux de trésorerie. |
| 8. Prospects, tableau de bord et rapports | Parcours prospects et conversion, calculs par données réelles, PDF/XLSX/CSV sécurisés | Étapes 3–7 | Éviter chiffres statiques ; tester CSV contre l’injection de formules. |
| 9. Sécurité et audit | Utilisateurs, rôles, session locale adaptée puis serveur si retenu, journal non altérable des opérations | Modèle d’usage mono-appareil et architecture serveur arbitrés ; étapes métier | Masquer un bouton n’est pas une autorisation ; droits côté serveur uniquement après implémentation serveur. |
| 10. Reprise, tests et lancement | Comparaison séparée des deux sauvegardes, stratégie de reprise validée, tests documentés hors ligne et redémarrage | Étapes 0–9 et validation métier | Pas d’import avant validation écrite de la comparaison et d’une sauvegarde restaurable. |
| 11. Synchronisation/SaaS et déploiement | API Worker, D1/R2 éventuel, synchronisation et déploiement autorisé | Fonctionnement local éprouvé ; décision d’architecture et sécurité | Hors périmètre de lancement mono-appareil ; aucun accès production/déploiement pendant cet audit. |

## 8. Vérifications restant ouvertes

Les points suivants ne peuvent être tranchés à partir du dépôt fourni et nécessitent un accès ou une validation séparée :

1. Emplacement, intégrité et contenu des sauvegardes production et locale du 3 novembre 2026 ; les données doivent rester séparées.
2. Présence et état du Worker Cloudflare, de D1, de R2, des secrets et des environnements ; aucun service externe n’a été inspecté.
3. Cahier physique : reçu 009, identité, montant/date, prochain numéro et éventuels reçus intermédiaires.
4. Fonctionnement réel de l’application dans navigateurs/téléphones, installation PWA, stockage, export et restauration ; aucun test d’exécution n’a été effectué.
5. Exécution SQL, version du moteur, mécanisme de migration et état éventuel d’une base extérieure ; aucun moteur n’a été interrogé et aucune migration exécutée.

## 9. Portée et validation

Ce rapport est une comparaison statique avec le cahier des charges transmis. Il ne certifie pas un comportement en production, ne remplace pas la comparaison des sauvegardes et ne vaut pas autorisation de migration, import, déploiement ou modification de données. Toute modification du code doit attendre la validation explicite du rapport et du plan.
