// ---------- SUPABASE CLIENT ----------
const supa = supabaseClient;

let currentUser = null;
let habits = [];      // Array mit Habit-Objekten aus Supabase
let history = {};     // { habitName: { "dd.mm.": true/false } }

// ---------- AUTH ELEMENTE ----------
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signupBtn = document.getElementById("signupbtn");
const loginBtn = document.getElementById("loginbtn");
const logoutBtn = document.getElementById("logoutbtn");

// ---------- AUTH EVENTS ----------
signupBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) return;

  const { data, error } = await supa.auth.signUp({ email, password });
  if (error) {
    alert("Fehler bei Registrierung: " + error.message);
  } else {
    alert("Bestätige ggf. deine E-Mail.");
  }
});

loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) return;

  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Login fehlgeschlagen: " + error.message);
  } else {
    currentUser = data.user;
    await loadAllData();
  }
});

logoutBtn.addEventListener("click", async () => {
  await supa.auth.signOut();
  currentUser = null;
  habits = [];
  history = {};
  loadHabitList();
  loadHistoryTable();
});

// Beim Laden prüfen, ob bereits eingeloggt
(async function initAuth() {
  const { data } = await supa.auth.getUser();
  currentUser = data.user || null;
  if (currentUser) {
    await loadAllData();
  }
})();

// ---------- DATUMSFUNKTIONEN ----------
function getToday() {
  const now = new Date();
  return (
    now.getDate().toString().padStart(2, "0") + "." +
    (now.getMonth() + 1).toString().padStart(2, "0") + "."
  );
}

function getLast30Days() {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const formatted =
      d.getDate().toString().padStart(2, "0") + "." +
      (d.getMonth() + 1).toString().padStart(2, "0") + ".";
    days.push(formatted);
  }
  return days;
}

// YYYY-MM-DD aus dd.mm.
function formatDateForSql(ddmm) {
  const [dd, mm] = ddmm.split(".");
  const now = new Date();
  const year = now.getFullYear();
  return `${year}-${mm}-${dd}`;
}

// dd.mm. aus YYYY-MM-DD
function formatDateForDisplay(yyyy_mm_dd) {
  const [year, mm, dd] = yyyy_mm_dd.split("-");
  return `${dd}.${mm}.`;
}

// ---------- ALLE DATEN LADEN ----------
async function loadAllData() {
  if (!currentUser) return;

  // Habits laden
  const { data: habitRows, error: habitsError } = await supa
    .from("habits")
    .select("*")
    .order("created_at");

  if (habitsError) {
    console.error(habitsError);
    return;
  }

  habits = habitRows.map(h => h); // komplette Objekte
  history = {};

  // History der letzten 30 Tage laden
  const days = getLast30Days();
  const from = formatDateForSql(days[days.length - 1]);
  const to = formatDateForSql(days[0]);

  const { data: histRows, error: histError } = await supa
    .from("habit_history")
    .select("*")
    .gte("date", from)
    .lte("date", to);

  if (!histError && histRows) {
    histRows.forEach(row => {
      const habitObj = habits.find(h => h.id === row.habit_id);
      if (!habitObj) return;
      const dayKey = formatDateForDisplay(row.date);
      if (!history[habitObj.name]) history[habitObj.name] = {};
      history[habitObj.name][dayKey] = row.done;
    });
  }

  loadHabitList();
  loadHistoryTable();
}

// ---------- HABIT LISTE ----------
function loadHabitList() {
  const list = document.getElementById("acthabits");
  list.innerHTML = "";
  const today = getToday();

  habits.forEach((habitObj) => {
    const habitName = habitObj.name;

    const li = document.createElement("li");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";

    // Häkchen für heute
    checkbox.checked =
      history[habitName] && history[habitName][today] ? true : false;

    // Listener: heute abhaken
    checkbox.addEventListener("change", async function () {
      if (!history[habitName]) {
        history[habitName] = {};
      }
      history[habitName][today] = this.checked;

      const dateSql = formatDateForSql(today);

      const { error } = await supa
        .from("habit_history")
        .upsert(
          {
            habit_id: habitObj.id,
            date: dateSql,
            done: this.checked,
          },
          { onConflict: "habit_id,date" }
        );

      if (error) {
        console.error(error);
        alert("Fehler beim Speichern.");
      }

      loadHistoryTable();
    });

    const text = document.createTextNode(" " + habitName);

    // Löschen-Button
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "x";
    deleteBtn.addEventListener("click", async function () {
      const { error } = await supa
        .from("habits")
        .delete()
        .eq("id", habitObj.id);

      if (error) {
        console.error(error);
        alert("Fehler beim Löschen.");
        return;
      }

      habits = habits.filter(h => h.id !== habitObj.id);
      delete history[habitName];
      loadHabitList();
      loadHistoryTable();
    });

    li.appendChild(checkbox);
    li.appendChild(text);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

// ---------- 30-TAGES-TABELLE ----------
function loadHistoryTable() {
  const table = document.getElementById("historytable");
  table.className = "history-table";
  table.innerHTML = "";
  const days = getLast30Days();

  // Header
  let headerRow = "<tr><th>Gewohnheit</th>";
  days.forEach((day) => (headerRow += `<th>${day}</th>`));
  headerRow += "</tr>";
  table.innerHTML += headerRow;

  // Rows
  habits.forEach((habitObj) => {
    const habitName = habitObj.name;
    let row = `<tr><td>${habitName}</td>`;
    days.forEach((day) => {
      const done =
        history[habitName] && history[habitName][day] ? true : false;
      const display = done ? "✓" : "";
      row += `<td>${display}</td>`;
    });
    row += "</tr>";
    table.innerHTML += row;
  });
}

// ---------- HABIT HINZUFÜGEN ----------
const input = document.getElementById("habitinput");
const button = document.getElementById("addhabitbtn");

button.addEventListener("click", async function () {
  const newHabit = input.value.trim();
  if (!newHabit || !currentUser) return;

  if (habits.some(h => h.name === newHabit)) {
    alert("Diese Gewohnheit existiert bereits!");
    return;
  }

  const { data, error } = await supa
    .from("habits")
    .insert({ name: newHabit })
    .select()
    .single();

  if (error) {
    console.error(error);
    alert("Fehler beim Anlegen.");
    return;
  }

  habits.push(data);
  history[newHabit] = {};
  loadHabitList();
  loadHistoryTable();
  input.value = "";
});

// ---------- INITIAL (ohne Login keine Daten) ----------
loadHabitList();
loadHistoryTable();
