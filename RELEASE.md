# Release GitHub Packages

Les packages sont publies dans GitHub Packages, pas sur npmjs.org.

Packages publies :

- `@bjalon/object-vcs-core`
- `@bjalon/object-vcs-firebase`
- `@bjalon/object-vcs-http`
- `@bjalon/object-vcs-react`
- `@bjalon/object-vcs-vue`
- `@bjalon/object-vcs-vanilla`

L'exemple `@bjalon/object-vcs-example-goblin-tavern` reste prive et n'est pas
publie.

## Publication depuis GitHub Actions

Workflow : `.github/workflows/release-github-packages.yml`

Ce workflow publie vers :

```txt
https://npm.pkg.github.com
```

Il utilise le `GITHUB_TOKEN` du workflow. Aucun secret `NPM_TOKEN` n'est
necessaire pour publier depuis ce repo.

Pour tester sans publier :

1. aller dans GitHub Actions ;
2. ouvrir `Release GitHub Packages` ;
3. cliquer `Run workflow` ;
4. laisser `dry_run` a `true`.

Pour publier :

1. verifier ou incrementer les versions dans les `packages/*/package.json` ;
2. mettre a jour `package-lock.json` ;
3. commit et push sur `main` ;
4. lancer le workflow avec `dry_run` a `false`, ou creer une GitHub Release
   publiee.

Le workflow publie dans cet ordre :

1. core ;
2. firebase ;
3. http ;
4. react ;
5. vue ;
6. vanilla.

## Utilisation dans un autre projet GitHub

Dans le projet consommateur, ajouter un fichier `.npmrc` :

```ini
@bjalon:registry=https://npm.pkg.github.com
```

Puis installer les packages :

```bash
npm install @bjalon/object-vcs-core
npm install @bjalon/object-vcs-react
npm install @bjalon/object-vcs-firebase
```

Pour installer depuis un poste local, npm doit etre authentifie a GitHub
Packages. Le plus simple est d'utiliser un token GitHub avec `read:packages` :

```bash
npm login --scope=@bjalon --registry=https://npm.pkg.github.com
```

Utilise ton identifiant GitHub comme username, et le token comme password.

Pour installer depuis une GitHub Action d'un autre repo, ajouter dans ce repo :

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: 24
    cache: npm
    registry-url: https://npm.pkg.github.com
    scope: "@bjalon"

- run: npm ci
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Si le repo consommateur n'a pas automatiquement acces au package, ouvrir la page
GitHub du package, puis `Package settings` -> `Manage Actions access`, et donner
l'acces au repo consommateur. Pour des packages prives, un token avec
`read:packages` peut aussi etre stocke comme secret du repo consommateur.

## Verification locale avant release

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Verification du contenu d'un package :

```bash
npm publish --workspace @bjalon/object-vcs-core --dry-run
```
