import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

export interface FirebaseRuntimeStatus {
  readonly configured: boolean;
  readonly app: FirebaseApp | null;
  readonly db: Firestore | null;
  readonly projectId: string | null;
  readonly missingVariables: readonly string[];
}

const requiredVariables = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID"
] as const;

type RequiredVariableName = (typeof requiredVariables)[number];

const env = import.meta.env;

function readRequiredVariable(name: RequiredVariableName): string | null {
  const value = env[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

const missingVariables = requiredVariables.filter(
  variableName => readRequiredVariable(variableName) === null
);

function createFirebaseOptions(): FirebaseOptions | null {
  const apiKey = readRequiredVariable("VITE_FIREBASE_API_KEY");
  const authDomain = readRequiredVariable("VITE_FIREBASE_AUTH_DOMAIN");
  const projectId = readRequiredVariable("VITE_FIREBASE_PROJECT_ID");
  const appId = readRequiredVariable("VITE_FIREBASE_APP_ID");

  if (
    apiKey === null ||
    authDomain === null ||
    projectId === null ||
    appId === null
  ) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId
  };
}

const firebaseOptions = createFirebaseOptions();
const configuredProjectId = readRequiredVariable("VITE_FIREBASE_PROJECT_ID");

export const firebaseRuntimeStatus: FirebaseRuntimeStatus =
  firebaseOptions === null
    ? {
        configured: false,
        app: null,
        db: null,
        projectId: configuredProjectId,
        missingVariables
      }
    : (() => {
        const app = initializeApp(firebaseOptions);
        return {
        configured: true,
        app,
        db: getFirestore(app),
        projectId: configuredProjectId,
        missingVariables: []
        };
      })();

export const objectVcsRepoId =
  env.VITE_OBJECT_VCS_REPO_ID ?? "goblin-tavern-demo";
