const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  canonicalQuery,
  createApiSignature,
  createCodeforcesSourceService,
  decodeBase64Source,
  signedEndpoint,
} = require("../electron/services/codeforces-source-service.cjs");

async function main() {
  const base64Source = "int main() { return 0; }\n";
  assert.equal(
    decodeBase64Source(Buffer.from(base64Source, "utf8").toString("base64")),
    base64Source,
  );
  assert.equal(decodeBase64Source("%%%not-base64%%%"), "");
  assert.equal(decodeBase64Source("a"), "");
  assert.equal(
    decodeBase64Source("A".repeat(Math.ceil((2 * 1024 * 1024 * 4) / 3) + 8)),
    "",
  );
  assert.equal(canonicalQuery({ count: 1, handle: "tourist", includeSources: true }), "count=1&handle=tourist&includeSources=true");
  const signature = createApiSignature(
    "user.status",
    { apiKey: "key", count: 1, handle: "tourist", includeSources: true, time: 1700000000 },
    "secret",
    "123456",
  );
  assert.match(signature, /^123456[0-9a-f]{128}$/);
  assert.match(
    signedEndpoint(
      "user.status",
      { handle: "tourist", from: 1, count: 1, includeSources: true },
      { apiKey: "key", apiSecret: "secret" },
      1700000000,
    ),
    /^user\.status\?.*apiSig=.*&.*time=1700000000/,
  );

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "cf-compass-source-"));
  const calls = [];
  try {
    const service = createCodeforcesSourceService({
      dataPath: (filename) => path.join(temporaryDirectory, filename),
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
        decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, ""),
      },
      fetchJson: async (endpoint) => {
        calls.push(endpoint);
        return [
          {
            id: 11,
            verdict: "WRONG_ANSWER",
            programmingLanguage: "C++17",
            relativeTimeSeconds: 120,
            timeConsumedMillis: 34,
            memoryConsumedBytes: 4096,
            sourceBase64: Buffer.from(base64Source, "utf8").toString("base64"),
          },
          {
            id: 12,
            verdict: "COMPILATION_ERROR",
            programmingLanguage: "C++17",
            sourceBase64: "%%%not-base64%%%",
          },
          {
            id: 13,
            verdict: "OK",
            programmingLanguage: "C++17",
            source: "plain source wins",
            sourceBase64: Buffer.from("ignored", "utf8").toString("base64"),
          },
        ];
      },
    });

    assert.equal((await service.getConfig()).hasCredentials, false);
    await service.setConfig({ enabled: true, apiKey: "key", apiSecret: "secret" });
    const config = await service.getConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.hasCredentials, true);
    assert.equal(config.credentialSource, "encrypted");

    const sources = await service.fetchSources({
      handle: "tester",
      candidates: [
        { id: 11, problemKey: "100-A", verdict: "WRONG_ANSWER" },
        { id: 12, problemKey: "100-B", verdict: "COMPILATION_ERROR" },
        { id: 13, problemKey: "100-C", verdict: "OK" },
      ],
      cachedSubmissions: [{ id: 11 }, { id: 12 }, { id: 13 }],
    });
    assert.equal(sources[0].sourceAvailable, true);
    assert.equal(sources[0].source, base64Source);
    assert.equal(sources[0].problemKey, "100-A");
    assert.equal(sources[0].programmingLanguage, "C++17");
    assert.equal(sources[1].sourceAvailable, false);
    assert.equal(sources[2].source, "plain source wins");
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^user\.status\?/);
    assert.match(calls[0], /includeSources=true/);
    assert.match(calls[0], /apiSig=/);

    await service.setConfig({ clearCredentials: true, enabled: false });
    await assert.rejects(
      () => service.fetchSources({ handle: "tester", candidates: [{ id: 11 }], cachedSubmissions: [{ id: 11 }] }),
      /配置 Codeforces API Key 和 Secret/,
    );
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }

  console.log("codeforces source service tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
