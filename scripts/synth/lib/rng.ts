export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    this.state = (this.state * 9301 + 49297) % 233280;
    return this.state / 233280;
  }

  int(minInclusive: number, maxInclusive: number): number {
    return Math.floor(this.next() * (maxInclusive - minInclusive + 1)) + minInclusive;
  }

  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  weighted<T>(choices: readonly { value: T; weight: number }[]): T {
    const total = choices.reduce((sum, c) => sum + c.weight, 0);
    let roll = this.next() * total;
    for (const choice of choices) {
      roll -= choice.weight;
      if (roll <= 0) return choice.value;
    }
    return choices[choices.length - 1].value;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  derive(label: string): Rng {
    let h = this.state;
    for (let i = 0; i < label.length; i += 1) {
      h = (h * 31 + label.charCodeAt(i)) >>> 0;
    }
    return new Rng(h || 1);
  }
}
