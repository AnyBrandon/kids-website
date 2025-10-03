const gameContainer = document.getElementById('game-container');
const scoreDisplay = document.getElementById('score');
const endScreen = document.getElementById('end-screen');
const finalScore = document.getElementById('final-score');
const confettiCanvas = document.getElementById('confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');

let score = 0;
let gameInterval;
let balloonInterval;
let gameDuration = 120000; // 120 seconds
let balloons = [];

const timerDisplay = document.getElementById('timer');
let timeLeft = gameDuration / 1000; // convert ms to seconds
let countdownInterval;

const popSound = document.getElementById('pop-sound');
const wrongSound = document.getElementById('wrong-sound');
const bgMusic = document.getElementById('bg-music');
bgMusic.volume = 0;
bgMusic.loop = true;

// Resize confetti canvas
function resizeCanvas() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Confetti particle class
class ConfettiParticle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = (Math.random() * 6) + 4;
    this.speedX = (Math.random() - 0.5) * 5;
    this.speedY = (Math.random() * -5) - 3;
    this.gravity = 0.1;
    this.color = `hsl(${Math.random() * 360}, 70%, 60%)`;
    this.opacity = 1;
    this.dop = 0.03 + Math.random() / 30;
    this.tilt = Math.floor(Math.random() * 10) - 10;
    this.tiltAngle = 0;
    this.tiltAngleIncrement = 0.07 + Math.random() / 10;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.speedY += this.gravity;
    this.opacity -= this.dop;
    this.tiltAngle += this.tiltAngleIncrement;
    this.tilt = Math.sin(this.tiltAngle) * 15;
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.lineWidth = this.size / 2;
    ctx.strokeStyle = `rgba(${hexToRgb(this.color)}, ${this.opacity})`;
    ctx.moveTo(this.x + this.tilt + this.size / 4, this.y);
    ctx.lineTo(this.x + this.tilt, this.y + this.tilt + this.size / 4);
    ctx.stroke();
  }
}

let confettiParticles = [];

// Convert hsl color to rgb for strokeStyle
function hexToRgb(hsl) {
  // Simple approximation, just strip hsl to rgb placeholder
  // We'll just use hsl string as-is (the strokeStyle can accept hsl + alpha)
  return hsl;
}

// Launch confetti from x,y
function launchConfetti(x, y) {
  for (let i = 0; i < 25; i++) {
    confettiParticles.push(new ConfettiParticle(x, y));
  }
}

// Animate confetti
function animateConfetti() {
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiParticles.forEach((p, idx) => {
    p.update();
    if (p.opacity <= 0) {
      confettiParticles.splice(idx, 1);
    } else {
      p.draw(confettiCtx);
    }
  });
  requestAnimationFrame(animateConfetti);
}
animateConfetti();

// Generate math expression as before, no changes
function generateMathExpression() {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const operators = ['+', '-', '×'];
  const operator = operators[Math.floor(Math.random() * operators.length)];

  let correctResult;
  switch (operator) {
    case '+': correctResult = num1 + num2; break;
    case '-': correctResult = num1 - num2; break;
    case '×': correctResult = num1 * num2; break;
  }

  const isCorrect = Math.random() < 0.5;

  let displayedResult;

  if (isCorrect) {
    displayedResult = correctResult;
  } else {
    let offset = Math.floor(Math.random() * 5) + 1;
    if (Math.random() < 0.5) {
      displayedResult = correctResult + offset;
    } else {
      displayedResult = correctResult - offset;
      if (displayedResult < 0) displayedResult = correctResult + offset;
    }
    if (displayedResult === correctResult) {
      displayedResult += 1;
    }
  }

  return { expression: `${num1} ${operator} ${num2} = ${displayedResult}`, isCorrect };
}

let balloonColors = ['color1', 'color2', 'color3', 'color4'];
let balloonColorIndex = 0;

function createBalloon() {
  console.log("Creating balloon…");
  const balloon = document.createElement('div');
  balloon.classList.add('balloon');

  // Assign balloon color cycling
  balloon.classList.add(balloonColors[balloonColorIndex]);
  balloonColorIndex = (balloonColorIndex + 1) % balloonColors.length;

  const { expression, isCorrect } = generateMathExpression();

  balloon.textContent = expression;
  balloon.dataset.isCorrect = isCorrect;

  // Position
  const balloonWidth = 140; // matches CSS
  balloon.style.left = Math.random() * (gameContainer.offsetWidth - balloonWidth) + 'px';


  gameContainer.appendChild(balloon);
  balloons.push(balloon);
  console.log("Balloon added to DOM:", balloon);
  let pos = 0;
  balloon.style.bottom = pos + 'px';

  const speed = 1 + Math.random() * 1.5;

  const upInterval = setInterval(() => {
    if (pos > gameContainer.offsetHeight + 180) {
      clearInterval(upInterval);
      balloon.remove();
      balloons = balloons.filter(b => b !== balloon);
    } else {
      pos += 0.6;
      balloon.style.bottom = pos + 'px';
    }
  }, 20);

  balloon.addEventListener('click', () => {
    if (balloon.dataset.isCorrect === 'true') {
      score++;
      scoreDisplay.textContent = `Score: ${score}`;
      popSound.volume = 0.5;
      popSound.currentTime = 0;
      popSound.play();
      launchConfetti(
        balloon.offsetLeft + balloon.offsetWidth / 2,
        balloon.offsetTop + balloon.offsetHeight / 2
      );

      // Pop animation then remove
      balloon.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
      balloon.style.transform = 'scale(1.5) rotate(20deg)';
      balloon.style.opacity = '0';

      setTimeout(() => {
        balloon.remove();
        balloons = balloons.filter(b => b !== balloon);
      }, 400);
    } else {
      score = Math.max(0, score - 1);
      scoreDisplay.textContent = `Score: ${score}`;
      wrongSound.volume = 0.4;
      wrongSound.currentTime = 0;
      wrongSound.play();

      balloon.classList.add('wrong');
      setTimeout(() => balloon.classList.remove('wrong'), 500);
    }
  });
}

function fadeAudio(audio, targetVolume, duration) {
  const stepTime = 50;
  const steps = duration / stepTime;
  const volumeStep = (targetVolume - audio.volume) / steps;
  let currentStep = 0;

  function step() {
    currentStep++;
    audio.volume = Math.min(Math.max(audio.volume + volumeStep, 0), 1);
    if (currentStep < steps) {
      setTimeout(step, stepTime);
    }
  }
  step();
}

function startGame() {
  score = 0;
  timeLeft = gameDuration / 1000; // convert milliseconds to seconds
  scoreDisplay.textContent = `🎯 Score: ${score}`;
  timerDisplay.textContent = `⏰ Time: ${timeLeft}s`;

  endScreen.style.display = 'none';
  gameContainer.innerHTML = '';
  balloons = [];

  // Reset and play background music with fade-in
  bgMusic.currentTime = 0;
  fadeAudio(bgMusic, 0.2, 2000);
  bgMusic.play();

  // Start spawning balloons at slower rate
  balloonInterval = setInterval(createBalloon, 2000); // one every 2 seconds

  // Start countdown timer
  countdownInterval = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = `⏰ Time: ${timeLeft}s`;
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      endGame();
    }
  }, 1000);

  // End game after fixed duration
  gameInterval = setTimeout(() => {
    endGame();
  }, gameDuration);
}

function endGame() {
  clearInterval(balloonInterval);
  clearInterval(countdownInterval);
  clearTimeout(gameInterval);

  bgMusic.pause();

  balloons.forEach(b => b.remove());
  balloons = [];

  finalScore.textContent = score;
  endScreen.style.display = 'block';
}



startGame();
