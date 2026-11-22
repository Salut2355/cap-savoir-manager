"use strict";

const App = {
  name: "CAP SAVOIR MANAGER",
  version: "1.0.0",
  titles: {
    dashboard: "Tableau de bord",
    students: "Élèves",
    groups: "Groupes et formations",
    attendance: "Présences",
    operations: "Finances, dépenses et prospects"
  },

  init() {
    console.log(this.name + " — Version " + this.version);
    this.initNavigation();
    this.initQuickActions();
    this.renderDashboard();
    this.renderGroups();
    this.registerServiceWorker();
  },

  initNavigation() {
    const controls = [...document.querySelectorAll("[data-view]")];
    const panels = [...document.querySelectorAll("[data-app-panel]")];
    if (!controls.length || !panels.length) return;

    const show = (view, control) => {
      const panel = panels.find(item => item.dataset.appPanel === view);
      if (!panel) return;
      panels.forEach(item => { item.hidden = item !== panel; });
      controls.forEach(item => {
        if (item.dataset.view === view) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      const title = document.getElementById("view-title");
      if (title) title.textContent = this.titles[view] || "CAP SAVOIR MANAGER";
      if (view === "dashboard") this.renderDashboard();
      if (view === "groups") this.renderGroups();
      if (control && control.dataset.open) this.openTarget(control.dataset.open);
      document.getElementById("app").focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    controls.forEach(control => control.addEventListener("click", event => {
      if (control.tagName === "A") event.preventDefault();
      show(control.dataset.view, control);
    }));
    const initial = controls.find(item => item.getAttribute("aria-current") === "page")?.dataset.view || "dashboard";
    show(initial);
  },

  initQuickActions() {
    document.addEventListener("click", event => {
      const action = event.target.closest("[data-action]");
      if (!action) return;
      if (action.dataset.action === "focus-student-form") {
        event.preventDefault();
        const panel = document.getElementById("student-form-panel");
        if (panel) panel.open = true;
        this.openTarget("student-name");
      }
      if (action.dataset.action === "view-student") {
        try {
          StudentManager.showDetails(action.dataset.studentId);
        } catch (error) {
          const message = document.getElementById("dashboard-message");
          if (message) {
            message.textContent = "Fiche indisponible : " + error.message;
            message.className = "inline-message message-error";
          }
        }
      }
    });
  },

  openTarget(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const details = target.closest("details");
    if (details) details.open = true;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (target.matches("input, select, textarea")) target.focus({ preventScroll: true });
    });
  },

  formatMoney(value) {
    return Number(value || 0).toLocaleString("fr-FR") + " FCFA";
  },

  formatDate(value) {
    if (!value) return "Date non renseignée";
    const date = new Date(String(value).slice(0, 10) + "T12:00:00");
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR", { timeZone: "Africa/Abidjan" });
  },

  renderDashboard() {
    const container = document.getElementById("dashboard-metrics");
    const message = document.getElementById("dashboard-message");
    const groupList = document.getElementById("dashboard-groups");
    const remindersList = document.getElementById("dashboard-reminders");
    const recentList = document.getElementById("dashboard-recent");
    if (!container || !message) return;

    try {
      const students = StudentManager.getAll();
      const attendance = AttendanceManager.getAll();
      const ledger = OperationsManager.getAll();
      const activeStudents = students.filter(student => !student.archived);
      const completedSessions = attendance.filter(record => (record.sessionStatus || "completed") === "completed").length;
      const received = ledger.payments.reduce((sum, item) => sum + item.amount, 0);
      const refunds = ledger.refunds.reduce((sum, item) => sum + item.amount, 0);
      const expenses = ledger.expenses.reduce((sum, item) => sum + item.amount, 0);
      const inflows = ledger.inflows.reduce((sum, item) => sum + item.amount, 0);
      const cashBalance = received - refunds + inflows - expenses;
      const metrics = [
        [String(activeStudents.length), "Élèves actifs", "accent"],
        [this.formatMoney(received), "Paiements réellement reçus", "positive"],
        [this.formatMoney(expenses), "Dépenses enregistrées", ""],
        [this.formatMoney(cashBalance), "Trésorerie nette déclarée", "accent"]
      ];
      container.replaceChildren(...metrics.map(([value, label, tone]) => {
        const card = document.createElement("article");
        card.className = "metric-card";
        if (tone) card.dataset.tone = tone;
        const number = document.createElement("strong");
        number.textContent = value;
        const caption = document.createElement("span");
        caption.textContent = label;
        card.append(number, caption);
        return card;
      }));

      if (groupList) this.renderDashboardGroups(activeStudents, groupList);
      if (remindersList) this.renderDashboardReminders(OperationsManager.getReminders(), remindersList);
      if (recentList) this.renderRecent(ledger, recentList);

      message.textContent = completedSessions + " séance(s) réalisée(s) enregistrée(s). Les sommes affichées comme reçues proviennent des paiements saisis.";
      message.className = "inline-message";
    } catch (error) {
      message.textContent = "Tableau de bord indisponible : " + error.message + ". Les données précédemment visibles peuvent ne plus être à jour.";
      message.className = "inline-message message-warning";
    }
  },

  renderDashboardGroups(students, container) {
    const definitions = [
      { keys: ["G1", "Groupe 1"], name: "G1", schedule: "Dimanche, mardi et jeudi · 19 h–21 h" },
      { keys: ["G2", "Groupe 2"], name: "G2", schedule: "Lundi, mercredi et vendredi · 19 h–21 h 30" }
    ];
    container.replaceChildren();
    definitions.forEach(group => {
      const members = students.filter(student => group.keys.includes(student.group));
      const row = document.createElement("div");
      row.className = "dashboard-group-row";
      const info = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = group.name;
      const schedule = document.createElement("small");
      schedule.textContent = group.schedule;
      info.append(name, schedule);
      const count = document.createElement("span");
      count.className = "dashboard-group-count";
      count.textContent = members.length + " élève(s)";
      row.append(info, count);
      container.appendChild(row);
    });
    const otherGroups = [...new Set(students.map(student => student.group).filter(group => !definitions.some(item => item.keys.includes(group))))];
    otherGroups.forEach(group => {
      const count = students.filter(student => student.group === group).length;
      const row = document.createElement("div");
      row.className = "dashboard-group-row";
      const name = document.createElement("strong");
      name.textContent = group || "Groupe non renseigné";
      const amount = document.createElement("span");
      amount.className = "dashboard-group-count";
      amount.textContent = count + " élève(s)";
      row.append(name, amount);
      container.appendChild(row);
    });
  },

  renderDashboardReminders(charges, container) {
    container.replaceChildren();
    if (!charges.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Aucune échéance impayée à surveiller dans les prochains jours.";
      container.appendChild(empty);
      return;
    }
    charges.slice(0, 5).forEach(charge => {
      const row = document.createElement("div");
      row.className = "dashboard-list-item";
      const info = document.createElement("div");
      const student = document.createElement("strong");
      student.textContent = charge.studentName || "Élève";
      const detail = document.createElement("small");
      detail.textContent = charge.label + " · échéance " + this.formatDate(charge.dueDate);
      info.append(student, detail);
      row.appendChild(info);
      container.appendChild(row);
    });
  },

  renderRecent(ledger, container) {
    const entries = [
      ...ledger.payments.map(item => ({ date: item.date, label: "Paiement reçu · " + (item.studentName || "Élève"), amount: item.amount, kind: "Paiement" })),
      ...ledger.refunds.map(item => ({ date: item.date, label: "Remboursement · " + (item.studentName || "Élève"), amount: -item.amount, kind: "Remboursement" })),
      ...ledger.expenses.map(item => ({ date: item.date, label: "Dépense · " + item.label, amount: -item.amount, kind: "Dépense" })),
      ...ledger.inflows.map(item => ({ date: item.date, label: "Autre entrée · " + item.label, amount: item.amount, kind: "Entrée" }))
    ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
    container.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Aucun mouvement financier enregistré.";
      container.appendChild(empty);
      return;
    }
    entries.forEach(entry => {
      const row = document.createElement("div");
      row.className = "dashboard-list-item";
      const info = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = entry.label;
      const date = document.createElement("small");
      date.textContent = entry.kind + " · " + this.formatDate(entry.date);
      info.append(label, date);
      const amount = document.createElement("span");
      amount.className = "dashboard-list-amount";
      amount.textContent = (entry.amount < 0 ? "−" : "+") + this.formatMoney(Math.abs(entry.amount));
      row.append(info, amount);
      container.appendChild(row);
    });
  },

  renderGroups() {
    const container = document.getElementById("groups-overview");
    if (!container) return;
    try {
      const students = StudentManager.getAll().filter(student => !student.archived);
      const definitions = [
        { keys: ["G1", "Groupe 1"], name: "G1", schedule: "Dimanche, mardi et jeudi", hours: "19 h à 21 h" },
        { keys: ["G2", "Groupe 2"], name: "G2", schedule: "Lundi, mercredi et vendredi", hours: "19 h à 21 h 30" }
      ];
      const cards = definitions.map(group => {
        const members = students.filter(student => group.keys.includes(student.group));
        const article = document.createElement("article");
        article.className = "surface group-card";
        const header = document.createElement("div");
        header.className = "group-card-heading";
        const heading = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = group.name;
        const schedule = document.createElement("p");
        schedule.className = "group-schedule";
        schedule.textContent = group.schedule + " · " + group.hours;
        heading.append(title, schedule);
        const count = document.createElement("span");
        count.className = "group-count-pill";
        count.textContent = members.length + " élève(s)";
        header.append(heading, count);
        article.appendChild(header);

        const list = document.createElement("ul");
        list.className = "group-member-list";
        if (!members.length) {
          const empty = document.createElement("li");
          empty.className = "muted-copy";
          empty.textContent = "Aucun élève actif dans ce groupe.";
          list.appendChild(empty);
        } else {
          members.forEach(student => list.appendChild(this.createMemberItem(student)));
        }
        article.appendChild(list);
        return article;
      });

      const legacy = [...new Set(students.map(student => student.group).filter(group => group && !definitions.some(item => item.keys.includes(group))))];
      legacy.forEach(group => {
        const members = students.filter(student => student.group === group);
        const article = document.createElement("article");
        article.className = "surface group-card";
        const header = document.createElement("div");
        header.className = "group-card-heading";
        const title = document.createElement("h3");
        title.textContent = group;
        const count = document.createElement("span");
        count.className = "group-count-pill";
        count.textContent = members.length + " élève(s)";
        header.append(title, count);
        article.appendChild(header);
        const list = document.createElement("ul");
        list.className = "group-member-list";
        members.forEach(student => list.appendChild(this.createMemberItem(student)));
        article.appendChild(list);
        cards.push(article);
      });
      container.replaceChildren(...cards);
    } catch (error) {
      container.textContent = "Groupes indisponibles : " + error.message;
    }
  },

  createMemberItem(student) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = student.name;
    button.dataset.action = "view-student";
    button.dataset.studentId = student.id;
    const level = document.createElement("small");
    level.textContent = student.level;
    item.append(button, level);
    return item;
  },

  updateFooter() {},
  async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      console.warn("Service Worker non pris en charge.");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js");
      console.log("Service Worker enregistré :", registration.scope);
    } catch (error) {
      console.error("Erreur d'enregistrement du Service Worker :", error);
    }
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await DataRestoreRecovery.ready;
  } catch (error) {
    DataRestoreRecovery.showBlocked(error);
    return;
  }

  StudentManager.init();
  AttendanceManager.init();
  OperationsManager.init();
  App.init();

  const recoveryNotice = DataRestoreRecovery.consumeNotice();
  if (recoveryNotice) {
    const message = document.getElementById("dashboard-message");
    if (message) {
      message.textContent = recoveryNotice;
      message.className = "inline-message message-warning";
    }
  }
});
