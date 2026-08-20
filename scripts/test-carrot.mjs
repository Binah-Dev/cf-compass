import assert from "node:assert/strict";

import predict, {
  Contestant,
  predictFromRanks,
} from "../electron/carrot/predict.mjs";

const contestants = [
  new Contestant("first", 4, 100, 2100),
  new Contestant("second", 3, 300, 1850),
  new Contestant("third", 2, 500, 1600),
  new Contestant("fourth", 1, 700, 1350),
];

const predicted = predict(contestants, true);

assert.equal(predicted.length, contestants.length);
assert.deepEqual(
  predicted.map((contestant) => contestant.rank),
  [1, 2, 3, 4],
);
assert.equal(predicted[0].performance, Infinity);
assert.ok(
  predicted.slice(1).every((contestant) => Number.isFinite(contestant.performance)),
);
assert.ok(
  predicted
    .slice(1)
    .every((contestant, index, items) => index === 0 || items[index - 1].performance >= contestant.performance),
);
assert.ok(predicted.every((contestant) => Number.isFinite(contestant.delta)));

const rankedContestants = [
  new Contestant("ranked-first", 0, 0, 2100),
  new Contestant("ranked-second", 0, 0, 1850),
  new Contestant("ranked-third", 0, 0, 1600),
];
rankedContestants.forEach((contestant, index) => {
  contestant.rank = index + 1;
});
predictFromRanks(rankedContestants);
assert.equal(rankedContestants[0].performance, Infinity);
assert.ok(
  rankedContestants
    .slice(1)
    .every((contestant) => Number.isFinite(contestant.performance)),
);

console.log(
  JSON.stringify({
    status: "ok",
    performances: predicted.map(({ handle, performance }) => ({
      handle,
      performance,
    })),
  }),
);
