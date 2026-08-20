/**
 * Real-sequence convolution adapted from Carrot Plus (MIT).
 * Cooley-Tukey FFT, O(n log n).
 */
export default class FFTConv {
  constructor(length) {
    let exponent = 1;
    while ((1 << exponent) < length) exponent += 1;
    this.length = 1 << exponent;
    const halfLength = this.length >> 1;
    this.realRoots = [];
    this.imaginaryRoots = [];
    const angle = (2 * Math.PI) / this.length;
    for (let index = 0; index < halfLength; index += 1) {
      this.realRoots[index] = Math.cos(index * angle);
      this.imaginaryRoots[index] = Math.sin(index * angle);
    }
    this.reversed = [0];
    for (let index = 1; index < this.length; index += 1) {
      this.reversed[index] =
        (this.reversed[index >> 1] >> 1) | ((index & 1) << (exponent - 1));
    }
  }

  reverse(values) {
    for (let index = 1; index < this.length; index += 1) {
      if (index < this.reversed[index]) {
        const temporary = values[index];
        values[index] = values[this.reversed[index]];
        values[this.reversed[index]] = temporary;
      }
    }
  }

  transform(real, imaginary) {
    this.reverse(real);
    this.reverse(imaginary);
    for (let size = 2; size <= this.length; size <<= 1) {
      const half = size >> 1;
      const difference = this.length / size;
      for (let offset = 0; offset < this.length; offset += size) {
        let rootIndex = 0;
        for (let index = offset; index < offset + half; index += 1) {
          const paired = index + half;
          const valueReal =
            real[paired] * this.realRoots[rootIndex] -
            imaginary[paired] * this.imaginaryRoots[rootIndex];
          const valueImaginary =
            real[paired] * this.imaginaryRoots[rootIndex] +
            imaginary[paired] * this.realRoots[rootIndex];
          real[paired] = real[index] - valueReal;
          imaginary[paired] = imaginary[index] - valueImaginary;
          real[index] += valueReal;
          imaginary[index] += valueImaginary;
          rootIndex += difference;
        }
      }
    }
  }

  convolve(first, second) {
    if (!first.length || !second.length) return [];
    const resultLength = first.length + second.length - 1;
    if (resultLength > this.length) {
      throw new Error(`Convolution result ${resultLength} exceeds FFT size ${this.length}`);
    }
    const real = new Array(this.length).fill(0);
    const imaginary = new Array(this.length).fill(0);
    real.splice(0, first.length, ...first);
    imaginary.splice(0, second.length, ...second);
    this.transform(real, imaginary);

    real[0] = 4 * real[0] * imaginary[0];
    imaginary[0] = 0;
    for (
      let left = 1, right = this.length - 1;
      left <= right;
      left += 1, right -= 1
    ) {
      const firstReal = real[left] + real[right];
      const firstImaginary = imaginary[left] - imaginary[right];
      const secondReal = imaginary[right] + imaginary[left];
      const secondImaginary = real[right] - real[left];
      real[left] = firstReal * secondReal - firstImaginary * secondImaginary;
      imaginary[left] = firstReal * secondImaginary + firstImaginary * secondReal;
      real[right] = real[left];
      imaginary[right] = -imaginary[left];
    }

    this.transform(real, imaginary);
    const result = [];
    result[0] = real[0] / (4 * this.length);
    for (
      let left = 1, right = this.length - 1;
      left <= right;
      left += 1, right -= 1
    ) {
      result[left] = real[right] / (4 * this.length);
      result[right] = real[left] / (4 * this.length);
    }
    result.splice(resultLength);
    return result;
  }
}
