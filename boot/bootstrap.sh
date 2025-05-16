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
  # Запрос на разогрев модели - простой запрос через API Ollama
  curl -s http://ollama:11434/api/generate -d '{
    "model": "llama3",
    "prompt": "Привет, это тестовый запрос для разогрева модели.",
    "stream": false
  }' > /dev/null
  echo "Модель инициализирована!"
}

# Проверка доступности Ollama
wait_for_ollama

# Инициализация модели
initialize_model

# Запуск основного сервера
echo "Запуск API сервера..."
exec ./server 