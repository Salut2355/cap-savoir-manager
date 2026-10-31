
"use strict";

const AttendanceManager = {
  storageKey: "cap-savoir-attendance-v1",

  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey)) || [];
    } catch (error) {
      console.error("Erreur de lecture des présences :", error);
      return [];
    }
  },

  saveAll(records) {
    localStorage.setItem(this.storageKey, JSON.stringify(records));
  },

  getActiveStudents() {
    if (typeof StudentManager === "undefined") return [];
    return StudentManager.getAll().filter(student => !student.archived);
  },

  init() {
    const section = document.getElementById("attendance-section");
    if (!section) return;

    section.innerHTML = `
      <h2>Suivi des présences</h2>

      <div class="attendance-controls">
        <label for="attendance-date">Date de la séance</label>
        <input type="date" id="attendance-date" required>

        <label for="attendance-group">Groupe</label>
        <select id="attendance-group" required>
          <option value="">Choisir un groupe</option>
        </select>

        <button type="button" id="load-attendance">
          Afficher les élèves
        </button>
      </div>

      <p id="attendance-message" role="status"></p>

      <div id="attendance-students"></div>

      <button type="button" id="save-attendance" hidden>
        Enregistrer les présences
      </button>

      <div class="attendance-history">
        <h3>Historique des séances</h3>
        <div id="attendance-history-list"></div>
      </div>
    `;

    const dateInput = document.getElementById("attendance-date");
    dateInput.value = new Date().toLocaleDateString("en-CA");

    const groups = [...new Set(
      this.getActiveStudents().map(student => student.group)
    )].sort();

    const groupSelect = document.getElementById("attendance-group");

    groups.forEach(group => {
      const option = document.createElement("option");
      option.value = group;
      option.textContent = group;
      groupSelect.appendChild(option);
    });

    document.getElementById("load-attendance")
      .addEventListener("click", () => this.loadStudents());

    document.getElementById("save-attendance")
      .addEventListener("click", () => this.save());

    this.renderHistory();
  },

  loadStudents() {
    const date = document.getElementById("attendance-date").value;
    const group = document.getElementById("attendance-group").value;
    const container = document.getElementById("attendance-students");
    const message = document.getElementById("attendance-message");
    const saveButton = document.getElementById("save-attendance");

    container.replaceChildren();
    saveButton.hidden = true;
    message.textContent = "";

    if (!date || !group) {
      message.textContent = "Choisis une date et un groupe.";
      return;
    }

    const students = this.getActiveStudents()
      .filter(student => student.group === group)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    if (students.length === 0) {
      message.textContent = "Aucun élève actif dans ce groupe.";
      return;
    }

    const existing = this.getAll().find(
      record => record.date === date && record.group === group
    );

    students.forEach(student => {
      const previous = existing?.entries.find(
        entry => entry.studentId === student.id
      );

      const card = document.createElement("div");
      card.className = "attendance-student";

      const name = document.createElement("strong");
      name.textContent = student.name;

      const status = document.createElement("select");
      status.className = "attendance-status";
      status.dataset.studentId = student.id;
      status.required = true;

      const choices = [
        ["", "Choisir un statut"],
        ["present", "Présent"],
        ["absent", "Absent"],
        ["late", "Retard"],
        ["excused", "Excusé"]
      ];

      choices.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        status.appendChild(option);
      });

      status.value = previous?.status || "";

      const reason = document.createElement("select");
      reason.className = "attendance-reason";
      reason.dataset.studentId = student.id;

      [
        ["", "Motif facultatif"],
        ["illness", "Maladie"],
        ["travel", "Voyage"],
        ["family", "Raison familiale"],
        ["appointment", "Rendez-vous"],
        ["other", "Autre"],
        ["undisclosed", "Non communiqué"]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        reason.appendChild(option);
      });

      reason.value = previous?.reason || "";

      const reasonLabel = document.createElement("label");
      reasonLabel.textContent = "Motif (facultatif)";
      reasonLabel.appendChild(reason);

      card.append(name, status, reasonLabel);
      container.appendChild(card);
    });

    saveButton.hidden = false;
    message.textContent = existing
      ? "Séance déjà enregistrée : tu peux modifier les statuts."
      : `${students.length} élève(s) chargé(s).`;
  },

  save() {
    const date = document.getElementById("attendance-date").value;
    const group = document.getElementById("attendance-group").value;
    const message = document.getElementById("attendance-message");

    const statuses = [
      ...document.querySelectorAll(".attendance-status")
    ];

    if (!statuses.length || statuses.some(input => !input.value)) {
      message.textContent = "Choisis un statut pour chaque élève.";
      return;
    }

    const entries = statuses.map(input => {
      const reasonInput = [...document.querySelectorAll(".attendance-reason")]
        .find(item => item.dataset.studentId === input.dataset.studentId);

      const student = this.getActiveStudents().find(
        item => item.id === input.dataset.studentId
      );

      return {
        studentId: input.dataset.studentId,
        studentName: student?.name || "Élève archivé",
        status: input.value,
        reason: reasonInput?.value || ""
      };
    });

    const records = this.getAll();
    const index = records.findIndex(
      record => record.date === date && record.group === group
    );

    const now = new Date().toISOString();

    const record = {
      id: index >= 0 ? records[index].id : crypto.randomUUID(),
      date,
      group,
      entries,
      createdAt: index >= 0 ? records[index].createdAt : now,
      updatedAt: now
    };

    if (index >= 0) {
      records[index] = record;
    } else {
      records.push(record);
    }

    try {
      this.saveAll(records);
      message.textContent = "Présences enregistrées avec succès.";
      this.renderHistory();
    } catch (error) {
      console.error(error);
      message.textContent = "Erreur : impossible d'enregistrer les présences.";
    }
  },

  renderHistory() {
    const container = document.getElementById("attendance-history-list");
    if (!container) return;

    container.replaceChildren();

    const records = this.getAll().sort(
      (a, b) => b.date.localeCompare(a.date)
    );

    if (!records.length) {
      container.textContent = "Aucune séance enregistrée.";
      return;
    }

    records.forEach(record => {
      const item = document.createElement("div");
      item.className = "attendance-history-item";

      const title = document.createElement("strong");
      title.textContent =
        `${record.group} — ${new Date(record.date + "T12:00:00")
          .toLocaleDateString("fr-FR")}`;

      const summary = document.createElement("p");
      const counts = {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0
      };

      record.entries.forEach(entry => {
        if (counts[entry.status] !== undefined) {
          counts[entry.status]++;
        }
      });

      summary.textContent =
        `Présents : ${counts.present} | Absents : ${counts.absent} | ` +
        `Retards : ${counts.late} | Excusés : ${counts.excused}`;

      const details = document.createElement("button");
      details.type = "button";
      details.textContent = "Voir le détail";
      details.addEventListener("click", () => {
        const lines = record.entries.map(entry =>
          `${entry.studentName} : ${({
            present: "Présent",
            absent: "Absent",
            late: "Retard",
            excused: "Excusé"
          })[entry.status] || entry.status}` +
          (entry.reason ? ` — Motif : ${entry.reason}` : "")
        );

        alert(`${record.group} — ${record.date}\n\n${lines.join("\n")}`);
      });

      item.append(title, summary, details);
      container.appendChild(item);
    });
  }
};

document.addEventListener("DOMContentLoaded", () => {
  AttendanceManager.init();
});
