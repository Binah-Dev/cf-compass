import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameQueue } from '../src/lib/frame-queue.js';
function fixture() {
  let next = 0; const callbacks = new Map(), applied = [];
  const queue = createFrameQueue(v => applied.push(v), fn => { callbacks.set(++next, fn); return next; }, id => callbacks.delete(id));
  return { queue, callbacks, applied };
}
test('240 pointer events use one frame and keep the latest coordinate', () => {
  const { queue, callbacks, applied } = fixture();
  for (let i = 0; i < 240; i++) queue.push(i);
  assert.equal(callbacks.size, 1); [...callbacks.values()][0]();
  assert.deepEqual(applied, [239]); assert.equal(callbacks.size, 0);
});
test('release flushes the final position exactly once', () => {
  const { queue, callbacks, applied } = fixture();
  queue.push(42); queue.flush(); queue.flush();
  assert.deepEqual(applied, [42]); assert.equal(callbacks.size, 0);
});
test('cancel/unmount discards work and subsequent gestures still work', () => {
  const { queue, callbacks, applied } = fixture();
  queue.push(1); queue.cancel(); queue.flush();
  assert.deepEqual(applied, []); assert.equal(callbacks.size, 0);
  queue.push(2); queue.flush(); assert.deepEqual(applied, [2]);
});
