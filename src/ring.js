/** Fixed-capacity buffer. The page runs for days, so nothing may grow without bound. */
export class Ring {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.items = new Array(capacity);
    this.start = 0;
    this.length = 0;
  }

  push(value) {
    if (this.length < this.capacity) {
      this.items[(this.start + this.length) % this.capacity] = value;
      this.length += 1;
    } else {
      this.items[this.start] = value;
      this.start = (this.start + 1) % this.capacity;
    }
  }

  toArray() {
    const out = new Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.items[(this.start + i) % this.capacity];
    return out;
  }
}
