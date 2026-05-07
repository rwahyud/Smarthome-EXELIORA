const el = id => document.getElementById(id)
function setValue(id, text){ el(id).textContent = text }
function setDot(id, color){ el(id).style.background = color }

function goToDashboard(){
  const welcome = el('welcome-screen')
  if (welcome) {
    welcome.classList.add('hidden')
    setTimeout(() => { welcome.style.display = 'none' }, 500)
  }
}

function updateToggleButtonText(){
  const lampBtn = el('lamp-toggle-text')
  const fanBtn = el('fan-toggle-text')
  if (lampBtn) lampBtn.textContent = state.lamp ? 'ON' : 'OFF'
  if (fanBtn) fanBtn.textContent = state.fan ? 'ON' : 'OFF'
}

const firebaseConfig = {
  apiKey: "AIzaSyCMi_dNUlMC2yKNgzOtLtkQiGiM1dAVOK8",
  databaseURL: "https://skripsi-smarthome-e6971-default-rtdb.asia-southeast1.firebasedatabase.app/"
}

firebase.initializeApp(firebaseConfig)
const database = firebase.database()

const RTDB_SENSOR_PATHS = [
  'DataSkripsi',
  'DataSkripsi/sensor',
  'DataSkripsi/status',
  '',
]

const state = {
  port: null,
  reader: null,
  writer: null,
  keepReading: false,
  serialConnecting: false,
  lamp: false,
  fan: false,
  serialLog: [],
  rtdbRef: null,
  rtdbHandler: null,
  rtdbPath: null,
  rtdbLastHash: '',
  controlLampRef: null,
  controlLampHandler: null,
  controlFanRef: null,
  controlFanHandler: null,
  lastDataReceivedTime: 0,
  sensorOfflineTimeout: null,
  isLoading: false,
  firebaseConnected: false,
  lastNotificationId: 0,
}

function appendSerialLog(line){
  state.serialLog.push(line)
  if (state.serialLog.length > 30) state.serialLog.shift()
  const logEl = el('serial-log')
  if (logEl) logEl.textContent = state.serialLog.join('\n')
}

function setConnectionStatus(text){
  setValue('conn-status', text)
  const isConnected = text.includes('connected') || text.includes('DataSkripsi')
  if (isConnected && !state.firebaseConnected) {
    state.firebaseConnected = true
    hideLoading()
    showNotification('✓ Terhubung ke Firebase', 'success', 3000)
  } else if (!isConnected && state.firebaseConnected) {
    state.firebaseConnected = false
    showLoading()
    showNotification('✗ Koneksi Firebase terputus', 'error', 0)
  }
}

function setSerialConnectDisabled(disabled){
  const btn = el('serial-connect')
  if (btn) btn.disabled = disabled
}

function showLoading(){
  if (!state.isLoading) {
    state.isLoading = true
    const loader = el('loading-indicator')
    if (loader) {
      loader.classList.add('active')
      loader.style.width = '50%'
    }
  }
}

function hideLoading(){
  state.isLoading = false
  const loader = el('loading-indicator')
  if (loader) {
    loader.classList.remove('active')
    setTimeout(() => {
      loader.style.width = '0%'
    }, 500)
  }
}

function showNotification(message, type = 'info', duration = 5000){
  const container = el('notifications-container')
  if (!container) return
  state.lastNotificationId++
  const notifId = state.lastNotificationId
  const notif = document.createElement('div')
  notif.className = 'notification ' + type
  notif.id = 'notif-' + notifId
  notif.textContent = message
  container.appendChild(notif)
  if (duration > 0) {
    setTimeout(() => {
      const notifEl = document.getElementById('notif-' + notifId)
      if (notifEl) {
        notifEl.classList.add('remove')
        setTimeout(() => notifEl.remove(), 300)
      }
    }, duration)
  }
  return notifId
}

function trackSensorData(){
  state.lastDataReceivedTime = Date.now()
  const cards = document.querySelectorAll('.grid .card')
  cards.forEach(card => card.classList.remove('sensor-offline'))
  if (state.sensorOfflineTimeout) {
    clearTimeout(state.sensorOfflineTimeout)
  }
  state.sensorOfflineTimeout = setTimeout(() => {
    showNotification('⚠️ ESP32 tidak mengirim data selama lebih dari 15 detik', 'warning', 0)
    const offlineCards = document.querySelectorAll('.grid .card')
    offlineCards.forEach(card => card.classList.add('sensor-offline'))
  }, 15000)
}

function normalizeBoolean(value){
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    const result = lowered === 'true' || lowered === 'on' || lowered === '1' || lowered === 'aktif'
    console.log(`[normalizeBoolean] string "${value}" → lowered: "${lowered}" → ${result}`)
    return result
  }
  console.log(`[normalizeBoolean] value ${value} (type: ${typeof value}) → false`)
  return false
}

function updateActuatorUI(kind, on){
  if (kind === 'lamp') {
    console.log('[updateActuatorUI] Updating lamp display:', on ? 'ON' : 'OFF')
    state.lamp = on
    setValue('lamp-status', on ? 'ON' : 'OFF')
    setDot('lamp-dot', on ? 'var(--accent)' : 'gray')
    const btn = el('lamp-toggle')
    if (btn) btn.classList.toggle('active', on)
    updateToggleButtonText()
  }
  if (kind === 'fan') {
    console.log('[updateActuatorUI] Updating fan display:', on ? 'ON' : 'OFF')
    state.fan = on
    setValue('fan-status', on ? 'ON' : 'OFF')
    setDot('fan-dot', on ? 'var(--accent)' : 'gray')
    const btn = el('fan-toggle')
    if (btn) btn.classList.toggle('active', on)
    updateToggleButtonText()
  }
}

function updateSensorUI(data){
  if (data.temp !== undefined) setValue('temp-value', Number(data.temp).toFixed(1) + ' °C')
  if (data.hum !== undefined) setValue('hum-value', Number(data.hum).toFixed(0) + ' %')
  if (data.light !== undefined) setValue('light-value', Number(data.light).toFixed(0) + ' lx')
  if (data.gas !== undefined) setValue('gas-value', Number(data.gas).toFixed(0))

  if (data.buzzer !== undefined) {
    const buzzerOn = normalizeBoolean(data.buzzer)
    setValue('buzzer-status', buzzerOn ? 'AKTIF' : 'tidak')
    setDot('buzzer-dot', buzzerOn ? 'var(--warn)' : 'var(--ok)')
  } else if (data.gas !== undefined) {
    const buzzerOn = Number(data.gas) > 220
    setValue('buzzer-status', buzzerOn ? 'AKTIF' : 'tidak')
    setDot('buzzer-dot', buzzerOn ? 'var(--warn)' : 'var(--ok)')
  }

  if (data.lamp !== undefined) {
    const lampOn = normalizeBoolean(data.lamp)
    console.log('[updateSensorUI] lamp raw:', data.lamp, '→ normalized:', lampOn)
    state.lamp = lampOn
    updateActuatorUI('lamp', state.lamp)
  }
  if (data.fan !== undefined) {
    const fanOn = normalizeBoolean(data.fan)
    console.log('[updateSensorUI] fan raw:', data.fan, '→ normalized:', fanOn)
    state.fan = fanOn
    updateActuatorUI('fan', state.fan)
  }
}

function stopRealtimeDatabaseListener(){
  if (state.rtdbRef && state.rtdbHandler) {
    state.rtdbRef.off('value', state.rtdbHandler)
  }
  state.rtdbRef = null
  state.rtdbHandler = null
}

function flattenSensorPayload(payload){
  if (!payload || typeof payload !== 'object') return null

  const container = payload.DataSkripsi || payload.dataSkripsi || payload.dataskripsi || payload
  const sensorSource = container.sensor || container.sensors || container.data || container.readings || container.latest || container.device || container.smarthome || container
  const statusSource = container.status || {}
  if (!sensorSource || typeof sensorSource !== 'object') return null

  const result = {}
  const aliases = {
    suhu: 'temp',
    temperature: 'temp',
    temp: 'temp',
    t: 'temp',
    kelembapan: 'hum',
    humidity: 'hum',
    hum: 'hum',
    h: 'hum',
    cahaya: 'light',
    light: 'light',
    lux: 'light',
    ldr: 'light',
    gas: 'gas',
    mq: 'gas',
    buzzer: 'buzzer',
    alarm: 'buzzer',
    lamp: 'lamp',
    lampu: 'lamp',
    relay1: 'lamp',
    r1: 'lamp',
    channel1: 'lamp',
    output1: 'lamp',
    fan: 'fan',
    kipas: 'fan',
    relay2: 'fan',
    r2: 'fan',
    channel2: 'fan',
    output2: 'fan',
  }

  Object.keys(sensorSource).forEach(key => {
    const normalized = aliases[key.toLowerCase()] || key.toLowerCase()
    result[normalized] = sensorSource[key]
  })

  console.log('[flattenSensorPayload] statusSource keys:', Object.keys(statusSource))
  Object.keys(statusSource).forEach(key => {
    const normalized = aliases[key.toLowerCase()] || key.toLowerCase()
    console.log(`[flattenSensorPayload] Status field "${key}" → normalized: "${normalized}" = ${statusSource[key]}`)
    result[normalized] = statusSource[key]
  })

  return Object.keys(result).length ? result : null
}

function hashPayload(payload){
  try {
    return JSON.stringify(payload)
  } catch (_) {
    return String(Date.now())
  }
}

async function startRealtimeDatabase(){
  stopRealtimeDatabaseListener()

  setConnectionStatus('RTDB connected')

  for (const path of RTDB_SENSOR_PATHS) {
    try {
      const ref = database.ref(path || '/')
      const snapshot = await ref.once('value')
      const data = flattenSensorPayload(snapshot.val())
      if (!data) continue

      state.rtdbPath = path || '/'
      state.rtdbLastHash = hashPayload(data)
      updateSensorUI(data)
      setConnectionStatus('RTDB connected: ' + state.rtdbPath)

      state.rtdbRef = ref
      state.rtdbHandler = snapshot2 => {
        const liveData = flattenSensorPayload(snapshot2.val())
        if (!liveData) return
        const liveHash = hashPayload(liveData)
        if (liveHash === state.rtdbLastHash) return
        state.rtdbLastHash = liveHash
        updateSensorUI(liveData)
        setConnectionStatus('RTDB connected: ' + state.rtdbPath)
      }
      ref.on('value', state.rtdbHandler, error => {
        appendSerialLog('[RTDB] ' + error.message)
        setConnectionStatus('RTDB error')
      })
      return
    } catch (error) {
      continue
    }
  }

  setConnectionStatus('RTDB belum ditemukan')
}

// Attach explicit listeners for DataSkripsi sensor and status nodes
function stopDataSkripsiListeners(){
  if (state.rtdbSensorRef && state.rtdbSensorHandler) state.rtdbSensorRef.off('value', state.rtdbSensorHandler)
  if (state.rtdbStatusRef && state.rtdbStatusHandler) state.rtdbStatusRef.off('value', state.rtdbStatusHandler)
  state.rtdbSensorRef = null
  state.rtdbSensorHandler = null
  state.rtdbStatusRef = null
  state.rtdbStatusHandler = null
}

function stopControlListeners(){
  if (state.controlLampRef && state.controlLampHandler) state.controlLampRef.off('value', state.controlLampHandler)
  if (state.controlFanRef && state.controlFanHandler) state.controlFanRef.off('value', state.controlFanHandler)
  state.controlLampRef = null
  state.controlLampHandler = null
  state.controlFanRef = null
  state.controlFanHandler = null
}

function updateToggleButton(id, on){
  const btn = el(id)
  if (btn) btn.classList.toggle('active', on)
}

function attachControlListeners(){
  stopControlListeners()
  if (!window.firebase || !firebase.database) return

  const db = firebase.database()
  state.controlLampRef = db.ref('/kontrol/lampu')
  state.controlLampHandler = snap => {
    const on = normalizeBoolean(snap.val())
    updateToggleButton('lamp-toggle', on)
    appendSerialLog('[RTDB kontrol lampu] ' + JSON.stringify(snap.val()))
  }
  state.controlLampRef.on('value', state.controlLampHandler, err => { appendSerialLog('[RTDB kontrol lampu error] ' + err.message) })

  state.controlFanRef = db.ref('/kontrol/kipas')
  state.controlFanHandler = snap => {
    const on = normalizeBoolean(snap.val())
    updateToggleButton('fan-toggle', on)
    appendSerialLog('[RTDB kontrol kipas] ' + JSON.stringify(snap.val()))
  }
  state.controlFanRef.on('value', state.controlFanHandler, err => { appendSerialLog('[RTDB kontrol kipas error] ' + err.message) })
}

function attachDataSkripsiListeners(){
  stopDataSkripsiListeners()
  if (!window.firebase || !firebase.database) {
    setConnectionStatus('Firebase SDK belum tersedia')
    return
  }
  const db = firebase.database()
  const sensorRef = db.ref('/DataSkripsi/sensor')
  const statusRef = db.ref('/DataSkripsi/status')
  setConnectionStatus('Firebase connected')

  state.rtdbSensorRef = sensorRef
  state.rtdbSensorHandler = snap => {
    const data = snap.val()
    if (!data) return
    state.rtdbReceived = true
    trackSensorData()
    // update using existing helper so mapping/aliases applied
    const flat = flattenSensorPayload({ DataSkripsi: { sensor: data, status: {} } }) || {}
    updateSensorUI(flat)
    appendSerialLog('[RTDB sensor] ' + JSON.stringify(data))
    setConnectionStatus('RTDB: DataSkripsi/sensor')
  }
  sensorRef.on('value', state.rtdbSensorHandler, err => { appendSerialLog('[RTDB sensor error] '+err.message) })

  // Also update specific DOM IDs if present (user requested IDs)
  db.ref('/DataSkripsi/sensor').on('value', (snapshot) => {
    const d = snapshot.val()
    if (!d) return
    trackSensorData()
    const setIf = (id, val) => {
      const eln = document.getElementById(id)
      if (eln) eln.innerText = (val === undefined || val === null) ? '--' : val
    }
    setIf('suhu-val', d.suhu ?? d.temp ?? d.temperature)
    setIf('kelembapan-val', d.kelembapan ?? d.hum ?? d.humidity)
    setIf('cahaya-val', d.cahaya ?? d.light ?? d.lux)
    setIf('gas-val', d.gas ?? d.mq)
  })

  state.rtdbStatusRef = statusRef
  state.rtdbStatusHandler = snap => {
    const data = snap.val()
    if (!data) return
    trackSensorData()
    console.log('[RTDB status] Raw data dari Firebase:', data)
    const flat = flattenSensorPayload({ DataSkripsi: { sensor: {}, status: data } }) || {}
    console.log('[RTDB status] After flattenSensorPayload:', flat)
    console.log('[RTDB status] state.lamp sebelum:', state.lamp, '| state.fan sebelum:', state.fan)
    updateSensorUI(flat)
    console.log('[RTDB status] state.lamp sesudah:', state.lamp, '| state.fan sesudah:', state.fan)
    appendSerialLog('[RTDB status] ' + JSON.stringify(data))
    setConnectionStatus('RTDB: DataSkripsi/status')
  }
  statusRef.on('value', state.rtdbStatusHandler, err => { appendSerialLog('[RTDB status error] '+err.message) })

  // fallback: if no RTDB events received shortly, poll REST endpoint
  state.rtdbReceived = false
  setTimeout(() => {
    if (!state.rtdbReceived) {
      appendSerialLog('[INFO] RTDB realtime not received — starting REST polling fallback')
      startRestPolling()
    }
  }, 3000)
}

let restPollTimer = null
async function fetchSensorRest(){
  try {
    const url = firebaseConfig.databaseURL.replace(/\/$/, '') + '/DataSkripsi/sensor.json'
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    if (!data) return
    const flat = flattenSensorPayload({ DataSkripsi: { sensor: data, status: {} } }) || {}
    updateSensorUI(flat)
    appendSerialLog('[REST poll] ' + JSON.stringify(data))
  } catch (err) {
    appendSerialLog('[REST error] ' + (err.message || err))
  }
}

function startRestPolling(){
  if (restPollTimer) return
  fetchSensorRest()
  restPollTimer = setInterval(fetchSensorRest, 3000)
}

function stopRestPolling(){
  if (!restPollTimer) return
  clearInterval(restPollTimer)
  restPollTimer = null
}

function parseLine(line){
  const raw = line.trim()
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch (_) {}

  const out = {}
  const normalized = raw
    .replaceAll(';', ',')
    .replaceAll(':', '=')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)

  normalized.forEach(pair => {
    const [keyRaw, valueRaw] = pair.split('=')
    if (!keyRaw || valueRaw === undefined) return
    const key = keyRaw.trim().toLowerCase()
    const valueText = valueRaw.trim()
    const num = Number(valueText)
    out[key] = Number.isNaN(num) ? valueText : num
  })

  const keyMap = {
    temperature: 'temp',
    t: 'temp',
    humidity: 'hum',
    h: 'hum',
    kelembapan: 'hum',
    cahaya: 'light',
    lux: 'light',
    l: 'light',
    mq: 'gas',
    g: 'gas',
    lampu: 'lamp',
    relay1: 'lamp',
    r1: 'lamp',
    channel1: 'lamp',
    output1: 'lamp',
    kipas: 'fan',
    relay2: 'fan',
    r2: 'fan',
    channel2: 'fan',
    output2: 'fan',
  }
  const mapped = {}
  Object.keys(out).forEach(k => {
    mapped[keyMap[k] || k] = out[k]
  })
  if (Object.keys(mapped).length) return mapped

  const looseMapped = {}
  const patterns = {
    temp: /(?:temp|temperature|suhu)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i,
    hum: /(?:hum|humidity|kelembapan)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i,
    light: /(?:light|cahaya|lux|ldr)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i,
    gas: /(?:gas|mq)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i,
    buzzer: /(?:buzzer|alarm)\s*[:=]?\s*(on|off|0|1)/i,
    lamp: /(?:lamp|lampu)\s*[:=]?\s*(on|off|0|1)/i,
    fan: /(?:fan|kipas)\s*[:=]?\s*(on|off|0|1)/i,
    relay1: /(?:relay1|r1|channel1|output1)\s*[:=]?\s*(on|off|0|1)/i,
    relay2: /(?:relay2|r2|channel2|output2)\s*[:=]?\s*(on|off|0|1)/i,
  }

  Object.keys(patterns).forEach(key => {
    const match = raw.match(patterns[key])
    if (!match) return
    const valueText = match[1].trim().toLowerCase()
    if (valueText === 'on') looseMapped[key] = 1
    else if (valueText === 'off') looseMapped[key] = 0
    else {
      const num = Number(valueText)
      looseMapped[key] = Number.isNaN(num) ? valueText : num
    }
  })

  if (Object.keys(looseMapped).length) return looseMapped

  const nums = raw.match(/-?\d+(?:\.\d+)?/g)
  if (nums && nums.length >= 4) {
    return {
      temp: Number(nums[0]),
      hum: Number(nums[1]),
      light: Number(nums[2]),
      gas: Number(nums[3]),
    }
  }

  return null
}

async function readLoop(){
  const decoder = new TextDecoder()
  let buffer = ''

  while (state.keepReading && state.reader) {
    const { value, done } = await state.reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace('\r', '')
      buffer = buffer.slice(idx + 1)
      appendSerialLog(line)
      const data = parseLine(line)
      if (data) updateSensorUI(data)
    }
  }
}

async function connectSerial(){
  if (!('serial' in navigator)) {
    setConnectionStatus('Web Serial tidak didukung browser ini')
    return
  }

  if (state.serialConnecting) return

  if (state.port || state.reader || state.writer) {
    await disconnectSerial()
  }

  try {
    state.serialConnecting = true
    setSerialConnectDisabled(true)
    setConnectionStatus('membuka port serial...')
    state.port = await navigator.serial.requestPort()
    const selectedBaud = Number(el('baud-rate').value || '115200')
    await state.port.open({ baudRate: selectedBaud })
    state.reader = state.port.readable.getReader()
    state.writer = state.port.writable.getWriter()
    state.keepReading = true
    state.serialLog = []
    setValue('serial-log', '(menunggu data dari Arduino...)')
    setConnectionStatus('connected @ ' + selectedBaud)
    readLoop().catch(() => setConnectionStatus('error saat baca serial'))
  } catch (err) {
    // Special-case when user cancels the port picker
    if (err && err.name === 'NotFoundError') {
      appendSerialLog('[INFO] Port tidak dipilih (dibatalkan oleh pengguna)')
      setConnectionStatus('tidak ada port dipilih')
    } else {
      setConnectionStatus('gagal open serial. tutup Serial Monitor Arduino IDE lalu coba lagi')
      appendSerialLog('[ERROR] ' + (err?.name ? err.name + ': ' : '') + (err?.message || String(err)))
      console.error(err)
    }
    // Ensure port state is cleared
    if (state.port) {
      try {
        await state.port.close()
      } catch (_) {}
    }
    state.port = null
    state.reader = null
    state.writer = null
    state.keepReading = false
  } finally {
    state.serialConnecting = false
    setSerialConnectDisabled(false)
  }
}

async function disconnectSerial(){
  state.keepReading = false
  try {
    if (state.reader) {
      await state.reader.cancel()
      state.reader.releaseLock()
      state.reader = null
    }
    if (state.writer) {
      state.writer.releaseLock()
      state.writer = null
    }
    if (state.port) {
      await state.port.close()
    }
  } catch (err) {
    console.error(err)
  } finally {
    state.port = null
    state.reader = null
    state.writer = null
  }
  setConnectionStatus('disconnected')
  appendSerialLog('[INFO] serial disconnected')
}

async function sendCommand(text){
  if (!state.writer) return
  const bytes = new TextEncoder().encode(text + '\n')
  await state.writer.write(bytes)
}

function setupToggle(buttonId, kind){
  const btn = el(buttonId)
  if (!btn) return
  btn.addEventListener('click', async () => {
    const on = !btn.classList.contains('active')
    const path = kind === 'lamp' ? '/kontrol/lampu' : '/kontrol/kipas'
    try {
      showLoading()
      await database.ref(path).set(on)
      btn.classList.toggle('active', on)
      updateToggleButtonText()
      appendSerialLog('[RTDB write] ' + path + ' = ' + JSON.stringify(on))
      setTimeout(hideLoading, 500)
    } catch (err) {
      console.error(err)
      hideLoading()
      setConnectionStatus('gagal update kontrol Firebase')
      showNotification('❌ Gagal mengontrol ' + (kind === 'lamp' ? 'lampu' : 'kipas'), 'error', 3000)
    }
  })
}

async function registerServiceWorker(){
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    console.log('[PWA] Service worker registered:', registration.scope)
  } catch (err) {
    console.error('[PWA] Service worker registration failed:', err)
  }
}

function resetDashboardState(){
  setConnectionStatus('RTDB connected')
  updateActuatorUI('lamp', false)
  updateActuatorUI('fan', false)
  setValue('buzzer-status', '--')
  const serialLogEl = el('serial-log')
  if (serialLogEl) serialLogEl.textContent = '(belum ada data)'
}

async function bootApp(){
  resetDashboardState()
  attachDataSkripsiListeners()
  attachControlListeners()
  await registerServiceWorker()
}

const serialConnectBtn = el('serial-connect')
if (serialConnectBtn) serialConnectBtn.addEventListener('click', connectSerial)

const serialDisconnectBtn = el('serial-disconnect')
if (serialDisconnectBtn) serialDisconnectBtn.addEventListener('click', disconnectSerial)

setupToggle('lamp-toggle', 'lamp')
setupToggle('fan-toggle', 'fan')

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp, { once: true })
} else {
  bootApp()
}
