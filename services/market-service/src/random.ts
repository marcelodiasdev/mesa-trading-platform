export interface Random {
  next(): number;
}

export function createSeededRandom(seed: number): Random {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;

  return {
    next() {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0x1_0000_0000;
    },
  };
}
