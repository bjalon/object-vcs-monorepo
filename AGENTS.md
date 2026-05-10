
---

# 2. Prompts Codex

## Prompt 0 — ajouter l’addendum et faire une revue du repo

```text
Lis d’abord AGENTS.md, README.md, docs/SPEC.md, docs/BACKEND_HTTP_CONTRACT.md, docs/IMPLEMENTATION_LOTS.md et docs/SPEC_ADDENDUM_GC_SCHEMA_FINGERPRINT.md.

Objectif : analyser l’état actuel du repo avant implémentation du nouvel addendum.

Ne modifie rien dans un premier temps.

Produis une revue structurée avec :

1. les APIs déjà présentes ;
2. les endroits précis à modifier pour :
   - schemaFingerprint ;
   - deleteTag ;
   - listBranches si absent ;
   - planGarbageCollection ;
   - runGarbageCollection ;
   - estimateStorage ;
   - extensions HTTP ;
   - Firebase ;
   - UI Goblin Tavern ;
3. les risques de typage ;
4. les risques de concurrence ;
5. les tests existants réutilisables ;
6. un plan d’implémentation en lots courts.

Contraintes :

- TypeScript strict.
- Aucun `any`.
- Ne propose pas de merge, rebase, patch storage ou compaction d’historique.
- Le stockage reste snapshot-only.