const API_BASE_URL = window.location.origin;
const recorder = new AudioRecorder();

// Audio context and buffers
let audioContext = null;
let audioBuffers = [];
let pendingAudioPaths = new Set();
let currentAudioPath = null;
let ws = null;

// DOM Elements
const startRecordingBtn = document.getElementById('startRecording');
const stopRecordingBtn = document.getElementById('stopRecording');
const transcriptionArea = document.getElementById('transcription');
const asrStatus = document.getElementById('asrStatus');
const ttsInput = document.getElementById('ttsInput');
const generateSpeechBtn = document.getElementById('generateSpeech');
const ttsStatus = document.getElementById('ttsStatus');
const audioPlayer = document.getElementById('audioPlayer');
const downloadAudioBtn = document.getElementById('downloadAudio');
const audioFileInput = document.getElementById('audioFileInput');
const uploadAudioBtn = document.getElementById('uploadAudio');
const personaIdEl = document.getElementById('personaId');
const personaNameEl = document.getElementById('personaName');
const personaSourceEl = document.getElementById('personaSource');
const personaPromptEl = document.getElementById('personaPrompt');
const personaStatus = document.getElementById('personaStatus');
const memoryFactsEl = document.getElementById('memoryFacts');
const memoryStatus = document.getElementById('memoryStatus');
const clearMemoryBtn = document.getElementById('clearMemory');
const exportMemoryBtn = document.getElementById('exportMemory');
const overrideNameInput = document.getElementById('overrideName');
const overrideDescInput = document.getElementById('overrideDescription');
const overrideLangInput = document.getElementById('overrideLanguage');
const overrideVerbosityInput = document.getElementById('overrideVerbosity');
const saveOverrideBtn = document.getElementById('saveOverride');
const revertOverrideBtn = document.getElementById('revertOverride');
const overrideStatus = document.getElementById('overrideStatus');

// File upload handler with format conversion
uploadAudioBtn.addEventListener('click', async () => {
    const file = audioFileInput.files[0];
    if (!file) {
        asrStatus.textContent = 'Please select an audio file';
        asrStatus.className = 'status error';
        return;
    }

    try {
        asrStatus.textContent = 'Processing audio file...';
        asrStatus.className = 'status';

        // Convert audio to WAV format
        const tempAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await file.arrayBuffer();
        const decodedBuffer = await tempAudioContext.decodeAudioData(arrayBuffer);
        const wavBuffer = await audioBufferToWav(decodedBuffer);
        const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });

        const formData = new FormData();
        formData.append('file', wavBlob, 'recording.wav');

        const response = await fetch(`${API_BASE_URL}/asr`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('ASR request failed');

        const data = await response.json();
        transcriptionArea.value = data.text;
        asrStatus.textContent = 'Transcription complete!';
        asrStatus.className = 'status success';

        tempAudioContext.close();
    } catch (error) {
        asrStatus.textContent = 'Error: ' + error.message;
        asrStatus.className = 'status error';
    }
});

// Recording handlers
startRecordingBtn.addEventListener('click', async () => {
    try {
        asrStatus.textContent = 'Starting recording...';
        asrStatus.className = 'status';
        await recorder.start();
        startRecordingBtn.disabled = true;
        stopRecordingBtn.disabled = false;
        asrStatus.textContent = 'Recording...';
    } catch (error) {
        asrStatus.textContent = 'Error starting recording: ' + error.message;
        asrStatus.className = 'status error';
    }
});

stopRecordingBtn.addEventListener('click', async () => {
    try {
        const audioBlob = await recorder.stop();
        startRecordingBtn.disabled = false;
        stopRecordingBtn.disabled = true;
        asrStatus.textContent = 'Processing audio...';

        const formData = new FormData();
        formData.append('file', audioBlob);

        const response = await fetch(`${API_BASE_URL}/asr`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('ASR request failed');

        const data = await response.json();
        transcriptionArea.value = data.text;
        asrStatus.textContent = 'Transcription complete!';
        asrStatus.className = 'status success';
    } catch (error) {
        asrStatus.textContent = 'Error: ' + error.message;
        asrStatus.className = 'status error';
        startRecordingBtn.disabled = false;
        stopRecordingBtn.disabled = true;
    }
});

// TTS handlers
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${wsProtocol}://${window.location.host}/tts-ws`);

    ws.onopen = () => {
        generateSpeechBtn.disabled = false;
        ttsStatus.textContent = 'Connected to TTS service';
        ttsStatus.className = 'status success';

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } else if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    };

    ws.onmessage = async (event) => {
        const response = JSON.parse(event.data);

        if (response.status === 'partial') {
            ttsStatus.textContent = 'Generating audio...';
            ttsStatus.className = 'status';
            try {
                const audioPath = response.audioPath.split('/').pop();
                pendingAudioPaths.add(audioPath);

                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                const audioResponse = await fetchWithRetry(`${API_BASE_URL}/cache/${audioPath}`);
                const arrayBuffer = await audioResponse.arrayBuffer();
                if (arrayBuffer.byteLength === 0) {
                    throw new Error('Empty audio data received');
                }

                const decoded = await audioContext.decodeAudioData(arrayBuffer);
                audioBuffers.push(decoded);
                pendingAudioPaths.delete(audioPath);
            } catch (error) {
                ttsStatus.textContent = 'Error loading audio: ' + error.message;
                ttsStatus.className = 'status error';
                pendingAudioPaths.clear();
            }
        } else if (response.status === 'complete') {
            if (pendingAudioPaths.size > 0) {
                ttsStatus.textContent = 'Finalizing audio...';
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            try {
                const targetSampleRate = 16000;
                const totalLength = audioBuffers.reduce((acc, buffer) => {
                    const ratio = targetSampleRate / buffer.sampleRate;
                    return acc + Math.ceil(buffer.length * ratio);
                }, 0);

                const combinedBuffer = audioContext.createBuffer(1, totalLength, targetSampleRate);
                let offset = 0;
                for (const buffer of audioBuffers) {
                    let channelData = buffer.getChannelData(0);
                    if (buffer.sampleRate !== targetSampleRate) {
                        channelData = await resampleAudio(channelData, buffer.sampleRate, targetSampleRate);
                    }
                    combinedBuffer.copyToChannel(channelData, 0, offset);
                    offset += channelData.length;
                }

                const wavBlob = new Blob([await audioBufferToWav(combinedBuffer)], { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(wavBlob);
                audioPlayer.src = audioUrl;
                audioPlayer.load();
                downloadAudioBtn.disabled = false;
                currentAudioPath = audioUrl;

                ttsStatus.textContent = 'Audio generated successfully!';
                ttsStatus.className = 'status success';
            } catch (error) {
                ttsStatus.textContent = 'Error combining audio: ' + error.message;
                ttsStatus.className = 'status error';
            } finally {
                audioBuffers = [];
                pendingAudioPaths.clear();
            }
        } else if (response.status === 'error') {
            ttsStatus.textContent = 'Error: ' + response.message;
            ttsStatus.className = 'status error';
            audioBuffers = [];
            pendingAudioPaths.clear();
        }
    };

    ws.onclose = () => {
        generateSpeechBtn.disabled = true;
        ttsStatus.textContent = 'Disconnected. Trying to reconnect...';
        ttsStatus.className = 'status error';
        audioBuffers = [];
        pendingAudioPaths.clear();
        if (currentAudioPath) {
            URL.revokeObjectURL(currentAudioPath);
            currentAudioPath = null;
        }
        setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = () => {
        ttsStatus.textContent = 'Connection error. Retrying...';
        ttsStatus.className = 'status error';
        audioBuffers = [];
        pendingAudioPaths.clear();
        if (currentAudioPath) {
            URL.revokeObjectURL(currentAudioPath);
            currentAudioPath = null;
        }
    };
}

// Convert AudioBuffer to WAV with specific format requirements
async function audioBufferToWav(buffer) {
    let audioData = buffer.getChannelData(0);
    if (buffer.sampleRate !== 16000) {
        audioData = await resampleAudio(audioData, buffer.sampleRate, 16000);
    }

    const numChannels = 1;
    const sampleRate = 16000;
    const format = 1;
    const bitDepth = 16;

    const dataLength = audioData.length * (bitDepth / 8);
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    floatTo16BitPCM(view, 44, audioData);
    return arrayBuffer;
}

function resampleAudio(audioData, originalSampleRate, targetSampleRate) {
    const ratio = targetSampleRate / originalSampleRate;
    const newLength = Math.round(audioData.length * ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
        const position = i / ratio;
        const index = Math.floor(position);
        const fraction = position - index;
        if (index + 1 < audioData.length) {
            result[i] = audioData[index] * (1 - fraction) + audioData[index + 1] * fraction;
        } else {
            result[i] = audioData[index];
        }
    }
    return result;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function floatTo16BitPCM(view, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

generateSpeechBtn.addEventListener('click', () => {
    const text = ttsInput.value.trim();
    if (!text) {
        ttsStatus.textContent = 'Please enter some text';
        ttsStatus.className = 'status error';
        return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ text }));
        ttsStatus.textContent = 'Generating audio...';
        ttsStatus.className = 'status';
    } else {
        ttsStatus.textContent = 'Connection lost. Reconnecting...';
        ttsStatus.className = 'status error';
        connectWebSocket();
    }
});

downloadAudioBtn.addEventListener('click', () => {
    if (currentAudioPath) {
        const link = document.createElement('a');
        link.href = currentAudioPath;
        link.download = `combined_audio_${Date.now()}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});

// Clean up resources when leaving the page
window.addEventListener('beforeunload', () => {
    if (audioContext) {
        audioContext.close();
    }
    if (ws) {
        ws.close();
    }
    if (currentAudioPath) {
        URL.revokeObjectURL(currentAudioPath);
    }
    audioBuffers = [];
    pendingAudioPaths.clear();
});

// Initialize WebSocket connection
connectWebSocket();

async function loadPersonaInfo() {
    try {
        personaStatus.textContent = 'Carregando persona...';
        personaStatus.className = 'status';
        const response = await fetch(`${API_BASE_URL}/persona-info`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        personaIdEl.textContent = data.active_persona_id || 'inline';
        personaNameEl.textContent = data.persona_name || 'Sem nome';
        personaSourceEl.textContent = data.source || 'conf.yaml:character_config.persona_prompt';
        personaPromptEl.value = data.system_prompt || '';
        personaStatus.textContent = 'Persona carregada';
        personaStatus.className = 'status success';
    } catch (error) {
        personaStatus.textContent = 'Erro ao carregar persona: ' + error.message;
        personaStatus.className = 'status error';
        personaPromptEl.value = '';
    }
}

async function loadMemoryFacts() {
    try {
        memoryStatus.textContent = 'Carregando memoria...';
        memoryStatus.className = 'status';
        const response = await fetch(`${API_BASE_URL}/memory-facts`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        memoryFactsEl.value = JSON.stringify(data.memory_facts || {}, null, 2);
        memoryStatus.textContent = 'Memoria carregada';
        memoryStatus.className = 'status success';
    } catch (error) {
        memoryStatus.textContent = 'Erro ao carregar memoria: ' + error.message;
        memoryStatus.className = 'status error';
        memoryFactsEl.value = '';
    }
}

clearMemoryBtn.addEventListener('click', async () => {
    const confirmClear = window.confirm('Tem certeza que deseja limpar a memoria?');
    if (!confirmClear) return;
    try {
        clearMemoryBtn.disabled = true;
        memoryStatus.textContent = 'Limpando memoria...';
        memoryStatus.className = 'status';
        const response = await fetch(`${API_BASE_URL}/memory-facts/clear`, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        memoryFactsEl.value = JSON.stringify(data.memory_facts || {}, null, 2);
        memoryStatus.textContent = 'Memoria limpa';
        memoryStatus.className = 'status success';
    } catch (error) {
        memoryStatus.textContent = 'Erro ao limpar memoria: ' + error.message;
        memoryStatus.className = 'status error';
    } finally {
        clearMemoryBtn.disabled = false;
    }
});

exportMemoryBtn.addEventListener('click', async () => {
    try {
        exportMemoryBtn.disabled = true;
        memoryStatus.textContent = 'Exportando memoria...';
        memoryStatus.className = 'status';
        const response = await fetch(`${API_BASE_URL}/memory-facts/export`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `memory_facts_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        memoryStatus.textContent = 'Memoria exportada';
        memoryStatus.className = 'status success';
    } catch (error) {
        memoryStatus.textContent = 'Erro ao exportar memoria: ' + error.message;
        memoryStatus.className = 'status error';
    } finally {
        exportMemoryBtn.disabled = false;
    }
});

async function loadPersonaOverride() {
    try {
        overrideStatus.textContent = 'Carregando override...';
        overrideStatus.className = 'status';
        const response = await fetch(`${API_BASE_URL}/persona-override`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const o = data.override || {};
        overrideNameInput.value = o.name || '';
        overrideDescInput.value = o.description || '';
        overrideLangInput.value = o.preferred_language || '';
        overrideVerbosityInput.value = o.verbosity || '';
        overrideStatus.textContent = 'Override carregado';
        overrideStatus.className = 'status success';
    } catch (error) {
        overrideStatus.textContent = 'Erro ao carregar override: ' + error.message;
        overrideStatus.className = 'status error';
        overrideNameInput.value = '';
        overrideDescInput.value = '';
        overrideLangInput.value = '';
        overrideVerbosityInput.value = '';
    }
}

saveOverrideBtn.addEventListener('click', async () => {
    const payload = {
        name: overrideNameInput.value.trim(),
        description: overrideDescInput.value.trim(),
        preferred_language: overrideLangInput.value.trim(),
        verbosity: overrideVerbosityInput.value.trim(),
    };
    try {
        saveOverrideBtn.disabled = true;
        overrideStatus.textContent = 'Salvando override...';
        overrideStatus.className = 'status';
        const response = await fetch(`${API_BASE_URL}/persona-override`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        await response.json();
        overrideStatus.textContent = 'Override salvo';
        overrideStatus.className = 'status success';
        await loadPersonaInfo();
    } catch (error) {
        overrideStatus.textContent = 'Erro ao salvar override: ' + error.message;
        overrideStatus.className = 'status error';
    } finally {
        saveOverrideBtn.disabled = false;
    }
});

revertOverrideBtn.addEventListener('click', async () => {
    const confirmRevert = window.confirm('Deseja reverter o override?');
    if (!confirmRevert) return;
    try {
        revertOverrideBtn.disabled = true;
        overrideStatus.textContent = 'Revertendo override...';
        overrideStatus.className = 'status';
        const response = await fetch(`${API_BASE_URL}/persona-override/revert`, {
            method: 'POST',
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        await response.json();
        overrideNameInput.value = '';
        overrideDescInput.value = '';
        overrideLangInput.value = '';
        overrideVerbosityInput.value = '';
        overrideStatus.textContent = 'Override revertido';
        overrideStatus.className = 'status success';
        await loadPersonaInfo();
    } catch (error) {
        overrideStatus.textContent = 'Erro ao reverter override: ' + error.message;
        overrideStatus.className = 'status error';
    } finally {
        revertOverrideBtn.disabled = false;
    }
});

loadPersonaInfo();
loadMemoryFacts();
loadPersonaOverride();

async function fetchWithRetry(url, maxRetries = 3, retryDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
}
