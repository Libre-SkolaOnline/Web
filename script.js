const API_BASE = "https://aplikace.skolaonline.cz/solapi/api";
const TOKEN_URL = API_BASE + "/connect/token";

let AppState = {
    token: localStorage.getItem("sol_token"),
    studentId: null,
    user: null
};

document.addEventListener("DOMContentLoaded", () => {
    if (AppState.token) {
        initApp();
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
    }
});

async function initApp() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';

    const userSuccess = await loadUserInfo();
    
    if (userSuccess) {
        loadTimetable();
    }
}

function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.sidebar button').forEach(el => el.classList.remove('active'));

    document.getElementById(`view-${viewName}`).style.display = 'block';
    
    const btn = Array.from(document.querySelectorAll('.sidebar button')).find(b => b.innerText.toLowerCase().includes(viewName));
    if(btn) btn.classList.add('active');

    if (viewName === 'rozvrh') loadTimetable();
    if (viewName === 'znamky') loadMarks();
    if (viewName === 'ukoly') loadHomeworks();
    if (viewName === 'zpravy') loadMessages();
}
async function loadUserInfo() {
    try {
        const data = await apiFetch("/v1/user");
        AppState.user = data;
        AppState.studentId = data.personID;

        document.getElementById('user-name').innerText = data.fullName;
        document.getElementById('user-class').innerText = data.class ? data.class.name : "";
        return true;
    } catch (e) {
        return false;
    }
}

async function loadTimetable() {
    const container = document.getElementById('timetable-grid');
    container.innerHTML = "";

    const today = new Date();
    const dateFrom = new Date(today.setDate(today.getDate() - today.getDay() + 1)).toISOString().split('T')[0];
    const dateTo = new Date(today.setDate(today.getDate() + 6)).toISOString().split('T')[0];

    try {
        const data = await apiFetch(`/v1/timeTable?StudentId=${AppState.studentId}&DateFrom=${dateFrom}&DateTo=${dateTo}`);
        
        let html = "";
        
        data.days.forEach(day => {
            const datePretty = new Date(day.date).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' });
            
            html += `<div class="day-container">`;
            html += `<div class="day-header">${datePretty}</div>`;
            html += `<div class="schedule-row">`;

            if (day.schedules && day.schedules.length > 0) {
                day.schedules.forEach(lesson => {
                    const subject = lesson.subject ? lesson.subject.name : "???";
                    const room = lesson.room ? lesson.room.abbrev : "";
                    const time = `${lesson.beginTime.substr(0, 5)} - ${lesson.endTime.substr(0, 5)}`;

                    html += `
                        <div class="lesson-card">
                            <div class="lesson-time">${time}</div>
                            <strong class="lesson-subject">${subject}</strong>
                            <div class="lesson-room">${room}</div>
                        </div>
                    `;
                });
            } else {
                html += `<div style="color:#999; padding:10px;">Volno</div>`;
            }

            html += `</div></div>`;
        });

        container.innerHTML = html;

    } catch (e) {
        container.innerText = "";
    }
}

async function loadMarks() {
    const container = document.getElementById('marks-list');
    container.innerHTML = "";

    try {
        const data = await apiFetch(`/v1/students/${AppState.studentId}/marks/bySubject?SemesterId=`);
        
        let html = "";

        if(data.subjects) {
            data.subjects.forEach(sub => {
                if (!sub.marks || sub.marks.length === 0) return;

                html += `<div class="subject-grades">`;
                html += `<div class="subject-title">${sub.subjectName || "Předmět bez názvu"}</div>`;
                html += `<div>`;
                
                sub.marks.forEach(m => {
                    const val = m.markText.replace('-', '');
                    let gradeClass = "";
                    if (val == "1") gradeClass = "grade-1";
                    if (val == "5") gradeClass = "grade-5";

                    html += `<span class="grade-badge ${gradeClass}" title="${m.theme || ''} (${m.weight})">${m.markText}</span>`;
                });

                html += `</div></div>`;
            });
        }
        
        container.innerHTML = html || "Žádné známky k zobrazení.";

    } catch (e) {
        container.innerText = "";
    }
}

async function loadHomeworks() {
    const container = document.getElementById('homework-list');
    container.innerHTML = "";

    try {
        const data = await apiFetch(`/v1/students/${AppState.studentId}/homeworks?Filter=active`);
        
        let html = "";
        if (data.homeworks) {
            data.homeworks.forEach(hw => {
                const dateDue = new Date(hw.dateTo).toLocaleDateString('cs-CZ');
                html += `
                    <div class="card">
                        <h3>${hw.topic || "Bez názvu"}</h3>
                        <div class="meta">Do: ${dateDue}</div>
                        <div>${hw.detailedDescription || ""}</div>
                    </div>
                `;
            });
        }
        container.innerHTML = html || "Žádné aktivní úkoly.";

    } catch (e) {
        container.innerText = "";
    }
}

async function loadMessages() {
    const container = document.getElementById('messages-list');
    container.innerHTML = "";
    
    try {
        const data = await apiFetch(`/v1/messages/received`);
        let html = "";
        if (data.messages) {
            data.messages.forEach(msg => {
                const sender = msg.sender ? msg.sender.name : "Neznámý";
                html += `
                    <div class="card">
                        <h3>${msg.subject}</h3>
                        <div class="meta">Od: ${sender} | ${new Date(msg.sentDate).toLocaleDateString('cs-CZ')}</div>
                        <div style="font-size:0.9em; color:#555">${msg.text ? msg.text.substring(0, 100) + "..." : ""}</div>
                    </div>
                `;
            });
        }
        container.innerHTML = html;
    } catch(e) {
        container.innerText = "";
    }
}

async function apiFetch(endpoint) {
    const token = localStorage.getItem("sol_token");
    if (!token) throw new Error("No token");

    const url = API_BASE + endpoint;
    const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    });

    if (res.status === 401) {
        logout();
        throw new Error("Unauthorized");
    }

    return await res.json();
}

async function performLogin() {
    const btn = document.getElementById('login-btn');
    const errorMsg = document.getElementById('login-error');
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const clientId = document.getElementById('login-client').value;

    btn.disabled = true;

    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', clientId);
    params.append('username', user);
    params.append('password', pass);
    params.append('scope', 'openid offline_access profile sol_api');

    try {
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        const data = await response.json();

        if (response.ok && data.access_token) {
            localStorage.setItem("sol_token", data.access_token);
            AppState.token = data.access_token;
            initApp();
        } else {
            errorMsg.innerText = "Chyba: " + (data.error || "Špatné heslo");
        }
    } catch (e) {
        errorMsg.innerText = "Chyba spojení.";
    } finally {
        btn.disabled = false;
    }
}

function logout() {
    localStorage.removeItem("sol_token");
    location.reload();
}