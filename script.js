'use strict';

// 1. Распознавание через Vosk WebSocket
let socket;
let isListening = false;
let mediaRecorder;
let audioContext;
let processor;

// Состояния устройств умного дома
const devices = {
  // Датчики
  sensor_1: { 
    name: 'Термогигрометр', 
    state: '20°C | 45%',
    type: 'sensor',
    online: true,
    icon: '🌡️',
    values: { temp: '20', humidity: '45' },
    commands: ['check_temperature', 'check_humidity'] 
  },
  sensor_2: { 
    name: 'Анализатор воздуха', 
    state: 'CO₂: 412ppm',
    type: 'sensor',
    online: true,
    icon: '💨', 
    values: { co2: '412' },
    commands: ['check_air'] 
  },
  sensor_3: { 
    name: 'Счетчик энергии', 
    state: '1.24',
    type: 'value',
    online: true,
    icon: '⚡',
    unit: ' кВт⋅ч',
    baseValue: 1.24,
    commands: ['check_energy', 'sensor_check', 'sensor_reset']
  },
  
  // Музыка
  speaker: { 
    name: 'Колонка', 
    state: 'off',
    type: 'switch',
    online: false,
    icon: '🔊',
    commands: ['music_on', 'music_off']
  },
  
  // Шторы
  curtains: { 
    name: 'Шторы', 
    state: 'off',
    type: 'switch',
    online: true,
    icon: '🪟',
    states: { 'on': 'Открыты', 'off': 'Закрыты' },
    commands: ['curtains_open', 'curtains_close', 'check_curtains']
  },
  
  // ТВ
  tv: { 
    name: 'Телевизор', 
    state: 'off',
    type: 'switch',
    online: true,
    icon: '📺',
    commands: ['tv_on', 'tv_off', 'check_tv']
  },
  
  // Батарея отопления
  heater: { 
    name: 'Батарея', 
    state: '22',
    type: 'value',
    online: true,
    icon: '🔥', 
    unit: '°C',
    commands: ['temperature_up', 'temperature_down', 'check_temperature']
  }
};

// DOM-элементы
let logElem;
let statusElem;
let textInput;
let sendButton;
let micButton;
let themeToggle;
let lastCommandText;
let deviceCards = {};
let devicesContainer;

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
  // Получение DOM-элементов
  logElem = document.querySelector('#log');
  statusElem = document.querySelector('#status');
  textInput = document.querySelector('#text');
  sendButton = document.querySelector('#send');
  micButton = document.querySelector('#mic');
  themeToggle = document.querySelector('#theme-toggle');
  lastCommandText = document.querySelector('#last-command-text');
  devicesContainer = document.querySelector('#devices-container');

  // Создание карточек устройств
  createDeviceCards();

  // Добавление обработчиков событий
  sendButton.addEventListener('click', handleSendClick);
  micButton.addEventListener('click', handleMicClick);
  themeToggle.addEventListener('click', toggleTheme);
  textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSendClick();
  });

  // Инициализация устройств
  updateAllDevices();

  // Начальное сообщение
  log('✅ mini Smart Home Assistant запущен и готов к работе');

  // Разогрев модели
  warmupModel();
}

// Создание карточек устройств динамически
function createDeviceCards() {
  for (const [deviceId, device] of Object.entries(devices)) {
    // Создаем элемент карточки устройства
    const card = document.createElement('div');
    card.className = 'device-card';
    card.dataset.device = deviceId;
    
    // Создаем иконку устройства
    const iconElem = document.createElement('div');
    iconElem.className = 'device-icon';
    iconElem.textContent = device.icon;
    
    // Создаем блок информации
    const infoElem = document.createElement('div');
    infoElem.className = 'device-info';
    
    // Имя устройства
    const nameElem = document.createElement('div');
    nameElem.className = 'device-name';
    nameElem.textContent = device.name;
    
    // Статус устройства
    const statusElem = document.createElement('div');
    statusElem.className = `device-status ${device.online ? 'online' : 'offline'}`;
    statusElem.textContent = device.online ? 'Онлайн' : 'Офлайн';
    
    // Индикатор состояния
    const indicatorElem = document.createElement('div');
    indicatorElem.className = `device-indicator ${device.online ? 'on' : 'off'}`;
    
    // Собираем карточку
    infoElem.appendChild(nameElem);
    infoElem.appendChild(statusElem);
    card.appendChild(iconElem);
    card.appendChild(infoElem);
    card.appendChild(indicatorElem);
    
    // Добавляем карточку в контейнер
    devicesContainer.appendChild(card);
    
    // Сохраняем ссылки на элементы
    deviceCards[deviceId] = {
      card: card,
      icon: iconElem,
      status: statusElem,
      indicator: indicatorElem
    };
    
    // Добавляем обработчик клика по карточке
    card.addEventListener('click', () => toggleDeviceOnline(deviceId));
  }
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
  await processCommand(text);
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

// Функция для обработки команды (текст -> действие)
async function processCommand(text) {
  try {
    log(`Команда: "${text}"`);
    updateLastCommand(text);
    statusElem.textContent = 'Обработка команды...';
    
    // Отправить на сервер для классификации
    const res = await fetch('http://localhost:8080/classify', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text})
    });
    
    const data = await res.json();
    log(`Распознано: ${data.text} → ${data.intent}`);
    
    // Обработка распознанной интент-команды
    executeDeviceCommand(data.intent, data.text);
    
    statusElem.textContent = '';
  } catch(e) {
    console.error(e);
    log(`Ошибка обработки команды: ${e.message}`);
    statusElem.textContent = 'Ошибка обработки команды: ' + e.message;
  }
}

// Функция для выполнения команды устройства
function executeDeviceCommand(intent, text) {
  // Проверяем все известные команды для каждого устройства
  for (const [deviceId, device] of Object.entries(devices)) {
    // Особая обработка для устройств с известными командами
    if (device.commands && device.commands.includes(intent)) {
      log(`Выполняется команда ${intent} для ${device.name}`);
      
      // Проверка статуса устройства
      if (!device.online) {
        showDeviceOfflineMessage(device.name);
        return;
      }
      
      // Обрабатываем команды для устройств разных типов
      switch (intent) {
        // Шторы
        case 'curtains_open':
          updateDeviceState(deviceId, 'on');
          break;
        case 'curtains_close':
          updateDeviceState(deviceId, 'off');
          break;
        case 'check_curtains':
          showDeviceValue(deviceId, device.state === 'on' ? 'Открыты' : 'Закрыты');
          break;
        
        // ТВ
        case 'tv_on':
          updateDeviceState(deviceId, 'on');
          break;
        case 'tv_off':
          updateDeviceState(deviceId, 'off');
          break;
        case 'check_tv':
          showDeviceValue(deviceId, device.state === 'on' ? 'Включен' : 'Выключен');
          break;
          
        // Музыка
        case 'music_on':
          updateDeviceState(deviceId, 'on');
          break;
        case 'music_off':
          updateDeviceState(deviceId, 'off');
          break;
          
        // Датчики
        case 'check_temperature':
          if (deviceId === 'sensor_1') {
            showDeviceValue(deviceId, `Температура: ${devices.sensor_1.values.temp}°C`);
          } else if (deviceId === 'heater') {
            showDeviceValue(deviceId, `Температура: ${devices.heater.state}°C`);
          }
          break;
        case 'check_humidity':
          showDeviceValue('sensor_1', `Влажность: ${devices.sensor_1.values.humidity}%`);
          break;
        case 'check_air':
          showDeviceValue('sensor_2', `CO₂: ${devices.sensor_2.values.co2} ppm`);
          break;
        case 'check_energy':
          showDeviceValue('sensor_3', `Расход энергии: ${devices.sensor_3.state}${devices.sensor_3.unit}`);
          break;
          
        // Температура отопления
        case 'temperature_up':
          let currentTemp = parseFloat(devices.heater.state);
          updateDeviceState(deviceId, (currentTemp + 1).toString());
          break;
        case 'temperature_down':
          let currTemp = parseFloat(devices.heater.state);
          updateDeviceState(deviceId, (currTemp - 1).toString());
          break;
          
        // Общие команды для датчиков
        case 'sensor_check':
          checkSensors();
          break;
        case 'sensor_reset':
          resetSensors();
          break;
      }
      
      return; // Команда обработана
    }
  }
  
  // Если команда не распознана
  log(`Команда не распознана: ${intent}`);
}

// Показать сообщение о недоступности устройства
function showDeviceOfflineMessage(deviceName) {
  log(`⚠️ Устройство "${deviceName}" недоступно`);
  
  // Создаём всплывающее окно с сообщением
  const popup = document.createElement('div');
  popup.className = 'show-device-value';
  popup.innerHTML = `
    <h3>Устройство недоступно</h3>
    <div class="value">
      <p>Устройство "${deviceName}" сейчас не в сети.</p>
      <p>Пожалуйста, проверьте подключение устройства.</p>
    </div>
    <button id="close-popup">Закрыть</button>
  `;
  
  document.body.appendChild(popup);
  
  // Анимация появления
  setTimeout(() => {
    popup.style.opacity = '1';
    popup.style.transform = 'scale(1)';
  }, 10);
  
  // Добавляем обработчик для закрытия
  document.getElementById('close-popup').addEventListener('click', () => {
    popup.style.opacity = '0';
    popup.style.transform = 'scale(0.8)';
    setTimeout(() => {
      document.body.removeChild(popup);
    }, 300);
  });
}

// Показать значение устройства
function showDeviceValue(deviceId, value) {
  const device = devices[deviceId];
  if (!device) return;
  
  log(`📊 Показания ${device.name}: ${value}`);
  
  // Создаём всплывающее окно со значением
  const popup = document.createElement('div');
  popup.className = 'show-device-value';
  popup.innerHTML = `
    <h3>${device.name}</h3>
    <div class="value">
      <p>${value}</p>
    </div>
    <button id="close-popup">Закрыть</button>
  `;
  
  document.body.appendChild(popup);
  
  // Анимация появления
  setTimeout(() => {
    popup.style.opacity = '1';
    popup.style.transform = 'scale(1)';
  }, 10);
  
  // Добавляем обработчик для закрытия
  document.getElementById('close-popup').addEventListener('click', () => {
    popup.style.opacity = '0';
    popup.style.transform = 'scale(0.8)';
    setTimeout(() => {
      document.body.removeChild(popup);
    }, 300);
  });
}

// Получить отображаемое значение устройства
function getDeviceDisplayValue(deviceId) {
  const device = devices[deviceId];
  if (!device) return '';
  
  switch (device.type) {
    case 'sensor':
      return device.state;
    case 'switch':
      if (device.states && device.states[device.state]) {
        return device.states[device.state];
      }
      return device.state === 'on' ? 'Вкл' : 'Выкл';
    case 'value':
      return `${device.state}${device.unit || ''}`;
    default:
      return device.state;
  }
}

// Проверить показания всех датчиков
function checkSensors() {
  log('📊 Проверка всех датчиков:');
  
  // Создаём всплывающее окно со значениями
  const popup = document.createElement('div');
  popup.className = 'show-device-value';
  
  let sensorInfo = '<h3>Показания датчиков</h3><div class="value">';
  
  // Добавляем информацию по каждому датчику
  if (devices.sensor_1.online) {
    sensorInfo += `<p>🌡️ Температура: ${devices.sensor_1.values.temp}°C | Влажность: ${devices.sensor_1.values.humidity}%</p>`;
  } else {
    sensorInfo += '<p>🌡️ Термогигрометр: недоступен</p>';
  }
  
  if (devices.sensor_2.online) {
    sensorInfo += `<p>💨 CO₂: ${devices.sensor_2.values.co2} ppm</p>`;
  } else {
    sensorInfo += '<p>💨 Анализатор воздуха: недоступен</p>';
  }
  
  if (devices.sensor_3.online) {
    sensorInfo += `<p>⚡ Расход энергии: ${devices.sensor_3.state}${devices.sensor_3.unit}</p>`;
  } else {
    sensorInfo += '<p>⚡ Счетчик энергии: недоступен</p>';
  }
  
  // Информация об отоплении
  if (devices.heater.online) {
    sensorInfo += `<p>🔥 Температура отопления: ${devices.heater.state}°C</p>`;
  }
  
  sensorInfo += '</div><button id="close-popup">Закрыть</button>';
  popup.innerHTML = sensorInfo;
  
  document.body.appendChild(popup);
  
  // Анимация появления
  setTimeout(() => {
    popup.style.opacity = '1';
    popup.style.transform = 'scale(1)';
  }, 10);
  
  // Добавляем обработчик для закрытия
  document.getElementById('close-popup').addEventListener('click', () => {
    popup.style.opacity = '0';
    popup.style.transform = 'scale(0.8)';
    setTimeout(() => {
      document.body.removeChild(popup);
    }, 300);
  });
}

// Сброс показаний датчиков
function resetSensors() {
  log('🔄 Сброс показаний датчиков');
  
  // Сбрасываем значения датчиков
  if (devices.sensor_3.online) {
    devices.sensor_3.state = '0.00';
    updateDeviceDisplay('sensor_3');
  }
  
  showDeviceValue('sensor_3', `Счетчик энергии сброшен: ${devices.sensor_3.state}${devices.sensor_3.unit}`);
}

// Отправка команды на Wirenboard
function sendCommandToWirenboard(deviceId, command, value) {
  // Здесь будет реализация для работы с реальными устройствами
  log(`📡 Отправка команды на Wirenboard: ${deviceId} ${command} ${value}`);
  
  return true; // Пока всегда успех
}

// Обновление состояния устройства
function updateDeviceState(deviceId, newState) {
  const device = devices[deviceId];
  if (!device) return false;
  
  // Сохраняем новое состояние
  device.state = newState;
  
  // Обновляем отображение
  updateDeviceDisplay(deviceId);
  
  // Для переключателей показываем соответствующее сообщение
  if (device.type === 'switch') {
    const stateText = device.states ? 
        device.states[newState] : 
        (newState === 'on' ? 'включен' : 'выключен');
    
    showDeviceValue(deviceId, `${device.name} ${stateText}`);
  }
  
  // Для устройств с числовыми значениями
  else if (device.type === 'value') {
    showDeviceValue(deviceId, `${device.name}: ${newState}${device.unit || ''}`);
  }
  
  return true;
}

// Обновление отображения устройства
function updateDeviceDisplay(deviceId) {
  const device = devices[deviceId];
  const cardElems = deviceCards[deviceId];
  
  if (!device || !cardElems) return;
  
  // Обновляем индикатор состояния
  if (device.online) {
    cardElems.indicator.className = 'device-indicator on';
    cardElems.status.className = 'device-status online';
    cardElems.status.textContent = 'Онлайн';
    
    // Для переключателей добавляем класс устройству
    if (device.type === 'switch' && device.state === 'on') {
      cardElems.card.classList.add('active');
    } else {
      cardElems.card.classList.remove('active');
    }
  } else {
    cardElems.indicator.className = 'device-indicator off';
    cardElems.status.className = 'device-status offline';
    cardElems.status.textContent = 'Офлайн';
    cardElems.card.classList.remove('active');
  }
}

// Переключение состояния онлайн/офлайн устройства
function toggleDeviceOnline(deviceId) {
  const device = devices[deviceId];
  if (!device) return;
  
  // Меняем состояние
  device.online = !device.online;
  
  // Обновляем отображение
  updateDeviceDisplay(deviceId);
  
  // Логируем изменение
  log(`${device.online ? '🟢' : '🔴'} Устройство "${device.name}" ${device.online ? 'онлайн' : 'офлайн'}`);
}

// Переключение состояния устройства (только для переключателей)
function toggleDeviceState(deviceId) {
  const device = devices[deviceId];
  if (!device || device.type !== 'switch' || !device.online) return;
  
  // Меняем состояние
  const newState = device.state === 'on' ? 'off' : 'on';
  
  // Обновляем состояние
  updateDeviceState(deviceId, newState);
  
  // Логируем изменение
  const stateText = device.states ? 
      device.states[newState] : 
      (newState === 'on' ? 'включен' : 'выключен');
  
  log(`🔄 Устройство "${device.name}" ${stateText}`);
}

// Обновление всех устройств
function updateAllDevices() {
  for (const deviceId in devices) {
    updateDeviceDisplay(deviceId);
  }
}

// Обновление последней команды
function updateLastCommand(text) {
  if (lastCommandText) {
    lastCommandText.textContent = text;
  }
}

// Классификация текста
async function classifyText(text) {
  // Здесь можно реализовать локальную классификацию,
  // если сервер недоступен
}

// Начало прослушивания
async function startListening() {
  try {
    isListening = true;
    
    // Запрашиваем доступ к микрофону
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    log('🎤 Доступ к микрофону получен');
    
    // Создаем аудио контекст
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    
    // Создаем процессор для обработки аудио
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = audioProcessingEvent => {
      // Получаем данные из буфера
      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      
      // Здесь можно обрабатывать аудиоданные или отправлять на сервер
      // Например, вычисление громкости для отображения визуализации
    };
    
    // Подключаем узлы
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    // Создаем MediaRecorder для записи аудио
    mediaRecorder = new MediaRecorder(stream);
    const chunks = [];
    
    mediaRecorder.ondataavailable = e => {
      chunks.push(e.data);
    };
    
    mediaRecorder.onstop = async () => {
      log('🔄 Обработка записи...');
      statusElem.textContent = 'Распознавание...';
      
      // Создаем blob из записанных данных
      const blob = new Blob(chunks, { type: 'audio/webm' });
      
      try {
        // Отправляем аудио на сервер для распознавания речи
        const formData = new FormData();
        formData.append('audio', blob);
        
        const response = await fetch('http://localhost:8080/recognize', {
          method: 'POST',
          body: formData
        });
        
        const result = await response.json();
        
        if (result && result.text) {
          log(`🎤 Распознано: "${result.text}"`);
          
          // Обрабатываем распознанную команду
          await processCommand(result.text);
        } else {
          log('⚠️ Речь не распознана');
        }
      } catch (error) {
        console.error('Error sending audio for recognition:', error);
        log('⚠️ Ошибка распознавания речи');
      }
      
      statusElem.textContent = '';
    };
    
    // Начинаем запись
    mediaRecorder.start();
    statusElem.textContent = 'Говорите...';
    
  } catch (error) {
    console.error('Error accessing microphone:', error);
    log('⚠️ Ошибка доступа к микрофону');
    isListening = false;
    micButton.classList.remove('recording');
  }
}

// Остановка прослушивания
function stopListening() {
  isListening = false;
  
  // Останавливаем запись
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  // Очищаем аудио контекст
  if (processor && audioContext) {
    processor.disconnect();
    audioContext.close().then(() => {
      log('🎤 Запись остановлена');
    });
  }
  
  // Сбрасываем состояние
  mediaRecorder = null;
  audioContext = null;
  processor = null;
}

// Разогрев модели
async function warmupModel() {
  try {
    log('🔄 Разогрев модели NLP...');
    const res = await fetch('http://localhost:8080/warmup');
    const data = await res.json();
    log('✅ Модель готова: ' + data.message);
  } catch(e) {
    console.error(e);
    log('⚠️ Ошибка при разогреве модели');
  }
} 