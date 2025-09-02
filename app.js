(() => {
  // State
  const state = {
    decks: 6,
    shoe: [],
    discard: [],
    playerHand: [],
    dealerHand: [],
    dealerHoleHidden: true,
    bankroll: 1000,
    pendingBet: 0,
    activeBet: 0,
    inRound: false,
    canAct: false,
    timerTickId: null,
  };

  // Elements
  const el = (id) => document.getElementById(id);
  const dealerHandEl = el('dealerHand');
  const playerHandEl = el('playerHand');
  const dealerTotalEl = el('dealerTotal');
  const playerTotalEl = el('playerTotal');
  const messageEl = el('message');
  const bankrollEl = el('bankroll');
  const betAmountEl = el('betAmount');
  const betCircleEl = el('betCircle');
  const bustProbEl = el('bustProb');
  const hintEl = el('basicHint');
  const countdownEl = document.getElementById('countdown');
  const countdownCircle = document.getElementById('countdownCircle');
  const countdownNumber = document.getElementById('countdownNumber');

  const dealBtn = el('dealBtn');
  const hitBtn = el('hitBtn');
  const standBtn = el('standBtn');
  const doubleBtn = el('doubleBtn');
  const splitBtn = el('splitBtn');

  const clearBetBtn = el('clearBet');
  const decksSelect = el('decksSelect');
  // removed adjustable timer and autoplay controls

  const snd = {
    deal: document.getElementById('sndDeal'),
    card: document.getElementById('sndCard'),
    win: document.getElementById('sndWin'),
    lose: document.getElementById('sndLose'),
    push: document.getElementById('sndPush'),
    cash: document.getElementById('sndCash'),
  };

  // Card assets mapping
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits = [
    { key: 'S', nome: 'espadas' },
    { key: 'H', nome: 'copas' },
    { key: 'D', nome: 'ouros' },
    { key: 'C', nome: 'paus' },
  ];

  const rankToValue = (r) => {
    if (r === 'A') return 11; // adjust later if bust
    if (r === 'K' || r === 'Q' || r === 'J' || r === '10') return 10;
    return parseInt(r, 10);
  };

  function createShoe(decks) {
    const cards = [];
    for (let d = 0; d < decks; d++) {
      for (const s of suits) {
        for (const r of ranks) {
          cards.push({ r, s: s.key, v: rankToValue(r), img: `static/cards/${r}${s.key}.png` });
        }
      }
    }
    // shuffle
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  function resetShoeIfNeeded() {
    // reshuffle if penetration high or exhausted
    if (state.shoe.length < state.decks * 52 * 0.2) {
      state.discard = [];
      state.shoe = createShoe(state.decks);
      setMessage(`Novo shoe embaralhado (${state.decks} baralhos).`);
    }
  }

  function drawCard() {
    if (state.shoe.length === 0) resetShoeIfNeeded();
    const c = state.shoe.pop();
    return c;
  }

  function handTotal(hand) {
    let sum = 0;
    let aces = 0;
    for (const c of hand) {
      sum += c.v === 11 && c.r === 'A' ? 11 : c.v;
      if (c.r === 'A') aces++;
    }
    // downgrade aces from 11 to 1 as needed
    while (sum > 21 && aces > 0) {
      sum -= 10;
      aces--;
    }
    return sum;
  }

  function isBlackjack(hand) {
    return hand.length === 2 && handTotal(hand) === 21;
  }

  function renderHands() {
    // Dealer
    dealerHandEl.innerHTML = '';
    state.dealerHand.forEach((c, idx) => {
      const img = document.createElement('img');
      if (idx === 1 && state.dealerHoleHidden) {
        img.src = 'static/cards/gray_back.png';
      } else {
        img.src = c.img;
      }
      img.alt = `${c.r}${c.s}`;
      img.className = 'dealt';
      dealerHandEl.appendChild(img);
    });
    dealerTotalEl.textContent = state.dealerHoleHidden ? (state.dealerHand[0] ? (state.dealerHand[0].v === 11 && state.dealerHand[0].r==='A' ? 11 : state.dealerHand[0].v) : 0) : handTotal(state.dealerHand);

    // Player
    playerHandEl.innerHTML = '';
    state.playerHand.forEach((c) => {
      const img = document.createElement('img');
      img.src = c.img;
      img.alt = `${c.r}${c.s}`;
      img.className = 'dealt';
      playerHandEl.appendChild(img);
    });
    playerTotalEl.textContent = handTotal(state.playerHand);
  }

  function setMessage(msg) {
    messageEl.textContent = msg;
  }

  function updateHUD() {
    bankrollEl.textContent = state.bankroll.toString();
    betAmountEl.textContent = state.pendingBet.toString();
    computeAndShowStats();
  }

  function enableActions(canHitStand) {
    hitBtn.disabled = !canHitStand;
    standBtn.disabled = !canHitStand;
    // allow double only on first action with exactly two cards
    const allowDouble = canHitStand && state.playerHand.length === 2 && state.bankroll >= state.activeBet;
    doubleBtn.disabled = !allowDouble;
    // split coming later
    splitBtn.disabled = true;
  }

  function placePendingChip(value) {
    if (state.inRound) return;
    if (state.bankroll < value) return;
    state.bankroll -= value;
    state.pendingBet += value;
    // place a small chip image into bet circle stack
    renderBetCircle();
    updateHUD();
  }

  function clearPendingBet() {
    if (state.inRound) return;
    state.bankroll += state.pendingBet;
    state.pendingBet = 0;
    renderBetCircle();
    updateHUD();
  }

  function renderBetCircle() {
    betCircleEl.innerHTML = '';
    const amountToRender = state.inRound ? state.activeBet : state.pendingBet;
    if (amountToRender <= 0) return;
    // render chips stacked roughly proportional: greedy by denominations
    const denoms = [500,100,50,20,10,5];
    let remain = amountToRender;
    let idx = 0;
    for (const d of denoms) {
      while (remain >= d) {
        const b = document.createElement('button');
        b.className = 'chip';
        b.style.left = `${20 + (idx%3)*34}px`;
        b.style.top = `${20 + Math.floor(idx/3)*14}px`;
        const im = document.createElement('img');
        im.src = `static/chips/${d}.png`;
        im.alt = `${d}`;
        b.appendChild(im);
        betCircleEl.appendChild(b);
        remain -= d;
        idx++;
      }
    }
  }

  function startRound() {
    if (state.inRound) return;
    if (state.pendingBet <= 0) { setMessage('Selecione fichas para apostar.'); return; }
    // hide pre-round countdown when entering and stop the timer
    if (countdownEl) {
      countdownEl.setAttribute('aria-hidden', 'true');
      countdownEl.style.display = 'none'; // force hide
    }
    if (state.timerTickId) { clearInterval(state.timerTickId); state.timerTickId = null; }

    resetShoeIfNeeded();
    state.inRound = true;
    state.canAct = true;
    state.activeBet = state.pendingBet;
    state.pendingBet = 0;
    renderBetCircle();
    updateHUD();

    state.playerHand = [];
    state.dealerHand = [];
    state.dealerHoleHidden = true;
    setMessage('Distribuindo...');
    snd.deal && snd.deal.play().catch(()=>{});

    // deal sequence: P, D(up), P, D(hole)
    state.playerHand.push(drawCard());
    state.dealerHand.push(drawCard());
    state.playerHand.push(drawCard());
    state.dealerHand.push(drawCard());
    renderHands();

    // natural checks
    const playerBJ = isBlackjack(state.playerHand);
    const dealerBJ = isBlackjack(state.dealerHand);
    if (playerBJ || dealerBJ) {
      revealDealer();
      resolveRoundOnStand();
      return;
    }

    setMessage('Sua vez.');
    enableActions(true);
    // no in-turn countdown; only pre-round countdown
  }

  function revealDealer() {
    state.dealerHoleHidden = false;
    renderHands();
  }

  function hit() {
    if (!state.inRound || !state.canAct) return;
    state.playerHand.push(drawCard());
    snd.card && snd.card.play().catch(()=>{});
    renderHands();
    const total = handTotal(state.playerHand);
    if (total > 21) {
      // bust
      state.canAct = false;
      revealDealer();
      endRound('lose');
      return;
    }
    enableActions(true);
  }

  function stand() {
    if (!state.inRound || !state.canAct) return;
    state.canAct = false;
    revealDealer();
    dealerPlayThenResolve();
  }

  function doubleDown() {
    if (!state.inRound || !state.canAct) return;
    if (state.playerHand.length !== 2) return;
    if (state.bankroll < state.activeBet) return;
    // take additional stake
    state.bankroll -= state.activeBet;
    state.activeBet *= 2;
    updateHUD();
    // one card only then stand
    hit();
    if (handTotal(state.playerHand) <= 21) {
      state.canAct = false;
      revealDealer();
      dealerPlayThenResolve();
    }
  }

  function dealerPlayThenResolve() {
    // Dealer hits until 17 (S17)
    while (handTotal(state.dealerHand) < 17) {
      state.dealerHand.push(drawCard());
    }
    renderHands();
    resolveRoundOnStand();
  }

  function resolveRoundOnStand() {
    const p = handTotal(state.playerHand);
    const d = handTotal(state.dealerHand);
    const playerBJ = isBlackjack(state.playerHand);
    const dealerBJ = isBlackjack(state.dealerHand);

    let outcome = '';
    if (p > 21) outcome = 'lose';
    else if (d > 21) outcome = 'win';
    else if (playerBJ && !dealerBJ) outcome = 'blackjack';
    else if (dealerBJ && !playerBJ) outcome = 'lose';
    else if (p > d) outcome = 'win';
    else if (p < d) outcome = 'lose';
    else outcome = 'push';

    endRound(outcome);
  }

  function endRound(outcome) {
    let msg = '';
    if (outcome === 'blackjack') {
      const win = Math.floor(state.activeBet * 2.5); // pays 3:2
      state.bankroll += win;
      msg = `Blackjack! Você ganha $${win - state.activeBet}.`;
      snd.win && snd.win.play().catch(()=>{});
      snd.cash && snd.cash.play().catch(()=>{});
    } else if (outcome === 'win') {
      const win = state.activeBet * 2;
      state.bankroll += win;
      msg = `Você venceu $${state.activeBet}.`;
      snd.win && snd.win.play().catch(()=>{});
      snd.cash && snd.cash.play().catch(()=>{});
    } else if (outcome === 'push') {
      state.bankroll += state.activeBet; // return bet
      msg = 'Empate. Aposta devolvida.';
      snd.push && snd.push.play().catch(()=>{});
    } else {
      msg = `Você perdeu $${state.activeBet}.`;
      snd.lose && snd.lose.play().catch(()=>{});
    }

    setMessage(msg);
    state.discard.push(...state.playerHand, ...state.dealerHand);
    state.playerHand = [];
    state.dealerHand = [];
    state.inRound = false;
    state.activeBet = 0;
    enableActions(false);
    updateHUD();
    renderBetCircle();
    // start pre-round countdown overlay
    startPreRoundCountdown();
  }

  // Probability and hints (simple bust chance next card)
  function computeAndShowStats() {
    if (!state.inRound || !state.canAct) {
      bustProbEl.textContent = '0';
      hintEl.textContent = '-';
      return;
    }
    const total = handTotal(state.playerHand);
    const need = 22 - total; // smallest value that would bust is need<=0
    let bustCards = 0;
    const remaining = state.shoe.length;
    if (remaining <= 0) {
      bustProbEl.textContent = '0';
      hintEl.textContent = '-';
      return;
    }
    // approximate by counting card values directly from remaining cards
    const values = [];
    for (const c of state.shoe) {
      const val = c.v === 11 && c.r==='A' ? 11 : c.v;
      values.push(val);
    }
    for (const v of values) {
      // consider Ace flexibility: if v==11, it can be 1 if needed
      const effective = (v === 11 && total + 11 > 21) ? 1 : v;
      if (total + effective > 21) bustCards++;
    }
    const prob = Math.round((bustCards / remaining) * 100);
    bustProbEl.textContent = `${prob}`;

    // very simplified hint
    let hint = 'Parar';
    if (total <= 11) hint = 'Pedir';
    else if (total === 12) hint = 'Pedir';
    else if (total >= 13 && total <= 16) {
      // peek dealer upcard if visible
      const up = state.dealerHand[0];
      const upVal = up ? (up.v === 11 && up.r==='A' ? 11 : up.v) : 10;
      hint = upVal >= 7 ? 'Pedir' : 'Parar';
    } else if (total >= 17) hint = 'Parar';
    hintEl.textContent = hint;
  }

  // Pre-round countdown (center overlay) – 20 seconds
  function startPreRoundCountdown() {
    if (state.timerTickId) { clearInterval(state.timerTickId); state.timerTickId = null; }
    let remaining = 20;
    if (countdownEl) {
      countdownEl.setAttribute('aria-hidden', 'false');
      countdownEl.style.display = 'grid'; // force show
    }
    const circumference = 113.097; // r=18
    if (countdownCircle) countdownCircle.style.strokeDasharray = `${circumference}`;
    const setVisuals = () => {
      if (countdownNumber) countdownNumber.textContent = `${remaining.toString().padStart(2,'0')}`;
      if (countdownCircle) {
        const offset = circumference * (1 - remaining / 20);
        countdownCircle.style.strokeDashoffset = `${offset}`;
      }
    };
    setVisuals();
    state.timerTickId = setInterval(() => {
      remaining -= 1;
      setVisuals();
      if (remaining <= 0) {
        clearInterval(state.timerTickId);
        state.timerTickId = null;
        // when timer reaches 0, reset the entire game
        resetGameOnTimeout();
      }
    }, 1000);
  }

  // Reset game when timer reaches 0
  function resetGameOnTimeout() {
    // clear hands and reset state
    state.playerHand = [];
    state.dealerHand = [];
    state.inRound = false;
    state.canAct = false;
    state.activeBet = 0;
    state.pendingBet = 0;
    
    // clear bet circle
    renderBetCircle();
    
    // disable action buttons
    enableActions(false);
    
    // clear hands display
    renderHands();
    
    // update HUD
    updateHUD();
    
    // set message
    setMessage('Tempo esgotado! Selecione fichas e clique Entrar para jogar.');
    
    // hide countdown
    if (countdownEl) {
      countdownEl.setAttribute('aria-hidden', 'true');
      countdownEl.style.display = 'none';
    }
  }

  // Events
  dealBtn.addEventListener('click', startRound);
  hitBtn.addEventListener('click', hit);
  standBtn.addEventListener('click', stand);
  doubleBtn.addEventListener('click', doubleDown);
  splitBtn.addEventListener('click', () => { /* reserved for future */ });

  clearBetBtn.addEventListener('click', clearPendingBet);
  document.getElementById('chipsTray').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    const val = parseInt(btn.getAttribute('data-value'), 10);
    if (!isNaN(val)) placePendingChip(val);
  });

  decksSelect.addEventListener('change', () => {
    state.decks = parseInt(decksSelect.value, 10);
    state.shoe = createShoe(state.decks);
    setMessage(`Baralhos: ${state.decks}. Shoe novo.`);
  });
  // removed adjustable timer and autoplay listeners

  // Init
  state.shoe = createShoe(state.decks);
  updateHUD();
  renderHands();
  // start pre-round countdown on load
  startPreRoundCountdown();
})();


