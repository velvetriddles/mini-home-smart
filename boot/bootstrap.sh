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

# Проверка доступности Ollama
wait_for_ollama

# Больше не выполняем прогрев модели здесь, так как это делается в веб-клиенте
echo "Запуск API сервера без прогрева (прогрев выполняется на стороне клиента)..."
exec ./server 