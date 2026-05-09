export interface UseObjectVcsHeadResult<TState> {
  readonly state: TState | null;
  readonly loading: boolean;
  readonly error: unknown;
}

export const objectVcsVuePackage = "@object-vcs/vue";
