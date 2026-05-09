# Lots d’implémentation — Object VCS

Version : `0.1-draft`

## Vue d’ensemble

Le découpage ci-dessous vise à produire rapidement un socle utilisable, puis à enrichir progressivement le stockage, les UI et les adapters.

Ordre recommandé :

```txt
Lot 0  Cadrage repo et outillage
Lot 1  Core types, graph, validation
Lot 2  Moteur HEAD/révision en mémoire
Lot 3  API CRUD typée
Lot 4  Adapter Firebase snapshot
Lot 5  React hooks + timeline
Lot 6  Exemple Goblin Tavern sur GitHub Pages
Lot 7  Adapter HTTP client + contrat backend
Lot 8  Vue
Lot 9  Vanilla
Lot 10 Diff/hybride/migrations
Lot 11 Durcissement, docs, release
```

## Lot 0 — Cadrage monorepo et outillage

### Objectif

Créer le squelette du projet.

### Livrables

- `pnpm-workspace.yaml` ;
- `package.json` racine ;
- `tsconfig.base.json` ;
- configuration build ;
- configuration tests ;
- structure `packages/*` ;
- structure `examples/goblin-tavern` ;
- conventions de nommage ;
- CI minimale.

### Packages concernés

- tous.

### Critères d’acceptation

- `pnpm install` fonctionne ;
- `pnpm build` fonctionne même si les packages sont vides ;
- `pnpm test` fonctionne ;
- chaque package expose un point d’entrée TypeScript.

## Lot 1 — Core types, graph et validation

### Objectif

Implémenter la définition de graph et la validation d’état.

### Livrables

- `defineGraph` ;
- `singleton` ;
- `collection` ;
- `InferState` ;
- `SchemaAdapter` ;
- adapter Zod ;
- validation complète d’un état ;
- contraintes JSON-compatible ;
- erreurs de validation.

### Packages concernés

- `@bjalon/object-vcs-core`.

### Critères d’acceptation

- un état valide passe ;
- un état invalide échoue ;
- les types TS sont correctement inférés ;
- les collections sont typées en `Record<string, Entity>` ;
- les singletons sont typés comme objets directs.

## Lot 2 — Moteur HEAD/révision en mémoire

### Objectif

Implémenter le moteur de versioning avec un adapter mémoire.

### Livrables

- `createRepository` ;
- `memoryPersistence` ;
- `init` ;
- `getHead` ;
- `update` ;
- `edit` ;
- `commit` ;
- `readRevision` ;
- `listRevisions` ;
- `tag` ;
- `listTags` ;
- `createBranch` ;
- `checkout` ;
- `restore` ;
- `resetBranch` ;
- hash canonique ;
- mode snapshot.

### Packages concernés

- `@bjalon/object-vcs-core`.

### Critères d’acceptation

- HEAD clean après init commitée ;
- HEAD dirty après update non commitée ;
- le dirty précédent est remplacé ;
- commit crée une révision ;
- commit vide possible avec `allowEmpty` ;
- tag clean ne crée pas de révision ;
- tag dirty crée une révision si autorisé ;
- branche depuis ancienne révision fonctionnelle ;
- restore sans commit rend HEAD dirty ;
- restore avec commit crée une révision.

## Lot 3 — API CRUD typée

### Objectif

Ajouter les helpers CRUD générés depuis le graph.

### Livrables

- `repo.singletons.<name>.get()` ;
- `repo.singletons.<name>.set()` ;
- `repo.entities.<name>.list()` ;
- `repo.entities.<name>.get(id)` ;
- `repo.entities.<name>.create(id, value)` ;
- `repo.entities.<name>.update(id, updater)` ;
- `repo.entities.<name>.delete(id)` ;
- propagation des options `commit`, `message`, `author`, `expectedHeadHash`.

### Packages concernés

- `@bjalon/object-vcs-core`.

### Critères d’acceptation

- CRUD singleton typé ;
- CRUD collection typé ;
- erreur si création d’un id existant ;
- erreur si update/delete d’un id absent, sauf option explicite ;
- validation Zod à chaque écriture ;
- les helpers utilisent le même moteur que `update`.

## Lot 4 — Adapter Firebase snapshot

### Objectif

Implémenter la persistance Firestore en mode snapshot.

### Livrables

- `firebasePersistence` ;
- structure collections/documents ;
- transactions commit/tag/branch/reset ;
- allocation atomique des révisions ;
- `subscribeHead` ;
- `subscribeRevisions` ;
- support blobs simple si document trop gros ;
- template de rules ;
- tests avec emulator.

### Packages concernés

- `@bjalon/object-vcs-firebase`.

### Critères d’acceptation

- init écrit dans Firestore ;
- update dirty écrit le HEAD ;
- commit crée une révision immuable ;
- conflit `expectedHeadHash` renvoie une erreur ;
- timeline temps réel mise à jour ;
- rules empêchent update/delete des révisions ;
- fonctionne avec l’émulateur Firebase.

## Lot 5 — React hooks et timeline

### Objectif

Fournir l’intégration React minimale.

### Livrables

- `ObjectVcsProvider` ;
- `useObjectVcs` ;
- `useHead` ;
- `useRevisions` ;
- `useTags` ;
- `useBranches` ;
- `RevisionTimeline` ;
- `BranchSelector` ;
- `TagList` ;
- états loading/error ;
- style minimal non intrusif.

### Packages concernés

- `@bjalon/object-vcs-react`.

### Critères d’acceptation

- un composant React peut afficher HEAD ;
- timeline affiche les révisions ;
- sélection d’une révision déclenche callback ;
- restore disponible via callback ;
- changement de branche possible ;
- pas de dépendance Firebase dans le package React.

## Lot 6 — Exemple Goblin Tavern

### Objectif

Créer une application de démonstration complète.

### Livrables

- projet Vite React ;
- graph Zod `Goblin Tavern` ;
- état initial ;
- CRUD gobelins ;
- CRUD menu ;
- panneau settings ;
- panneau HEAD ;
- timeline ;
- tags ;
- branches ;
- Firebase setup ;
- GitHub Action de déploiement Pages ;
- documentation de déploiement.

### Packages concernés

- `examples/goblin-tavern` ;
- `@bjalon/object-vcs-core` ;
- `@bjalon/object-vcs-firebase` ;
- `@bjalon/object-vcs-react`.

### Critères d’acceptation

- build Vite OK ;
- déploiement Pages OK ;
- Firestore reçoit les modifications ;
- scénarios de démonstration exécutables ;
- README spécifique à l’exemple.

## Lot 7 — Adapter HTTP client et contrat backend

### Objectif

Permettre de remplacer Firebase par un backend custom.

### Livrables

- package `@bjalon/object-vcs-http` ;
- `httpPersistence` ;
- mapping endpoints vers `PersistenceAdapter` ;
- gestion auth bearer ;
- gestion idempotency key ;
- gestion erreurs HTTP ;
- support optionnel SSE ;
- documentation `BACKEND_HTTP_CONTRACT.md` ;
- mock server de test.

### Packages concernés

- `@bjalon/object-vcs-http` ;
- `@bjalon/object-vcs-core`.

### Critères d’acceptation

- le même code applicatif fonctionne avec `httpPersistence` ;
- les conflits 409 deviennent `ConcurrencyConflictError` ;
- les erreurs 422 deviennent `ValidationError` ;
- les endpoints minimaux sont testés ;
- le mock backend passe les mêmes tests que Firebase pour les scénarios principaux.

## Lot 8 — Vue

### Objectif

Fournir l’intégration Vue.

### Livrables

- plugin Vue ;
- composables ;
- composants ;
- timeline ;
- docs ;
- exemple minimal.

### Packages concernés

- `@bjalon/object-vcs-vue`.

### Critères d’acceptation

- même comportement fonctionnel que React ;
- pas de dépendance Firebase ;
- composants typés ;
- supports loading/error.

## Lot 9 — Vanilla

### Objectif

Fournir une intégration sans framework.

### Livrables

- `createRevisionTimeline` ;
- `createBranchSelector` ;
- `createTagList` ;
- option Web Components ;
- CSS minimal ;
- docs.

### Packages concernés

- `@bjalon/object-vcs-vanilla`.

### Critères d’acceptation

- utilisable avec un simple élément DOM ;
- pas de dépendance React/Vue ;
- callback sélection révision ;
- callback restore ;
- rendu accessible et simple.

## Lot 10 — Diff, stockage hybride et migrations

### Objectif

Passer du snapshot simple à un stockage plus compact et évolutif.

### Livrables

- génération JSON Patch ;
- application JSON Patch ;
- mode `patch` ;
- mode `hybrid` ;
- checkpoints ;
- reconstruction depuis checkpoint ;
- moteur de migration ;
- `MigrationMode` ;
- diff viewer enrichi.

### Packages concernés

- `@bjalon/object-vcs-core` ;
- `@bjalon/object-vcs-firebase` ;
- `@bjalon/object-vcs-http` ;
- UI packages pour diff viewer.

### Critères d’acceptation

- reconstruction fiable ;
- tests patch/apply ;
- checkpoints respectés ;
- lecture ancienne révision possible ;
- migration `raw/latest/strict` testée ;
- compatibilité snapshot conservée.

## Lot 11 — Durcissement, documentation et release

### Objectif

Rendre la librairie publiable et maintenable.

### Livrables

- documentation complète ;
- API reference ;
- guides Firebase/HTTP/React/Vue/Vanilla ;
- tests de non-régression ;
- CI complète ;
- packaging ESM ;
- types `.d.ts` ;
- changelog ;
- versioning packages ;
- stratégie de release.

### Critères d’acceptation

- `pnpm test` vert ;
- `pnpm build` vert ;
- exemple déployé ;
- docs lisibles ;
- packages publiables ;
- API publique stabilisée.

## Risques principaux

### Concurrence sur HEAD partagé

Risque : deux utilisateurs modifient le même `HEAD` en même temps.

Mitigation :

- `expectedHeadHash` ;
- mode `strict` par défaut pour commit ;
- UI indiquant les conflits ;
- option `last-write-wins` seulement pour usages simples.

### Taille des états

Risque : les états dépassent les limites du backend.

Mitigation :

- blobs ;
- mode hybride ;
- documentation des limites ;
- cible claire : petite grappe d’objets.

### Sécurité Firebase

Risque : croire que la config Firebase suffit à sécuriser.

Mitigation :

- règles Firestore fournies ;
- docs explicites ;
- recommandation backend pour usages sensibles.

### Scope creep vers Git complet

Risque : ajouter merge/rebase/cherry-pick trop tôt.

Mitigation :

- v1 limitée ;
- branches sans merge automatique ;
- restore et reset clairs.

## Décision recommandée pour démarrer

Démarrer par :

1. `@bjalon/object-vcs-core` avec `memoryPersistence` ;
2. mode snapshot only ;
3. React timeline minimale ;
4. Firebase adapter ;
5. Goblin Tavern.

Le stockage par diff doit venir après validation de la sémantique HEAD/commit/branch, car il complexifie la persistance sans changer l’API utilisateur.
