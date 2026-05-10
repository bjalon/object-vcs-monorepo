import { useCallback, useEffect, useMemo, useState } from "react";

import {
  BranchNotFoundError,
  RepositoryAlreadyExistsError,
  type BranchRecord,
  type Head,
  type RevisionSummary,
  type TagRecord
} from "@bjalon/object-vcs-core";
import { ObjectVcsProvider, RevisionTimeline } from "@bjalon/object-vcs-react";

import { firebaseRuntimeStatus, objectVcsRepoId } from "./firebase.js";
import type { Goblin, TavernState } from "./graph.js";
import { initialState } from "./initialState.js";
import { goblinTavernExample } from "./index.js";
import { goblinTavernRepository } from "./repo.js";
import "./styles.css";

type BusyAction =
  | "init"
  | "dirty"
  | "commit"
  | "tag"
  | "branch"
  | "restore"
  | "checkout"
  | "preview"
  | "storage";

interface StorageEstimate {
  readonly totalBytes: number;
  readonly headBytes: number;
  readonly revisionsBytes: number;
  readonly metadataBytes: number;
  readonly revisionCount: number;
  readonly calculatedAt: string;
}

const goblinNames = ["Mog", "Blim", "Traka", "Nurz", "Pifang"] as const;
const snacks = [
  "biscuit de cave",
  "cornichon volcanique",
  "tartine de boue",
  "chips de racine"
] as const;

const busyLabels: Record<BusyAction, string> = {
  init: "Initialisation du repository",
  dirty: "Enregistrement du brouillon",
  commit: "Creation de revision",
  tag: "Creation du tag",
  branch: "Creation de branche",
  restore: "Restauration de revision",
  checkout: "Changement de branche",
  preview: "Lecture de revision",
  storage: "Calcul du stockage"
};

export function App() {
  if (!firebaseRuntimeStatus.configured || goblinTavernRepository === null) {
    return <ConfigurationScreen />;
  }

  return (
    <ObjectVcsProvider repository={goblinTavernRepository}>
      <GoblinTavernApp />
    </ObjectVcsProvider>
  );
}

function ConfigurationScreen() {
  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Object VCS example</p>
          <h1>{goblinTavernExample.name}</h1>
        </div>
        <span className="status-pill warning">Firebase missing</span>
      </section>

      <section className="panel warning-panel">
        <h2>Configuration Firebase incomplete</h2>
        <p>
          Configure les variables Vite avant de demarrer ou publier
          l'application.
        </p>
        <ul className="code-list">
          {firebaseRuntimeStatus.missingVariables.map(variableName => (
            <li key={variableName}>
              <code>{variableName}</code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function GoblinTavernApp() {
  const repo = useMemo(() => {
    if (goblinTavernRepository === null) {
      throw new Error("Goblin Tavern repository is not configured.");
    }

    return goblinTavernRepository;
  }, []);
  const [activeBranch, setActiveBranch] = useState("main");
  const [head, setHead] = useState<Head<TavernState> | null>(null);
  const [revisions, setRevisions] = useState<readonly RevisionSummary[]>([]);
  const [tags, setTags] = useState<readonly TagRecord[]>([]);
  const [branches, setBranches] = useState<readonly BranchRecord[]>([]);
  const [selectedRevision, setSelectedRevision] =
    useState<RevisionSummary | null>(null);
  const [selectedState, setSelectedState] = useState<TavernState | null>(null);
  const [message, setMessage] = useState("Service du soir");
  const [tagName, setTagName] = useState("service-du-soir");
  const [branchName, setBranchName] = useState("univers-sans-soupe");
  const [fullCheckEnabled, setFullCheckEnabled] = useState(false);
  const [storageEstimate, setStorageEstimate] =
    useState<StorageEstimate | null>(null);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [error, setError] = useState<unknown>(undefined);

  const refresh = useCallback(async () => {
    setError(undefined);

    try {
      const [nextHead, nextRevisions, nextTags, nextBranches] =
        await Promise.all([
          repo.getHead({ branch: activeBranch }),
          repo.listRevisions({ limit: 50 }),
          repo.listTags(),
          repo.listBranches()
        ]);
      setHead(nextHead);
      setRevisions(nextRevisions);
      setTags(nextTags);
      setBranches(nextBranches);
    } catch (caughtError: unknown) {
      if (caughtError instanceof BranchNotFoundError) {
        setHead(null);
        setRevisions([]);
        setTags([]);
        setBranches([]);
        return;
      }

      setError(caughtError);
    }
  }, [activeBranch, repo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const state = head?.state ?? null;
  const taggedRevisionNames = useMemo(
    () => new Map(tags.map(tag => [tag.name, tag.revision])),
    [tags]
  );
  const busyText = busy === null ? "Pret" : busyLabels[busy];

  async function runAction(action: BusyAction, task: () => Promise<void>) {
    setBusy(action);
    setError(undefined);

    try {
      await task();
      await refresh();
    } catch (caughtError: unknown) {
      setError(caughtError);
    } finally {
      setBusy(null);
    }
  }

  async function initializeRepository() {
    await runAction("init", async () => {
      try {
        await repo.init({
          initialState,
          branch: "main",
          message: "Ouverture de la taverne",
          author: "Goblin Tavern"
        });
        setActiveBranch("main");
      } catch (caughtError: unknown) {
        if (!(caughtError instanceof RepositoryAlreadyExistsError)) {
          throw caughtError;
        }
      }
    });
  }

  async function updateDirty(updater: (current: TavernState) => TavernState) {
    setBusy("dirty");
    setError(undefined);

    try {
      const result = await repo.update(updater, {
        branch: activeBranch,
        commit: false,
        author: "Goblin Editor"
      });
      setHead(result.head);

      if (fullCheckEnabled) {
        await refresh();
      }
    } catch (caughtError: unknown) {
      setError(caughtError);
    } finally {
      setBusy(null);
    }
  }

  async function commitHead(allowEmpty = false) {
    await runAction("commit", async () => {
      await repo.commit({
        branch: activeBranch,
        message: message.trim().length === 0 ? "Checkpoint" : message,
        author: "Goblin Editor",
        allowEmpty
      });
    });
  }

  async function createTag() {
    await runAction("tag", async () => {
      await repo.tag(tagName.trim(), {
        branch: activeBranch,
        revision: "HEAD",
        annotation: "Tag cree depuis la demo",
        author: "Goblin Editor",
        createRevisionIfDirty: true
      });
    });
  }

  async function checkout(branch: string) {
    await runAction("checkout", async () => {
      await repo.checkout(branch);
      setActiveBranch(branch);
    });
  }

  async function selectRevision(revision: RevisionSummary) {
    await runAction("preview", async () => {
      setSelectedRevision(revision);
      setSelectedState(await repo.readRevision(revision.revision));
    });
  }

  async function restoreRevision(revision: RevisionSummary) {
    await runAction("restore", async () => {
      await repo.restore(revision.revision, {
        branch: activeBranch,
        commit: false,
        message: `Restore revision ${revision.revision}`,
        author: "Goblin Editor"
      });
      setSelectedRevision(revision);
      setSelectedState(await repo.readRevision(revision.revision));
    });
  }

  async function createBranchFromSelectedRevision() {
    if (selectedRevision === null) {
      return;
    }

    await runAction("branch", async () => {
      await repo.createBranch(branchName.trim(), {
        from: selectedRevision.revision,
        checkout: true,
        author: "Goblin Editor"
      });
      setActiveBranch(branchName.trim());
    });
  }

  async function estimateStorage() {
    await runAction("storage", async () => {
      const currentHead = await repo.getHead({ branch: activeBranch });
      const allRevisions = await repo.listRevisions();
      const revisionStates = await Promise.all(
        allRevisions.map(revision => repo.readRevision(revision.revision))
      );
      const headBytes = jsonByteSize(currentHead.state);
      const revisionsBytes = revisionStates.reduce(
        (sum, revisionState) => sum + jsonByteSize(revisionState),
        0
      );
      const metadataBytes =
        jsonByteSize(stripHeadState(currentHead)) +
        jsonByteSize(allRevisions) +
        jsonByteSize(tags) +
        jsonByteSize(branches);

      setStorageEstimate({
        totalBytes: headBytes + revisionsBytes + metadataBytes,
        headBytes,
        revisionsBytes,
        metadataBytes,
        revisionCount: allRevisions.length,
        calculatedAt: new Date().toISOString()
      });
    });
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Object VCS example</p>
          <h1>{goblinTavernExample.name}</h1>
        </div>
        <div className="status-stack">
          <span className={head?.status === "dirty" ? "status-pill dirty" : "status-pill clean"}>
            {head === null ? "Repository not initialized" : `HEAD ${head.status}`}
          </span>
          <span className={busy === null ? "activity-indicator" : "activity-indicator busy"}>
            {busyText}
          </span>
        </div>
      </section>

      <section className="toolbar">
        <div>
          <span>Repo</span>
          <strong>{objectVcsRepoId}</strong>
        </div>
        <div>
          <span>Branch</span>
          <strong>{activeBranch}</strong>
        </div>
        <div>
          <span>Revision</span>
          <strong>{head?.headRevision ?? "-"}</strong>
        </div>
        <div>
          <span>Hash</span>
          <strong>{head?.stateHash.slice(0, 14) ?? "-"}</strong>
        </div>
      </section>

      {error === undefined ? null : (
        <section className="panel error-panel">{errorMessage(error)}</section>
      )}

      {state === null ? (
        <section className="panel start-panel">
          <h2>Repository</h2>
          <p>Initialise la demo dans Firestore pour commencer.</p>
          <button type="button" onClick={() => void initializeRepository()} disabled={busy !== null}>
            Initialiser
          </button>
        </section>
      ) : (
        <>
          <section className="dashboard-grid">
            <TavernPanel
              state={state}
              disabled={busy !== null}
              onReputationChange={delta =>
                void updateDirty(current => ({
                  ...current,
                  tavern: {
                    ...current.tavern,
                    reputation: clamp(current.tavern.reputation + delta, 0, 100)
                  }
                }))
              }
            />
            <GoblinPanel
              goblins={state.goblins}
              disabled={busy !== null}
              onAdd={() => void addGoblin(updateDirty)}
              onMood={id => void cycleGoblinMood(updateDirty, id)}
              onDelete={id =>
                void updateDirty(current => {
                  const nextGoblins = Object.fromEntries(
                    Object.entries(current.goblins).filter(([goblinId]) => goblinId !== id)
                  ) as Record<string, Goblin>;
                  return { ...current, goblins: nextGoblins };
                })
              }
            />
          </section>

          <section className="panel action-panel">
            <h2>Versioning</h2>
            <div className="form-row">
              <label>
                Check complet apres modification
                <select
                  value={fullCheckEnabled ? "true" : "false"}
                  onChange={event => setFullCheckEnabled(event.target.value === "true")}
                >
                  <option value="false">Desactive</option>
                  <option value="true">Active</option>
                </select>
              </label>
              <span>
                {fullCheckEnabled
                  ? "Chaque brouillon relit HEAD, revisions, tags et branches."
                  : "Chaque brouillon met seulement HEAD a jour localement."}
              </span>
            </div>
            <div className="storage-row">
              <div>
                <span>Stockage estime</span>
                <strong>{storageEstimate === null ? "-" : formatBytes(storageEstimate.totalBytes)}</strong>
              </div>
              <button
                type="button"
                onClick={() => void estimateStorage()}
                disabled={busy !== null}
              >
                Calculer
              </button>
              {storageEstimate === null ? null : (
                <span title={storageTooltip(storageEstimate)}>
                  {storageEstimate.revisionCount} revisions · {formatBytes(storageEstimate.revisionsBytes)} snapshots
                </span>
              )}
            </div>
            <div className="form-row">
              <label>
                Message
                <input value={message} onChange={event => setMessage(event.target.value)} />
              </label>
              <button type="button" onClick={() => void commitHead(false)} disabled={busy !== null}>
                Commit
              </button>
              <button type="button" onClick={() => void commitHead(true)} disabled={busy !== null}>
                Commit vide
              </button>
            </div>
            <div className="form-row">
              <label>
                Tag
                <input value={tagName} onChange={event => setTagName(event.target.value)} />
              </label>
              <button type="button" onClick={() => void createTag()} disabled={busy !== null || tagName.trim().length === 0}>
                Creer tag
              </button>
              <span>{Array.from(taggedRevisionNames.entries()).map(([name, revision]) => `${name} -> #${revision}`).join(", ")}</span>
            </div>
          </section>

          <section className="two-column">
            <section className="panel">
              <h2>Branches</h2>
              <div className="branch-list">
                {branches.map(branch => (
                  <button
                    key={branch.name}
                    type="button"
                    className={branch.name === activeBranch ? "selected" : ""}
                    onClick={() => void checkout(branch.name)}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
              <div className="form-row">
                <label>
                  Nouvelle branche
                  <input value={branchName} onChange={event => setBranchName(event.target.value)} />
                </label>
                <button
                  type="button"
                  disabled={selectedRevision === null || busy !== null || branchName.trim().length === 0}
                  onClick={() => void createBranchFromSelectedRevision()}
                >
                  Depuis revision
                </button>
              </div>
            </section>

            <section className="panel">
              <RevisionTimeline<TavernState>
                branch={activeBranch}
                revisions={revisions}
                tags={tags}
                branches={branches}
                head={head}
                selectedRevision={selectedRevision?.revision ?? null}
                loading={busy === "preview" || busy === "restore"}
                error={undefined}
                onSelectRevision={selectRevision}
                onRestoreRevision={restoreRevision}
              />
            </section>
          </section>

          <RevisionPreview revision={selectedRevision} state={selectedState} />
        </>
      )}
    </main>
  );
}

function TavernPanel(props: {
  readonly state: TavernState;
  readonly disabled: boolean;
  readonly onReputationChange: (delta: number) => void;
}) {
  return (
    <section className="panel">
      <h2>{props.state.tavern.name}</h2>
      <p>{props.state.tavern.motto}</p>
      <div className="metric">
        <span>Reputation</span>
        <strong>{props.state.tavern.reputation}</strong>
      </div>
      <div className="button-row">
        <button type="button" onClick={() => props.onReputationChange(-3)} disabled={props.disabled}>
          -3
        </button>
        <button type="button" onClick={() => props.onReputationChange(5)} disabled={props.disabled}>
          +5
        </button>
      </div>
    </section>
  );
}

function GoblinPanel(props: {
  readonly goblins: Readonly<Record<string, Goblin>>;
  readonly disabled: boolean;
  readonly onAdd: () => void;
  readonly onMood: (id: string) => void;
  readonly onDelete: (id: string) => void;
}) {
  return (
    <section className="panel list-panel">
      <HeaderWithAction
        title="Goblins"
        action="Ajouter"
        disabled={props.disabled}
        onAction={props.onAdd}
      />
      {Object.values(props.goblins).map(goblin => (
        <article key={goblin.id} className="list-item">
          <strong>{goblin.name}</strong>
          <span>{goblin.role} · {goblin.mood} · energie {goblin.energy}</span>
          <span>{goblin.favoriteSnack}</span>
          <div className="button-row">
            <button
              type="button"
              onClick={() => props.onMood(goblin.id)}
              disabled={props.disabled}
            >
              Humeur
            </button>
            <button
              type="button"
              onClick={() => props.onDelete(goblin.id)}
              disabled={props.disabled}
            >
              Retirer
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function HeaderWithAction(props: {
  readonly title: string;
  readonly action: string;
  readonly disabled?: boolean;
  readonly onAction: () => void;
}) {
  return (
    <div className="panel-header">
      <h2>{props.title}</h2>
      <button type="button" onClick={props.onAction} disabled={props.disabled === true}>
        {props.action}
      </button>
    </div>
  );
}

function RevisionPreview(props: {
  readonly revision: RevisionSummary | null;
  readonly state: TavernState | null;
}) {
  if (props.revision === null || props.state === null) {
    return null;
  }

  return (
    <section className="panel preview-panel">
      <h2>Revision #{props.revision.revision}</h2>
      <pre>{JSON.stringify(props.state, null, 2)}</pre>
    </section>
  );
}

async function addGoblin(
  updateDirty: (updater: (current: TavernState) => TavernState) => Promise<void>
) {
  const id = `goblin_${Date.now().toString(36)}`;
  const name = goblinNames[Math.floor(Math.random() * goblinNames.length)] ?? "Nok";
  const snack = snacks[Math.floor(Math.random() * snacks.length)] ?? "soupe froide";

  await updateDirty(current => ({
    ...current,
    goblins: {
      ...current.goblins,
      [id]: {
        id,
        name,
        role: "intern",
        mood: "suspicious",
        favoriteSnack: snack,
        energy: 44
      }
    }
  }));
}

async function cycleGoblinMood(
  updateDirty: (updater: (current: TavernState) => TavernState) => Promise<void>,
  id: string
) {
  const moods: readonly Goblin["mood"][] = ["grumpy", "hungry", "heroic", "suspicious"];

  await updateDirty(current => {
    const goblin = current.goblins[id];
    if (goblin === undefined) {
      return current;
    }

    const moodIndex = moods.indexOf(goblin.mood);
    const nextMood = moods[(moodIndex + 1) % moods.length] ?? "grumpy";

    return {
      ...current,
      goblins: {
        ...current.goblins,
        [id]: {
          ...goblin,
          mood: nextMood
        }
      }
    };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function jsonByteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function stripHeadState(head: Head<TavernState>): Omit<Head<TavernState>, "state"> {
  return {
    repoId: head.repoId,
    branchName: head.branchName,
    status: head.status,
    headRevision: head.headRevision,
    baseRevision: head.baseRevision,
    stateHash: head.stateHash,
    updatedAt: head.updatedAt,
    ...(head.updatedBy === undefined ? {} : { updatedBy: head.updatedBy })
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KiB`;
  }

  return `${(kib / 1024).toFixed(2)} MiB`;
}

function storageTooltip(estimate: StorageEstimate): string {
  return [
    `Total: ${formatBytes(estimate.totalBytes)}`,
    `HEAD state: ${formatBytes(estimate.headBytes)}`,
    `Revision snapshots: ${formatBytes(estimate.revisionsBytes)}`,
    `Metadata: ${formatBytes(estimate.metadataBytes)}`,
    `Revisions: ${estimate.revisionCount}`,
    `Calculated at: ${estimate.calculatedAt}`
  ].join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
