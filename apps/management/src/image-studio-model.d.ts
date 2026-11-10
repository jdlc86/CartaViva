export type StudioStep = 'source' | 'transform' | 'review' | 'approve' | 'publish';
export type ImageRatio = 'five-four' | 'four-three' | 'square';
export type TransformationId = 'lighting' | 'framing' | 'background' | 'presentation';

export const STUDIO_STEPS: ReadonlyArray<{id: StudioStep; label: string; shortLabel: string}>;
export const IMAGE_RATIOS: ReadonlyArray<{
  id: ImageRatio;
  label: string;
  dimensions: string;
  use: string;
}>;
export const TRANSFORMATION_CONTROLS: ReadonlyArray<{
  id: TransformationId;
  title: string;
  description: string;
}>;

export function validateLocalImage(file: Pick<File, 'type'> | null): string;
export function canNavigateToStudioStep(step: StudioStep, state: {hasSource: boolean; hasConfiguration?: boolean}): boolean;
export function validateTransformationSelection(selectedIds: ReadonlyArray<TransformationId>): string;
