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
let globalRecords = [];

// NUEVO: Variables para la edición y la identidad secreta
let editingRecordId = null;
let currentEditingImage = null;

// Genera o recupera el Token de Agente oculto en este navegador
function getOrCreateOwnerToken() {
    let token = localStorage.getItem("incognito_owner_token");
    if (!token) {
        token = 'agent_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("incognito_owner_token", token);
    }
    return token;
}
const MY_AGENT_TOKEN = getOrCreateOwnerToken();

const screens = {
    home: document.getElementById("homeScreen"),
    submit: document.getElementById("submitScreen"),
    archive: document.getElementById("archiveScreen")
};

/* =========================
    FIREBASE REALTIME SYNC (EL RADAR)
========================= */
db.ref("records").on("value", (snapshot) => {
    globalRecords = [];
    const data = snapshot.val();
    if (data) {
        for (let key in data) {
            globalRecords.push({
                dbKey: key, 
                ...data[key]
            });
        }
    }
    
    if (!screens.archive.classList.contains("hidden")) {
        const term = document.getElementById("deepScanInput").value.toLowerCase();
        const catBtn = document.querySelector(".filter-btn.active");
        const cat = catBtn ? catBtn.dataset.cat : "ALL";
        renderArchive(term, cat);
    }
    refreshAdminUI();
});

/* =========================
    CUSTOM MODALS
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
    LOCAL STORAGE (SOLO PARA ADMIN Y VOTOS)
========================= */
function checkAdminStatus() { return localStorage.getItem("is_admin") === "true"; }
function getUserVotes() { return JSON.parse(localStorage.getItem("incognito_user_votes")) || {}; }
function saveUserVotes(votes) { localStorage.setItem("incognito_user_votes", JSON.stringify(votes)); }

function refreshAdminUI() {
    const isAdmin = checkAdminStatus();
    const logoutBtn = document.getElementById("adminLogout");
    const adminPanel = document.getElementById("adminPanel");
    
    if (isAdmin) {
        document.body.classList.add("admin-mode");
        logoutBtn?.classList.remove("hidden");
        adminPanel?.classList.remove("hidden"); 
        if(globalRecords) document.getElementById("totalRecords").innerText = globalRecords.length;
    } else {
        document.body.classList.remove("admin-mode");
        logoutBtn?.classList.add("hidden");
        adminPanel?.classList.add("hidden");
    }
}

document.getElementById("nukeDatabase").onclick = async () => {
    const confirm = await terminalConfirm("¿ESTÁS SEGURO? ESTO BORRARÁ TODA LA EVIDENCIA DE LA NUBE.");
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
    UI RENDERING & LOGIC
========================= */
async function handleNewSubmission() {
    const title = document.getElementById("inTitle").value.trim();
    const category = document.getElementById("inCategory").value; 
    const desc = document.getElementById("inDesc").value.trim();
    const source = document.getElementById("inSource").value.trim();
    const fileInput = document.getElementById("inImage");

    if (source === ADMIN_KEY && !editingRecordId) {
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
    if (fileInput.files && fileInput.files[0]) {
        imageData = await imageToBase64(fileInput.files[0]);
    }

    if (editingRecordId) {
        
        const updates = {
            title: title,
            category: category || "OTHER",
            description: desc,
            source: source || "ANONYMOUS"
        };
        
        
        if (imageData) {
            updates.image = imageData;
        }

        try {
            await db.ref("records/" + editingRecordId).update(updates);
            await terminalAlert("TRANSMISSION UPDATED.");
        } catch (error) {
            console.error("Transmission error:", error);
            await terminalAlert("ERROR DE CONEXIÓN AL ACTUALIZAR.");
        }
    } else {
        
        const newRecord = {
            title,
            category: category || "OTHER",
            description: desc,
            source: source || "ANONYMOUS",
            image: imageData || null,
            reactions: { believe: 0, redacted: 0 },
            timestamp: Date.now(),
            ownerToken: MY_AGENT_TOKEN 
        };
        db.ref("records").push(newRecord);
    }

    clearSubmitForm();
    showScreen('archive');
}

// INICIAR EL MODO EDICIÓN
function startEditing(record) {
    editingRecordId = record.dbKey;
    currentEditingImage = record.image;

    document.getElementById("inTitle").value = record.title;
    document.getElementById("inCategory").value = record.category || "OTHER";
    document.getElementById("inDesc").value = record.description;
    document.getElementById("inSource").value = record.source === "ANONYMOUS" ? "" : record.source;
    document.getElementById("inImage").value = "";

    const submitTitle = document.querySelector(".submit-title");
    if(submitTitle) submitTitle.innerText = "EDIT EVIDENCE";
    
    const sendBtn = document.getElementById("sendRecordBtn");
    if(sendBtn) sendBtn.innerText = "UPDATE TRANSMISSION";

    showScreen('submit');
}

function renderArchive(filterTerm = "", filterCat = "ALL") {
    const list = document.getElementById("archiveList");
    const template = document.getElementById("cardTemplate");
    const isAdmin = checkAdminStatus();
    const userVotes = getUserVotes();
    
    list.innerHTML = "";
    let records = globalRecords.filter(r => {
        const titleMatch = r.title.toLowerCase().includes(filterTerm);
        const descMatch = r.description.toLowerCase().includes(filterTerm);
        const textMatch = titleMatch || descMatch;
        const recCategory = r.category || "OTHER"; 
        const catMatch = (filterCat === "ALL" || recCategory === filterCat);
        return textMatch && catMatch;
    });

    records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

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
        const myVote = userVotes[record.dbKey];

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

        // MOSTRAR BOTONES AL DUEÑO DEL ARCHIVO
        if (record.ownerToken === MY_AGENT_TOKEN) {
            const userActions = clone.querySelector(".user-actions");
            if (userActions) {
                userActions.classList.remove("hidden");
                
                userActions.querySelector(".edit-btn").onclick = (e) => {
                    e.stopPropagation();
                    startEditing(record);
                };
                
                userActions.querySelector(".delete-btn").onclick = async (e) => {
                    e.stopPropagation();
                    const confirmed = await terminalConfirm("PERMANENTLY DELETE YOUR RECORD?");
                    if (confirmed) db.ref("records/" + record.dbKey).remove();
                };
            }
        }

        card.onclick = () => {
            const expanded = card.querySelector(".record-expanded");
            const isOpen = card.dataset.open === "true";
            expanded.classList.toggle("hidden", isOpen);
            card.dataset.open = !isOpen;
        };

        believeBtn.onclick = (e) => { e.stopPropagation(); updateReaction(record, 'believe'); };
        redactedBtn.onclick = (e) => { e.stopPropagation(); updateReaction(record, 'redacted'); };

        if (isAdmin) {
            const delBtn = clone.querySelector(".admin-only");
            if (delBtn) {
                delBtn.classList.remove("hidden");
                delBtn.onclick = async (e) => {
                    e.stopPropagation(); 
                    await deleteRecord(record.dbKey);
                };
            }
        }

        list.appendChild(clone);
    });
}

function updateReaction(record, type) {
    const userVotes = getUserVotes();
    const currentVote = userVotes[record.dbKey];
    
    let believeCount = record.reactions.believe || 0;
    let redactedCount = record.reactions.redacted || 0;

    if (currentVote === type) {
        if (type === 'believe') believeCount = Math.max(0, believeCount - 1);
        if (type === 'redacted') redactedCount = Math.max(0, redactedCount - 1);
        delete userVotes[record.dbKey];
    } else {
        if (currentVote === 'believe') believeCount = Math.max(0, believeCount - 1);
        if (currentVote === 'redacted') redactedCount = Math.max(0, redactedCount - 1);
        
        if (type === 'believe') believeCount++;
        if (type === 'redacted') redactedCount++;
        userVotes[record.dbKey] = type;
    }

    saveUserVotes(userVotes);
    db.ref("records/" + record.dbKey + "/reactions").set({ believe: believeCount, redacted: redactedCount });
}

async function deleteRecord(dbKey) {
    const confirmed = await terminalConfirm("PURGE THIS DATA FROM CLOUD?");
    if (confirmed) {
        db.ref("records/" + dbKey).remove(); 
    }
}

function clearSubmitForm() {
    editingRecordId = null;
    currentEditingImage = null;
    document.getElementById("inTitle").value = "";
    document.getElementById("inCategory").value = "ALIEN"; 
    document.getElementById("inDesc").value = "";
    document.getElementById("inSource").value = "";
    document.getElementById("inImage").value = "";
    
    const submitTitle = document.querySelector(".submit-title");
    if(submitTitle) submitTitle.innerText = "SUBMIT EVIDENCE";
    
    const sendBtn = document.getElementById("sendRecordBtn");
    if(sendBtn) sendBtn.innerText = "TRANSMIT";
}

/* =========================
    DEEP SCAN / FILTER EVENT BINDING
========================= */
let scanTimeout;
document.getElementById("deepScanInput").oninput = function(e) {
    const term = e.target.value.toLowerCase();
    const currentCat = document.querySelector(".filter-btn.active").dataset.cat;
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => { renderArchive(term, currentCat); }, 300); 
};

document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const term = document.getElementById("deepScanInput").value.toLowerCase();
        renderArchive(term, btn.dataset.cat);
    };
});

/* =========================
    POLÍGRAFO Y LIVE WIRE
========================= */
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
            updateWarning("ANOMALÍA: INTENTO DE MODIFICACIÓN DETECTADO.");
        } else if (timeDifference > 2000 && timeDifference < 10000) {
            stressLevel += 10;
            updateWarning("ANOMALÍA: TITUBEO DETECTADO.");
        } else {
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
            if (polyWarning.innerText === message) polyWarning.innerText = "VIGILANCIA ACTIVA: ESCRIBA SU REPORTE.";
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
    "NO MIRES AL CIELO ESTA NOCHE. REPETIMOS: NO MIRES AL CIELO.",
    "INFORME COLUMBUS CLASIFICADO: LA RUPTURA DIMENSIONAL NO FUE UN ACCIDENTE. SENREF MIENTE.",
    "EL PUEBLO NO ESTÁ EN LOS MAPAS DE 1981. AF-01 NO DEJÓ CUERPOS, SOLO SILENCIO Y ESTÁTICA.",
    "INCIDENTE SUR 1980: LAS ALMAS SON COMBUSTIBLE DIMENSIONAL. LA ENTIDAD AF-01 AÚN TIENE HAMBRE.",
    "FRECUENCIA SENREF INTERCEPTADA: LAS CINTAS DE CONTENCIÓN ESTÁN GRABADAS CON GRITOS VÍTRICOS.",
    "ERROR DE CONTENCIÓN CRÍTICO. EL DR. COLUMBUS FUE EL PRIMER RECIPIENTE. EL SUR ES UNA ZONA MUERTA.",
    "PULSO ELECTROMAGNÉTICO EN CERRO ÑIELOL. TEMUCO ES EL EPICENTRO DE LA SEGUNDA BRECHA.",
    "LA NIEBLA EN TEMUCO NO ES HUMO DE LEÑA. ES GAS DE OCULTAMIENTO. NO RESPIRAR PROFUNDO."
];

function generateGlitchText() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*¥§µ‡†∆∇';
    let glitch = '';
    for (let i = 0; i < 15; i++) glitch += chars.charAt(Math.floor(Math.random() * chars.length));
    return `[DATA_CORRUPT: 0x${Math.floor(Math.random()*99)} ${glitch} ]`;
}

function initLiveWire() {
    const wireTrack = document.getElementById('liveWireTrack');
    if (!wireTrack) return;
    let allMessages = [...wireMessages];
    for (let i = 0; i < 4; i++) allMessages.push(generateGlitchText());
    allMessages.sort(() => Math.random() - 0.5);
    const separator = '<span class="wire-separator"> ■ </span>';
    const messageString = separator + allMessages.join(separator) + separator;
    wireTrack.innerHTML = messageString + messageString;
}

/* =========================
   PROTOCOLO BILINGÜE
========================= */

let currentLang = localStorage.getItem("terminal_lang") || "ES"; 

const translations = {
    ES: {
        lang_btn: "[ LANG: ES ]",
        system_status: "[ SISTEMA ACTIVO ]",
        btn_admin_logout: "SALIR ADMIN",
        home_warning: "NO DEBERÍAS ESTAR<br>AQUÍ.",
        home_info: "Este sistema contiene<br>archivos sin verificar.",
        nav_archive: "ACCEDER AL ARCHIVO",
        nav_submit: "SUBIR REPORTE",
        home_watching: "— SISTEMA OBSERVANDO —",
        form_main_title: "SUBIR EVIDENCIA",
        form_lbl_title: "TÍTULO DEL REPORTE",
        form_ph_title: "Archivo sin título",
        form_lbl_cat: "CLASIFICACIÓN",
        cat_alien: "EXTRATERRESTRE",
        cat_para: "PARANORMAL",
        cat_cryptid: "CRÍPTIDO",
        cat_society: "SOCIEDAD SECRETA",
        cat_urban: "LEYENDA URBANA",
        cat_govt: "GUBERNAMENTAL",
        cat_other: "DESCONOCIDO",
        form_lbl_desc: "DESCRIPCIÓN / CONSPIRACIÓN",
        polygraph_warning: "VIGILANCIA ACTIVA: ESCRIBA SU REPORTE.",
        form_ph_desc: "Escriba el reporte aquí...",
        form_lbl_img: "EVIDENCIA (FOTO/IMAGEN)",
        form_lbl_source: "FUENTE / CLAVE (OPCIONAL)",
        form_ph_source: "Desconocido / Anónimo",
        btn_submit: "TRANSMITIR",
        btn_abort: "ABORTAR",
        archive_title: "ARCHIVO SEGURO",
        ph_search: "BÚSQUEDA PROFUNDA...",
        filter_all: "TODO",
        cat_society_short: "SOCIEDAD",
        cat_urban_short: "LEYENDA",
        cat_other_short: "OTRO",
        btn_return: "VOLVER AL INICIO",
        btn_edit: "EDITAR REPORTE",
        btn_delete: "ELIMINAR REPORTE",
        alert_continue: "CONTINUAR",
        confirm_sure: "¿ESTÁS SEGURO?",
        confirm_yes: "PROCEDER",
        confirm_no: "ABORTAR"
    },
    EN: {
        lang_btn: "[ LANG: EN ]",
        system_status: "[ SYSTEM ACTIVE ]",
        btn_admin_logout: "EXIT ADMIN",
        home_warning: "YOU ARE NOT SUPPOSED TO BE<br>HERE.",
        home_info: "This system contains<br>unverified records.",
        nav_archive: "ACCESS ARCHIVE",
        nav_submit: "SUBMIT RECORD",
        home_watching: "— SYSTEM WATCHING —",
        form_main_title: "SUBMIT EVIDENCE",
        form_lbl_title: "RECORD TITLE",
        form_ph_title: "Untitled file",
        form_lbl_cat: "CLASSIFICATION",
        cat_alien: "EXTRATERRESTRIAL",
        cat_para: "PARANORMAL",
        cat_cryptid: "CRYPTID",
        cat_society: "SECRET SOCIETY",
        cat_urban: "URBAN LEGEND",
        cat_govt: "GOVERNMENT",
        cat_other: "UNKNOWN",
        form_lbl_desc: "DESCRIPTION / CONSPIRACY",
        polygraph_warning: "ACTIVE SURVEILLANCE: WRITE YOUR REPORT.",
        form_ph_desc: "Write the record...",
        form_lbl_img: "EVIDENCE (PHOTO/IMAGE)",
        form_lbl_source: "SOURCE / ACCESS KEY (OPTIONAL)",
        form_ph_source: "Unknown / Anonymous",
        btn_submit: "TRANSMIT",
        btn_abort: "ABORT",
        archive_title: "SECURE ARCHIVE",
        ph_search: "DEEP SCAN...",
        filter_all: "ALL",
        cat_society_short: "SOCIETY",
        cat_urban_short: "LEGEND",
        cat_other_short: "OTHER",
        btn_return: "RETURN TO HOME",
        btn_edit: "EDIT RECORD",
        btn_delete: "DELETE RECORD",
        alert_continue: "CONTINUE",
        confirm_sure: "ARE YOU SURE?",
        confirm_yes: "PROCEED",
        confirm_no: "ABORT"
    }
};

function switchLanguage() {
    currentLang = (currentLang === "ES") ? "EN" : "ES";
    localStorage.setItem("terminal_lang", currentLang);
    applyTranslations();
}

function applyTranslations() {
    const langBtn = document.getElementById("langToggle");
    if (langBtn) {
        langBtn.innerText = translations[currentLang].lang_btn;
    }

    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (translations[currentLang][key]) {
            if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
                el.placeholder = translations[currentLang][key];
            } else {
                el.innerHTML = translations[currentLang][key];
            }
        }
    });
}
/* =========================
   SECUENCIA DE ARRANQUE (BIOS)
========================= */
const bootLines = [
    "BIOS Date 10/24/85 14:22:34 Ver 08.00.02",
    "CPU: MK-ULTRA PROCESSOR, Speed: 8.5 MHz",
    "Memory Test: 640K OK",
    " ",
    "Initializing secure connection...",
    "Establishing SAT-COM link... OK",
    "Bypassing public relays... OK",
    "Decrypting payload... OK",
    "Loading IN.CÓGNITO Core Modules...",
    "Checking local biometric sensors... DETECTED",
    "Mounting shadow database...",
    " ",
    "WARNING: UNAUTHORIZED ACCESS LOGGED.",
    "INITIATING SYSTEM..."
];

function runBootSequence() {
    const bootScreen = document.getElementById("bootScreen");
    const bootText = document.getElementById("bootText");
    
    
    if (sessionStorage.getItem("system_booted")) {
        bootScreen.classList.add("hidden");
        return;
    }

    let i = 0;
    const bootInterval = setInterval(() => {
        if (i < bootLines.length) {
            const p = document.createElement("div");
            p.textContent = bootLines[i];
            bootText.appendChild(p);
            
            
            bootScreen.scrollTop = bootScreen.scrollHeight;
            i++;
        } else {
            clearInterval(bootInterval);
            
            setTimeout(() => {
                bootScreen.classList.add("hidden");
                sessionStorage.setItem("system_booted", "true");
            }, 1200);
        }
    }, 120);
}

document.addEventListener("DOMContentLoaded", () => {
    applyTranslations();
    runBootSequence();
});
/* =========================
    EVENT BINDING & INIT
========================= */
document.getElementById("accessBtn").onclick = () => runTerminalSequence(() => showScreen('archive'));
document.getElementById("submitBtn").onclick = () => runTerminalSequence(() => { clearSubmitForm(); showScreen('submit'); });
document.getElementById("cancelBtn").onclick = () => { clearSubmitForm(); showScreen('home'); };
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