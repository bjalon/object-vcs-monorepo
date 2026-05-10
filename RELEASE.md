# Release npm

Les packages publics sont publies sous le scope `@bjalon` :

- `@bjalon/object-vcs-core`
- `@bjalon/object-vcs-firebase`
- `@bjalon/object-vcs-http`
- `@bjalon/object-vcs-react`
- `@bjalon/object-vcs-vue`
- `@bjalon/object-vcs-vanilla`

L'exemple `@bjalon/object-vcs-example-goblin-tavern` reste prive et n'est pas
publie sur npm.

## Prerequis GitHub

1. Creer un token npm avec droit de publication.
2. Dans GitHub, ajouter le secret repository `NPM_TOKEN`.
3. Verifier que les packages npm du scope `@bjalon` sont publics.

Le workflow utilise `npm publish --provenance`, donc les permissions GitHub
incluent `id-token: write`.

## Release depuis GitHub Actions

Workflow : `.github/workflows/release-npm.yml`

Pour tester sans publier :

1. Aller dans GitHub Actions.
2. Ouvrir `Release npm packages`.
3. Cliquer `Run workflow`.
4. Laisser `dry_run` a `true`.

Pour publier :

1. Mettre a jour les versions dans les `package.json` des packages publies.
2. Mettre a jour `package-lock.json`.
3. Committer et pousser sur `main`.
4. Creer une GitHub Release publiee, ou lancer manuellement le workflow avec
   `dry_run` a `false`.

Le workflow publie toujours dans cet ordre :

1. core ;
2. firebase ;
3. http ;
4. react ;
5. vue ;
6. vanilla.

Cet ordre garantit que les packages qui dependent de
`@bjalon/object-vcs-core` trouvent deja la version publique.

## Verification locale avant release

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Tu peux aussi verifier le contenu publie :

```bash
npm publish --workspace @bjalon/object-vcs-core --access public --dry-run
```

## Installation dans un autre projet

```bash
npm install @bjalon/object-vcs-core
npm install @bjalon/object-vcs-firebase
npm install @bjalon/object-vcs-react
```

Installe seulement les adapters ou bindings necessaires au projet cible.
