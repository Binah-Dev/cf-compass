async function waitUntil(read, predicate, timeout = 10000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw Error('Timed out waiting for persisted state');
}
module.exports = { waitUntil };
