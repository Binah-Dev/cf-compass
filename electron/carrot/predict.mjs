/**
 * Carrot Plus performance-rating calculator (MIT).
 *
 * Adapted from meooow25/carrot and Carrot Plus. The implementation follows
 * Codeforces' Elo-based rating calculation and uses FFT convolution for seed
 * calculation. Carrot's fast performance value is normally within 0-4 points
 * of the slower exact calculation.
 */
import binarySearch from "./binsearch.mjs";
import FFTConv from "./conv.mjs";

const DEFAULT_RATING = 1400;
export const MAX_RATING_LIMIT = 6000;
export const MIN_RATING_LIMIT = -500;
const RATING_RANGE_LENGTH = MAX_RATING_LIMIT - MIN_RATING_LIMIT;
const ELO_OFFSET = RATING_RANGE_LENGTH;
const RATING_OFFSET = -MIN_RATING_LIMIT;

const eloWinProbability = new Array(2 * RATING_RANGE_LENGTH + 1);
for (
  let difference = -RATING_RANGE_LENGTH;
  difference <= RATING_RANGE_LENGTH;
  difference += 1
) {
  eloWinProbability[difference + ELO_OFFSET] =
    1 / (1 + Math.pow(10, difference / 400));
}

const fft = new FFTConv(eloWinProbability.length + RATING_RANGE_LENGTH - 1);

export class Contestant {
  constructor(handle, points, penalty, rating) {
    this.handle = handle;
    this.points = points;
    this.penalty = penalty;
    this.rating = rating;
    this.effectiveRating = rating == null ? DEFAULT_RATING : rating;
    this.rank = null;
    this.delta = null;
    this.performance = null;
  }
}

export class RatingCalculator {
  constructor(contestants) {
    this.contestants = contestants;
    this.seed = null;
    this.adjustment = null;
  }

  calculate(calcPerformances = false) {
    this.calculateSeed();
    this.reassignRanks();
    this.calculateDeltas();
    this.adjustDeltas();
    if (calcPerformances) this.calculatePerformances();
  }

  calculateSeed() {
    const counts = new Array(RATING_RANGE_LENGTH).fill(0);
    for (const contestant of this.contestants) {
      counts[contestant.effectiveRating + RATING_OFFSET] += 1;
    }
    this.seed = fft.convolve(eloWinProbability, counts);
    for (let index = 0; index < this.seed.length; index += 1) {
      this.seed[index] += 1;
    }
  }

  getSeed(rating, excludedRating) {
    return (
      this.seed[rating + ELO_OFFSET + RATING_OFFSET] -
      eloWinProbability[rating - excludedRating + ELO_OFFSET]
    );
  }

  reassignRanks() {
    this.contestants.sort((first, second) =>
      first.points !== second.points
        ? second.points - first.points
        : first.penalty - second.penalty,
    );
    let previousPoints;
    let previousPenalty;
    let rank;
    for (let index = this.contestants.length - 1; index >= 0; index -= 1) {
      const contestant = this.contestants[index];
      if (
        contestant.points !== previousPoints ||
        contestant.penalty !== previousPenalty
      ) {
        previousPoints = contestant.points;
        previousPenalty = contestant.penalty;
        rank = index + 1;
      }
      contestant.rank = rank;
    }
  }

  calculateDelta(contestant, assumedRating) {
    const seed = this.getSeed(assumedRating, contestant.effectiveRating);
    const middleRank = Math.sqrt(contestant.rank * seed);
    const neededRating = this.rankToRating(
      middleRank,
      contestant.effectiveRating,
    );
    return Math.trunc((neededRating - assumedRating) / 2);
  }

  calculateDeltas() {
    for (const contestant of this.contestants) {
      contestant.delta = this.calculateDelta(
        contestant,
        contestant.effectiveRating,
      );
    }
  }

  rankToRating(rank, selfRating) {
    return (
      binarySearch(2, MAX_RATING_LIMIT, (rating) =>
        this.getSeed(rating, selfRating) < rank,
      ) - 1
    );
  }

  adjustDeltas() {
    this.contestants.sort(
      (first, second) => second.effectiveRating - first.effectiveRating,
    );
    const count = this.contestants.length;
    const totalDelta = this.contestants.reduce(
      (sum, contestant) => sum + contestant.delta,
      0,
    );
    const firstAdjustment = Math.trunc(-totalDelta / count) - 1;
    this.adjustment = firstAdjustment;
    for (const contestant of this.contestants) {
      contestant.delta += firstAdjustment;
    }

    const zeroSumCount = Math.min(4 * Math.round(Math.sqrt(count)), count);
    const topDelta = this.contestants
      .slice(0, zeroSumCount)
      .reduce((sum, contestant) => sum + contestant.delta, 0);
    const secondAdjustment = Math.min(
      Math.max(Math.trunc(-topDelta / zeroSumCount), -10),
      0,
    );
    this.adjustment += secondAdjustment;
    for (const contestant of this.contestants) {
      contestant.delta += secondAdjustment;
    }
  }

  calculatePerformances() {
    for (const contestant of this.contestants) {
      contestant.performance =
        contestant.rank === 1
          ? Number.POSITIVE_INFINITY
          : binarySearch(
              MIN_RATING_LIMIT,
              MAX_RATING_LIMIT,
              (assumedRating) =>
                this.calculateDelta(contestant, assumedRating) +
                  this.adjustment <=
                0,
            );
    }
  }
}

export default function predict(contestants, calcPerformances = false) {
  new RatingCalculator(contestants).calculate(calcPerformances);
  return contestants;
}

/**
 * Calculates deltas and performances from already-published official ranks.
 *
 * This path is preferable for completed contests because Codeforces
 * `contest.ratingChanges` contains every rated participant and the exact rank
 * used by the rating system, while the public standings response can omit or
 * rename individual rows.
 */
export function predictFromRanks(contestants, calcPerformances = true) {
  if (
    contestants.some(
      (contestant) =>
        !Number.isFinite(Number(contestant.rank)) ||
        Number(contestant.rank) <= 0,
    )
  ) {
    throw new Error("Carrot Plus 需要完整的官方排名");
  }
  const calculator = new RatingCalculator(contestants);
  calculator.calculateSeed();
  calculator.calculateDeltas();
  calculator.adjustDeltas();
  if (calcPerformances) calculator.calculatePerformances();
  return contestants;
}
