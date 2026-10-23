import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canNavigateToStudioStep,
  IMAGE_RATIOS,
  STUDIO_STEPS,
  TRANSFORMATION_CONTROLS,
  validateLocalImage,
  validateTransformationSelection,
} from '../src/image-studio-model.js';
import {createImagePreviewController} from '../src/image-preview-lifecycle.js';

test('guided navigation opens only local preparation stages without a backend result', () => {
  assert.deepEqual(STUDIO_STEPS.map((step) => step.id), ['source', 'transform', 'review', 'approve', 'publish']);
  assert.equal(canNavigateToStudioStep('source', {hasSource: false}), true);
  assert.equal(canNavigateToStudioStep('transform', {hasSource: false}), false);
  assert.equal(canNavigateToStudioStep('review', {hasSource: false}), false);
  assert.equal(canNavigateToStudioStep('transform', {hasSource: true}), true);
  assert.equal(canNavigateToStudioStep('review', {hasSource: true}), false);
  assert.equal(canNavigateToStudioStep('review', {hasSource: true, hasConfiguration: true}), true);
  assert.equal(canNavigateToStudioStep('approve', {hasSource: true}), false);
  assert.equal(canNavigateToStudioStep('publish', {hasSource: true}), false);
});

test('local validation accepts image previews and rejects absent or non-image files', () => {
  assert.match(validateLocalImage(null), /Selecciona una fotografía/);
  assert.match(validateLocalImage({type: 'application/pdf'}), /archivo de imagen/);
  assert.equal(validateLocalImage({type: 'image/jpeg'}), '');
  assert.match(validateTransformationSelection([]), /al menos un ajuste/);
  assert.equal(validateTransformationSelection(['lighting']), '');
});

test('documented ratios and fidelity controls remain exact', () => {
  assert.deepEqual(IMAGE_RATIOS.map((ratio) => [ratio.label, ratio.dimensions]), [
    ['5:4', '1000 × 800'],
    ['4:3', '1200 × 900'],
    ['1:1', '400 × 400'],
  ]);
  assert.deepEqual(TRANSFORMATION_CONTROLS.map((control) => control.id), [
    'lighting',
    'framing',
    'background',
    'presentation',
  ]);
});

test('temporary object URLs are revoked on replace, clear and dispose without duplicates', () => {
  const created = [];
  const revoked = [];
  const urlApi = {
    createObjectURL(file) {
      const url = `blob:preview-${created.length + 1}`;
      created.push({file, url});
      return url;
    },
    revokeObjectURL(url) {
      revoked.push(url);
    },
  };
  const controller = createImagePreviewController(urlApi);
  const first = {name: 'first.jpg'};
  const second = {name: 'second.jpg'};

  assert.equal(controller.replace(first), 'blob:preview-1');
  assert.equal(controller.replace(second), 'blob:preview-2');
  assert.deepEqual(revoked, ['blob:preview-1']);

  controller.clear();
  controller.clear();
  controller.dispose();
  assert.deepEqual(revoked, ['blob:preview-1', 'blob:preview-2']);
  assert.equal(controller.replace(null), '');
  assert.equal(created.length, 2);
});
