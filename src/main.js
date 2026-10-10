import { Chess } from 'chess.js';
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
const moveList = document.getElementById('move-list');
const navFirst = document.getElementById('nav-first');
const navPrev = document.getElementById('nav-prev');
const navNext = document.getElementById('nav-next');
const promotionOverlay = document.getElementById('promotion');
const promotionMenu = document.getElementById('promotion-menu');

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];
const PROMOTION_NAMES = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };

let currentFen = START_FEN;
let flipped = false;
let game = null;
let timeline = [{ fen: START_FEN, san: null, from: null, to: null, moveNumber: 1, color: 'w' }];
let cursor = 0;
let pendingPromotion = null;
let showDests = localStorage.getItem('fen-viewer.showDests') !== 'false';

const turnColor = (fen) => (fen.trim().split(/\s+/)[1] === 'w' ? 'white' : 'black');
const orientation = () => (flipped ? 'black' : 'white');

const ground = Chessground(boardEl, {
  fen: START_FEN,
  coordinates: false,
  viewOnly: false,
  drawable: { enabled: false },
  movable: {
    free: false,
    showDests: true,
    events: { after: onMove },
  },
  premovable: { enabled: false },
  draggable: { enabled: true, showGhost: true },
  selectable: { enabled: true },
  animation: { enabled: true, duration: 200 },
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

function makeGame(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function legalDests() {
  const dests = new Map();
  if (!game || game.isGameOver()) return dests;
  for (const move of game.moves({ verbose: true })) {
    const targets = dests.get(move.from);
    if (targets) targets.push(move.to);
    else dests.set(move.from, [move.to]);
  }
  return dests;
}

function renderMoves() {
  const groups = [];
  for (let i = 1; i < timeline.length; i += 1) {
    const entry = timeline[i];
    let group = groups[groups.length - 1];
    if (!group || group.number !== entry.moveNumber) {
      group = { number: entry.moveNumber, w: null, b: null };
      groups.push(group);
    }
    group[entry.color] = i;
  }

  const rows = groups.map((group) => {
    const row = document.createElement('li');
    row.className = 'move-row';

    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${group.number}.`;
    row.appendChild(num);
    row.appendChild(group.w !== null ? moveButton(group.w) : emptyCell());
    row.appendChild(group.b !== null ? moveButton(group.b) : emptyCell());
    return row;
  });

  moveList.replaceChildren(...rows);
  moveList.querySelector('.move-ply.active')?.scrollIntoView({ block: 'nearest' });
}

function moveButton(index) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `move-ply${index === cursor ? ' active' : ''}`;
  btn.textContent = timeline[index].san;
  btn.addEventListener('click', () => goto(index));
  return btn;
}

function emptyCell() {
  const el = document.createElement('span');
  el.className = 'move-ply empty';
  return el;
}

function renderNav() {
  navFirst.disabled = cursor === 0;
  navPrev.disabled = cursor === 0;
  navNext.disabled = cursor >= timeline.length - 1;
}

function refresh() {
  const ori = orientation();
  const turn = turnColor(currentFen);
  const entry = timeline[cursor];
  ground.set({
    fen: currentFen,
    orientation: ori,
    turnColor: turn,
    check: game ? game.isCheck() : isCheck(currentFen),
    lastMove: entry && entry.from ? [entry.from, entry.to] : undefined,
    movable: {
      free: false,
      color: turn,
      dests: legalDests(),
      showDests,
    },
  });
  renderCoords(ori);
  setTurn(turn === 'white' ? 'w' : 'b');
  fenInput.value = currentFen;
  renderMoves();
  renderNav();
}

function goto(index) {
  if (index < 0 || index >= timeline.length) return;
  cursor = index;
  currentFen = timeline[cursor].fen;
  game = makeGame(currentFen);
  refresh();
}

function commitMove(move, moveNumber, color) {
  timeline = timeline.slice(0, cursor + 1);
  timeline.push({
    fen: game.fen(),
    san: move.san,
    from: move.from,
    to: move.to,
    moveNumber,
    color,
  });
  cursor = timeline.length - 1;
  currentFen = game.fen();
  refresh();
}

function onMove(orig, dest) {
  if (!game) {
    refresh();
    return;
  }

  const candidates = game.moves({ verbose: true }).filter(
    (move) => move.from === orig && move.to === dest,
  );

  if (!candidates.length) {
    refresh();
    return;
  }

  if (candidates.some((move) => move.promotion)) {
    ground.set({ fen: currentFen });
    openPromotion(orig, dest, candidates[0].color);
    return;
  }

  const moveNumber = game.moveNumber();
  const color = game.turn();
  const move = game.move({ from: orig, to: dest });
  commitMove(move, moveNumber, color);
}

function openPromotion(orig, dest, color) {
  pendingPromotion = { orig, dest, color };
  promotionMenu.replaceChildren(
    ...PROMOTION_PIECES.map((piece) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = PROMOTION_NAMES[piece];
      btn.setAttribute('aria-label', PROMOTION_NAMES[piece]);
      const img = document.createElement('img');
      img.src = `/piece/staunty/${color}${piece.toUpperCase()}.svg`;
      img.alt = PROMOTION_NAMES[piece];
      btn.appendChild(img);
      btn.addEventListener('click', () => completePromotion(piece));
      return btn;
    }),
  );
  promotionOverlay.hidden = false;
}

function closePromotion() {
  pendingPromotion = null;
  promotionOverlay.hidden = true;
  promotionMenu.replaceChildren();
}

function completePromotion(piece) {
  if (!pendingPromotion) return;
  const { orig, dest } = pendingPromotion;
  closePromotion();
  try {
    const moveNumber = game.moveNumber();
    const color = game.turn();
    const move = game.move({ from: orig, to: dest, promotion: piece });
    commitMove(move, moveNumber, color);
  } catch {
    refresh();
  }
}

function applyFen(fen) {
  const trimmed = fen.trim();
  if (isValidFen(trimmed)) {
    fenInput.classList.remove('invalid');
    fenError.hidden = true;
    lichessBtn.disabled = false;
    const parsed = makeGame(trimmed);
    const parts = trimmed.split(/\s+/);
    const moveNumber = parts.length > 5 ? Number(parts[5]) : 1;
    const color = parts[1];
    currentFen = trimmed;
    game = parsed;
    timeline = [
      { fen: trimmed, san: null, from: null, to: null, moveNumber, color },
    ];
    cursor = 0;
    refresh();
  } else {
    fenInput.classList.add('invalid');
    fenError.hidden = false;
    lichessBtn.disabled = true;
  }
}

navFirst.addEventListener('click', () => goto(0));
navPrev.addEventListener('click', () => goto(cursor - 1));
navNext.addEventListener('click', () => goto(cursor + 1));

promotionOverlay.addEventListener('click', (event) => {
  if (event.target === promotionOverlay) {
    closePromotion();
    refresh();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && pendingPromotion) {
    closePromotion();
    refresh();
    return;
  }
  if (event.key === 'Escape' && settingsMenu && !settingsMenu.hidden) {
    closeSettings();
    return;
  }
  if (event.target === fenInput) return;
  if (pendingPromotion) return;
  if (event.key.toLowerCase() === 'f') {
    flipped = !flipped;
    refresh();
  }
});

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

const timerToggle = document.getElementById('timer-toggle');
const timerPanel = document.getElementById('timer-panel');
const timerDisplay = document.getElementById('timer-display');
const timerStartPause = document.getElementById('timer-startpause');
const timerReset = document.getElementById('timer-reset');

let timerSeconds = 0;
let timerRunning = false;
let timerId = null;

const formatTime = (total) => {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

function renderTimer() {
  timerDisplay.textContent = formatTime(timerSeconds);
  timerStartPause.textContent = timerRunning ? 'Pause' : 'Start';
  timerToggle.classList.toggle('running', timerRunning);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
  timerRunning = false;
}

function resetTimer() {
  stopTimer();
  timerSeconds = 0;
  renderTimer();
}

timerStartPause.addEventListener('click', () => {
  if (timerRunning) {
    stopTimer();
    renderTimer();
  } else {
    timerRunning = true;
    timerId = setInterval(() => {
      timerSeconds += 1;
      renderTimer();
    }, 1000);
    renderTimer();
  }
});

timerReset.addEventListener('click', resetTimer);

timerToggle.addEventListener('click', () => {
  const willShow = timerPanel.hidden;
  timerPanel.hidden = !willShow;
  timerToggle.setAttribute('aria-pressed', String(willShow));
  timerToggle.title = willShow ? 'Hide timer' : 'Show timer';
  if (!willShow && !timerRunning) resetTimer();
});

const settingsToggle = document.getElementById('settings-toggle');
const settingsMenu = document.getElementById('settings-menu');
const showDestsInput = document.getElementById('setting-show-dests');
const themeButtons = document.querySelectorAll('.settings-theme-btn');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('fen-viewer.theme', theme);
  themeButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.themeValue === theme));
  });
}

let savedTheme = localStorage.getItem('fen-viewer.theme') || 'modern';
if (savedTheme === 'dark' || savedTheme === 'blue' || savedTheme === 'paper') savedTheme = 'modern';
if (savedTheme === 'wood') savedTheme = 'classic';
applyTheme(savedTheme);

themeButtons.forEach((btn) => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.themeValue));
});

function closeSettings() {
  settingsMenu.hidden = true;
  settingsToggle.setAttribute('aria-expanded', 'false');
  settingsToggle.setAttribute('aria-pressed', 'false');
  settingsToggle.title = 'Settings';
}

settingsToggle.addEventListener('click', () => {
  if (settingsMenu.hidden) {
    settingsMenu.hidden = false;
    settingsToggle.setAttribute('aria-expanded', 'true');
    settingsToggle.setAttribute('aria-pressed', 'true');
    settingsToggle.title = 'Hide settings';
  } else {
    closeSettings();
  }
});

showDestsInput.checked = showDests;
showDestsInput.closest('.settings-item').setAttribute('aria-checked', String(showDests));

showDestsInput.addEventListener('change', () => {
  showDestsInput.closest('.settings-item').setAttribute('aria-checked', String(showDestsInput.checked));
  showDests = showDestsInput.checked;
  localStorage.setItem('fen-viewer.showDests', String(showDests));
  refresh();
});

document.addEventListener('click', (event) => {
  if (
    !settingsMenu.hidden &&
    !settingsToggle.contains(event.target) &&
    !settingsMenu.contains(event.target)
  ) {
    closeSettings();
  }
});

renderTimer();

currentFen = START_FEN;
game = makeGame(START_FEN);
timeline = [{ fen: START_FEN, san: null, from: null, to: null, moveNumber: 1, color: 'w' }];
cursor = 0;
refresh();
