'use strict';

// --- Utilitas & Inisialisasi ---
const $ = id => document.getElementById(id);
const synth = window.speechSynthesis;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// --- State Aplikasi ---
let active = false;
let state = 'STANDBY';
let recognition = null;
let listening = false;
let lastReply = '';
let speechToken = 0;
let utterance = null;
let endpoint = '';

// --- Session & Storage ---
const sessionId = (() => {
    try {
        let id = sessionStorage.getItem('nyz-session') || crypto.randomUUID();
        sessionStorage.setItem('nyz-session', id);
        return id;
    } catch {
        return 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }
})();

try {
    endpoint = localStorage.getItem('nyz-webhook') || '';
} catch {}

$('webhook-url').value = endpoint;
$('cpu').textContent = sessionId.slice(0, 8);

// --- Manajemen UI & State ---
function setState(nextState) {
    state = nextState;
    $('ai-status').textContent = nextState;
    
    let coreClass = 'jarvis-core-container';
    if (nextState === 'LISTENING') coreClass += ' state-listening';
    if (nextState === 'THINKING') coreClass += ' state-thinking';
    $('core-visualizer').className = coreClass;
    
    $('mic-status').textContent = listening ? 'RECORDING' : (Recognition ? 'READY' : 'TEKS');
    
    const talkBtn = $('talk-btn');
    talkBtn.disabled = !Recognition || nextState === 'THINKING';
    talkBtn.textContent = listening ? 'SELESAI TRANSMIT' : 'TRANSMIT';
    talkBtn.classList.toggle('recording', listening);
    
    $('send-btn').disabled = nextState === 'THINKING' || listening;
    
    const interruptBtn = $('interrupt-btn');
    interruptBtn.style.display = nextState === 'RESPONDING' ? 'block' : 'none';
    interruptBtn.textContent = 'ABORT AUDIO';
}

// --- Fitur Suara (Text-to-Speech) ---
function stopSpeech() {
    speechToken++;
    if (synth) synth.cancel();
    utterance = null;
    $('tts-debug').textContent = '[ TTS: BERHENTI ]';
}

function speak(text) {
    stopSpeech();
    
    if (!synth || !window.SpeechSynthesisUtterance) {
        $('tts-debug').textContent = 'TTS tidak didukung';
        setState('STANDBY');
        return;
    }
    
    const token = speechToken;
    // Memecah teks agar tidak terpotong oleh limit browser (maks ~180 karakter per chunk)
    const chunks = text.replace(/[*#`]/g, '').match(/[\s\S]{1,180}(?:\s|$)|[\s\S]{1,180}/g) || [];
    let i = 0;
    
    setState('RESPONDING');
    
    function next() {
        if (token !== speechToken) return; // Batal jika diinterupsi
        if (i >= chunks.length) {
            setState('STANDBY');
            $('tts-debug').textContent = '[ TTS: SELESAI ]';
            return;
        }
        
        utterance = new SpeechSynthesisUtterance(chunks[i++]);
        utterance.lang = 'id-ID';
        utterance.rate = 0.95;
        
        const voices = synth.getVoices();
        const voice = voices.find(v => v.lang.startsWith('id') && /Google|Natural|Online/i.test(v.name)) 
                   || voices.find(v => v.lang.startsWith('id'));
        
        if (voice) utterance.voice = voice;
        
        utterance.onend = next;
        utterance.onerror = e => {
            if (token !== speechToken) return;
            $('tts-debug').textContent = 'TTS gagal: ' + e.error + '. Klik Ulangi.';
            setState('STANDBY');
        };
        
        $('tts-debug').textContent = `[ TTS: ${i}/${chunks.length} ]`;
        synth.speak(utterance);
    }
    
    synth.resume();
    next();
}

// --- Validasi & Simpan Webhook ---
function validateUrl(value) {
    let u;
    try {
        u = new URL(value);
    } catch {
        throw Error('Isi Endpoint n8n Webhook di Pengaturan jaringan.');
    }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) {
        throw Error('URL webhook harus HTTP/HTTPS tanpa kredensial.');
    }
    if (location.protocol === 'https:' && u.protocol === 'http:') {
        throw Error('Web HTTPS memerlukan webhook HTTPS.');
    }
    return u.href;
}

$('save-url').onclick = () => {
    try {
        endpoint = validateUrl($('webhook-url').value.trim());
        try { localStorage.setItem('nyz-webhook', endpoint); } catch {}
        $('link-status').textContent = 'BELUM DIUJI';$('ai-response').textContent = 'URL tersimpan. Kirim perintah untuk menguji koneksi neural-link.';
    } catch (e) {
        $('ai-response').textContent = e.message;
    }
};

// --- Komunikasi API dengan n8n (Fetch) ---
async function send(message) {
    message = message.trim();
    if (!active || !message || state === 'THINKING' || listening) return;
    
    stopSpeech();
    let url;
    try {
        url = validateUrl(endpoint);
    } catch (e) {
        $('ai-response').textContent = e.message;
        setState('STANDBY');
        return;
    }
    
    setState('THINKING');
    $('ai-response').textContent = 'Anda: ' + message + '\n\nMemproses Neural-Link...';
    
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000); // Batas tunggu 90 detik
    
    try {
        // Menggunakan Form encoding untuk menghindari preflight CORS
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: new URLSearchParams({ 
                message: message, 
                chatInput: message, 
                sessionId: sessionId, 
                session_id: sessionId 
            }),
            signal: controller.signal,
            credentials: 'omit'
        });
        
        if (!response.ok) throw Error(`HTTP ${response.status}. Periksa webhook n8n dan Executions.`);
        
        const raw = await response.text();
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            throw Error('Respons bukan JSON. Pastikan Respond to Webhook Node diset ke JSON.');
        }
        
        if (Array.isArray(data)) data = data[0];
        const reply = data?.reply ?? data?.output;
        
        if (typeof reply !== 'string' || !reply.trim()) {
            throw Error('JSON n8n harus memiliki properti "reply" atau "output" berupa teks.');
        }
        
        lastReply = reply.trim();
        $('link-status').textContent = 'TERHUBUNG';$('ai-response').textContent = 'Anda: ' + message + '\n\nNYZ AI: ' + lastReply;
        $('ai-response').scrollTop =$('ai-response').scrollHeight;
        
        speak(lastReply);
        
    } catch (e) {
        $('link-status').textContent = 'GAGAL';
        let errorMsg = e.message;
        
        if (e.name === 'AbortError') {
            errorMsg = 'Waktu tunggu 90 detik habis. Periksa Executions n8n.';
        } else if (e instanceof TypeError) {
            errorMsg = 'Koneksi gagal. Periksa URL n8n, HTTPS, CORS, dan IP Address.';
        }
        
        $('ai-response').textContent = 'Anda: ' + message + '\n\nERROR: ' + errorMsg;
        setState('STANDBY');
    } finally {
        clearTimeout(timer);
    }
}

// --- Event Listeners UI ---
$('chat-form').onsubmit = e => {
    e.preventDefault();
    const message = $('message').value;
    if (active && state !== 'THINKING' && !listening) {
        $('message').value = '';
        send(message);
    }
};

$('replay').onclick = () => {
    if (lastReply && state !== 'THINKING' && !listening) speak(lastReply);
};

$('interrupt-btn').onclick = () => {
    stopSpeech();
    setState('STANDBY');
};

$('boot-screen').onclick = () => {
    active = true;
    $('boot-screen').style.display = 'none';
    setState('STANDBY');
    $('ai-response').textContent = 'Sistem NYZ AI aktif. Atur API Webhook di pengaturan untuk memulai.';
    speak('Sistem NYZ AI siap digunakan.');
};

// --- Fitur Mikrofon (Speech-to-Text) ---
$('talk-btn').onclick = () => {
    if (!active || !Recognition || state === 'THINKING') return;
    
    if (listening) {
        recognition?.stop();
        return;
    }
    
    stopSpeech();
    if (!window.isSecureContext) {
        $('ai-response').textContent = 'Fitur mikrofon memerlukan koneksi HTTPS atau jaringan Localhost.';
        setState('STANDBY');
        return;
    }
    
    const rec = new Recognition();
    recognition = rec;
    rec.lang = 'id-ID';
    rec.interimResults = true;
    rec.continuous = false;
    
    let finalText = '';
    let failed = false;
    
    listening = true;
    setState('LISTENING');
    
    rec.onresult = e => {
        let interim = '';
        finalText = '';
        for (let i = 0; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
                finalText += e.results[i][0].transcript + ' ';
            } else {
                interim += e.results[i][0].transcript;
            }
        }
        $('ai-response').textContent = 'Anda: ' + finalText + interim;
    };
    
    rec.onerror = e => {
        failed = true;
        const messages = {
            'not-allowed': 'Izin mikrofon ditolak browser. Cek pengaturan situs.',
            'no-speech': 'Suara tidak terdeteksi. Silakan coba lagi.',
            'audio-capture': 'Mikrofon tidak tersedia di perangkat ini.',
            'network': 'Gagal terhubung ke layanan pengenal suara.'
        };
        $('ai-response').textContent = messages[e.error] || 'Pengenal suara gagal: ' + e.error;
    };
    
    rec.onend = () => {
        listening = false;
        recognition = null;
        setState('STANDBY');
        
        if (!failed && finalText.trim()) {
            send(finalText);
        } else if (!failed) {
            $('ai-response').textContent = 'Tidak ada ucapan yang dikenali. Silakan coba lagi atau ketik teks.';
        }
    };
    
    try {
        rec.start();
    } catch (e) {
        listening = false;
        recognition = null;
        setState('STANDBY');
        $('ai-response').textContent = e.message;
    }
};

// --- Animasi 3D Partikel ---
for (let i = 0; i < 75; i++) {
    const p = document.createElement('div');
    p.className = 'solar-particle';
    
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const r = 65 + Math.random() * 85;
    
    p.style.transform = `translate3d(${r * Math.sin(phi) * Math.cos(theta)}px, ${r * Math.sin(phi) * Math.sin(theta)}px, ${r * Math.cos(phi)}px)`;
    $('solar-cloud').appendChild(p);
}

// Inisialisasi awal UI
setState('STANDBY');