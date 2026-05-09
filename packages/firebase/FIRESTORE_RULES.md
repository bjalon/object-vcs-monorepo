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
- suppression interdite ;
- revisions immuables ;
- blobs immuables ;
- tags, branches et HEAD modifiables uniquement par des writers selon la fonction `canWriteRepo`.

Pour une application de production, remplace `canReadRepo` et `canWriteRepo`
par une verification de membership par repository, par exemple via custom claims
ou un document ACL. Les rules ne valident pas les schemas Zod : si le contenu
est sensible, les commits doivent passer par un backend ou des Cloud Functions.

Si tu changes `rootCollection` dans `firebasePersistence`, adapte aussi les
chemins du template.

## Tests Emulator

Il n'y a pas encore de configuration Emulator dediee dans ce monorepo. La
structure recommandee pour l'ajouter au lot suivant :

1. ajouter un `firebase.json` de test qui pointe vers ce fichier rules ;
2. lancer `firebase emulators:exec --only firestore "npm --workspace @bjalon/object-vcs-firebase run test:emulator"` ;
3. initialiser une app Firebase de test avec `FIRESTORE_EMULATOR_HOST` ;
4. reutiliser les scenarios du package core : init, dirty HEAD, commit, revision, tags, branches, reset.
