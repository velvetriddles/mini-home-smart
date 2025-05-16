#!/bin/sh

# Функция для проверки доступности Ollama
wait_for_ollama() {
  echo "Проверка доступности сервера Ollama..."
  while ! wget -q --spider http://ollama:11434/api/tags 2>/dev/null; do
    echo "Ожидание запуска Ollama сервера..."
    sleep 5
  done
  echo "Сервер Ollama доступен!"
}

# Функция для инициализации модели
initialize_model() {
  echo "Инициализация языковой модели..."

  # Запрос на разогрев модели phi3:mini - используем реальный промпт из приложения
  for i in 1 2 3; do
    echo "Прогрев модели (попытка $i)..."
    
    # Используем тот же формат запроса, который использует приложение
    curl -s http://ollama:11434/api/generate -d '{
      "model": "phi3:mini",
      "prompt": "Ты — голосовой ассистент умного дома. Твоя текущая задача — КЛАССИФИКАЦИЯ КОМАНД. Правила ответа: 1. Прочти пользовательскую фразу. 2. Верни **только** одну метку из списка ниже, без пробелов, комментариев и кавычек. 3. Если фраза не подходит ни под один интент — верни `unknown`. Справочник интентов: light_on, light_off, temperature_up, temperature_down, music_on, music_off, curtains_open, curtains_close, tv_on, tv_off, door_lock, door_unlock, sensor_check, sensor_reset, unknown ===== ПРИМЕРЫ ===== зажги подсветку → light_on свет включается → light_on погаси освещение → light_off лампу выключи → light_off подними температуру → temperature_up становится прохладно → temperature_up остуди комнату → temperature_down температуру ниже → temperature_down воспроизведи музыку → music_on запусти трек → music_on музыку останови → music_off плеер выкл → music_off шторы раздвинь → curtains_open подними жалюзи → curtains_open затемни окна → curtains_close оконные шторы опусти → curtains_close телевизор вкл → tv_on включай тв → tv_on тв отключить → tv_off телевизор выруби → tv_off запри дверь → door_lock вход заблокировать → door_lock дверь разблокируй → door_unlock открой вход → door_unlock проверка сенсоров → sensor_check просканируй датчики → sensor_check сенсоры рестарт → sensor_reset датчики перезапусти → sensor_reset спой анекдот → unknown что нового в мире → unknown сколько будет 2+2 → unknown ===================== потеплей → temperature_up прикрой занавески → curtains_close открой дверь → door_unlock сними замок → door_unlock отпреси дверь → door_unlock погода на завтра → unknown Новая фраза: «включи свет» →",
      "options": {
        "temperature": 0,
        "top_p": 1,
        "num_predict": 12
      },
      "stream": false
    }' > /dev/null

    # Небольшая пауза между запросами
    sleep 1
  done
  
  echo "Модель инициализирована!"
}

# Проверка доступности Ollama
wait_for_ollama

# Инициализация модели
initialize_model

# Запуск основного сервера
echo "Запуск API сервера..."
exec ./server 