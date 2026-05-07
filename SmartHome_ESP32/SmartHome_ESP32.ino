#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <WiFiManager.h>
#include "DHT.h"
#include <time.h> 

// --- KONFIGURASI FIREBASE ---
#define API_KEY "AIzaSyCMi_dNUlMC2yKNgzOtLtkQiGiM1dAVOK8"
#define DATABASE_URL "https://skripsi-smarthome-e6971-default-rtdb.asia-southeast1.firebasedatabase.app/"

// --- PIN DEFINISI ---
#define DHTPIN 4
#define DHTTYPE DHT11
#define PIN_LDR 34
#define PIN_GAS 35
#define PIN_BUZZER 25
#define PIN_LAMPU 26
#define PIN_KIPAS 27

// --- INSTANSI & VARIABEL ---
DHT dht(DHTPIN, DHTTYPE);
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

unsigned long sendDataPrevMillis = 0;
unsigned long manualKipasMillis = 0;
unsigned long manualLampuMillis = 0;
bool manualKipasActive = false;
bool manualLampuActive = false;

#define MANUAL_TIMEOUT_MS 60000  // 1 menit batas kontrol manual

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n=== SISTEM IOT SIAP ===\n");
  
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LAMPU, OUTPUT);
  pinMode(PIN_KIPAS, OUTPUT);
  
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LAMPU, LOW);
  digitalWrite(PIN_KIPAS, LOW);
  
  dht.begin();

  // WiFi Manager
  WiFiManager wm;
  if(!wm.autoConnect("SmartHome_AP")) {
    Serial.println("Gagal konek WiFi!");
    delay(3000);
    ESP.restart();
  }
  Serial.println("WiFi Terhubung!");

  // Sinkronisasi Waktu
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  while (time(nullptr) < 1000) { delay(500); Serial.print("."); }
  Serial.println("\nWaktu OK!");

  // Firebase Init
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.timeout.networkReconnect = 10000;
  if (Firebase.signUp(&config, &auth, "", "")) Serial.println("Firebase SignUp OK");
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  if (Firebase.ready() && (millis() - sendDataPrevMillis > 5000 || sendDataPrevMillis == 0)) {
    sendDataPrevMillis = millis();

    // 1. BACA SENSOR
    float t_raw = dht.readTemperature();
    float h_raw = dht.readHumidity();
    if (isnan(t_raw) || isnan(h_raw)) { t_raw = 0; h_raw = 0; }
    
    int t = (int)round(t_raw);
    int h = (int)round(h_raw);
    int cahaya = analogRead(PIN_LDR);
    int gas = analogRead(PIN_GAS);

    // 2. CEK KONTROL MANUAL (LOGIKA BARU: BISA ON & OFF)
    
    // Cek Kipas
    if (Firebase.RTDB.getBool(&fbdo, "/kontrol/kipas")) {
      bool webKipas = fbdo.boolData();
      bool autoKipasStatus = (t > 29);
      if (webKipas != autoKipasStatus) { // Jika tombol web beda dengan sensor
        manualKipasActive = true;
        manualKipasMillis = millis();
      } else {
        manualKipasActive = false;
      }
    }

    // Cek Lampu
    if (Firebase.RTDB.getBool(&fbdo, "/kontrol/lampu")) {
      bool webLampu = fbdo.boolData();
      bool autoLampuStatus = (cahaya > 880);
      if (webLampu != autoLampuStatus) {
        manualLampuActive = true;
        manualLampuMillis = millis();
      } else {
        manualLampuActive = false;
      }
    }

    // 3. EKSEKUSI OUTPUT (DETERMINE STATE)
    bool kipasState, lampuState, buzzerState;
    String kipasMode, lampuMode;

    // Eksekusi Kipas
    if (manualKipasActive && (millis() - manualKipasMillis < MANUAL_TIMEOUT_MS)) {
      Firebase.RTDB.getBool(&fbdo, "/kontrol/kipas");
      kipasState = fbdo.boolData(); 
      kipasMode = kipasState ? "Manual-ON" : "Manual-OFF";
    } else {
      manualKipasActive = false;
      kipasState = (t > 29) ? HIGH : LOW;
      kipasMode = (t > 29) ? "Auto-ON" : "Auto-OFF";
    }
    digitalWrite(PIN_KIPAS, kipasState);

    // Eksekusi Lampu
    if (manualLampuActive && (millis() - manualLampuMillis < MANUAL_TIMEOUT_MS)) {
      Firebase.RTDB.getBool(&fbdo, "/kontrol/lampu");
      lampuState = fbdo.boolData();
      lampuMode = lampuState ? "Manual-ON" : "Manual-OFF";
    } else {
      manualLampuActive = false;
      lampuState = (cahaya > 880) ? HIGH : LOW;
      lampuMode = (cahaya > 880) ? "Auto-ON" : "Auto-OFF";
    }
    digitalWrite(PIN_LAMPU, lampuState);

    buzzerState = (gas > 2000) ? HIGH : LOW;
    digitalWrite(PIN_BUZZER, buzzerState);

    // 4. KIRIM DATA KE CLOUD
    FirebaseJson json;
    json.set("sensor/suhu", t);
    json.set("sensor/kelembapan", h);
    json.set("sensor/cahaya", cahaya);
    json.set("sensor/gas", gas);
    json.set("status/lampu", (int)lampuState);
    json.set("status/kipas", (int)kipasState);
    json.set("status/buzzer", (int)buzzerState);
    json.set("mode/lampu", lampuMode);
    json.set("mode/kipas", kipasMode);
    json.set("timestamp", (int)(time(nullptr)));

    Firebase.RTDB.setJSON(&fbdo, "/DataSkripsi", &json);
     
    // Log Serial Monitor
    Serial.printf("T:%d H:%d LDR:%d GAS:%d | Kipas:%s Lampu:%s\n", t, h, cahaya, gas, kipasMode.c_str(), lampuMode.c_str());
  }
  delay(10);
}