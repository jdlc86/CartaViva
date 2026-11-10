import test from 'node:test';
import assert from 'node:assert/strict';
import {createLatestReadTaskController} from '../src/latest-read-task.js';

test('a newer read aborts and invalidates the previous task', () => {
  const controller = createLatestReadTaskController();
  const first = controller.start();

  assert.equal(first.signal.aborted, false);
  assert.equal(first.isCurrent(), true);

  const second = controller.start();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.signal.aborted, false);
  assert.equal(second.isCurrent(), true);

  first.finish();
  assert.equal(second.isCurrent(), true);
});

test('cancel aborts the active task without preventing a later explicit read', () => {
  const controller = createLatestReadTaskController();
  const first = controller.start();

  controller.cancel();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);

  const second = controller.start();
  assert.equal(second.signal.aborted, false);
  assert.equal(second.isCurrent(), true);
});

test('finish releases a completed task without aborting its signal', () => {
  const controller = createLatestReadTaskController();
  const task = controller.start();

  task.finish();
  task.finish();

  assert.equal(task.signal.aborted, false);
  assert.equal(task.isCurrent(), false);
  assert.ok(Object.isFrozen(controller));
  assert.ok(Object.isFrozen(task));
});
