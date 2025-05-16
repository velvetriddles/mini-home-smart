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

// Инициализация DOM-элементов после загрузки страницы
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
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

  // Обработчик кнопки отправки текста
  sendButton.addEventListener('click', handleSendClick);

  // Запуск/остановка распознавания речи
  micButton.addEventListener('click', handleMicClick);

  // Добавление функции для переключения темы
  themeToggle.addEventListener('click', toggleTheme);

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
    iconElem.textContent = device.icon || '📱';
    
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
    
    // Добавляем обработчик клика по карточке для переключения статуса online/offline
    card.addEventListener('click', (event) => {
      if (event.detail === 1) {  // Одиночный клик
        // Добавляем эффект волны
        const ripple = document.createElement('div');
        ripple.className = 'ripple';
        ripple.style.left = `${event.offsetX}px`;
        ripple.style.top = `${event.offsetY}px`;
        card.appendChild(ripple);
        
        // Удаляем волну после анимации
        setTimeout(() => {
          ripple.remove();
        }, 600);
        
        // Используем setTimeout для распознавания между одинарным и двойным кликом
        const clickTimeout = setTimeout(() => {
          toggleDeviceOnline(deviceId);
        }, 300);
        
        card.setAttribute('data-click-timeout', clickTimeout);
      }
    });
    
    // Обработчик двойного клика для показа статуса
    card.addEventListener('dblclick', (event) => {
      // Отменяем таймер одиночного клика
      const clickTimeout = parseInt(card.getAttribute('data-click-timeout'));
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        card.removeAttribute('data-click-timeout');
      }
      
      // Показываем информацию об устройстве
      showDeviceDetails(deviceId);
      
      // Предотвращаем всплытие события
      event.stopPropagation();
    });
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
          
        // Температура
        case 'temperature_up':
          let currentTemp = parseInt(devices[deviceId].state);
          updateDeviceState(deviceId, (currentTemp + 1).toString());
          break;
        case 'temperature_down':
          let temp = parseInt(devices[deviceId].state);
          updateDeviceState(deviceId, (temp - 1).toString());
          break;
        case 'check_temperature':
          if (deviceId === 'heater') {
            showDeviceValue(deviceId, `${device.state}${device.unit}`);
          } else if (deviceId === 'sensor_1') {
            showDeviceValue(deviceId, `Температура: ${device.values.temp}°C`);
          }
          break;
        
        // Проверки датчиков
        case 'check_humidity':
          showDeviceValue('sensor_1', `Влажность: ${devices.sensor_1.values.humidity}%`);
          break;
        case 'check_air':
          showDeviceValue('sensor_2', `CO₂: ${devices.sensor_2.values.co2}ppm`);
          break;
        case 'check_energy':
          showDeviceValue('sensor_3', `${devices.sensor_3.state}${devices.sensor_3.unit}`);
          break;
          
        // Обновление сенсоров
        case 'sensor_check':
          checkSensors();
          break;
        case 'sensor_reset':
          resetSensors();
          break;
      }
      
      return;
    }
  }
  
  // Обработка старого формата команд (для совместимости)
  const parts = intent.split(':');
  
  if (parts.length < 2) {
    log(`Команда не распознана: ${intent}`);
    return;
  }
  
  const command = parts[0];
  const deviceId = parts[1];
  const value = parts[2];  // Опционально, для команд с значением
  
  if (!devices[deviceId]) {
    log(`Устройство не найдено: ${deviceId}`);
    return;
  }
  
  // Проверка статуса устройства
  if (!devices[deviceId].online) {
    showDeviceOfflineMessage(devices[deviceId].name);
    return;
  }
  
  log(`Выполняется: ${command} для ${devices[deviceId].name}`);
  
  switch (command) {
    case 'turn_on':
      updateDeviceState(deviceId, 'on');
      break;
    case 'turn_off':
      updateDeviceState(deviceId, 'off');
      break;
    case 'toggle':
      toggleDeviceState(deviceId);
      break;
    case 'set_value':
      if (value !== undefined) {
        updateDeviceState(deviceId, value);
      }
      break;
    case 'check_value':
      showDeviceValue(deviceId, getDeviceDisplayValue(deviceId));
      break;
    default:
      log(`Неизвестная команда: ${command}`);
  }
}

// Отображение сообщения о недоступности устройства
function showDeviceOfflineMessage(deviceName) {
  log(`⚠️ Устройство "${deviceName}" недоступно`);
  
  // Создаем элемент для отображения сообщения
  const messageBox = document.createElement('div');
  messageBox.className = 'show-device-value';
  messageBox.innerHTML = `
    <h3>${deviceName}</h3>
    <div class="value" style="color: var(--status-offline)">УСТРОЙСТВО НЕДОСТУПНО</div>
    <button id="close-popup">Закрыть</button>
  `;
  
  document.body.appendChild(messageBox);
  
  // Анимация появления
  setTimeout(() => {
    messageBox.style.opacity = '1';
    messageBox.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 10);
  
  // Добавляем обработчик для кнопки закрытия
  document.getElementById('close-popup').addEventListener('click', () => {
    messageBox.style.opacity = '0';
    messageBox.style.transform = 'translate(-50%, -50%) scale(0.8)';
    setTimeout(() => {
      document.body.removeChild(messageBox);
    }, 300);
  });
  
  // Автоматически убираем через 3 секунды
  setTimeout(() => {
    if (messageBox.parentNode) {
      messageBox.style.opacity = '0';
      messageBox.style.transform = 'translate(-50%, -50%) scale(0.8)';
      setTimeout(() => {
        if (messageBox.parentNode) {
          document.body.removeChild(messageBox);
        }
      }, 300);
    }
  }, 3000);
}

// Отображение значения устройства
function showDeviceValue(deviceId, value) {
  const device = devices[deviceId];
  
  if (!device) return;
  
  log(`📊 Показания ${device.name}: ${value}`);
  
  // Создаем элемент для отображения значения
  const valueBox = document.createElement('div');
  valueBox.className = 'show-device-value';
  valueBox.innerHTML = `
    <h3>${device.name}</h3>
    <div class="value">${value}</div>
    <button id="close-popup">Закрыть</button>
  `;
  
  document.body.appendChild(valueBox);
  
  // Анимация появления
  setTimeout(() => {
    valueBox.style.opacity = '1';
    valueBox.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 10);
  
  // Добавляем обработчик для кнопки закрытия
  document.getElementById('close-popup').addEventListener('click', () => {
    valueBox.style.opacity = '0';
    valueBox.style.transform = 'translate(-50%, -50%) scale(0.8)';
    setTimeout(() => {
      document.body.removeChild(valueBox);
    }, 300);
  });
  
  // Автоматически убираем через 5 секунд
  setTimeout(() => {
    if (valueBox.parentNode) {
      valueBox.style.opacity = '0';
      valueBox.style.transform = 'translate(-50%, -50%) scale(0.8)';
      setTimeout(() => {
        if (valueBox.parentNode) {
          document.body.removeChild(valueBox);
        }
      }, 300);
    }
  }, 5000);
}

// Получение форматированного значения для отображения
function getDeviceDisplayValue(deviceId) {
  const device = devices[deviceId];
  
  if (!device) return '';
  
  switch (deviceId) {
    case 'sensor_1':
      return `${device.values.temp}°C | ${device.values.humidity}%`;
    case 'sensor_2':
      return `CO₂: ${device.values.co2}ppm`;
    case 'sensor_3':
    case 'heater':
      return device.state + (device.unit || '');
    default:
      return device.state;
  }
}

// Проверка всех сенсоров
function checkSensors() {
  log('📊 Проверка всех датчиков...');
  
  // Симулируем новые данные с сенсоров
  const newValues = {
    sensor_1: { temp: (18 + Math.floor(Math.random() * 6)).toString(), 
               humidity: (40 + Math.floor(Math.random() * 20)).toString() },
    sensor_2: { co2: (400 + Math.floor(Math.random() * 100)).toString() },
    sensor_3: (Math.random() * 2 + 0.8).toFixed(2)  // Случайное потребление энергии от 0.8 до 2.8 кВт⋅ч
  };
  
  // Обновляем термогигрометр
  devices.sensor_1.values = newValues.sensor_1;
  devices.sensor_1.state = `${newValues.sensor_1.temp}°C | ${newValues.sensor_1.humidity}%`;
  
  // Обновляем анализатор воздуха
  devices.sensor_2.values = newValues.sensor_2;
  devices.sensor_2.state = `CO₂: ${newValues.sensor_2.co2}ppm`;
  
  // Обновляем счетчик энергии
  devices.sensor_3.state = newValues.sensor_3;
  devices.sensor_3.baseValue = parseFloat(newValues.sensor_3);
  
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
    popup.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 10);
  
  // Добавляем обработчик для закрытия
  document.getElementById('close-popup').addEventListener('click', () => {
    popup.style.opacity = '0';
    popup.style.transform = 'translate(-50%, -50%) scale(0.8)';
    setTimeout(() => {
      document.body.removeChild(popup);
    }, 300);
  });
  
  log('✅ Данные датчиков обновлены');
}

// Сброс сенсоров в начальное состояние
function resetSensors() {
  log('Сброс сенсоров...');
  
  // Термогигрометр
  devices.sensor_1.values = { temp: '20', humidity: '45' };
  devices.sensor_1.state = '20°C | 45%';
  
  // Анализатор воздуха
  devices.sensor_2.values = { co2: '412' };
  devices.sensor_2.state = 'CO₂: 412ppm';
  
  // Счетчик энергии
  devices.sensor_3.state = '1.24';
  devices.sensor_3.baseValue = 1.24;
  
  log('Сенсоры сброшены');
  showDeviceValue('sensor_1', 'Датчики сброшены');
}

// Функция отправки данных на Wirenboard (заглушка)
function sendCommandToWirenboard(deviceId, command, value) {
  // Пример REST API запроса на Wirenboard
  // fetch('http://wirenboard-ip/api/v1/devices/' + deviceId + '/controls', 
  //   { method: 'POST', body: JSON.stringify({ value: value }) }
  // );
  log(`Отправка на Wirenboard: ${deviceId}, ${command}, ${value}`);
}

// Обновление состояния устройства
function updateDeviceState(deviceId, newState) {
  if (!devices[deviceId]) return;
  
  const device = devices[deviceId];
  
  // Проверка статуса устройства
  if (!device.online) {
    showDeviceOfflineMessage(device.name);
    return;
  }
  
  device.state = newState;
  
  updateDeviceDisplay(deviceId);
  
  log(`Устройство ${device.name} изменено на ${newState}`);
}

// Обновление отображения устройства в интерфейсе
function updateDeviceDisplay(deviceId) {
  const device = devices[deviceId];
  const uiElements = deviceCards[deviceId];
  
  if (!uiElements) return;
  
  // Обновляем индикатор онлайн/офлайн
  if (uiElements.status) {
    if (device.online) {
      uiElements.status.className = 'device-status online';
      uiElements.status.textContent = 'Онлайн';
    } else {
      uiElements.status.className = 'device-status offline';
      uiElements.status.textContent = 'Офлайн';
    }
  }
  
  // Обновляем индикатор, если есть
  if (uiElements.indicator) {
    uiElements.indicator.className = 'device-indicator ' + (device.online ? 'on' : 'off');
  }
  
  // Обновляем карточку
  uiElements.card.classList.toggle('active', device.online && device.type === 'switch' && device.state === 'on');
}

// Переключение онлайн-статуса устройства
function toggleDeviceOnline(deviceId) {
  if (!devices[deviceId]) return;
  
  const device = devices[deviceId];
  
  // Переключаем статус онлайн/офлайн
  device.online = !device.online;
  
  // Обновляем отображение
  updateDeviceDisplay(deviceId);
  
  log(`Устройство ${device.name} ${device.online ? 'в сети' : 'не в сети'}`);
}

// Переключение состояния устройства (вкл/выкл)
function toggleDeviceState(deviceId) {
  if (!devices[deviceId]) return;
  
  const device = devices[deviceId];
  
  // Проверка статуса устройства
  if (!device.online) {
    showDeviceOfflineMessage(device.name);
    return;
  }
  
  if (device.type === 'switch') {
    const newState = device.state === 'on' ? 'off' : 'on';
    updateDeviceState(deviceId, newState);
  } else if (device.type === 'value' && deviceId === 'sensor_3') {
    // Для счетчика энергии: при клике симулируем изменение показаний
    const currentValue = parseFloat(device.state);
    const newValue = (currentValue + 0.05).toFixed(2);
    updateDeviceState(deviceId, newValue);
  }
}

// Обновление всех устройств согласно текущим состояниям
function updateAllDevices() {
  Object.keys(devices).forEach(deviceId => {
    updateDeviceDisplay(deviceId);
  });
}

// Обновление текста последней команды
function updateLastCommand(text) {
  if (lastCommandText) {
    lastCommandText.textContent = text;
  }
}

// Функция для классификации (теперь используется processCommand)
async function classifyText(text) {
  await processCommand(text);
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
          // Обрабатываем текстовую команду
          processCommand(d.text.trim());
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
  micButton.style.background = '';
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

// Функция для показа подробной информации об устройстве
function showDeviceDetails(deviceId) {
  const device = devices[deviceId];
  if (!device) return;
  
  let detailsHTML = '';
  
  if (device.type === 'sensor') {
    if (deviceId === 'sensor_1') {
      detailsHTML = `
        <p><strong>Тип:</strong> Датчик температуры и влажности</p>
        <p><strong>Температура:</strong> ${device.values.temp}°C</p>
        <p><strong>Влажность:</strong> ${device.values.humidity}%</p>
        <p><strong>Статус:</strong> ${device.online ? 'Онлайн' : 'Офлайн'}</p>
      `;
    } else if (deviceId === 'sensor_2') {
      detailsHTML = `
        <p><strong>Тип:</strong> Анализатор качества воздуха</p>
        <p><strong>CO₂:</strong> ${device.values.co2} ppm</p>
        <p><strong>Статус:</strong> ${device.online ? 'Онлайн' : 'Офлайн'}</p>
      `;
    }
  } else if (device.type === 'value') {
    if (deviceId === 'sensor_3') {
      detailsHTML = `
        <p><strong>Тип:</strong> Счетчик энергии</p>
        <p><strong>Текущее потребление:</strong> ${device.state}${device.unit}</p>
        <p><strong>Статус:</strong> ${device.online ? 'Онлайн' : 'Офлайн'}</p>
      `;
    } else if (deviceId === 'heater') {
      detailsHTML = `
        <p><strong>Тип:</strong> Терморегулятор</p>
        <p><strong>Температура:</strong> ${device.state}°C</p>
        <p><strong>Статус:</strong> ${device.online ? 'Онлайн' : 'Офлайн'}</p>
      `;
    }
  } else if (device.type === 'switch') {
    // Для переключателей (шторы, ТВ, колонка)
    let stateText = device.state === 'on' ? 'Включен' : 'Выключен';
    if (device.states && device.states[device.state]) {
      stateText = device.states[device.state];
    }
    
    detailsHTML = `
      <p><strong>Тип:</strong> ${device.name}</p>
      <p><strong>Состояние:</strong> ${stateText}</p>
      <p><strong>Статус:</strong> ${device.online ? 'Онлайн' : 'Офлайн'}</p>
    `;
    
    if (device.online) {
      detailsHTML += `
        <div class="device-controls">
          <button class="control-button" data-action="toggle" data-device="${deviceId}">
            ${device.state === 'on' ? 'Выключить' : 'Включить'}
          </button>
        </div>
      `;
    }
  }
  
  if (!device.online) {
    detailsHTML += `<p class="device-offline-message">⚠️ Устройство сейчас не в сети</p>`;
  }
  
  // Создаём всплывающее окно с информацией
  const popup = document.createElement('div');
  popup.className = 'show-device-value device-details';
  popup.innerHTML = `
    <h3>${device.icon} ${device.name}</h3>
    <div class="value">
      ${detailsHTML}
    </div>
    <button id="close-popup">Закрыть</button>
  `;
  
  document.body.appendChild(popup);
  
  // Анимация появления
  setTimeout(() => {
    popup.style.opacity = '1';
    popup.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 10);
  
  // Добавляем обработчик для закрытия
  document.getElementById('close-popup').addEventListener('click', () => {
    popup.style.opacity = '0';
    popup.style.transform = 'translate(-50%, -50%) scale(0.8)';
    setTimeout(() => {
      document.body.removeChild(popup);
    }, 300);
  });
  
  // Обработчики кнопок управления (если они есть)
  const controlButtons = popup.querySelectorAll('.control-button');
  controlButtons.forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      const targetDevice = button.dataset.device;
      
      if (action === 'toggle') {
        toggleDeviceState(targetDevice);
        // Обновляем текст кнопки
        button.textContent = devices[targetDevice].state === 'on' ? 'Выключить' : 'Включить';
      }
    });
  });
} 