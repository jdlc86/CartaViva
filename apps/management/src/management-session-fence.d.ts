export interface ManagementSessionFence {
  replace(gateway: {revoke(): void}): () => void;
  isCurrent(gateway: {revoke(): void}): boolean;
  revoke(): void;
}
export declare function createManagementSessionFence(): ManagementSessionFence;
