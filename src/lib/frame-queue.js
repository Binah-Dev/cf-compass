// Keep only the newest pointer position per frame; release can flush it.
export function createFrameQueue(apply, request = requestAnimationFrame, cancel = cancelAnimationFrame) {
  let frame = null, latest, pending = false;
  function flush() {
    if (frame !== null) cancel(frame);
    frame = null;
    if (!pending) return;
    const value = latest;
    pending = false; latest = undefined;
    apply(value);
  }
  return {
    push(value) {
      latest = value; pending = true;
      if (frame === null) frame = request(flush);
    },
    flush,
    cancel() {
      if (frame !== null) cancel(frame);
      frame = null; pending = false; latest = undefined;
    },
  };
}
