'use strict';

// 1. Распознавание через Vosk WebSocket
let socket;
let isListening = false;
let mediaRecorder;
let audioContext;
let processor;

// DOM-элементы
let logElem;
let statusElem;
let textInput;
let sendButton;
let micButton;
let themeToggle;

// Инициализация DOM-элементов после загрузки страницы
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
  logElem = document.querySelector('#log');
  statusElem = document.querySelector('#status');
  textInput = document.querySelector('#text');
  sendButton = document.querySelector('#send');
  micButton = document.querySelector('#mic');
  themeToggle = document.querySelector('#theme-toggle');

  // Обработчик кнопки отправки текста
  sendButton.addEventListener('click', handleSendClick);

  // Запуск/остановка распознавания речи
  micButton.addEventListener('click', handleMicClick);

  // Добавление функции для переключения темы
  themeToggle.addEventListener('click', toggleTheme);

  // Начальное сообщение
  log('✅ mini Smart Home Assistant запущен и готов к работе');

  // Разогрев модели
  warmupModel();
}

// Функция для логирования
function log(message) {
  console.log(message);
  if (logElem) {
    logElem.textContent += message + '\n';
    logElem.scrollTop = logElem.scrollHeight;
  }
}

// Обработчик кнопки отправки
async function handleSendClick() {
  const text = textInput.value.trim();
  if(!text) return;
  await classifyText(text);
  textInput.value = '';
}

// Обработчик кнопки микрофона
async function handleMicClick() {
  // Переключаем класс для анимации
  micButton.classList.toggle('recording');
  
  if (isListening) {
    log('Остановка записи...');
    stopListening();
  } else {
    log('Запуск записи...');
    await startListening();
  }
}

// Переключение темы
function toggleTheme() {
  const body = document.body;
  
  if (body.classList.contains('light-theme')) {
    body.classList.remove('light-theme');
    themeToggle.textContent = '☀️';
  } else {
    body.classList.add('light-theme');
    themeToggle.textContent = '🌙';
  }
}

// Функция для классификации
async function classifyText(text) {
  try {
    log(`Классификация: "${text}"`);
    statusElem.textContent = 'Классификация...';
    
    const res = await fetch('http://localhost:8080/classify', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text})
    });
    const d = await res.json();
    log(`Результат: ${d.text}  →  ${d.intent}`);
    statusElem.textContent = '';
  } catch(e) {
    console.error(e);
    log(`Ошибка классификации: ${e.message}`);
    statusElem.textContent = 'Ошибка классификации: ' + e.message;
  }
}

// Инициализация WebSocket и записи с микрофона
async function startListening() {
  try {
    let silenceTimer;
    
    log('Запрашиваем доступ к микрофону...');
    statusElem.textContent = 'Запрашиваем доступ к микрофону...';
    
    // Запрос доступа к микрофону
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1
      }
    });
    
    log('Доступ к микрофону получен');
    statusElem.textContent = 'Инициализация аудио...';
    
    // Создание AudioContext для обработки звука
    const ctx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000
    });
    
    audioContext = ctx;
    
    log(`Частота дискретизации: ${audioContext.sampleRate} Гц`);
    
    // Создание источника аудио из потока
    const source = audioContext.createMediaStreamSource(stream);
    
    // Создание процессора для обработки аудиоданных
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    log('Подключение к серверу распознавания речи...');
    statusElem.textContent = 'Подключение к серверу...';
    
    // Создание WebSocket подключения к Vosk
    socket = new WebSocket('ws://localhost:2700');
    socket.binaryType = 'arraybuffer';
    
    // Инициализация конфигурации для Vosk
    socket.onopen = () => {
      log('WebSocket соединение установлено');
      
      // Отправляем конфигурацию для Vosk
      socket.send(JSON.stringify({config:{sample_rate:16000}}));
      
      statusElem.textContent = 'Говорите...';
      micButton.textContent = '⏹ Стоп';
      micButton.style.background = '#05f';
      isListening = true;
    };
    
    // Обработка аудиоданных и отправка через WebSocket
    processor.onaudioprocess = (e) => {
      const inData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inData.length);
      for(let i=0; i<inData.length; i++) {
        pcm16[i] = Math.max(-1, Math.min(1, inData[i]))*32767;
      }
      if(socket.readyState === 1) socket.send(pcm16.buffer);

      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(stopListening, 4000);  // если 4 с тишины — стоп
    };
    
    // Подключаем процессор к источнику и к выходу
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    // Обработка ответов от сервера
    socket.onmessage = (e) => {
      const d = JSON.parse(e.data);

      // пропускаем пустые partial-ы
      if (d.partial && d.partial.trim() === '') return;

      log(`Ответ: ${e.data}`);

      if (d.text && d.text.trim() !== '') {
          classifyText(d.text.trim());
          stopListening();
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
      log(`Ошибка WebSocket: ${error}`);
      statusElem.textContent = 'Ошибка соединения';
      stopListening();
    };
    
    socket.onclose = (event) => {
      console.log('WebSocket closed:', event);
      log(`WebSocket закрыт: код=${event.code}, причина=${event.reason || 'не указана'}`);
      statusElem.textContent = 'Соединение закрыто';
      stopListening();
    };
    
  } catch(e) {
    console.error('Error:', e);
    log(`Ошибка: ${e.message}`);
    statusElem.textContent = 'Ошибка микрофона: ' + e.message;
  }
}

// Остановка распознавания
function stopListening() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    // Отправляем сигнал завершения
    log('Отправка сигнала завершения');
    socket.send(JSON.stringify({"eof":1}));
    socket.close();
  }
  
  if (processor && audioContext) {
    log('Закрытие аудиоконтекста');
    processor.disconnect();
    audioContext.close();
    processor = null;
    audioContext = null;
  }
  
  statusElem.textContent = '';
  micButton.textContent = '🎤 Голос';
  micButton.style.background = '#f05';
  isListening = false;
}

// Функция для разогрева модели при загрузке страницы
async function warmupModel() {
  try {
    log('Разогрев модели при загрузке страницы...');
    statusElem.textContent = 'Прогрев модели...';
    
    // Выполняем запрос для прогрева модели (без отображения результата)
    await fetch('http://localhost:8080/classify', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text: 'включи свет'})
    });
    
    log('Модель прогрета и готова к использованию');
    statusElem.textContent = '';
  } catch(e) {
    console.error('Ошибка при прогреве модели:', e);
    log(`Прогрев модели не выполнен: ${e.message}`);
  }
} 