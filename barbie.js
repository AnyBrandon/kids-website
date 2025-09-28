// Barbie memory game for Rita – with timer, sounds, animations, and funny chicken!

const characters = [
  { name: "Barbie1", img: "images/barbie1.png" },
  { name: "Barbie2", img: "images/barbie2.png" },
  { name: "Barbie3", img: "images/barbie3.png" },
  { name: "Barbie4", img: "images/barbie4.png" },
  { name: "Barbie5", img: "images/barbie5.png" },
  { name: "Barbie6", img: "images/barbie6.png" },
  { name: "Barbie7", img: "images/barbie7.png" },
  { name: "Barbie8", img: "images/barbie8.png" }
];

// Declare variables (assigned in window.onload)
let flipSound, winSound, chickenSound;
let timerDisplay, timerContainer;
let chickenAnim, chickenMessage;

let cards = [];
let flipped = [];
let matchedPairs = 0;
let timerInterval = null;
let timeLeft = 0;
let gameActive = false;

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function createCards() {
  const board = document.getElementById("gameBoard");
  board.innerHTML = "";
  const doubled = [...characters, ...characters];
  shuffle(doubled);

  cards = doubled.map((char, index) => {
    const card = document.createElement("div");
    card.classList.add("card");
    card.dataset.name = char.name;
    card.dataset.index = index;

    const front = document.createElement("div");
    front.classList.add("front");

    const back = document.createElement("div");
    back.classList.add("back");
    const img = document.createElement("img");
    img.src = char.img;
    img.alt = char.name;
    back.appendChild(img);

    card.appendChild(front);
    card.appendChild(back);

    card.addEventListener("click", () => flipCard(card));
    return card;
  });

  cards.forEach(card => document.getElementById("gameBoard").appendChild(card));
}

function flipCard(card) {
  if (
    !gameActive ||
    flipped.length === 2 ||
    card.classList.contains("flipped") ||
    card.classList.contains("matched")
  ) return;

  card.classList.add("flipped");
  flipped.push(card);

  flipSound.currentTime = 0;
  flipSound.play();

  if (flipped.length === 2) {
    checkMatch();
  }
}

function checkMatch() {
  const [first, second] = flipped;

  if (first.dataset.name === second.dataset.name) {
    first.classList.add("matched");
    second.classList.add("matched");
    matchedPairs++;

    if (matchedPairs === characters.length) {
      gameWon();
    }
  } else {
    setTimeout(() => {
      first.classList.remove("flipped");
      second.classList.remove("flipped");
    }, 1000);
  }

  flipped = [];
}

function gameWon() {
  gameActive = false;
  clearInterval(timerInterval);
  timerContainer.classList.add("hidden");

  winSound.currentTime = 0;
  winSound.play();

  document.getElementById("winMessage").classList.remove("hidden");
}


function gameLost() {
  gameActive = false;
  clearInterval(timerInterval);
  timerContainer.classList.add("hidden");

  document.getElementById("gameBoard").classList.add("hide-board");

// Show chicken animation and message
chickenAnim.classList.remove("hidden");
chickenAnim.classList.add("show");
chickenMessage.classList.remove("hidden");

  chickenSound.currentTime = 0;
  chickenSound.play();
}

function startTimer(seconds) {
  timeLeft = seconds;
  timerDisplay.textContent = timeLeft;
  timerContainer.classList.remove("hidden");

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      gameLost();
    }
  }, 1000);
}

function startGame(difficulty) {
  const timeMap = {
    easy: 90,
    medium: 60,
    hard: 45,
    legendary: 30
  };

  if (!timeMap[difficulty]) return;

  matchedPairs = 0;
  flipped = [];
  gameActive = true;

  clearInterval(timerInterval);

  chickenAnim.classList.remove("show");
  chickenAnim.classList.add("hidden");
  document.getElementById("winMessage").classList.add("hidden");
  chickenMessage.classList.add("hidden");
  document.getElementById("gameBoard").classList.remove("hide-board");

  createCards();
  startTimer(timeMap[difficulty]);
}

window.onload = () => {
  // Assign all DOM elements
  flipSound = document.getElementById("flipSound");
  winSound = document.getElementById("winSound");
  chickenSound = document.getElementById("chickenSound");

  timerDisplay = document.getElementById("timer");
  timerContainer = document.querySelector(".timer-container");
  chickenAnim = document.getElementById("chickenAnim");
  chickenMessage = document.getElementById("chickenMessage");

  gameActive = false;
  timerContainer.classList.add("hidden");
  chickenAnim.classList.remove("show");
  chickenMessage.classList.add("hidden");
};
