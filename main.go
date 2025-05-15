package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

const fewshot = `Ты — голосовой ассистент умного дома.  
Твоя текущая задача — КЛАССИФИКАЦИЯ КОМАНД.

Правила ответа:
1. Прочти пользовательскую фразу.  
2. Верни **только** одну метку из списка ниже, без пробелов, комментариев и кавычек.  
3. Если фраза не подходит ни под один интент — верни ` + "`unknown`" + `.

Справочник интентов:  
light_on, light_off, temperature_up, temperature_down,  
music_on, music_off, curtains_open, curtains_close,  
tv_on, tv_off, door_lock, door_unlock,  
sensor_check, sensor_reset, unknown

===== ПРИМЕРЫ =====
зажги подсветку               → light_on
свет включается               → light_on

погаси освещение              → light_off
лампу выключи                 → light_off

подними температуру           → temperature_up
становится прохладно          → temperature_up

остуди комнату                → temperature_down
температуру ниже              → temperature_down

воспроизведи музыку           → music_on
запусти трек                  → music_on

музыку останови               → music_off
плеер выкл                    → music_off

шторы раздвинь                → curtains_open
подними жалюзи                → curtains_open

затемни окна                  → curtains_close
оконные шторы опусти          → curtains_close

телевизор вкл                 → tv_on
включай тв                    → tv_on

тв отключить                  → tv_off
телевизор выруби              → tv_off

запри дверь                   → door_lock
вход заблокировать            → door_lock

дверь разблокируй             → door_unlock
открой вход                   → door_unlock

проверка сенсоров             → sensor_check
просканируй датчики           → sensor_check

сенсоры рестарт               → sensor_reset
датчики перезапусти           → sensor_reset

спой анекдот                  → unknown
что нового в мире             → unknown
сколько будет 2+2             → unknown
=====================
потеплей                → temperature_up
прикрой занавески       → curtains_close
открой дверь            → door_unlock
сними замок             → door_unlock
отпреси дверь           → door_unlock
погода на завтра        → unknown


Новая фраза: «<ФРАЗА>» →`

type ClassifyRequest struct {
	Text string `json:"text"`
}

type ClassifyResponse struct {
	Text   string `json:"text"`
	Intent string `json:"intent"`
}

type OllamaRequest struct {
	Model   string                 `json:"model"`
	Prompt  string                 `json:"prompt"`
	Options map[string]interface{} `json:"options"`
	Stream  bool                   `json:"stream"`
}

type OllamaResponse struct {
	Response string `json:"response"`
}

func main() {
	// Получаем хост Ollama из переменных окружения или используем значение по умолчанию
	ollamaHost := os.Getenv("OLLAMA_HOST")
	if ollamaHost == "" {
		ollamaHost = "http://localhost:11434"
	}

	// Настраиваем HTTP сервер
	mux := http.NewServeMux()

	// Обработчик для классификации текста
	mux.HandleFunc("/classify", func(w http.ResponseWriter, r *http.Request) {
		// Добавляем CORS заголовки
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		// Обрабатываем preflight OPTIONS запрос
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Проверяем метод
		if r.Method != http.MethodPost {
			http.Error(w, "Метод не разрешен", http.StatusMethodNotAllowed)
			return
		}

		// Читаем тело запроса
		var req ClassifyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Ошибка при разборе JSON", http.StatusBadRequest)
			return
		}

		// Формируем prompt с использованием текста из запроса
		prompt := strings.Replace(fewshot, "<ФРАЗА>", req.Text, 1)

		// Создаем запрос к Ollama API
		ollamaReq := OllamaRequest{
			Model:  "phi3:mini",
			Prompt: prompt,
			Options: map[string]interface{}{
				"temperature": 0,
				"top_p":       1,
				"num_predict": 12,
			},
			Stream: false,
		}

		// Кодируем запрос в JSON
		reqBody, err := json.Marshal(ollamaReq)
		if err != nil {
			http.Error(w, "Ошибка при создании запроса", http.StatusInternalServerError)
			return
		}

		// Отправляем запрос к Ollama API
		resp, err := http.Post(ollamaHost+"/api/generate", "application/json", bytes.NewBuffer(reqBody))
		if err != nil {
			http.Error(w, "Ошибка при обращении к Ollama API", http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		// Читаем ответ
		var ollamaResp OllamaResponse
		if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
			http.Error(w, "Ошибка при разборе ответа от Ollama", http.StatusInternalServerError)
			return
		}

		// Формируем ответ клиенту
		response := ClassifyResponse{
			Text:   req.Text,
			Intent: strings.TrimSpace(ollamaResp.Response),
		}

		// Отправляем ответ
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			http.Error(w, "Ошибка при формировании ответа", http.StatusInternalServerError)
			return
		}
	})

	// Создаем HTTP сервер
	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	// Запускаем сервер в отдельной горутине
	go func() {
		log.Printf("Сервер запущен на порту :8080")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Ошибка при запуске сервера: %v", err)
		}
	}()

	// Настраиваем graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Завершение работы сервера...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Ошибка при остановке сервера: %v", err)
	}

	log.Println("Сервер успешно остановлен")
}
