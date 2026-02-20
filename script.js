/* =========================
    CONFIG & FIREBASE INIT
========================= */

const firebaseConfig = {
    apiKey: "AIzaSyASCta2UnJgTPMxXCbQs6yiYCt4eKQWCIQ",
    authDomain: "incognito-terminal.firebaseapp.com",
   
    databaseURL: "https://incognito-terminal-default-rtdb.firebaseio.com", 
    projectId: "incognito-terminal",
    storageBucket: "incognito-terminal.firebasestorage.app",
    messagingSenderId: "486338406237",
    appId: "1:486338406237:web:87edd00a33d84c087e2ab4"
};


firebase.initializeApp(firebaseConfig);
const db = firebase.database();



/* =========================
    CONFIG & GLOBALS
========================= */
const ADMIN_KEY = "COLOCOLO"; 
let loggedIn = false;

const screens = {
    home: document.getElementById("homeScreen"),
    submit: document.getElementById("submitScreen"),
    archive: document.getElementById("archiveScreen")
};

 
/* =========================
    CUSTOM MODALS (INTERNAL UI)
========================= */

function terminalAlert(message) {
    return new Promise(resolve => {
        const modal = document.getElementById("customAlert");
        document.getElementById("alertMsg").textContent = message;
        modal.classList.remove("hidden");
        document.getElementById("closeAlert").onclick = () => {
            modal.classList.add("hidden");
            resolve();
        };
    });
}

function terminalConfirm(message) {
    return new Promise(resolve => {
        const modal = document.getElementById("customConfirm");
        document.getElementById("confirmMsg").textContent = message;
        modal.classList.remove("hidden");
        document.getElementById("confirmYes").onclick = () => {
            modal.classList.add("hidden");
            resolve(true);
        };
        document.getElementById("confirmNo").onclick = () => {
            modal.classList.add("hidden");
            resolve(false);
        };
    });
}

/* =========================
    STORAGE & ADMIN LOGIC
========================= */

function getRecords() {
    return JSON.parse(localStorage.getItem("incognito_records")) || [];
}

function saveRecords(records) {
    localStorage.setItem("incognito_records", JSON.stringify(records));
}

function checkAdminStatus() {
    return localStorage.getItem("is_admin") === "true";
}

function getUserVotes() {
    return JSON.parse(localStorage.getItem("incognito_user_votes")) || {};
}

function saveUserVotes(votes) {
    localStorage.setItem("incognito_user_votes", JSON.stringify(votes));
}

function refreshAdminUI() {
    const isAdmin = checkAdminStatus();
    const logoutBtn = document.getElementById("adminLogout");
    const adminPanel = document.getElementById("adminPanel");
    
    if (isAdmin) {
        document.body.classList.add("admin-mode");
        logoutBtn?.classList.remove("hidden");
        adminPanel?.classList.remove("hidden"); 
        
        
        if(globalRecords) {
            document.getElementById("totalRecords").innerText = globalRecords.length;
        }
    } else {
        document.body.classList.remove("admin-mode");
        logoutBtn?.classList.add("hidden");
        adminPanel?.classList.add("hidden");
    }
}


document.getElementById("nukeDatabase").onclick = async () => {
    const confirm = await terminalConfirm("¿ESTÁS SEGURO? ESTO BORRARÁ TODA LA EVIDENCIA COMPARTIDA.");
    if (confirm) {
        db.ref("records").remove(); 
        terminalAlert("BASE DE DATOS PURGADA.");
    }
};

/* =========================
    CORE FUNCTIONS
========================= */

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.add("hidden"));
    screens[screenId].classList.remove("hidden");
    
   
    if (screenId === 'archive') {
        document.getElementById("deepScanInput").value = "";
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        document.querySelector('.filter-btn[data-cat="ALL"]').classList.add("active");
        renderArchive();
    }
}

function imageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function runTerminalSequence(callback) {
    if (loggedIn) return callback();
    const log = document.getElementById("systemLog");
    loggedIn = true;
    log.classList.remove("hidden");
    log.innerHTML = "";
    const lines = ["> INITIALIZING...", "> SCANNING PROXIES...", "> ACCESS GRANTED"];
    let i = 0;
    const interval = setInterval(() => {
        if (i < lines.length) {
            const div = document.createElement("div");
            div.textContent = lines[i];
            if (lines[i].includes("GRANTED")) div.className = "ok";
            log.appendChild(div);
            i++;
        } else {
            clearInterval(interval);
            setTimeout(callback, 600);
        }
    }, 250);
}

/* =========================
    REACTION LOGIC (TOGGLE)
========================= */

function updateReaction(recordId, type) {
    const records = getRecords();
    const userVotes = getUserVotes();
    const record = records.find(r => r.id === recordId);
    
    if (!record) return;
    if (!record.reactions) record.reactions = { believe: 0, redacted: 0 };

    const currentVote = userVotes[recordId];

    if (currentVote === type) {
        
        record.reactions[type] = Math.max(0, record.reactions[type] - 1);
        delete userVotes[recordId];
    } else {
        
        if (currentVote) {
            record.reactions[currentVote] = Math.max(0, record.reactions[currentVote] - 1);
        }
        record.reactions[type]++;
        userVotes[recordId] = type;
    }

    saveRecords(records);
    saveUserVotes(userVotes);
    
    
    const currentTerm = document.getElementById("deepScanInput").value.toLowerCase();
    const currentCat = document.querySelector(".filter-btn.active").dataset.cat;
    renderArchive(currentTerm, currentCat); 
}

/* =========================
    UI RENDERING & LOGIC
========================= */

async function handleNewSubmission() {
    const title = document.getElementById("inTitle").value.trim();
    const category = document.getElementById("inCategory").value; 
    const desc = document.getElementById("inDesc").value.trim();
    const source = document.getElementById("inSource").value.trim();
    const fileInput = document.getElementById("inImage");

    if (source === ADMIN_KEY) {
        localStorage.setItem("is_admin", "true");
        document.querySelector(".terminal").classList.add("glitch-effect");
        await terminalAlert("ADMIN PRIVILEGES ACTIVATED.");
        document.querySelector(".terminal").classList.remove("glitch-effect");
        refreshAdminUI();
        clearSubmitForm(); 
        showScreen('archive');
        return; 
    }

    if (!title || !desc) {
        await terminalAlert("CRITICAL ERROR: DATA REQUIRED.");
        return;
    }

    let imageData = null;
    if (fileInput.files[0]) imageData = await imageToBase64(fileInput.files[0]);

    const records = getRecords();
    records.push({
        id: Date.now(),
        title,
        category: category || "OTHER",
        description: desc,
        source: source || "ANONYMOUS",
        image: imageData,
        reactions: { believe: 0, redacted: 0 } 
    });

    saveRecords(records);
    clearSubmitForm();
    showScreen('archive');
}


function renderArchive(filterTerm = "", filterCat = "ALL") {
    const list = document.getElementById("archiveList");
    const template = document.getElementById("cardTemplate");
    const isAdmin = checkAdminStatus();
    const userVotes = getUserVotes();
    
    list.innerHTML = "";
    let records = getRecords();

    
    records = records.filter(r => {
        const titleMatch = r.title.toLowerCase().includes(filterTerm);
        const descMatch = r.description.toLowerCase().includes(filterTerm);
        const textMatch = titleMatch || descMatch;
        
       
        const recCategory = r.category || "OTHER"; 
        const catMatch = (filterCat === "ALL" || recCategory === filterCat);
        
        return textMatch && catMatch;
    });

    if (records.length === 0) {
        list.innerHTML = `<div class="archive-empty">NO RECORDS MATCH THIS SCAN.</div>`;
        return;
    }

    records.forEach(record => {
        if (!record.reactions) record.reactions = { believe: 0, redacted: 0 };

        const clone = template.content.cloneNode(true);
        const card = clone.querySelector(".archive-card");
        const believeBtn = clone.querySelector(".believe-btn");
        const redactedBtn = clone.querySelector(".redacted-btn");
        const myVote = userVotes[record.id];

       
        const catLabel = record.category ? `[${record.category}] ` : "[OTHER] ";
        clone.querySelector(".card-title").textContent = catLabel + record.title;
        
        clone.querySelector(".card-preview").textContent = record.description.substring(0, 60) + "...";
        clone.querySelector(".full-desc").textContent = record.description;
        clone.querySelector(".record-source").textContent = `SOURCE: ${record.source}`;

      
        believeBtn.querySelector(".count").textContent = record.reactions.believe;
        redactedBtn.querySelector(".count").textContent = record.reactions.redacted;

        if (myVote === 'believe') believeBtn.classList.add("active");
        if (myVote === 'redacted') {
            redactedBtn.classList.add("active");
            card.classList.add("card-censored"); 
        }

       
        if (record.image) {
            const thumb = clone.querySelector(".evidence-preview");
            thumb.src = record.image;
            thumb.classList.remove("hidden");
            clone.querySelector(".placeholder-icon").classList.add("hidden");
            const fullImg = clone.querySelector(".full-evidence-img");
            fullImg.src = record.image;
            fullImg.classList.remove("hidden");
        }

   
        card.onclick = () => {
            const expanded = card.querySelector(".record-expanded");
            const isOpen = card.dataset.open === "true";
            expanded.classList.toggle("hidden", isOpen);
            card.dataset.open = !isOpen;
        };

        believeBtn.onclick = (e) => { e.stopPropagation(); updateReaction(record.id, 'believe'); };
        redactedBtn.onclick = (e) => { e.stopPropagation(); updateReaction(record.id, 'redacted'); };

        if (isAdmin) {
            const delBtn = clone.querySelector(".admin-only");
            delBtn.classList.remove("hidden");
            delBtn.onclick = async (e) => {
                e.stopPropagation(); 
                await deleteRecord(record.id);
            };
        }

        list.appendChild(clone);
    });
}

async function deleteRecord(id) {
    const confirmed = await terminalConfirm("PURGE THIS DATA?");
    if (confirmed) {
        const records = getRecords().filter(r => r.id !== id);
        saveRecords(records);
        
      
        const currentTerm = document.getElementById("deepScanInput").value.toLowerCase();
        const currentCat = document.querySelector(".filter-btn.active").dataset.cat;
        renderArchive(currentTerm, currentCat);
    }
}

function clearSubmitForm() {
    document.getElementById("inTitle").value = "";
    document.getElementById("inCategory").value = "ALIEN"; 
    document.getElementById("inDesc").value = "";
    document.getElementById("inSource").value = "";
    document.getElementById("inImage").value = "";
}


/* =========================
    DEEP SCAN / FILTER EVENT BINDING
========================= */

let scanTimeout;
document.getElementById("deepScanInput").oninput = function(e) {
    const term = e.target.value.toLowerCase();
    const currentCat = document.querySelector(".filter-btn.active").dataset.cat;
    
  
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
        renderArchive(term, currentCat);
    }, 300); 
};

document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.onclick = () => {
       
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
       
        const term = document.getElementById("deepScanInput").value.toLowerCase();
        renderArchive(term, btn.dataset.cat);
    };
});

// ===== POLÍGRAFO ACTIVO: LÓGICA DE ANÁLISIS =====


document.addEventListener("DOMContentLoaded", () => {
    
   
    const textArea = document.getElementById('inDesc'); 
    const polyStatus = document.getElementById('polygraph-status');
    const polyBar = document.getElementById('polygraph-bar');
    const polyWarning = document.getElementById('polygraph-warning');
    const bpmReadout = document.getElementById('bpm-readout');

   
    if (!textArea || !polyStatus) return;

    let stressLevel = 0; 
    let lastKeystrokeTime = Date.now();
    let baseBpm = 72;


    textArea.addEventListener('keydown', function(event) {
        let currentTime = Date.now();
        let timeDifference = currentTime - lastKeystrokeTime;
        
       
        if (event.key === 'Backspace' || event.key === 'Delete') {
            stressLevel += 15;
            updateWarning("ANOMALÍA: INTENTO DE MODIFICACIÓN DETECTADO. ¿OCULTA ALGO?");
        } 
      
        else if (timeDifference > 2000 && timeDifference < 10000) {
            stressLevel += 10;
            updateWarning("ANOMALÍA: TITUBEO DETECTADO. MANTENGA LA VERACIDAD.");
        } 
     
        else {
            stressLevel -= 2; 
        }

        stressLevel = Math.max(0, Math.min(100, stressLevel));
        lastKeystrokeTime = currentTime;
        
        updatePolygraphUI();
    });

   
    setInterval(function() {
        if (Date.now() - lastKeystrokeTime > 3000 && stressLevel > 0) {
            stressLevel -= 5;
            stressLevel = Math.max(0, Math.min(100, stressLevel));
            updatePolygraphUI();
        }
        
       
        let currentBpm = baseBpm + Math.floor(stressLevel * 0.8) + Math.floor(Math.random() * 5);
        if (bpmReadout) bpmReadout.innerText = currentBpm;
        
    }, 1500);

    function updateWarning(message) {
        if (!polyWarning) return;
        polyWarning.innerText = message;
        setTimeout(() => {
            if (polyWarning.innerText === message) {
                polyWarning.innerText = "VIGILANCIA ACTIVA: ESCRIBA SU REPORTE.";
            }
        }, 4000);
    }

    function updatePolygraphUI() {
        if (!polyBar || !polyStatus) return;
        
        polyBar.style.width = stressLevel + '%';

        if (stressLevel < 30) {
            polyStatus.innerText = "ESTABLE";
            polyStatus.className = "status-normal";
            polyBar.style.backgroundColor = "#00ff00"; 
        } else if (stressLevel >= 30 && stressLevel < 70) {
            polyStatus.innerText = "ELEVADO";
            polyStatus.className = "status-elevated";
            polyBar.style.backgroundColor = "#ffff00"; 
        } else {
            polyStatus.innerText = "PROBABILIDAD DE ENGAÑO: ALTA";
            polyStatus.className = "status-critical";
            polyBar.style.backgroundColor = "#ff0000"; 
        }
    }
});

// ===== LIVE WIRE: GENERADOR DE TRANSMISIONES (EXPANDIDO Y CLASIFICADO) =====

const wireMessages = [
    
    "INTERCEPTACIÓN SECTOR 4: ANOMALÍA MAGNÉTICA DETECTADA",
    "SAT-COM LINK ESTABLISHED... DOWNLOADING TELEMETRY",
    "UNAUTHORIZED ACCESS DETECTED IN SECTOR 7G",
    "WARNING: CONTAINMENT BREACH AT SITE-19. DEPLOYING MTF.",
    "OPERATION BLUEBEAM ON STANDBY...",
    "NORAD: UNIDENTIFIED BOGEY OVER RESTRICTED AIRSPACE",
    "BLACK KNIGHT SATELLITE BROADCASTING NEW COORDINATES",
    "DEEP UNDERGROUND MILITARY BASE (DUMB) NETWORK ACTIVE",

   
    "AGENTE [█████] NO RESPONDE. INICIANDO PROTOCOLO DE LIMPIEZA.",
    "PROYECTO MK-ULTRA FASE 4: OBJETIVOS EN POSICIÓN",
    "NIVEL DE AMENAZA GLOBAL: ELEVADO",
    "VIGILANCIA ORBITAL ACTIVA. RASTREANDO OBJETIVO.",
    "ALERTA SÍSMICA: EPICENTRO DESCONOCIDO. NO ES FALLA TECTÓNICA.",
    "EL FORO GLOBAL HA ADELANTADO LA AGENDA. PREPAREN REFUGIOS.",

    
    "ANOMALÍA GRAVITACIONAL SEVERA RASTREADA EN EL VALLE DE ELQUI. INICIANDO CUARENTENA.",
    "RADARES EN PUNTA ARENAS CAPTAN OBJETO SUBMARINO NO IDENTIFICADO (OSNI) A 400 NUDOS.",
    "CRIATURA ALADA EN CHILOÉ RE-CLASIFICADA COMO MUTACIÓN BIOLÓGICA DE CLASE 4.",
    "BASE AÉREA CERRO MORENO: CONTACTO DE RADAR CONFIRMADO MOVIÉNDOSE A MACH 15.",
    "ACTIVIDAD SÍSMICA ARTIFICIAL DETECTADA BAJO EL DESIERTO DE ATACAMA.",

   
    "INFORME MAJESTIC: EL PROGRAMADOR CONOCIDO COMO 'FLOKO' HA DESENCRIPTADO EL ARCHIVO OMEGA. INTERCEPTAR.",
    "SISTEMA COMPROMETIDO POR INGENIERO DE CÓDIGO 'FLOKO'. RASTREO DE IP EVADIDO.",
    "SUJETO C-09 (ALIAS 'ELDRYC') AVISTADO EN ZONA BOSCOSA. ENTIDAD SUBTERRÁNEA ALTAMENTE PELIGROSA.",
    "INCIDENTE ELDRYC: EL GNOMO HA ROTO EL CERCO DE CONTENCIÓN. SE AUTORIZA FUERZA LETAL.",

   
    "01001000 01000101 01001100 01010000",
    "NULL_REFERENCE_EXCEPTION: LA REALIDAD NO RESPONDE",
    "EL OJO ESTÁ ABIERTO. EL OJO ESTÁ OBSERVANDO.",
    "SÍNDROME DE LA HABANA DETECTADO EN EMBAJADA SUR",
    "NO MIRES AL CIELO ESTA NOCHE. REPETIMOS: NO MIRES AL CIELO."
];

function generateGlitchText() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*¥§µ‡†∆∇';
    let glitch = '';
    for (let i = 0; i < 15; i++) {
        glitch += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `[DATA_CORRUPT: 0x${Math.floor(Math.random()*99)} ${glitch} ]`;
}

function initLiveWire() {
    const wireTrack = document.getElementById('liveWireTrack');
    if (!wireTrack) return;

    let allMessages = [...wireMessages];
    for (let i = 0; i < 4; i++) {
        allMessages.push(generateGlitchText());
    }

    allMessages.sort(() => Math.random() - 0.5);

    
    const separator = '<span class="wire-separator"> ■ </span>';
    const messageString = separator + allMessages.join(separator) + separator;

 
    wireTrack.innerHTML = messageString + messageString;
}



/* =========================
    EVENT BINDING & INIT
========================= */

document.getElementById("accessBtn").onclick = () => runTerminalSequence(() => showScreen('archive'));
document.getElementById("submitBtn").onclick = () => runTerminalSequence(() => showScreen('submit'));
document.getElementById("cancelBtn").onclick = () => showScreen('home');
document.getElementById("backBtn").onclick = () => showScreen('home');
document.getElementById("sendRecordBtn").onclick = handleNewSubmission;

document.getElementById("adminLogout").onclick = async () => {
    localStorage.removeItem("is_admin");
    document.querySelector(".terminal").classList.add("glitch-effect");
    await terminalAlert("ADMIN SESSION TERMINATED.");
    document.querySelector(".terminal").classList.remove("glitch-effect");
    refreshAdminUI();
    renderArchive(); 
};
initLiveWire();
window.onload = refreshAdminUI;