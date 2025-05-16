# SmartNLU - Умный дом с NLU классификацией

## Текущая реализация

Система состоит из трех микросервисов:

1. **Ollama** - локальный LLM-сервер для запуска малой языковой модели (phi3:mini)
2. **API** - Go-сервис, обрабатывающий запросы классификации команд пользователя
3. **STT** - Vosk сервер для распознавания речи на русском языке

### Архитектура

```
                     +---> [Ollama (порт 11434)]
                     |
[Клиент] <---> [API (Go, порт 8080)]
   |                  
   |                    
   +---> [STT (Vosk, порт 2700)]
      WebSocket аудио
```

### Принцип работы

1. Пользователь отправляет текст команды на `/classify` эндпоинт API или аудио через WebSocket на STT-сервер
2. STT-сервер преобразует речь в текст и возвращает результат клиенту
3. Go-сервер формирует промпт с примерами команд (few-shot) и отправляет запрос к Ollama API
4. Модель phi3:mini классифицирует текст в одну из категорий:
   - light_on, light_off
   - temperature_up, temperature_down
   - music_on, music_off
   - curtains_open, curtains_close
   - tv_on, tv_off
   - door_lock, door_unlock
   - sensor_check, sensor_reset
   - unknown
5. API возвращает классифицированный интент

### Установка

1. Склонируйте репозиторий
2. Загрузите модель русского языка для Vosk:
   ```bash
   mkdir -p models/vosk-ru
   wget https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip
   unzip vosk-model-small-ru-0.22.zip -d models/vosk-ru
   ```
3. Запустите сервисы:
   ```bash
   docker-compose up -d
   ```

### Управление системой

```bash
# Запуск контейнеров
docker-compose up -d

# Остановка контейнеров
docker-compose down

# Пересборка и перезапуск с новым кодом
docker-compose down
docker-compose up -d --build

# Просмотр логов
docker logs smartnlu-api
docker logs smartnlu-ollama
docker logs smartnlu-stt

# Проверка работы API
curl -X POST -H "Content-Type: application/json" -d '{"text": "включи свет"}' http://localhost:8080/classify
```

### Использование STT

STT-сервер (Vosk) запускается на порту 2700 и принимает аудиопоток через WebSocket. Клиент отправляет аудио с частотой дискретизации 16 кГц. Сервер возвращает распознанный текст в формате JSON.

Пример использования в JavaScript:
```javascript
// Создание WebSocket соединения с STT-сервером
const socket = new WebSocket('ws://localhost:2700');
socket.binaryType = 'arraybuffer';

// Инициализация
socket.onopen = () => {
  socket.send(JSON.stringify({config:{sample_rate:16000}}));
};

// Обработка ответов от сервера
socket.onmessage = function(event) {
  const result = JSON.parse(event.data);
  if (result.text) {
    console.log('Распознанный текст:', result.text);
    // Отправка текста на сервер классификации
    fetch('/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: result.text })
    })
    .then(response => response.json())
    .then(data => console.log('Интент:', data.intent));
  }
};

// При завершении работы
socket.send(JSON.stringify({"eof":1}));
```

## Планы развития

### 1. Интеграция с Wirenboard

- Добавление локального Wirenboard с виртуальными датчиками
- Преобразование классифицированных команд в MQTT-сообщения для WB
- Реализация обратной связи от датчиков

### 2. Улучшение голосового интерфейса

- Добавление отдельного контейнера для распознавания речи (Vosk/Whisper)
- Интеграция TTS для озвучивания ответов
- Полноценный голосовой диалог

### 3. Улучшение пользовательского интерфейса

- Создание веб-интерфейса для управления и мониторинга
- Отображение состояния датчиков в реальном времени через WebSocket
- Интерфейс для добавления новых команд и обучения модели

### 4. Расширение функциональности NLU

- Добавление slots/entities для извлечения параметров из команд
- Улучшение контекстного понимания последовательных команд
- Поддержка комплексных команд ("включи свет и выключи телевизор")

## Технические заметки

### MQTT и WebSocket для датчиков

Для отображения данных с датчиков в реальном времени предлагается:
1. Подписаться на MQTT-топики Wirenboard через MQTT-клиент на бэкенде
2. Организовать WebSocket-сервер для передачи изменений в UI
3. Реализовать клиентскую часть для отображения показаний

### Голосовой интерфейс

Для распознавания речи предлагается:
1. Использовать локальную модель Vosk/Whisper в отдельном контейнере
2. Микрофонный поток обрабатывать через WebRTC в браузере
3. Для синтеза речи использовать локальную TTS-модель
