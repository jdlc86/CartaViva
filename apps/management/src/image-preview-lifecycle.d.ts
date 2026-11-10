export type ImagePreviewController = {
  replace(file: Blob | null): string;
  clear(): void;
  dispose(): void;
};

export function createImagePreviewController(urlApi?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>): ImagePreviewController;
