
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
