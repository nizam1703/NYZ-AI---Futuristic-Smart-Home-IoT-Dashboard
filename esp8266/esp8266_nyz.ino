#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DHT.h>

// Konfigurasi WiFi
const char* ssid = "NAMA_WIFI";
const char* password = "PASSWORD_WIFI";

// Konfigurasi Pin Sensor
#define DHTPIN D4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);
#define TRIG_PIN D5
#define ECHO_PIN D6

// Konfigurasi Array 6 Pin LED
const int ledPins[6] = {D0, D1, D2, D3, D7, D8};

ESP8266WebServer server(80);

void setup() {
  Serial.begin(115200);
  
  // Inisialisasi Sensor
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Inisialisasi ke-6 LED (Otomatis mati saat awal)
  for (int i = 0; i < 6; i++) {
    pinMode(ledPins[i], OUTPUT);
    digitalWrite(ledPins[i], LOW);
  }

  dht.begin();

  // Koneksi WiFi
  WiFi.begin(ssid, password);
  Serial.print("Menghubungkan ke WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nTerhubung! IP Address: ");
  Serial.println(WiFi.localIP());

  // Routing API
  server.on("/api", handleApiRequest);
  server.begin();
  Serial.println("Server HTTP dimulai.");
}

void loop() {
  server.handleClient();
}

void handleApiRequest() {
  if (server.hasArg("endpoint")) {
    String endpoint = server.arg("endpoint");
    
    // 1. ENDPOINT: DATA (Untuk Sensor Suhu & Jarak)
    if (endpoint == "data") {
      float h = dht.readHumidity();
      float t = dht.readTemperature();
      if (isnan(h) || isnan(t)) { t = 0.0; h = 0.0; }

      digitalWrite(TRIG_PIN, LOW);
      delayMicroseconds(2);
      digitalWrite(TRIG_PIN, HIGH);
      delayMicroseconds(10);
      digitalWrite(TRIG_PIN, LOW);
      long duration = pulseIn(ECHO_PIN, HIGH);
      float distance = duration * 0.034 / 2;

      String jsonResponse = "{\"suhu\": " + String(t) + 
                            ", \"kelembapan\": " + String(h) + 
                            ", \"jarak_cm\": " + String(distance) + "}";
      server.send(200, "application/json", jsonResponse);
      
    } 
    // 2. ENDPOINT: LED (Untuk Menyalakan/Mematikan)
    else if (endpoint == "led") {
      String state = server.arg("state");
      String led_id = server.arg("led_id");
      int targetState = (state == "on") ? HIGH : LOW;

      if (led_id == "all") {
        for (int i = 0; i < 6; i++) digitalWrite(ledPins[i], targetState);
        server.send(200, "application/json", "{\"status\": \"Semua lampu " + state + "\"}");
      } else {
        int index = led_id.toInt() - 1;
        if (index >= 0 && index < 6) {
          digitalWrite(ledPins[index], targetState);
          server.send(200, "application/json", "{\"status\": \"Lampu " + led_id + " " + state + "\"}");
        } else {
          server.send(400, "application/json", "{\"error\": \"LED ID tidak valid\"}");
        }
      }
    } 
    // 3. ENDPOINT: STATUS (FITUR BARU: Mengecek lampu mana yang sedang menyala)
    else if (endpoint == "status") {
      String jsonStatus = "{";
      for (int i = 0; i < 6; i++) {
        // Membaca status fisik voltase pada pin
        String kondisi = (digitalRead(ledPins[i]) == HIGH) ? "on" : "off";
        jsonStatus += "\"led_" + String(i + 1) + "\": \"" + kondisi + "\"";
        if (i < 5) jsonStatus += ", "; // Tambah koma kecuali di item terakhir
      }
      jsonStatus += "}";
      server.send(200, "application/json", jsonStatus);
    } 
    // 4. JIKA ENDPOINT SALAH/TIDAK DIKENAL
    else {
      server.send(404, "application/json", "{\"error\": \"Endpoint tidak ditemukan\"}");
    }
  } else {
    server.send(400, "application/json", "{\"error\": \"Parameter endpoint wajib diisi\"}");
  }
}