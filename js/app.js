
"use strict";

// CAP SAVOIR MANAGER
const App = {
  name: "CAP SAVOIR MANAGER",
  version: "1.0.0",

  init() {
    console.log(`${this.name} — Version ${this.version}`);

    this.updateFooter();
    this.registerServiceWorker();
  },

  updateFooter() {
    const footer = document.querySelector("footer p");

    if (footer) {
      footer.textContent =
        `${this.name} — Version ${this.version}`;
    }
  },

  async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      console.warn("Service worker non pris en charge.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register(
        "./service-worker.js"
      );

      console.log(
        "Service worker enregistré :",
        registration.scope
      );
    } catch (error) {
      console.error(
        "Erreur d'enregistrement du service worker :",
        error
      );
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
.student-name-button {
  display: block;
  border: none;
  background: transparent;
  color: var(--navy);
  font-size: 18px;
  font-weight: bold;
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: var(--orange);
  margin-bottom: 8px;
}

#student-details-dialog {
  width: min(90%, 500px);
  max-height: 85vh;
  margin: auto;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text);
}

#student-details-dialog::backdrop {
  background: rgba(16, 29, 64, 0.65);
}

#student-details-dialog h2,
#student-details-dialog h3 {
  color: var(--navy);
  margin-bottom: 14px;
}

#student-details-dialog p {
  margin: 10px 0;
  overflow-wrap: anywhere;
}

#student-details-dialog button {
  margin-top: 18px;
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  background: var(--navy);
  color: white;
  cursor: pointer;
}
/* Module de suivi des présences */
.attendance-section {
  background: var(--white);
  padding: 24px;
  margin-bottom: 20px;
  border-radius: 14px;
  border: 1px solid var(--border);
}

.attendance-controls {
  display: grid;
  gap: 10px;
  margin: 20px 0;
}

.attendance-controls label {
  color: var(--navy);
  font-weight: 600;
  font-size: 14px;
}

.attendance-controls select,
.attendance-controls input {
  width: 100%;
  min-height: 46px;
  padding: 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--white);
  font-size: 16px;
}

.attendance-controls button,
#save-attendance {
  min-height: 46px;
  padding: 11px 16px;
  border: none;
  border-radius: 8px;
  background: var(--navy);
  color: var(--white);
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
}

.attendance-student {
  display: grid;
  gap: 10px;
  padding: 14px;
  margin: 10px 0;
  border: 1px solid var(--border);
  border-radius: 9px;
}

.attendance-student strong {
  color: var(--navy);
}

.attendance-student select {
  width: 100%;
  min-height: 42px;
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--white);
  font-size: 15px;
}

#attendance-message {
  margin: 12px 0;
  color: var(--green);
  font-weight: bold;
}

.attendance-history {
  margin-top: 24px;
}

.attendance-history-item {
  padding: 12px;
  margin: 10px 0;
  border-left: 4px solid var(--green);
  border-radius: 8px;
  background: var(--background);
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .attendance-section {
    padding: 18px;
  }
}
