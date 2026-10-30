
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

        const name = document.createElement("h3");
        name.textContent = student.name;

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

  init() {
    const form = document.getElementById("student-form");
    const message = document.getElementById("student-message");
    const list = document.getElementById("student-list");

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
