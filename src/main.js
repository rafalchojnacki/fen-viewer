import { Chessground } from '@lichess-org/chessground';
import '@lichess-org/chessground/assets/chessground.base.css';
import './theme.css';
import './style.css';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const fenInput = document.getElementById('fen-input');
const fenError = document.getElementById('fen-error');
const lichessBtn = document.getElementById('lichess-btn');
const boardEl = document.getElementById('board');
const moveIndicator = document.getElementById('move-indicator');
const coordsFilesTop = document.getElementById('coords-files-top');
const coordsRanksLeft = document.getElementById('coords-ranks-left');
const coordsRanksRight = document.getElementById('coords-ranks-right');
const coordsFilesBottom = document.getElementById('coords-files-bottom');

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

let currentFen = START_FEN;
let flipped = false;

const opposite = (color) => (color === 'white' ? 'black' : 'white');
const turnColor = (fen) => (fen.trim().split(/\s+/)[1] === 'w' ? 'white' : 'black');
const orientation = () => {
  const turn = turnColor(currentFen);
  return flipped ? opposite(turn) : turn;
};

const ground = Chessground(boardEl, {
  fen: START_FEN,
  coordinates: false,
  viewOnly: true,
  drawable: { enabled: false },
});

function span(text) {
  const el = document.createElement('span');
  el.textContent = text;
  return el;
}

function renderCoords(orientation) {
  const horizontal = orientation === 'white' ? FILES : [...FILES].reverse();
  const vertical = orientation === 'white' ? RANKS : [...RANKS].reverse();
  coordsFilesTop.replaceChildren(...horizontal.map(span));
  coordsFilesBottom.replaceChildren(...horizontal.map(span));
  coordsRanksLeft.replaceChildren(...vertical.map(span));
  coordsRanksRight.replaceChildren(...vertical.map(span));
}

function setTurn(turn) {
  moveIndicator.classList.toggle('turn-white', turn === 'w');
  moveIndicator.classList.toggle('turn-black', turn === 'b');
}

function isValidFen(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4 || parts.length > 6) return false;

  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return false;

  for (const rank of ranks) {
    let count = 0;
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) count += Number(ch);
      else if (/[prnbqkPRNBQK]/.test(ch)) count += 1;
      else return false;
    }
    if (count !== 8) return false;
  }

  if (!/^[wb]$/.test(parts[1])) return false;
  if (!/^(KQ?k?q?|Q?k?q?|k?q?|-)$/.test(parts[2])) return false;
  if (!/^(-|[a-h][36])$/.test(parts[3])) return false;

  if (parts.length > 4 && !/^\d+$/.test(parts[4])) return false;
  if (parts.length > 5 && !/^\d+$/.test(parts[5])) return false;

  return true;
}

function isCheck(fen) {
  const field = fen.trim().split(/\s+/)[3] || '';
  return /[kK]/.test(field);
}

function applyFen(fen) {
  const trimmed = fen.trim();
  if (isValidFen(trimmed)) {
    fenInput.classList.remove('invalid');
    fenError.hidden = true;
    lichessBtn.disabled = false;
    currentFen = trimmed;
    refresh();
  } else {
    fenInput.classList.add('invalid');
    fenError.hidden = false;
    lichessBtn.disabled = true;
  }
}

function refresh() {
  const ori = orientation();
  ground.set({ fen: currentFen, orientation: ori, check: isCheck(currentFen) });
  renderCoords(ori);
  setTurn(turnColor(currentFen) === 'white' ? 'w' : 'b');
}

document.addEventListener('keydown', (event) => {
  if (event.target === fenInput) return;
  if (event.key.toLowerCase() === 'f') {
    flipped = !flipped;
    refresh();
  }
});

refresh();

let debounceTimer;
fenInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => applyFen(fenInput.value), 300);
});

lichessBtn.addEventListener('click', () => {
  if (lichessBtn.disabled) return;
  const parts = currentFen.trim().split(/\s+/).slice(0, 4).join(' ');
  window.open(`https://lichess.org/analysis/${parts.replace(/ /g, '_')}`, '_blank');
});