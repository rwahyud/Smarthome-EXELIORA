# 🔒 Security Guidelines

## Kredensial Sensitif - JANGAN PUSH!

Berikut adalah file/data yang TIDAK boleh di-commit ke repository:

### ❌ Dilarang di-push:
- `.env` - Environment variables dengan API keys
- `.env.local` - Local environment overrides
- `firebase-adminsdk-*.json` - Firebase service account keys
- `.firebaserc` - Firebase project configuration
- Any file dengan credentials, tokens, atau API keys

### ✅ Allowed (Safe):
- `.env.example` - Template untuk environment variables
- `firestore.rules` - Security rules (aman untuk public)
- `firebase.json` - Firebase configuration (aman untuk public)
- `public/**` - Frontend code (aman untuk public)

## Setup Lokal (Development)

### 1. Clone Repository
```bash
git clone https://github.com/rwahyud/Smarthome-EXELIORA.git
cd Smarthome-EXELIORA
```

### 2. Setup Environment Variables

#### Frontend Setup
```bash
# Copy template
cp .env.example .env.local

# Edit .env.local dengan Firebase credentials Anda
# Jangan commit .env.local ke repository!
```

#### ESP32 Setup
```cpp
// Di SmartHome_ESP32.ino, ganti hardcoded credentials dengan:
// 1. Gunakan WiFiManager untuk WiFi credentials
// 2. Tambahkan EEPROM/Flash storage untuk Firebase credentials
// Atau gunakan:
#include "secrets.h"  // File lokal yang tidak di-commit
```

### 3. Environment Variables yang Diperlukan

**Frontend (`.env.local`):**
```
FIREBASE_API_KEY=your_api_key
FIREBASE_DATABASE_URL=https://your-project.firebasedatabase.app/
```

**ESP32 (ganti di code atau gunakan EEPROM):**
```cpp
const char* FIREBASE_API_KEY = "your_api_key";
const char* DATABASE_URL = "https://your-project.firebasedatabase.app/";
const char* WIFI_SSID = "your_ssid";
const char* WIFI_PASSWORD = "your_password";
```

## Firebase Security Best Practices

### 1. Restrict API Key
- Login ke [Firebase Console](https://console.firebase.google.com)
- Pergi ke Project Settings → API Keys
- Restrict key ke **REST API only** (bukan Android/iOS/Web)
- Set HTTP referrers ke domain Anda saja

### 2. Enable Firestore Rules
```javascript
// JANGAN gunakan rules yang open!
// ❌ BERBAHAYA:
match /{document=**} {
  allow read, write; // Siapa saja bisa baca/tulis!
}

// ✅ AMAN:
match /users/{uid} {
  allow read, write: if request.auth.uid == uid;
}
```

### 3. Service Account Keys
- Jangan pernah commit service account JSON ke repository
- Gunakan Environment Variables atau Secret Management
- Rotate keys secara berkala

## Github Secrets (untuk CI/CD)

Jika menggunakan GitHub Actions:
```yaml
# .github/workflows/deploy.yml
env:
  FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
  FIREBASE_DATABASE_URL: ${{ secrets.FIREBASE_DATABASE_URL }}
```

## Jika Credentials Sudah Ter-Expose

### 1. Immediate Actions
```bash
# Revoke old credentials
# 1. Login ke Firebase Console
# 2. Project Settings → Service Accounts → Generate new private key
# 3. Hapus key yang lama
```

### 2. Rewrite Git History (if needed)
```bash
# ⚠️ Hati-hati! Ini akan rewrite history
# Gunakan BFG Repo-Cleaner atau git-filter-branch
# https://help.github.com/articles/removing-sensitive-data-from-a-repository/
```

## Monitoring & Alerts

Firebase akan mendeteksi penggunaan API key dari origin yang tidak terdaftar:
- Monitor [Firebase Console](https://console.firebase.google.com) untuk suspicious activity
- Enable [Firebase Security Alerts](https://firebase.google.com/docs/projects/security-alerts)

## Tools untuk Scan Credentials

Gunakan tools ini untuk scan repository:
```bash
# Install
npm install -g detect-secrets

# Scan
detect-secrets scan --all-files

# Baseline
detect-secrets baseline
```

---

**Remember: Security is everyone's responsibility! 🔐**

Untuk pertanyaan lebih lanjut, baca:
- [Firebase Security Docs](https://firebase.google.com/docs/rules)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
