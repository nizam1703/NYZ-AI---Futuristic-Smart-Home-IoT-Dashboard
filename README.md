# NYZ AI - Futuristic Smart Home IoT Dashboard

NYZ AI adalah sistem antarmuka rumah pintar berbasis web yang mengintegrasikan AI Agent (Google Gemini) melalui n8n untuk mengontrol perangkat keras secara *real-time*. Sistem ini memungkinkan interaksi suara natural (Speech-to-Text & Text-to-Speech) untuk memonitor sensor dan mengendalikan simulasi perangkat elektronik.

## 🚀 Fitur Utama
* **Voice-Activated Control:** Memberikan perintah ke perangkat keras menggunakan suara berbahasa Indonesia.
* **Agentic AI Workflow:** Memanfaatkan n8n AI Agent untuk menerjemahkan perintah bahasa natural yang ambigu menjadi parameter API yang presisi secara otomatis.
* **Hardware as Source of Truth:** NodeMCU ESP8266 bertindak sebagai pusat status (Stateless AI design), memastikan data sensor dan status nyala/mati 6 LED selalu akurat.
* **Cyberpunk UI:** Antarmuka futuristik berbasis web dengan animasi CSS berkinerja tinggi tanpa membebani memori peramban.

## 🛠️ Arsitektur Sistem
1. **Frontend:** HTML5, CSS3, Vanilla JavaScript (menggunakan Web Speech API dan Fetch API).
2. **Middleware (n8n):** Webhook, Window Buffer Memory, Google Gemini 3.5 Flash-lite Chat Model, HTTP Request Tool.
3. **Hardware:** NodeMCU ESP8266 (C++), Sensor Suhu DHT22, Sensor Jarak Ultrasonik HC-SR04, Simulasi 6 Titik LED.

## ⚙️ Endpoint API Perangkat Keras
ESP8266 memproses *request* HTTP GET/POST pada jaringan lokal dengan parameter berikut:
* `?endpoint=data` — Mengembalikan data suhu, kelembapan, dan jarak dalam format JSON.
* `?endpoint=led&state=[on/off]&led_id=[1-6/all]` — Mengontrol nyala/mati perangkat.
* `?endpoint=status` — Mengembalikan status aktual seluruh perangkat fisik.

## 👨‍💻 Pengembang
Dikembangkan oleh **Nizam Al-Gifari**