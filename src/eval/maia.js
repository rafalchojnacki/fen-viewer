import { Chess } from 'chess.js';
import { swapWdl } from './format.js';

export const MAIA_MODEL_URL = '/models/maia3_23m.onnx';
// Rating levels averaged for the move-probability circles.
export const CIRCLE_RATINGS = [2200, 2300, 2400, 2500, 2600];

let loading = null;
let progressListener = null;

// The maia3-js and onnxruntime code is loaded on first use, not at page load.
export function loadMaia(onProgress) {
  if (onProgress) progressListener = onProgress;
  if (!loading) {
    loading = (async () => {
      const { Maia3 } = await import('maia3-js/web');
      const instance = new Maia3({
        variant: '23m',
        url: MAIA_MODEL_URL,
        numThreads: 1,
        simd: true,
        proxy: false,
        onProgress: (loaded, total) => progressListener?.(loaded, total),
      });
      await instance.load();
      return instance;
    })().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Scores the candidate moves of one position.
//   fen:       position being analysed (side to move is the mover)
//   moves:     [{ uci, childFen }] one entry per engine line, childFen is the
//              position after that move
//   rating:    rating used for the peer win/draw/loss
// Returns { moves, topProbability }: moves has one { probability, wdl } per
// input move (probability averaged over CIRCLE_RATINGS, wdl from the mover's
// point of view); topProbability is the highest averaged probability of any
// legal move in the position.
export async function scoreMoves({ fen, moves, rating }) {
  const instance = await loadMaia();

  const positions = await instance.predictBatch(
    CIRCLE_RATINGS.map((selfElo) => ({ fen, selfElo })),
    { onError: 'collect' },
  );

  const childInputs = [];
  const childIndex = [];
  moves.forEach((move, index) => {
    if (!move.childFen || isGameOver(move.childFen)) return;
    childInputs.push({ fen: move.childFen, selfElo: rating, oppoElo: rating });
    childIndex.push(index);
  });
  const children = childInputs.length
    ? await instance.predictBatch(childInputs, { onError: 'collect' })
    : [];

  const valid = positions.filter((position) => !(position instanceof Error));

  // Highest averaged probability over every legal move in the position.
  // Circles are scaled against it, so the most probable move is always full.
  const sums = new Map();
  for (const position of valid) {
    for (const [uci, p] of position.moves) sums.set(uci, (sums.get(uci) ?? 0) + p);
  }
  const topProbability = valid.length
    ? Math.max(0, ...[...sums.values()].map((sum) => sum / valid.length))
    : null;

  const results = moves.map((move) => {
    const probabilities = valid.map((position) => position.moves.get(move.uci) ?? 0);
    return {
      probability: probabilities.length ? average(probabilities) : null,
      wdl: null,
    };
  });

  children.forEach((child, i) => {
    if (child instanceof Error) return;
    // The child is scored from the opponent's side to move.
    results[childIndex[i]].wdl = swapWdl(child.wdl);
  });

  return { moves: results, topProbability };
}

function isGameOver(fen) {
  const chess = new Chess(fen);
  return chess.isGameOver();
}
