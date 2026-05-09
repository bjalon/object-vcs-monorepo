import { firebaseRuntimeStatus, objectVcsRepoId } from "./firebase.js";
import { goblinTavernExample } from "./index.js";
import "./styles.css";

const plannedPackages = [
  "@bjalon/object-vcs-core",
  "@bjalon/object-vcs-firebase",
  "@bjalon/object-vcs-react"
] as const;

export function App() {
  const firebaseStatusLabel = firebaseRuntimeStatus.configured
    ? "Firebase configure"
    : "Firebase a configurer";

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Object VCS example</p>
        <h1>{goblinTavernExample.name}</h1>
        <p className="summary">
          Exemple GitHub Pages pour valider la chaine build, publication et
          injection de configuration Firebase.
        </p>
      </section>

      <section className="status-grid" aria-label="Etat du deploiement">
        <article>
          <span>Deploiement</span>
          <strong>{goblinTavernExample.deploymentTarget}</strong>
        </article>
        <article>
          <span>Repository demo</span>
          <strong>{objectVcsRepoId}</strong>
        </article>
        <article>
          <span>Firebase</span>
          <strong>{firebaseStatusLabel}</strong>
        </article>
      </section>

      {firebaseRuntimeStatus.configured ? (
        <section className="panel">
          <h2>Configuration active</h2>
          <p>
            Projet Firebase detecte :{" "}
            <strong>{firebaseRuntimeStatus.projectId}</strong>.
          </p>
        </section>
      ) : (
        <section className="panel warning">
          <h2>Configuration Firebase incomplete</h2>
          <p>
            Ajoute les secrets GitHub Actions documentes dans{" "}
            <code>GITHUB_PAGE.md</code> pour activer Firebase sur Pages.
          </p>
          <ul>
            {firebaseRuntimeStatus.missingVariables.map(variableName => (
              <li key={variableName}>
                <code>{variableName}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Packages relies</h2>
        <ul className="package-list">
          {plannedPackages.map(packageName => (
            <li key={packageName}>
              <code>{packageName}</code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
