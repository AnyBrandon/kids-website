let quizzes = [];
let currentQuestionIndex = 0;
let score = 0;
let timeLeft = 60; // seconds
let timerInterval;
let difficulty = 'easy'; // default

const questionEl = document.getElementById('question');
const optionsEl = document.getElementById('options');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const endMessageEl = document.getElementById('end-message');

const difficultySelectionEl = document.getElementById('difficulty-selection');
const quizContainerEl = document.getElementById('quiz-container');

let correctSound = new Audio('sounds/correct.wav');
let incorrectSound = new Audio('sounds/incorrect.wav');

async function loadQuizzes() {
  try {
    const response = await fetch('quizzes.json');
    quizzes = await response.json();

    // Shuffle quizzes randomly
    quizzes = shuffleArray(quizzes);

    // Show difficulty selection UI first
    difficultySelectionEl.style.display = 'block';
    quizContainerEl.style.display = 'none';
  } catch (error) {
    questionEl.textContent = 'Failed to load quizzes.';
    console.error(error);
  }
}

function shuffleArray(array) {
  for(let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Called when player selects difficulty
function startWithDifficulty(selectedDifficulty) {
  difficulty = selectedDifficulty;

  // Hide difficulty selection, show quiz container
  difficultySelectionEl.style.display = 'none';
  quizContainerEl.style.display = 'block';

  startGame();
}

function startGame() {
  score = 0;
  currentQuestionIndex = 0;
  scoreEl.textContent = `Score: ${score}`;
  endMessageEl.textContent = '';
  timeLeft = 60;
  timerEl.textContent = `Time Left: ${timeLeft}s`;

  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = `Time Left: ${timeLeft}s`;
    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);

  showQuestion();
}

function showQuestion() {
  if (currentQuestionIndex >= quizzes.length) {
    endGame();
    return;
  }

  const currentQuiz = quizzes[currentQuestionIndex];
  questionEl.textContent = currentQuiz.question;

  optionsEl.innerHTML = '';

  const shuffledOptions = shuffleArray([...currentQuiz.options]);

  shuffledOptions.forEach(option => {
    const btn = document.createElement('button');
    btn.textContent = option;
    btn.classList.add('option-btn');
    btn.onclick = () => checkAnswer(option, btn);
    optionsEl.appendChild(btn);
  });
}

function checkAnswer(selectedOption, clickedBtn) {
  const currentQuiz = quizzes[currentQuestionIndex];

  if (selectedOption === currentQuiz.answer) {
    score++;
    scoreEl.textContent = `Score: ${score}`;

    correctSound.currentTime = 0;
    correctSound.play();

    clickedBtn.classList.add('correct-animate');
    disableAllOptions();

    setTimeout(() => {
      currentQuestionIndex++;
      if (timeLeft > 0) {
        showQuestion();
      } else {
        endGame();
      }
    }, 1200);

  } else {
    // Subtract points based on difficulty
    if (difficulty === 'hard') {
      score = Math.max(0, score - 1);
    } else if (difficulty === 'legendary') {
      score = Math.max(0, score - 2);
    }
    scoreEl.textContent = `Score: ${score}`;

    incorrectSound.currentTime = 0;
    incorrectSound.play();

    clickedBtn.classList.add('wrong-animate');
    disableAllOptions();

    setTimeout(() => {
      currentQuestionIndex++;
      if (timeLeft > 0) {
        showQuestion();
      } else {
        endGame();
      }
    }, 1200);
  }
}

function disableAllOptions() {
  const buttons = optionsEl.querySelectorAll('button');
  buttons.forEach(btn => btn.disabled = true);
}

function endGame() {
  clearInterval(timerInterval);
  questionEl.textContent = 'Game Over!';
  optionsEl.innerHTML = '';

  // Determine chicken threshold based on difficulty
  let chickenThreshold = 5;
  if (difficulty === 'hard') {
    chickenThreshold = 8;
  } else if (difficulty === 'legendary') {
    chickenThreshold = 12;
  }

  if (score <= chickenThreshold) {
    const img = document.createElement('img');
    img.src = 'images/funnyChickenQuiz.png';
    img.alt = 'Funny Chicken';
    img.style.maxWidth = '250px';
    img.style.marginTop = '20px';
    endMessageEl.innerHTML = `Your final score is ${score} point${score !== 1 ? 's' : ''}.`;
    endMessageEl.appendChild(img);

    const chickenSound = new Audio('sounds/chicken.wav');
    chickenSound.play();
  } else {
    endMessageEl.textContent = `Your final score is ${score} point${score !== 1 ? 's' : ''}. Thanks for playing!`;
  }
}

// Load quizzes on page load
window.onload = loadQuizzes;
