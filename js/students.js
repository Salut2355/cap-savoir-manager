
"use strict";

// Gestion des fiches élèves de CAP SAVOIR
const StudentManager = (() => {
  const storageKey = "cap-savoir-students-v1";

  function readRaw() {
    if (typeof DataRestoreRecovery !== "undefined") DataRestoreRecovery.assertReadable();
    try {
      return localStorage.getItem(storageKey);
    } catch (cause) {
      const error = new Error("Stockage des élèves inaccessible.");
      error.code = "STORAGE_ACCESS";
      error.cause = cause;
      throw error;
    }
  }

  function readStored() {
    const raw = readRaw();
    if (raw === null) return { records: [], raw: null };

    if (raw.trim() === "") {
      const error = new Error("Les données des élèves sont vides et invalides.");
      error.code = "STORAGE_EMPTY";
      throw error;
    }

    let records;
    try {
      records = JSON.parse(raw);
    } catch (cause) {
      const error = new Error("Les données des élèves contiennent un JSON invalide.");
      error.code = "STORAGE_INVALID_JSON";
      error.cause = cause;
      throw error;
    }

    if (!Array.isArray(records)) {
      const error = new Error("Les données des élèves ne sont pas une liste JSON.");
      error.code = "STORAGE_INVALID_ROOT";
      throw error;
    }

    return { records, raw };
  }


  function commit(records, expectedRaw) {
    const write = () => {
      if (!Array.isArray(records)) {
        throw new TypeError("Les données des élèves doivent être une liste.");
      }

      if (readRaw() !== expectedRaw) {
        const error = new Error(
          "Les données des élèves ont changé depuis leur lecture. Écriture annulée."
        );
        error.code = "STORAGE_CHANGED";
        throw error;
      }

      let serialized;
      try {
        serialized = JSON.stringify(records);
      } catch (cause) {
        const error = new Error("Impossible de préparer l'enregistrement des élèves.");
        error.code = "STORAGE_SERIALIZATION";
        error.cause = cause;
        throw error;
      }

      try {
        localStorage.setItem(storageKey, serialized);
      } catch (cause) {
        const error = new Error("Impossible d'enregistrer les élèves. L'écriture a échoué.");
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

    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      return navigator.locks.request("cap-savoir-data-write", write);
    }

    throw new Error(
      "Verrouillage indisponible. Écriture refusée pour protéger les données."
    );
  }


  let hasRenderedStudents = false;

  return {
  storageKey,
  editingId: null,

  getAll() {
    return readStored().records;
  },

  showStorageError(error) {
    const message = document.getElementById("student-message");
    if (message) {
      message.textContent =
        `Lecture ou écriture impossible : ${error.message} ` +
        (hasRenderedStudents
          ? "Les données affichées proviennent du dernier chargement réussi et peuvent ne plus être à jour."
          : "Aucune donnée n'a été déclarée vide.");
    }
  },

  async add(student) {
    const state = readStored();
    const students = state.records;

    students.push({
      id: crypto.randomUUID(),
      name: student.name.trim(),
      level: student.level,
      parent: student.parent.trim(),
      phone: student.phone.trim(),
      group: student.group,
      startDate: student.startDate,
      createdAt: new Date().toISOString(),
      levelHistory: [{ level: student.level, effectiveFrom: student.startDate }],
      billingHistoryVerified: true,
      archived: false,
      archivedAt: null,
      registrationExempted: Boolean(student.registrationExempted)
    });

    await commit(students, state.raw);
  },

  async update(id, data) {
    const state = readStored();
    const students = state.records;
    const index = students.findIndex(student => student.id === id);

    if (index === -1) return false;

    const current = students[index];
    const levelHistory = Array.isArray(current.levelHistory)
      ? [...current.levelHistory]
      : [{ level: current.level, effectiveFrom: current.startDate }];
    const todayParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Abidjan", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    const effectiveFrom = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
    if (data.level !== current.level && !levelHistory.some(entry => entry.effectiveFrom === effectiveFrom && entry.level === data.level)) {
      levelHistory.push({ level: data.level, effectiveFrom });
    }

    students[index] = {
      ...students[index],
      name: data.name.trim(),
      level: data.level,
      levelHistory,
      parent: data.parent.trim(),
      phone: data.phone.trim(),
      group: data.group,
      startDate: current.startDate,
      registrationExempted: Boolean(current.registrationExempted)
    };

    await commit(students, state.raw);
    return true;
  },

  async setArchived(id, archived) {
    const state = readStored();
    const students = state.records;
    const student = students.find(item => item.id === id);

    if (!student) return;

    student.archived = archived;
    student.archivedAt = archived
      ? new Date().toISOString()
      : null;

    await commit(students, state.raw);
  },

  resetForm() {
    const form = document.getElementById("student-form");
    const button = form?.querySelector('button[type="submit"]');

    if (form) form.reset();
    if (form?.elements.startDate) form.elements.startDate.readOnly = false;
    if (form?.elements.registrationExempted) form.elements.registrationExempted.disabled = false;

    this.editingId = null;

    const formPanel = document.getElementById("student-form-panel");
    if (formPanel) formPanel.open = false;

    if (button) {
      button.textContent = "Enregistrer l'élève";
    }
  },

  render() {
    const list = document.getElementById("student-list");
    const count = document.getElementById("student-count");

    if (!list || !count) return;

    let students;
    try {
      students = this.getAll();
    } catch (error) {
      if (!hasRenderedStudents) {
        list.textContent = "Données des élèves indisponibles.";
        count.textContent = "Données indisponibles";
      }
      this.showStorageError(error);
      return;
    }
    const active = students.filter(s => !s.archived);
    const archived = students.filter(s => s.archived);
    const query = (document.getElementById("student-search")?.value || "").trim().toLocaleLowerCase("fr");
    const level = document.getElementById("student-filter-level")?.value || "";
    const group = document.getElementById("student-filter-group")?.value || "";
    const status = document.getElementById("student-filter-status")?.value || "active";
    const matches = student => {
      const searchable = [student.name, student.parent, student.phone, student.level, student.group]
        .filter(Boolean).join(" ").toLocaleLowerCase("fr");
      return (!query || searchable.includes(query)) && (!level || student.level === level) &&
        (!group || student.group === group) &&
        (status === "all" || (status === "archived" ? Boolean(student.archived) : !student.archived));
    };
    const visible = students.filter(matches);

    count.textContent = `${active.length} actif(s) · ${archived.length} archivé(s) · affichage ${visible.length}/${students.length}`;

    list.replaceChildren();

    if (visible.length === 0) {
      list.textContent = students.length ? "Aucun élève ne correspond à ces critères." : "Aucun élève enregistré.";
      list.classList.add("empty-state");
      hasRenderedStudents = true;
      return;
    }
    list.classList.remove("empty-state");

    const createSection = (title, items, isArchived) => {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = title;
      section.appendChild(heading);

      if (items.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "Aucun élève dans cette catégorie.";
        section.appendChild(empty);
      }

      items.forEach(student => {
        const card = document.createElement("article");
        card.className = "student-card";

       const name = document.createElement("button");
name.type = "button";
name.className = "student-name-button";
name.textContent = student.name;
name.dataset.action = "view";
name.dataset.id = student.id;

        const details = document.createElement("p");
        details.textContent =
          `${student.level} • ${student.group} • Début : ${student.startDate}`;

        const enrollment = document.createElement("p");
        enrollment.textContent = student.registrationExempted
          ? "Inscription : exonérée"
          : "Inscription : 2 000 FCFA";

        const parent = document.createElement("p");
        parent.textContent =
          `Responsable : ${student.parent || "Non renseigné"}`;

        const phone = document.createElement("p");
        phone.textContent =
          `Téléphone : ${student.phone || "Non renseigné"}`;

        const status = document.createElement("p");
        status.className = isArchived ? "student-status archived" : "student-status";
        status.textContent = isArchived
          ? "Statut : Archivé"
          : "Statut : Actif";

        const actions = document.createElement("div");
        actions.className = "student-actions";

        if (!isArchived) {
          const editButton = document.createElement("button");
          editButton.type = "button";
          editButton.textContent = "Modifier";
          editButton.dataset.action = "edit";
          editButton.dataset.id = student.id;
          actions.appendChild(editButton);

          const archiveButton = document.createElement("button");
          archiveButton.type = "button";
          archiveButton.textContent = "Archiver";
          archiveButton.dataset.action = "archive";
          archiveButton.dataset.id = student.id;
          actions.appendChild(archiveButton);
        } else {
          const restoreButton = document.createElement("button");
          restoreButton.type = "button";
          restoreButton.textContent = "Restaurer";
          restoreButton.dataset.action = "restore";
          restoreButton.dataset.id = student.id;
          actions.appendChild(restoreButton);
        }

        card.append(name, details, enrollment, parent, phone, status, actions);
        section.appendChild(card);
      });

      list.appendChild(section);
    };

    if (status !== "archived") createSection("Élèves actifs", visible.filter(student => !student.archived), false);
    if (status !== "active") createSection("Élèves archivés", visible.filter(student => student.archived), true);
    hasRenderedStudents = true;
  },
showDetails(id) {
  const student = this.getAll().find(item => item.id === id);
  if (!student) return;

  const oldDialog = document.getElementById("student-details-dialog");
  if (oldDialog) oldDialog.remove();

  const dialog = document.createElement("dialog");
  dialog.id = "student-details-dialog";

  const title = document.createElement("h2");
  title.textContent = "Fiche individuelle";
  title.className = "dialog-title";
  const closeTop = document.createElement("button");
  closeTop.type = "button";
  closeTop.className = "dialog-close";
  closeTop.setAttribute("aria-label", "Fermer la fiche");
  closeTop.textContent = "Fermer";
  closeTop.addEventListener("click", () => dialog.close());

  const fields = [
    ["Nom complet", student.name],
    ["Niveau scolaire", student.level],
    ["Groupe", student.group],
    ["Date de début", student.startDate],
    ["Frais d'inscription", student.registrationExempted ? "Exonérés" : "2 000 FCFA"],
    ["Parent / responsable", student.parent || "Non renseigné"],
    ["Téléphone", student.phone || "Non renseigné"],
    ["Statut", student.archived ? "Archivé" : "Actif"],
    [
      "Date de création",
      student.createdAt
        ? new Date(student.createdAt).toLocaleDateString("fr-FR", { timeZone: "Africa/Abidjan" })
        : "Non renseignée"
    ]
  ];

  dialog.append(title, closeTop);

  fields.forEach(([label, value]) => {
    const line = document.createElement("p");
    line.textContent = `${label} : ${value}`;
    dialog.appendChild(line);
  });

  const levelTitle = document.createElement("h3");
  levelTitle.textContent = "Historique des niveaux";
  dialog.appendChild(levelTitle);
  const levelHistory = Array.isArray(student.levelHistory) ? [...student.levelHistory].sort((a, b) => String(a.effectiveFrom || "").localeCompare(String(b.effectiveFrom || ""))) : [];
  if (levelHistory.length) {
    levelHistory.forEach(change => {
      const line = document.createElement("p");
      line.textContent = `${change.level || "Niveau non renseigné"} — à partir du ${change.effectiveFrom || "date non renseignée"}`;
      dialog.appendChild(line);
    });
  } else {
    const line = document.createElement("p");
    line.textContent = "Aucun historique de changement de niveau enregistré.";
    dialog.appendChild(line);
  }

  const attendanceTitle = document.createElement("h3");
  attendanceTitle.textContent = "Historique des présences";
  dialog.appendChild(attendanceTitle);

  const attendance = AttendanceManager.getAll();
  const sessions = attendance.filter(record =>
    (record.sessionStatus || "completed") === "completed" &&
    (record.entries || []).some(entry => entry.studentId === student.id)
  );
  const presenceCounts = { present: 0, absent: 0, late: 0, excused: 0 };
  sessions.forEach(record => record.entries.forEach(entry => {
    if (presenceCounts[entry.status] !== undefined) presenceCounts[entry.status]++;
  }));
  const attendanceLine = document.createElement("p");
  attendanceLine.textContent = sessions.length
    ? `Séances réalisées : ${sessions.length} — présents ${presenceCounts.present}, absents ${presenceCounts.absent}, retards ${presenceCounts.late}, excusés ${presenceCounts.excused}.`
    : "Présences : Non disponible (aucune séance réalisée enregistrée).";
  dialog.appendChild(attendanceLine);
  sessions.slice(-5).reverse().forEach(record => {
    const entry = (record.entries || []).find(item => item.studentId === student.id);
    if (!entry) return;
    const line = document.createElement("p");
    line.textContent = `${record.date} · ${record.group} · ${entry.status}${entry.reason ? ` · ${entry.reason}` : ""}`;
    dialog.appendChild(line);
  });

  const ledger = OperationsManager.getAll();
  const payments = ledger.payments.filter(item => item.studentId === student.id);
  const refunds = ledger.refunds.filter(item => item.studentId === student.id);
  const totalPaid = payments.reduce((sum, item) => sum + item.amount, 0);
  const totalRefunded = refunds.reduce((sum, item) => sum + item.amount, 0);
  const paymentTitle = document.createElement("h3");
  paymentTitle.textContent = "Historique des paiements";
  dialog.appendChild(paymentTitle);
  const paymentLine = document.createElement("p");
  paymentLine.textContent = payments.length
    ? `Paiements enregistrés : ${totalPaid.toLocaleString("fr-FR")} FCFA · remboursements : ${totalRefunded.toLocaleString("fr-FR")} FCFA.`
    : "Aucun paiement enregistré.";
  dialog.appendChild(paymentLine);
  [...payments].sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach(payment => {
    const line = document.createElement("p");
    line.textContent = `${payment.date} · ${payment.amount.toLocaleString("fr-FR")} FCFA · ${payment.method || "moyen non renseigné"}${payment.reference ? ` · réf. ${payment.reference}` : ""}${payment.paperReceipt ? ` · reçu papier ${payment.paperReceipt}` : ""}`;
    dialog.appendChild(line);
  });

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Fermer";
  closeButton.addEventListener("click", () => dialog.close());

  dialog.appendChild(closeButton);
  document.body.appendChild(dialog);

  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
},
  edit(id) {
    const student = this.getAll().find(item => item.id === id);
    if (!student || student.archived) return;

    const panel = document.getElementById("student-form-panel");
    if (panel) panel.open = true;
    const form = document.getElementById("student-form");
    if (!form) return;

    form.elements.name.value = student.name;
    form.elements.level.value = student.level;
    form.elements.parent.value = student.parent;
    form.elements.phone.value = student.phone;
    form.elements.group.value = student.group;
    form.elements.startDate.value = student.startDate;
    form.elements.startDate.readOnly = true;
    form.elements.registrationExempted.checked =
      Boolean(student.registrationExempted);
    form.elements.registrationExempted.disabled = true;
    document.getElementById("student-name")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("student-name")?.focus({ preventScroll: true });

    this.editingId = id;

    const button = form.querySelector('button[type="submit"]');
    if (button) button.textContent = "Enregistrer les modifications";

    document.getElementById("student-message").textContent =
      `Modification de la fiche de ${student.name}.`;

    form.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  exportBackup() {
  const backup = {
    application: "CAP SAVOIR MANAGER",
    version: 4,
    exportedAt: new Date().toISOString(),
    students: this.getAll(),
    attendance: AttendanceManager.getAll(),
    operations: OperationsManager.getAll()
  };

  const content = JSON.stringify(backup, null, 2);

  this.downloadFile(
    content,
    `cap-savoir-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`,
    "application/json"
  );
},

  exportCSV() {
    const students = this.getAll();

    const columns = [
      "Nom complet",
      "Niveau",
      "Parent",
      "Téléphone",
      "Groupe",
      "Date de début",
      "Statut",
      "Date de création"
    ];

    const escapeCSV = value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = students.map(student => [
      student.name,
      student.level,
      student.parent,
      student.phone,
      student.group,
      student.startDate,
      student.archived ? "Archivé" : "Actif",
      student.createdAt || ""
    ]);

    const csv = [
      columns,
      ...rows
    ].map(row => row.map(escapeCSV).join(";")).join("\r\n");

    this.downloadFile(
      "\uFEFF" + csv,
      `cap-savoir-eleves-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv;charset=utf-8"
    );
  },

  downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  },

async restoreBackup(file) {
  try {
    const backup = JSON.parse(await file.text());
    const imported = OperationsManager.validateBackup(backup);
    const current = OperationsManager.captureRestoreSnapshot();

    const preRestoreBackup = {
      application: "CAP SAVOIR MANAGER",
      version: 4,
      exportedAt: new Date().toISOString(),
      students: current.students,
      attendance: current.attendance,
      operations: current.operations
    };

    const preRestoreContent = JSON.stringify(preRestoreBackup, null, 2);
    const checked = OperationsManager.validateBackup(
      JSON.parse(preRestoreContent)
    );

    if (
      JSON.stringify(checked.students) !== JSON.stringify(current.students) ||
      JSON.stringify(checked.attendance) !== JSON.stringify(current.attendance) ||
      JSON.stringify(checked.operations) !== JSON.stringify(current.operations)
    ) {
      throw new Error(
        "La sauvegarde préalable complète n'a pas passé la vérification."
      );
    }

    this.downloadFile(
      preRestoreContent,
      `cap-savoir-avant-restauration-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json"
    );

    const retained = confirm(
      "La sauvegarde préalable complète (élèves, présences et opérations) " +
      "a été préparée, vérifiée et son téléchargement a été déclenché. " +
      "L'application ne peut pas vérifier que le fichier a été conservé " +
      "sur votre appareil. Confirmez que vous l'avez retrouvé et conservé."
    );

    if (!retained) return;

    const confirmed = confirm(
      `La sauvegarde contient ${imported.students.length} élève(s), ` +
      `${imported.attendance.length} séance(s), ` +
      `${imported.operations.payments.length} paiement(s), ` +
      `${imported.operations.expenses.length} dépense(s) et ` +
      `${imported.operations.prospects.length} prospect(s).\n\n` +
      "La restauration remplacera les trois registres locaux. Confirmez-vous ?"
    );

    if (!confirmed) return;

    await OperationsManager.restoreAll(backup, current.raw);

    this.resetForm();
    this.render();
    AttendanceManager.renderHistory();
    OperationsManager.refresh();

    const message = document.getElementById("student-message");

    if (message) {
      message.className = "";
      message.textContent =
        "Restauration complète vérifiée : élèves, présences et opérations.";
    }
  } catch (error) {
    console.error("Erreur de restauration :", error);

    const message = document.getElementById("student-message");
    if (!message) return;

    message.className = "message-error";

    if (
      error.code === "RESTORE_PARTIAL" ||
      error.code === "RESTORE_ROLLED_BACK"
    ) {
      message.textContent = error.message;
    } else if (error.code && error.code.startsWith("STORAGE_")) {
      this.showStorageError(error);
    } else {
      message.textContent = `Restauration impossible : ${error.message}`;
    }
  }
},
  init() {
    const form = document.getElementById("student-form");
    const message = document.getElementById("student-message");
    const list = document.getElementById("student-list");
const exportButton = document.getElementById("export-backup");
const csvButton = document.getElementById("export-csv");
const restoreInput = document.getElementById("restore-backup");

exportButton?.addEventListener("click", () => {
  try {
    this.exportBackup();
  } catch (error) {
    this.showStorageError(error);
  }
});

csvButton?.addEventListener("click", () => {
  try {
    this.exportCSV();
  } catch (error) {
    this.showStorageError(error);
  }
});

restoreInput?.addEventListener("change", async () => {
  const file = restoreInput.files[0];

  if (file) {
    await this.restoreBackup(file);
  }

  restoreInput.value = "";
});
    if (!form || !list) return;

    document.getElementById("student-search")?.addEventListener("input", () => this.render());
    ["student-filter-level", "student-filter-group", "student-filter-status"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", () => this.render());
    });

    this.render();

    form.addEventListener("submit", async event => {
      event.preventDefault();

      if (!form.reportValidity()) return;

      const formData = new FormData(form);

      const data = {
        name: formData.get("name"),
        level: formData.get("level"),
        parent: formData.get("parent") || "",
        phone: formData.get("phone") || "",
        group: formData.get("group"),
        startDate: formData.get("startDate"),
        registrationExempted: formData.get("registrationExempted") === "on"
      };

      try {
        if (this.editingId) {
          const updated = await this.update(this.editingId, data);

          if (!updated) {
            message.textContent = "Fiche introuvable.";
            return;
          }

          message.textContent = "Fiche modifiée avec succès.";
        } else {
          await this.add(data);
          message.textContent = "Élève enregistré avec succès.";
        }

        this.resetForm();
        this.render();
      } catch (error) {
        console.error("Erreur :", error);
        this.showStorageError(error);
      }
    });

    list.addEventListener("click", async event => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      try {
        const id = button.dataset.id;
        const action = button.dataset.action;
        const student = this.getAll().find(item => item.id === id);

        if (!student) return;
        if (action === "view") {
          this.showDetails(id);
        }
        if (action === "edit") {
          this.edit(id);
        }

        if (action === "archive") {
          const confirmed = confirm(
            `Archiver la fiche de ${student.name} ?`
          );

          if (confirmed) {
            await this.setArchived(id, true);
            message.textContent = "Élève archivé. Sa fiche est conservée.";
            this.resetForm();
            this.render();
          }
        }

        if (action === "restore") {
          await this.setArchived(id, false);
          message.textContent = "Élève restauré avec succès.";
          this.render();
        }
      } catch (error) {
        console.error("Erreur de lecture ou d'enregistrement :", error);
        this.showStorageError(error);
      }
    });
  }
  };
})();
