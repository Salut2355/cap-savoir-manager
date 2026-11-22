
"use strict";

const AttendanceManager = (() => {
  const storageKey = "cap-savoir-attendance-v1";

  function readRaw() {
    if (typeof DataRestoreRecovery !== "undefined") DataRestoreRecovery.assertReadable();
    try {
      return localStorage.getItem(storageKey);
    } catch (cause) {
      const error = new Error("Stockage des présences inaccessible.");
      error.code = "STORAGE_ACCESS";
      error.cause = cause;
      throw error;
    }
  }

  function readStored() {
    const raw = readRaw();
    if (raw === null) return { records: [], raw: null };

    if (raw.trim() === "") {
      const error = new Error("Les données de présence sont vides et invalides.");
      error.code = "STORAGE_EMPTY";
      throw error;
    }

    let records;
    try {
      records = JSON.parse(raw);
    } catch (cause) {
      const error = new Error("Les données de présence contiennent un JSON invalide.");
      error.code = "STORAGE_INVALID_JSON";
      error.cause = cause;
      throw error;
    }

    if (!Array.isArray(records)) {
      const error = new Error("Les données de présence ne sont pas une liste JSON.");
      error.code = "STORAGE_INVALID_ROOT";
      throw error;
    }

    return { records, raw };
  }

  function commit(records, expectedRaw) {
    const write = () => {
    if (!Array.isArray(records)) {
      throw new TypeError("Les données de présence doivent être une liste.");
    }

    if (readRaw() !== expectedRaw) {
      const error = new Error(
        "Les données de présence ont changé depuis leur lecture. Écriture annulée."
      );
      error.code = "STORAGE_CHANGED";
      throw error;
    }

    let serialized;
    try {
      serialized = JSON.stringify(records);
    } catch (cause) {
      const error = new Error("Impossible de préparer l'enregistrement des présences.");
      error.code = "STORAGE_SERIALIZATION";
      error.cause = cause;
      throw error;
    }

    try {
      localStorage.setItem(storageKey, serialized);
    } catch (cause) {
      const error = new Error("Impossible d'enregistrer les présences. L'écriture a échoué.");
      error.code = "STORAGE_WRITE";
      error.cause = cause;
      throw error;
    }

    let written;
    try {
      written = readRaw();
    } catch (cause) {
      const error = new Error(
        "Écriture effectuée, mais vérification impossible. L'état des données est incertain."
      );
      error.code = "STORAGE_WRITE_UNCERTAIN";
      error.cause = cause;
      throw error;
    }

    if (written !== serialized) {
      const error = new Error(
        "Écriture effectuée, mais la vérification a échoué. L'état des données est incertain."
      );
      error.code = "STORAGE_WRITE_UNCERTAIN";
      throw error;
    }
    };
    if (typeof DataRestoreRecovery !== "undefined") {
      return DataRestoreRecovery.withLock(write);
    }

    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      return navigator.locks.request("cap-savoir-data-write", write);
    }

    throw new Error(
      "Verrouillage indisponible. Écriture refusée pour protéger les données."
    );
  }

  let hasRenderedHistory = false;

  return {
  storageKey,

  getAll() {
    return readStored().records;
  },

  showStorageError(error) {
    const message = document.getElementById("attendance-message");
    if (message) {
      message.textContent =
        `Lecture ou écriture impossible : ${error.message} ` +
        (hasRenderedHistory
          ? "Les données affichées proviennent du dernier chargement réussi et peuvent ne plus être à jour."
          : "Aucune donnée n'a été déclarée vide.");
    }
  },

  getAllStudents() {
    if (typeof StudentManager === "undefined") {
      const error = new Error("Le module élèves est indisponible; les présences ne peuvent pas être enregistrées.");
      error.code = "STUDENT_MODULE_UNAVAILABLE";
      throw error;
    }
    return StudentManager.getAll();
  },

  getActiveStudents() {
    return this.getAllStudents().filter(student => !student.archived);
  },

  getTodayLocalDate() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Abidjan", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  },

  isScheduledGroupDay(group, dateValue) {
    const day = new Date(`${dateValue}T12:00:00`).getDay();
    const isG1 = ["G1", "Groupe 1"].includes(group);
    const isG2 = ["G2", "Groupe 2"].includes(group);
    const isG3 = ["G3", "Groupe 3"].includes(group);

    return isG1 ? [0, 3, 6].includes(day)

      : isG2 ? [1, 3, 5].includes(day)

      : isG3 && [6].includes(day);
  },

  init() {
    const section = document.getElementById("attendance-section");
    if (!section) return;

    section.innerHTML = `
      <div class="view-intro">
        <div><p class="eyebrow">SUIVI QUOTIDIEN</p><h2>Présences</h2><p>Choisissez une séance, faites l’appel, puis vérifiez avant l’enregistrement.</p></div>
      </div>

      <section class="surface attendance-workflow" aria-labelledby="attendance-session-heading">
        <div class="section-heading"><div><p class="eyebrow">ÉTAPE 1 · SÉANCE</p><h3 id="attendance-session-heading">Sélectionner le cours</h3></div></div>
        <div class="attendance-controls">
          <label for="attendance-date">Date de la séance<input type="date" id="attendance-date" required></label>
          <label for="attendance-group">Groupe<select id="attendance-group" required><option value="">Choisir un groupe</option></select></label>
          <label for="attendance-session-status">État de la séance<select id="attendance-session-status" required><option value="planned">Prévue</option><option value="completed">Réalisée</option><option value="cancelled">Annulée</option></select></label>
          <button type="button" id="load-attendance">Afficher les élèves</button>
        </div>
      </section>

      <p id="attendance-message" class="inline-message" role="status" aria-live="polite"></p>
      <section id="attendance-students" class="attendance-roster" aria-live="polite"></section>
      <button type="button" id="save-attendance" hidden>Enregistrer les présences</button>

      <section class="surface attendance-history">
        <div class="section-heading"><div><p class="eyebrow">CONSULTATION</p><h3>Historique des séances</h3></div></div>
        <div id="attendance-history-list"></div>
      </section>
    `;

    document.getElementById("attendance-date").value =
      this.getTodayLocalDate();

    this.populateGroups();

    document.getElementById("load-attendance")
      .addEventListener("click", () => this.loadStudents());

    document.getElementById("save-attendance")
      .addEventListener("click", () => this.save());

    this.renderHistory();
  },

  populateGroups() {
    const select = document.getElementById("attendance-group");
    if (!select) return;

    const previousValue = select.value;
    const groups = new Set();

    try {
      this.getAllStudents().forEach(student => {
        if (student.group) groups.add(student.group);
      });

      this.getAll().forEach(record => {
        if (record.group) groups.add(record.group);
      });
    } catch (error) {
      this.showStorageError(error);
      return;
    }

    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choisir un groupe";
    select.appendChild(placeholder);

    [...groups].sort((a, b) => a.localeCompare(b, "fr"))
      .forEach(group => {
        const option = document.createElement("option");
        option.value = group;
        option.textContent = group;
        select.appendChild(option);
      });

    if (groups.has(previousValue)) select.value = previousValue;
  },

  loadStudents() {
    const date = document.getElementById("attendance-date").value;
    const group = document.getElementById("attendance-group").value;
    const container = document.getElementById("attendance-students");
    const message = document.getElementById("attendance-message");
    const saveButton = document.getElementById("save-attendance");

    if (!date || !group) {
      message.textContent = "Choisis une date et un groupe.";
      saveButton.disabled = true;
      return;
    }

    if (!this.isScheduledGroupDay(group, date)) {
      message.textContent = "Cette date ne correspond pas aux jours prévus pour le groupe sélectionné.";
      saveButton.disabled = true;
      return;
    }

    let existing;
    let allStudents;
    try {
      existing = this.getAll().find(
        record => record.date === date && record.group === group
      );
      allStudents = this.getAllStudents();
    } catch (error) {
      saveButton.disabled = true;
      this.showStorageError(error);
      return;
    }

    container.replaceChildren();
    const attendanceStatus = document.getElementById("attendance-session-status");
    attendanceStatus.value = existing?.sessionStatus || "completed";
    saveButton.hidden = false;
    saveButton.disabled = false;
    message.textContent = "";

    const activeStudents = allStudents.filter(
      student => !student.archived && student.group === group
    );

    const existingEntries = existing?.entries || [];

    // Inclure les élèves actifs et ceux déjà inscrits dans cette séance.
    const studentsById = new Map();

    activeStudents.forEach(student => {
      studentsById.set(student.id, {
        id: student.id,
        name: student.name,
        archived: false
      });
    });

    existingEntries.forEach(entry => {
      if (!studentsById.has(entry.studentId)) {
        const current = allStudents.find(
          student => student.id === entry.studentId
        );

        studentsById.set(entry.studentId, {
          id: entry.studentId,
          name: entry.studentName || current?.name || "Élève inconnu",
          archived: !current || Boolean(current.archived) ||
            current.group !== group
        });
      }
    });

    const students = [...studentsById.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    if (students.length === 0 && attendanceStatus.value === "completed") {
      message.textContent = "Aucun élève dans ce groupe.";
      saveButton.disabled = true;
      return;
    }

    students.forEach(student => {
      const previous = existingEntries.find(
        entry => entry.studentId === student.id
      );

      const card = document.createElement("div");
      card.className = "attendance-student";

      const name = document.createElement("strong");
      name.textContent = student.name +
        (student.archived ? " (ancien élève)" : "");

      const status = document.createElement("select");
      status.className = "attendance-status";
      status.dataset.studentId = student.id;
      status.required = true;

      [
        ["", "Choisir un statut"],
        ["present", "Présent"],
        ["absent", "Absent"],
        ["late", "Retard"],
        ["excused", "Excusé"]
      ].forEach(([value, label]) => {
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

    message.textContent = existing
      ? "Séance existante chargée. Les anciens élèves sont conservés."
      : `${students.length} élève(s) chargé(s).`;
  },

  async save() {
    const date = document.getElementById("attendance-date").value;
    const group = document.getElementById("attendance-group").value;
    const sessionStatus = document.getElementById("attendance-session-status")?.value || "completed";
    const message = document.getElementById("attendance-message");

    if (!date || !group) {
      message.textContent = "Choisis une date et un groupe.";
      return;
    }

    if (!this.isScheduledGroupDay(group, date)) {
      message.textContent = "Enregistrement bloqué : cette date ne correspond pas aux jours prévus pour le groupe.";
      return;
    }

    const statuses = [
      ...document.querySelectorAll(".attendance-status")
    ];

    const reasons = [
      ...document.querySelectorAll(".attendance-reason")
    ];

    if (!sessionStatus) {
      message.textContent = "Choisis l'état de la séance.";
      return;
    }

    if (sessionStatus === "completed" && (!statuses.length || statuses.some(input => !input.value))) {
      message.textContent = "Choisis un statut pour chaque élève.";
      return;
    }

    let allStudents;
    let state;
    try {
      allStudents = this.getAllStudents();
      state = readStored();
    } catch (error) {
      console.error("Erreur de lecture avant l'enregistrement :", error);
      this.showStorageError(error);
      const saveButton = document.getElementById("save-attendance");
      if (saveButton) saveButton.disabled = true;
      return;
    }

    const records = state.records;

    const index = records.findIndex(
      record => record.date === date && record.group === group
    );

    const previousEntries = index >= 0
      ? records[index].entries || []
      : [];

    // Conserver toutes les anciennes entrées, même si l'élève
    // est désormais archivé ou appartient à un autre groupe.
    const entriesById = new Map(
      previousEntries.map(entry => [entry.studentId, { ...entry }])
    );

    statuses.forEach(input => {
      const studentId = input.dataset.studentId;

      const student = allStudents.find(
        item => item.id === studentId
      );

      const reasonInput = reasons.find(
        item => item.dataset.studentId === studentId
      );

      const previous = entriesById.get(studentId);

      entriesById.set(studentId, {
        studentId,
        studentName: student?.name ||
          previous?.studentName || "Élève inconnu",
        status: input.value,
        reason: reasonInput?.value || ""
      });
    });

    const now = new Date().toISOString();

    const record = {
      id: index >= 0 ? records[index].id : crypto.randomUUID(),
      date,
      group,
      sessionStatus,
      // Les changements d'état ne détruisent jamais les entrées historiques.
      entries: sessionStatus === "completed"
        ? [...entriesById.values()]
        : (index >= 0 ? [...previousEntries] : []),
      createdAt: index >= 0 ? records[index].createdAt : now,
      updatedAt: now,
      revisions: index >= 0 ? [...(records[index].revisions || [])] : []
    };

    if (index >= 0) {
      const previous = records[index];
      const changed = (previous.sessionStatus || "completed") !== sessionStatus ||
        JSON.stringify(previous.entries || []) !== JSON.stringify(record.entries);
      if (changed) {
        record.revisions.push({
          changedAt: now,
          sessionStatus: previous.sessionStatus || "completed",
          entries: (previous.entries || []).map(entry => ({ ...entry }))
        });
      }
      records[index] = record;
    } else {
      records.push(record);
    }

    try {
      await commit(records, state.raw);
      message.textContent = sessionStatus === "completed"
        ? "Présences enregistrées avec succès."
        : "État de la séance enregistré avec succès.";
      this.renderHistory();
    } catch (error) {
      console.error("Erreur d'enregistrement :", error);
      message.textContent = error.message;
    }
  },

  renderHistory() {
    const container = document.getElementById("attendance-history-list");
    if (!container) return;

    let records;
    try {
      records = this.getAll().sort(
        (a, b) => b.date.localeCompare(a.date)
      );
    } catch (error) {
      if (!hasRenderedHistory) {
        container.textContent = "Historique des présences indisponible.";
      }
      this.showStorageError(error);
      return;
    }

    if (!records.length) {
      container.replaceChildren();
      container.textContent = "Aucune séance enregistrée.";
      hasRenderedHistory = true;
      return;
    }

    container.replaceChildren();
    records.forEach(record => {
      const item = document.createElement("div");
      item.className = "attendance-history-item";

      const title = document.createElement("strong");
      title.textContent =
        `${record.group} — ${new Date(record.date + "T12:00:00Z")
          .toLocaleDateString("fr-FR", { timeZone: "Africa/Abidjan" })}`;

      const summary = document.createElement("p");

      const counts = {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0
      };

      (record.entries || []).forEach(entry => {
        if (counts[entry.status] !== undefined) {
          counts[entry.status]++;
        }
      });

      summary.textContent =
        (record.sessionStatus && record.sessionStatus !== "completed")
          ? `Séance ${record.sessionStatus === "planned" ? "prévue" : "annulée"} — aucune statistique de présence.`
          : `Présents : ${counts.present} | Absents : ${counts.absent} | ` +
            `Retards : ${counts.late} | Excusés : ${counts.excused}`;

      const details = document.createElement("button");
      details.type = "button";
      details.textContent = "Voir le détail";

      details.addEventListener("click", () => {
        const lines = (record.entries || []).map(entry => {
          const labels = {
            present: "Présent",
            absent: "Absent",
            late: "Retard",
            excused: "Excusé"
          };

          return `${entry.studentName} : ${labels[entry.status] || entry.status}` +
            (entry.reason ? ` — Motif : ${entry.reason}` : "");
        });

        this.showHistoryDialog(`${record.group} · ${record.date}`, lines);
      });

      item.append(title, summary, details);
      if (record.revisions?.length) {
        const revisions = document.createElement("button");
        revisions.type = "button";
        revisions.textContent = `Corrections (${record.revisions.length})`;
        revisions.addEventListener("click", () => {
          const history = record.revisions.map((revision, index) =>
            `${index + 1}. ${new Date(revision.changedAt).toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })} — état précédent : ${revision.sessionStatus}`
          );
          this.showHistoryDialog(`Corrections · ${record.group} · ${record.date}`, history);
        });
        item.appendChild(revisions);
      }
      container.appendChild(item);
    });
    hasRenderedHistory = true;
  },

  showHistoryDialog(titleText, lines) {
    document.getElementById("attendance-details-dialog")?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "attendance-details-dialog";
    const title = document.createElement("h2");
    title.textContent = titleText;
    dialog.appendChild(title);
    const closeTop = document.createElement("button");
    closeTop.type = "button";
    closeTop.className = "dialog-close";
    closeTop.setAttribute("aria-label", "Fermer le détail");
    closeTop.textContent = "Fermer";
    closeTop.addEventListener("click", () => dialog.close());
    dialog.appendChild(closeTop);
    if (lines.length) {
      const list = document.createElement("ul");
      lines.forEach(text => {
        const item = document.createElement("li");
        item.textContent = text;
        list.appendChild(item);
      });
      dialog.appendChild(list);
    } else {
      const empty = document.createElement("p");
      empty.textContent = "Aucun détail enregistré pour cette séance.";
      dialog.appendChild(empty);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "button button-primary";
    close.textContent = "Fermer";
    close.addEventListener("click", () => dialog.close());
    dialog.appendChild(close);
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
  }
  };
})();
