# Firestore Rules

Le package fournit un template dans `packages/firebase/firestore.rules`.

Il cible la structure par defaut :

```txt
/objectVcs/{repoId}
/objectVcs/{repoId}/branches/{branchName}
/objectVcs/{repoId}/heads/{branchName}
/objectVcs/{repoId}/revisions/{revisionNo}
/objectVcs/{repoId}/tags/{tagName}
/objectVcs/{repoId}/blobs/{stateHash}
```

Le template minimal impose :

- lecture reservee aux utilisateurs authentifies ;
- ecriture reservee aux utilisateurs authentifies ;
- suppression de repo, branches et HEAD interdite ;
- revisions immuables hors suppression par garbage collection ;
- blobs immuables hors suppression par garbage collection ;
- tags, branches et HEAD modifiables uniquement par des writers selon la fonction `canWriteRepo`.
- tags supprimables par des writers.

Pour une application de production, remplace `canReadRepo` et `canWriteRepo`
par une verification de membership par repository, par exemple via custom claims
ou un document ACL. Les rules ne valident pas les schemas Zod : si le contenu
est sensible, les commits doivent passer par un backend ou des Cloud Functions.

## Garbage Collection Firebase

`firebasePersistence` implemente `planGarbageCollection`, `runGarbageCollection`
et `estimateStorage` pour le mode snapshot.

Avant chaque suppression, l'adapter recalcule le plan et refuse l'execution si
les references protegees ont change avec `GarbageCollectionPlanStaleError`.
Les suppressions sont executees dans l'ordre suivant :

1. revisions candidates non accessibles ;
2. blobs orphelins ou blobs des revisions supprimees, seulement s'ils ne sont
   plus references par une revision restante ou un HEAD.

Les operations qui modifient les references de protection mettent aussi a jour
le document repo afin que les transactions Firestore detectent les ecritures
concurrentes. Si tu exposes ces rules directement a des clients web, limite
`canWriteRepo` a des utilisateurs de confiance : les rules Firestore ne peuvent
pas verifier seules toute la reachability du graphe de revisions.

`estimateStorage` renvoie une estimation approximative. Elle additionne les
payloads JSON Object VCS, les blobs et une surcharge configurable par document.
Elle n'est pas une estimation de facturation Firestore exacte.

Si tu changes `rootCollection` dans `firebasePersistence`, adapte aussi les
chemins du template.

## Tests Emulator

Il n'y a pas encore de configuration Emulator dediee dans ce monorepo. Les tests
unitaires du package utilisent un Firestore mocke pour couvrir `deleteTag`,
`listBranches`, le plan GC, l'execution GC, les plans stale, les blobs orphelins
et l'estimation de stockage.

Structure recommandee pour ajouter des tests emulator complets :

1. ajouter un `firebase.json` de test qui pointe vers ce fichier rules ;
2. lancer `firebase emulators:exec --only firestore "npm --workspace @bjalon/object-vcs-firebase run test:emulator"` ;
3. initialiser une app Firebase de test avec `FIRESTORE_EMULATOR_HOST` ;
4. reutiliser les scenarios du package core : init, dirty HEAD, commit, revision,
   tags, deleteTag, branches, reset et garbage collection.
