import { MigrationError } from "./errors.js";
import { cloneJson } from "./json.js";

export interface StateMigration {
  readonly from: string;
  readonly to: string;
  readonly migrate: (state: unknown) => unknown;
}

export interface MigrateStateOptions {
  readonly state: unknown;
  readonly from: string;
  readonly to: string;
  readonly migrations: readonly StateMigration[];
}

interface MigrationStep {
  readonly version: string;
  readonly state: unknown;
  readonly path: readonly string[];
}

export function migrateState(options: MigrateStateOptions): unknown {
  if (options.from === options.to) {
    return cloneJson(options.state);
  }

  const queue: MigrationStep[] = [
    {
      version: options.from,
      state: cloneJson(options.state),
      path: [options.from]
    }
  ];
  const visited = new Set<string>([options.from]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }

    const nextMigrations = options.migrations.filter(
      migration => migration.from === current.version
    );

    for (const migration of nextMigrations) {
      let nextState: unknown;
      try {
        nextState = migration.migrate(cloneJson(current.state));
      } catch (error: unknown) {
        throw new MigrationError(
          `Migration "${migration.from}" -> "${migration.to}" failed.`,
          {
            from: migration.from,
            to: migration.to,
            cause: error
          }
        );
      }

      const nextPath = [...current.path, migration.to];
      if (migration.to === options.to) {
        return cloneJson(nextState);
      }

      if (!visited.has(migration.to)) {
        visited.add(migration.to);
        queue.push({
          version: migration.to,
          state: nextState,
          path: nextPath
        });
      }
    }
  }

  throw new MigrationError(
    `No migration path found from "${options.from}" to "${options.to}".`,
    {
      from: options.from,
      to: options.to
    }
  );
}
