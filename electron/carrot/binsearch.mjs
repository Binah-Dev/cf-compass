/**
 * Binary search helper adapted from Carrot Plus (MIT).
 * Searches integers in [left, right) for the first true predicate.
 */
export default function binarySearch(left, right, predicate) {
  if (left > right) {
    throw new Error(`left ${left} must be <= right ${right}`);
  }
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (predicate(middle)) {
      right = middle;
    } else {
      left = middle + 1;
    }
  }
  return left;
}
