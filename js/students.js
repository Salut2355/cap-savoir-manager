
"use strict";

// Gestion des fiches élèves de CAP SAVOIR
const StudentManager = {
  storageKey: "cap-savoir-students-v1",
  editingId: null,

  getAll() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Erreur de lecture :", error);
      return [];
    }
  },

  saveAll(students) {
    localStorage.setItem(this.storageKey, JSON.stringify(students));
  },

  add(student) {
    const students = this.getAll();

    students.push({
      id: crypto.randomUUID(),
      name: student.name.trim(),
      level: student.level,
      parent: student.parent.trim(),
      phone: student.phone.trim(),
      group: student.group,
      startDate: student.startDate,
      createdAt: new Date().toISOString(),
      archived: false,
      archivedAt: null
    });

    this.saveAll(students);
  },

  update(id, data) {
    const students = this.getAll();
    const index = students.findIndex(student => student.id === id);

    if (index === -1) return false;

    students[index] = {
      ...students[index],
      name: data.name.trim(),
      level: data.level,
      parent: data.parent.trim(),
      phone: data.phone.trim(),
      group: data.group,
      startDate: data.startDate
    };

    this.saveAll(students);
    return true;
  },

  setArchived(id, archived) {
    const students = this.getAll();
    const student = students.find(item => item.id === id);

    if (!student) return;

    student.archived = archived;
    student.archivedAt = archived
      ? new Date().toISOString()
      : null;

    this.saveAll(students);
  },

  resetForm() {
    const form = document.getElementById("student-form");
    const button = form?.querySelector('button[type="submit"]');

    if (form) form.reset();

    this.editingId = null;

    if (button) {
      button.textContent = "Enregistrer l'élève";
    }
  },

  render() {
    const list = document.getElementById("student-list");
    const count = document.getElementById("student-count");

    if (!list || !count) return;

    const students = this.getAll();
    const active = students.filter(s => !s.archived);
    const archived = students.filter(s => s.archived);

    count.textContent =
      `${active.length} élève(s) actif(s) — ${archived.length} archivé(s)`;

    list.replaceChildren();

    if (students.length === 0) {
      list.textContent = "Aucun élève enregistré.";
      return;
    }

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

        const parent = document.createElement("p");
        parent.textContent =
          `Responsable : ${student.parent || "Non renseigné"}`;

        const phone = document.createElement("p");
        phone.textContent =
          `Téléphone : ${student.phone || "Non renseigné"}`;

        const status = document.createElement("p");
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

        card.append(name, details, parent, phone, status, actions);
        section.appendChild(card);
      });

      list.appendChild(section);
    };

    createSection("Élèves actifs", active, false);
    createSection("Élèves archivés", archived, true);
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

  const fields = [
    ["Nom complet", student.name],
    ["Niveau scolaire", student.level],
    ["Groupe", student.group],
    ["Date de début", student.startDate],
    ["Parent / responsable", student.parent || "Non renseigné"],
    ["Téléphone", student.phone || "Non renseigné"],
    ["Statut", student.archived ? "Archivé" : "Actif"],
    [
      "Date de création",
      student.createdAt
        ? new Date(student.createdAt).toLocaleDateString("fr-FR")
        : "Non renseignée"
    ]
  ];

  dialog.appendChild(title);

  fields.forEach(([label, value]) => {
    const line = document.createElement("p");
    line.textContent = `${label} : ${value}`;
    dialog.appendChild(line);
  });

  const historyTitle = document.createElement("h3");
  historyTitle.textContent = "Historique";
  dialog.appendChild(historyTitle);

  const historyMessage = document.createElement("p");
  historyMessage.textContent =
    "Les historiques de présence et de paiement seront ajoutés dans une prochaine version.";
  dialog.appendChild(historyMessage);

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

    const form = document.getElementById("student-form");
    if (!form) return;

    form.elements.name.value = student.name;
    form.elements.level.value = student.level;
    form.elements.parent.value = student.parent;
    form.elements.phone.value = student.phone;
    form.elements.group.value = student.group;
    form.elements.startDate.value = student.startDate;

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
    version: 2,
    exportedAt: new Date().toISOString(),
    students: this.getAll(),
    attendance: AttendanceManager.getAll()
  };

  const content = JSON.stringify(backup, null, 2);

  this.downloadFile(
    content,
    `cap-savoir-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`,
    "application/json"
  );
},

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
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

 
async restoreBackup(file) {
  try {
    const content = await file.text();
    const backup = JSON.parse(content);

    if (
      backup.application !== "CAP SAVOIR MANAGER" ||
      !Array.isArray(backup.students)
    ) {
      throw new Error("Format de sauvegarde invalide.");
    }

    // Vérifier les fiches élèves
    const validStudents = backup.students.every(student =>
      student &&
      typeof student.id === "string" &&
      typeof student.name === "string" &&
      typeof student.level === "string" &&
      typeof student.parent === "string" &&
      typeof student.phone === "string" &&
      typeof student.group === "string" &&
      typeof student.startDate === "string" &&
      typeof student.archived === "boolean"
    );

    const studentIds = backup.students.map(student => student.id);

    if (
      !validStudents ||
      new Set(studentIds).size !== studentIds.length
    ) {
      throw new Error("Les données des élèves sont invalides.");
    }

    // Vérifier les présences si elles existent dans la sauvegarde
    const hasAttendance = Array.isArray(backup.attendance);

    if (backup.attendance !== undefined && !hasAttendance) {
      throw new Error("L'historique des présences est invalide.");
    }

    if (hasAttendance) {
      const validAttendance = backup.attendance.every(record =>
        record &&
        typeof record.id === "string" &&
        typeof record.date === "string" &&
        typeof record.group === "string" &&
        Array.isArray(record.entries) &&
        record.entries.every(entry =>
          entry &&
          typeof entry.studentId === "string" &&
          typeof entry.studentName === "string" &&
          typeof entry.status === "string" &&
          typeof entry.reason === "string"
        )
      );

      const attendanceIds = backup.attendance.map(record => record.id);

      if (
        !validAttendance ||
        new Set(attendanceIds).size !== attendanceIds.length
      ) {
        throw new Error("Les données des présences sont invalides.");
      }
    }

    const confirmed = confirm(
      `Cette sauvegarde contient ${backup.students.length} fiche(s) élève(s).\n` +
      `${hasAttendance ? backup.attendance.length + " séance(s) de présence" : "Aucun historique de présence dans ce fichier"}.\n\n` +
      "La restauration remplacera les fiches élèves actuelles.\n" +
      (hasAttendance
        ? "Elle remplacera également l'historique des présences actuel.\n\n"
        : "L'historique des présences déjà présent sur cet appareil sera conservé.\n\n") +
      "Avez-vous déjà téléchargé une sauvegarde de vos données actuelles ?"
    );

    if (!confirmed) return;

    // Restaurer les élèves
    this.saveAll(backup.students);

    // Restaurer les présences uniquement si elles sont présentes
    if (hasAttendance) {
      AttendanceManager.saveAll(backup.attendance);
    }

    this.resetForm();
    this.render();

    if (hasAttendance) {
      AttendanceManager.renderHistory();
    }

    document.getElementById("student-message").textContent =
      hasAttendance
        ? "Élèves et historique des présences restaurés avec succès."
        : "Élèves restaurés. L'historique des présences existant a été conservé.";

  } catch (error) {
    console.error("Erreur de restauration :", error);

    document.getElementById("student-message").textContent =
      "Restauration impossible : fichier invalide ou illisible.";
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
  this.exportBackup();
});

csvButton?.addEventListener("click", () => {
  this.exportCSV();
});

restoreInput?.addEventListener("change", async () => {
  const file = restoreInput.files[0];

  if (file) {
    await this.restoreBackup(file);
  }

  restoreInput.value = "";
});
    if (!form || !list) return;

    this.render();

    form.addEventListener("submit", event => {
      event.preventDefault();

      if (!form.reportValidity()) return;

      const formData = new FormData(form);

      const data = {
        name: formData.get("name"),
        level: formData.get("level"),
        parent: formData.get("parent") || "",
        phone: formData.get("phone") || "",
        group: formData.get("group"),
        startDate: formData.get("startDate")
      };

      try {
        if (this.editingId) {
          const updated = this.update(this.editingId, data);

          if (!updated) {
            message.textContent = "Fiche introuvable.";
            return;
          }

          message.textContent = "Fiche modifiée avec succès.";
        } else {
          this.add(data);
          message.textContent = "Élève enregistré avec succès.";
        }

        this.resetForm();
        this.render();
      } catch (error) {
        console.error("Erreur :", error);
        message.textContent =
          "Enregistrement impossible. Vérifiez l'espace disponible.";
      }
    });

    list.addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

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
          this.setArchived(id, true);
          this.resetForm();
          message.textContent = "Élève archivé. Sa fiche est conservée.";
          this.render();
        }
      }

      if (action === "restore") {
        this.setArchived(id, false);
        message.textContent = "Élève restauré avec succès.";
        this.render();
      }
    });
  }
};

document.addEventListener("DOMContentLoaded", () => {
  StudentManager.init();
});
