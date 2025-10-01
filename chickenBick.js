let mode = 'family'; // default mode
let eggPositions = [];
let crackedCount = 0;
let gameEnded = false;


function weightedRandom() {
  const probabilities = [
    { value: 0, weight: 11 },
    { value: 1, weight: 20 },
    { value: 2, weight: 22 },
    { value: 3, weight: 20 },
    { value: 4, weight: 16 },
    { value: 5, weight: 11 },
  ];

  const totalWeight = probabilities.reduce((acc, curr) => acc + curr.weight, 0);
  const random = Math.random() * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i].weight;
    if (random < cumulative) {
      return probabilities[i].value;
    }
  }
}


function startGame(selectedMode) {
  mode = selectedMode;
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");

  initializeEggs();

  const drawContainer = document.getElementById("draw-container");
  if (mode === "competitive") {
    drawContainer.classList.remove("hidden");
    drawContainer.classList.add("visible");
  } else {
    drawContainer.classList.remove("visible");
    drawContainer.classList.add("hidden");
  }

}


function initializeEggs() {
  const grid = document.getElementById("egg-grid");
  grid.innerHTML = '';
  crackedCount = 0;
  gameEnded = false;
  document.getElementById("status").innerText = `Eggs cracked: 0 / 24`;

  // Create 24 gold, 1 chicken — shuffle
  eggPositions = Array(24).fill("gold").concat("chicken");
  shuffleArray(eggPositions);

  for (let i = 0; i < 25; i++) {
    const egg = document.createElement("div");
    egg.classList.add("egg");
    egg.dataset.index = i;
    egg.addEventListener("click", handleEggClick);
    grid.appendChild(egg);
  }
}

function handleEggClick(e) {
  const egg = e.currentTarget;
  const index = egg.dataset.index;

  if (gameEnded || egg.classList.contains("revealed")) return;

  // Play crack sound
  const crackSound = new Audio("sounds/crack.wav");
  crackSound.play();

  egg.classList.add("shaking");

  setTimeout(() => {
    egg.classList.remove("shaking");
    revealEgg(egg, index);
  }, 2000);
}


function revealEgg(egg, index) {
  const result = eggPositions[index];
  egg.classList.add("revealed");

  if (result === "chicken") {
    // Skip showing any image — go straight to game over
    gameOver(false);
    return;
  }

  // Remove egg.png background
  egg.style.backgroundImage = "none";
  egg.innerHTML = ''; // Clear existing content

  const img = document.createElement("img");
  img.src = "images/gold.png";
  img.alt = "gold";
  img.classList.add("reveal-img");
  egg.appendChild(img);

  crackedCount++;
  document.getElementById("status").innerText = `🥚 Eggs cracked: ${crackedCount} / 24`;

  if (crackedCount === 24) {
    setTimeout(() => {
      gameOver(true);
    }, 0);
  }
}


function gameOver(won) {
  gameEnded = true;
  document.getElementById("game-screen").classList.add("hidden");
  document.getElementById("end-screen").classList.remove("hidden");

  const message = won
    ? "🎉 You Win! All the gold is yours! 🥇"
    : "💥 You Chicken Bicken! Game Over!";

  document.getElementById("end-message").innerText = message;

  const chickenDisplay = document.getElementById("chicken-display");
  chickenDisplay.innerHTML = '';

  if (!won) {
    const chickenImg = document.createElement("img");
    chickenImg.src = "images/chickenBicken.png";
    chickenImg.alt = "Angry Chicken Bicken";
    chickenDisplay.appendChild(chickenImg);
    // Play chicken.wav sound on loss
    const chickenSound = new Audio("sounds/chicken.wav");
    chickenSound.play();
  }
}


function resetGame() {
  document.getElementById("end-screen").classList.add("hidden");
  document.getElementById("start-screen").classList.remove("hidden");
  document.getElementById("chicken-display").innerHTML = '';
}

// Fisher-Yates shuffle
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// DRAW button functionality
document.addEventListener("DOMContentLoaded", () => {
  const drawButton = document.getElementById("draw-button");
  const drawCard = document.getElementById("draw-card");

  drawButton.addEventListener("click", () => {
    // Play click sound
    const clickSound = new Audio("sounds/click.wav");
    clickSound.play();

    // Clear previous number
    drawCard.textContent = "";

    // Start shake animation
    drawCard.classList.add("shaking");

    // After 2 seconds, show new number and stop shaking
    setTimeout(() => {
      const number = weightedRandom();
      drawCard.textContent = number;
      drawCard.classList.remove("shaking");
    }, 2000);
  });
});


