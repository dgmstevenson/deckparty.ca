// ============================================================
// Deck Party Decision Engine
// ============================================================

const questions = [
  {
    text: "Do you have a deck?",
    answers: [
      { label: "Yes", score: 3 },
      { label: "No, but I have a patio", score: 2 },
      { label: "No, but I have dreams", score: 1 },
    ],
  },
  {
    text: "Do you have access to beverages?",
    answers: [
      { label: "Fully stocked", score: 3 },
      { label: "I can make do", score: 2 },
      { label: "I have tap water and optimism", score: 1 },
    ],
  },
  {
    text: "Are you currently on fire?",
    answers: [
      { label: "No", score: 3 },
      { label: "Metaphorically", score: 2 },
      { label: "Let me check", score: 0 },
    ],
  },
  {
    text: "Is anyone actively forbidding you from having a deck party?",
    answers: [
      { label: "No, I'm a free spirit", score: 3 },
      { label: "My HOA has opinions", score: 1 },
      { label: "I'm grounded", score: 0 },
    ],
  },
  {
    text: "How committed are you to this deck party?",
    answers: [
      { label: "I was born for this", score: 3 },
      { label: "Mildly curious", score: 1 },
      { label: "I just came here for the website", score: 0 },
    ],
  },
];

// Max possible question score = 5 questions * 3 pts = 15
const MAX_QUESTION_SCORE = 15;

// State
let currentQuestion = 0;
let userAnswers = []; // { questionText, answerLabel, score }

// DOM refs
const landing = document.getElementById("landing");
const questionsSection = document.getElementById("questions");
const weatherCheck = document.getElementById("weather-check");
const verdictSection = document.getElementById("verdict");

const startBtn = document.getElementById("start-btn");
const progressFill = document.getElementById("progress-fill");
const questionContainer = document.getElementById("question-container");
const questionText = document.getElementById("question-text");
const answersContainer = document.getElementById("answers-container");

const weatherLoading = document.getElementById("weather-loading");
const cityFallback = document.getElementById("city-fallback");
const weatherStatus = document.getElementById("weather-status");
const cityInput = document.getElementById("city-input");
const citySubmit = document.getElementById("city-submit");
const cityError = document.getElementById("city-error");

const verdictText = document.getElementById("verdict-text");
const verdictWeather = document.getElementById("verdict-weather");
const verdictBreakdown = document.getElementById("verdict-breakdown");
const restartBtn = document.getElementById("restart-btn");
const shareBtn = document.getElementById("share-btn");

// ============================================================
// Navigation
// ============================================================

function showStep(hide, show) {
  hide.classList.add("fade-out");
  setTimeout(() => {
    hide.classList.remove("active", "fade-out");
    show.classList.add("active");
  }, 400);
}

// ============================================================
// Start
// ============================================================

startBtn.addEventListener("click", () => {
  posthog.capture("quiz_started");
  showStep(landing, questionsSection);
  setTimeout(() => renderQuestion(), 450);
});

// ============================================================
// Questions
// ============================================================

function renderQuestion() {
  const q = questions[currentQuestion];
  progressFill.style.width =
    ((currentQuestion / questions.length) * 100).toFixed(1) + "%";

  // Slide out then in
  questionContainer.classList.add("slide-out");

  setTimeout(() => {
    questionText.textContent = q.text;
    answersContainer.innerHTML = "";

    q.answers.forEach((ans, i) => {
      const btn = document.createElement("button");
      btn.className = "answer-btn";
      btn.textContent = ans.label;
      btn.addEventListener("click", () => selectAnswer(i));
      answersContainer.appendChild(btn);
    });

    questionContainer.classList.remove("slide-out");
    questionContainer.classList.add("slide-in");

    requestAnimationFrame(() => {
      questionContainer.classList.remove("slide-in");
    });
  }, 300);
}

function selectAnswer(index) {
  const q = questions[currentQuestion];
  const ans = q.answers[index];

  // Visual feedback
  const buttons = answersContainer.querySelectorAll(".answer-btn");
  buttons.forEach((btn) => (btn.disabled = true));
  buttons[index].classList.add("selected");

  userAnswers.push({
    questionText: q.text,
    answerLabel: ans.label,
    score: ans.score,
  });

  posthog.capture("question_answered", {
    question_number: currentQuestion + 1,
    question_text: q.text,
    answer: ans.label,
    answer_score: ans.score,
  });

  setTimeout(() => {
    currentQuestion++;
    if (currentQuestion < questions.length) {
      renderQuestion();
    } else {
      progressFill.style.width = "100%";
      posthog.capture("quiz_completed", {
        total_question_score: userAnswers.reduce((s, a) => s + a.score, 0),
        answers: userAnswers.map((a) => ({ q: a.questionText, a: a.answerLabel })),
      });
      setTimeout(() => {
        showStep(questionsSection, weatherCheck);
        setTimeout(() => startWeatherCheck(), 500);
      }, 400);
    }
  }, 500);
}

// ============================================================
// Weather Check
// ============================================================

function startWeatherCheck() {
  weatherLoading.style.display = "";
  cityFallback.style.display = "none";
  weatherStatus.textContent = "Locating you on this planet...";

  if (!navigator.geolocation) {
    showCityFallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      posthog.capture("geolocation_allowed");
      weatherStatus.textContent = "Found you! Checking the skies...";
      fetchWeather(pos.coords.latitude, pos.coords.longitude);
    },
    () => {
      posthog.capture("geolocation_denied");
      showCityFallback();
    },
    { timeout: 8000 }
  );
}

function showCityFallback() {
  weatherLoading.style.display = "none";
  cityFallback.style.display = "";
  cityInput.focus();
}

citySubmit.addEventListener("click", () => geocodeCity());
cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") geocodeCity();
});

async function geocodeCity() {
  const city = cityInput.value.trim();
  if (!city) {
    cityError.textContent = "Please enter a city name.";
    return;
  }

  cityError.textContent = "";
  citySubmit.disabled = true;
  citySubmit.textContent = "Searching...";

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    );
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      cityError.textContent = "Couldn't find that city. Try another?";
      citySubmit.disabled = false;
      citySubmit.textContent = "Check Weather";
      return;
    }

    const loc = data.results[0];
    posthog.capture("city_searched", { city: city, resolved_city: loc.name, country: loc.country });
    // Switch to loading view
    cityFallback.style.display = "none";
    weatherLoading.style.display = "";
    weatherStatus.textContent = `Found ${loc.name}! Checking the skies...`;
    fetchWeather(loc.latitude, loc.longitude, loc.name);
  } catch {
    cityError.textContent = "Something went wrong. Try again?";
    citySubmit.disabled = false;
    citySubmit.textContent = "Check Weather";
  }
}

async function fetchWeather(lat, lon, cityName) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m`;

    const res = await fetch(url);
    const data = await res.json();
    const current = data.current;

    const weather = {
      temp: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      precip: current.precipitation,
      code: current.weather_code,
      wind: current.wind_speed_10m,
      gusts: current.wind_gusts_10m,
      cityName: cityName || null,
    };

    buildVerdict(weather);
  } catch {
    weatherStatus.textContent =
      "Couldn't fetch weather. Delivering verdict without it!";
    setTimeout(() => buildVerdict(null), 1500);
  }
}

// ============================================================
// Weather Code Descriptions
// ============================================================

const weatherDescriptions = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

function describeWeather(code) {
  return weatherDescriptions[code] || "Unknown conditions";
}

// ============================================================
// Scoring Engine
// ============================================================

function scoreWeather(weather) {
  if (!weather) return { score: 0, maxScore: 15, commentary: "Weather data unavailable. We'll judge on vibes alone." };

  let score = 0;
  const maxScore = 15;
  const notes = [];

  // Temperature (0-5 pts)
  const t = weather.temp;
  if (t >= 18 && t <= 28) {
    score += 5;
  } else if ((t >= 12 && t < 18) || (t > 28 && t <= 33)) {
    score += 3;
  } else if ((t >= 5 && t < 12) || (t > 33 && t <= 38)) {
    score += 1;
  }
  // below 5 or above 38 = 0

  if (t < -10) notes.push(`It's ${t}°C. Your beer will stay cold naturally.`);
  else if (t < 0) notes.push(`It's ${t}°C. Bold move, but frostbite adds character.`);
  else if (t < 10) notes.push(`${t}°C. You'll want a jacket. And maybe a second jacket.`);
  else if (t >= 18 && t <= 28) notes.push(`${t}°C. Chef's kiss deck party temperature.`);
  else if (t > 35) notes.push(`${t}°C. Your deck is basically a frying pan right now.`);
  else if (t > 28) notes.push(`${t}°C. Warm, but manageable with shade and cold drinks.`);
  else notes.push(`${t}°C. Not bad, not great.`);

  // Wind (0-3 pts)
  const w = weather.wind;
  if (w < 15) {
    score += 3;
  } else if (w < 30) {
    score += 2;
    notes.push("A bit breezy. Secure your napkins.");
  } else if (w < 50) {
    score += 1;
    notes.push("Windy enough to rearrange your furniture.");
  } else {
    notes.push("Wind speeds suggest your deck may relocate.");
  }

  // Precipitation (0-3 pts)
  const p = weather.precip;
  if (p === 0) {
    score += 3;
  } else if (p < 1) {
    score += 2;
    notes.push("Light precipitation. An umbrella might help, or denial.");
  } else if (p < 5) {
    score += 1;
    notes.push("It's raining. Your deck party becomes a pool party.");
  } else {
    notes.push("Significant precipitation detected. Consider building an ark.");
  }

  // Weather code (0-4 pts)
  const c = weather.code;
  if (c <= 1) {
    score += 4; // Clear
  } else if (c <= 3) {
    score += 3; // Cloudy
  } else if (c <= 48) {
    score += 2; // Fog
  } else if (c <= 57) {
    score += 1; // Drizzle
  } else if (c <= 67) {
    score += 0; // Rain
  } else if (c <= 77) {
    score -= 1; // Snow
    notes.push("It's snowing. Deck parties in the snow are either brave or unwise.");
  } else if (c <= 86) {
    score -= 1; // Snow showers
  } else if (c >= 95) {
    score -= 2; // Thunderstorm
    notes.push("Thunderstorm active. Your deck party may become an origin story.");
  }

  score = Math.max(0, score);

  const commentary = notes.join(" ");
  return { score, maxScore, commentary };
}

// ============================================================
// Verdict Logic
// ============================================================

const verdicts = [
  { threshold: 0.9, text: "ABSOLUTELY YES", css: "verdict-yes", emoji: "go" },
  { threshold: 0.72, text: "Strong yes", css: "verdict-strong-yes", emoji: "go" },
  { threshold: 0.55, text: "Probably yes", css: "verdict-probably", emoji: "lean" },
  { threshold: 0.4, text: "Technically possible", css: "verdict-technically", emoji: "meh" },
  { threshold: 0.25, text: "Maybe reconsider", css: "verdict-reconsider", emoji: "warn" },
  { threshold: 0, text: "Definitely not", css: "verdict-no", emoji: "stop" },
];

function buildVerdict(weather) {
  const questionScore = userAnswers.reduce((sum, a) => sum + a.score, 0);
  const weatherResult = scoreWeather(weather);
  const totalScore = questionScore + weatherResult.score;
  const totalMax = MAX_QUESTION_SCORE + weatherResult.maxScore;
  const ratio = totalScore / totalMax;

  // Special override: "on fire" answer
  const onFire = userAnswers.find(
    (a) => a.questionText === "Are you currently on fire?" && a.answerLabel === "Let me check"
  );

  let verdict;
  if (onFire && ratio > 0.5) {
    verdict = verdicts.find((v) => v.text === "Maybe reconsider");
  } else {
    verdict = verdicts.find((v) => ratio >= v.threshold) || verdicts[verdicts.length - 1];
  }

  // Render verdict
  verdictText.textContent = verdict.text;
  verdictText.className = "verdict-text " + verdict.css;

  // Weather section
  if (weather) {
    const desc = describeWeather(weather.code);
    const location = weather.cityName ? ` in ${weather.cityName}` : "";
    verdictWeather.innerHTML = `
      <p class="weather-summary">${desc}${location} &mdash; ${weather.temp}°C (feels like ${weather.feelsLike}°C)</p>
      <p class="weather-detail">Wind: ${weather.wind} km/h (gusts ${weather.gusts} km/h) &bull; Precipitation: ${weather.precip} mm</p>
      ${weatherResult.commentary ? `<p class="weather-commentary">${weatherResult.commentary}</p>` : ""}
    `;
  } else {
    verdictWeather.innerHTML = `
      <p class="weather-summary">Weather: Unknown</p>
      <p class="weather-commentary">${weatherResult.commentary}</p>
    `;
  }

  // Breakdown
  let breakdownHTML = `<p class="breakdown-title">Your answers</p>`;
  userAnswers.forEach((a) => {
    breakdownHTML += `
      <div class="breakdown-item">
        <span class="breakdown-question">${a.questionText}</span>
        <span class="breakdown-answer">${a.answerLabel}</span>
      </div>
    `;
  });
  verdictBreakdown.innerHTML = breakdownHTML;

  posthog.capture("verdict_delivered", {
    verdict: verdict.text,
    total_score: totalScore,
    max_score: totalMax,
    score_ratio: Math.round(ratio * 100) / 100,
    question_score: questionScore,
    weather_score: weatherResult.score,
    temperature: weather ? weather.temp : null,
    weather_description: weather ? describeWeather(weather.code) : null,
    city: weather ? weather.cityName : null,
  });

  // Show verdict
  showStep(weatherCheck, verdictSection);
}

// ============================================================
// Actions
// ============================================================

restartBtn.addEventListener("click", () => {
  posthog.capture("restart_clicked", { previous_verdict: verdictText.textContent });
  currentQuestion = 0;
  userAnswers = [];
  progressFill.style.width = "0%";
  cityInput.value = "";
  cityError.textContent = "";
  citySubmit.disabled = false;
  citySubmit.textContent = "Check Weather";

  showStep(verdictSection, landing);
});

shareBtn.addEventListener("click", () => {
  posthog.capture("result_shared", { verdict: verdictText.textContent });
  const text = `I asked deckparty.ca if it's time for a deck party and the answer was: "${verdictText.textContent}" 🎉`;
  if (navigator.share) {
    navigator.share({ title: "Deck Party Verdict", text, url: "https://deckparty.ca" }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text + "\nhttps://deckparty.ca").then(() => {
      shareBtn.textContent = "Copied!";
      setTimeout(() => (shareBtn.textContent = "Share Result"), 2000);
    });
  }
});
