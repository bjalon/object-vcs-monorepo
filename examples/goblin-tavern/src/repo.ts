import { createRepository } from "@bjalon/object-vcs-core";
import { firebasePersistence } from "@bjalon/object-vcs-firebase";

import { firebaseRuntimeStatus, objectVcsRepoId } from "./firebase.js";
import { goblinTavernGraph, type TavernState } from "./graph.js";

export const goblinTavernRepository =
  firebaseRuntimeStatus.db === null
    ? null
    : createRepository({
        repoId: objectVcsRepoId,
        graph: goblinTavernGraph,
        schemaVersion: 1,
        graphVersion: "goblin-tavern-v1",
        defaultBranch: "main",
        persistence: firebasePersistence<TavernState>({
          db: firebaseRuntimeStatus.db,
          rootCollection: "objectVcs"
        })
      });
