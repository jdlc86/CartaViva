export type LatestReadTask = Readonly<{
  signal: AbortSignal;
  isCurrent: () => boolean;
  finish: () => void;
}>;

export type LatestReadTaskController = Readonly<{
  start: () => LatestReadTask;
  cancel: () => void;
}>;

export declare function createLatestReadTaskController(): LatestReadTaskController;
