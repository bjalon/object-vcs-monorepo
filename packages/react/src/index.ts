export interface UseHeadResult<TState> {
  readonly state: TState | null;
  readonly loading: boolean;
  readonly error: unknown;
}

export const objectVcsReactPackage = "@bjalon/object-vcs-react";
