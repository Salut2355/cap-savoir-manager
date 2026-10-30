
"use strict";

// Gestion locale des élèves de CAP SAVOIR
const StudentManager = {
  storageKey: "cap-savoir-students-v1",

  getAll() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Erreur de lecture des élèves :", error);
      return [];
    }
  },

  saveAll(students) {
    localStorage.setItem(this.storageKey, JSON.stringify(students));
  },

  add(student) {
    const students = this.getAll();

    const newStudent = {
      id: crypto.randomUUID(),
      name: student.name.trim(),
      level: student.level,
      parent: student.parent.trim(),
      phone: student.phone.trim(),
      group: student.group,
      startDate: student.startDate,
      createdAt: new Date().toISOString()
    };

    students.push(newStudent);
    this.saveAll(students);

    return newStudent;
  },

  render() {
    const list = document.getElementById("student-list");
    const count = document.getElementById("student-count");

    if (!list || !count) return;

    const students = this.getAll();

    count.textContent =
      `${students.length} élève${students.length > 1 ? "s" : ""} enregistré${students.length > 1 ? "s" : ""}`;

    list.replaceChildren();

    if (students.length === 0) {
      const message = document.createElement("p");
      message.textContent = "Aucun élève enregistré pour le moment.";
      list.appendChild(message);
      return;
    }

    students.forEach((student) => {
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

      card.append(name, details, parent, phone);
      list.appendChild(card);
    });
  },

  init() {
    const form = document.getElementById("student-form");
    const message = document.getElementById("student-message");

    if (!form) return;

    this.render();

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!form.reportValidity()) return;

      const formData = new FormData(form);

      try {
        this.add({
          name: formData.get("name"),
          level: formData.get("level"),
          parent: formData.get("parent") || "",
          phone: formData.get("phone") || "",
          group: formData.get("group"),
          startDate: formData.get("startDate")
        });

        form.reset();
        this.render();

        message.textContent = "Élève enregistré avec succès.";
      } catch (error) {
        console.error("Erreur d'enregistrement :", error);
        message.textContent =
          "Impossible d'enregistrer. Vérifiez l'espace disponible.";
      }
    });
  }
};

document.addEventListener("DOMContentLoaded", () => {
  StudentManager.init();
});
