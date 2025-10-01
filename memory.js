// Fortnite memory game for George – with timer, sounds, animations, and funny chicken!

const characters = [
  { name: "Peely", img: "images/fortniteSkin1.png" },
  { name: "Drift", img: "images/fortniteSkin2.png" },
  { name: "Fishstick", img: "images/fortniteSkin3.png" },
  { name: "Jonesy", img: "images/fortniteSkin4.png" },
  { name: "Midas", img: "images/fortniteSkin5.png" },
  { name: "Raven", img: "images/fortniteSkin6.png" },
  { name: "Lynx", img: "images/fortniteSkin7.png" },
  { name: "Meowscles", img: "images/fortniteSkin8.png" }
];

// DOM elements
const flipSound = document.getElementById("flipSound");
const winSound = document.getElementById("winSound");
const chickenSound = document.getElementById("chickenSound");
const timerDisplay = document.getElementById("timer");
const timerContainer = document.querySelector(".timer-container");
const chickenAnim = document.getElementById("chickenAnim");
const chickenMessage = document.getElementById("chickenMessage");
let currentDifficulty = null;
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

  document.getElementById("winMessage").classList.remove("hidden");
  winSound.currentTime = 0;
  winSound.play();

  console.log("Player won on difficulty:", currentDifficulty);

  // Define trophies for each difficulty
  const difficultyTrophies = {
    easy: "fortniteEasyTrophy",
    medium: "fortniteMediumTrophy",
    hard: "fortniteHardTrophy",
    legendary: "fortniteLegendaryTrophy"
  };

  const trophyToAdd = difficultyTrophies[currentDifficulty];
  if (!trophyToAdd) return; // safety check

  // Retrieve existing trophies from localStorage
  const trophies = JSON.parse(localStorage.getItem("trophies") || "[]");

  // Check if the trophy already exists
  if (!trophies.includes(trophyToAdd)) {
    trophies.push(trophyToAdd);
    localStorage.setItem("trophies", JSON.stringify(trophies));
    console.log(`${trophyToAdd} added!`);
  } else {
    console.log(`${trophyToAdd} already earned.`);
  }
}



function gameLost() {
  gameActive = false;
  clearInterval(timerInterval);
  timerContainer.classList.add("hidden");

  // Hide the game board
  document.getElementById("gameBoard").classList.add("hide-board");

// Show chicken animation and message
chickenAnim.classList.remove("hidden");
chickenAnim.classList.add("show");
chickenMessage.classList.remove("hidden");


  // Play chicken sound
  chickenSound.currentTime = 0;
  chickenSound.play();
}

function startTimer(seconds) {
  timeLeft = seconds;
  timerDisplay.textContent = timeLeft;
  timerContainer.classList.remove("hidden");

  clearInterval(timerInterval); // Clear any previous interval
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

    // Store the current difficulty
  currentDifficulty = difficulty;

  // Reset state
  matchedPairs = 0;
  flipped = [];
  gameActive = true;

  clearInterval(timerInterval);

  // Hide previous win message and chicken
  document.getElementById("winMessage").classList.add("hidden");
  chickenAnim.classList.remove("show");
  chickenAnim.classList.add("hidden"); // ✅ This fully hides the chicken overlay
  chickenMessage.classList.add("hidden");

  // Show the game board again
  document.getElementById("gameBoard").classList.remove("hide-board");

  createCards();
  startTimer(timeMap[difficulty]);
}



window.onload = () => {
  gameActive = false;
  timerContainer.classList.add("hidden");
  chickenAnim.classList.remove("show");
  chickenMessage.classList.add("hidden");
};
