"use strict";

// Registre local des opérations. L'absence de clé signifie un registre neuf;
// toute autre anomalie bloque les écritures sans réinitialiser le contenu.
const OperationsManager = (() => {
  const storageKey = "cap-savoir-operations-v1";
  const emptyLedger = () => ({ charges: [], payments: [], refunds: [], credits: [], creditApplications: [], expenses: [], inflows: [], prospects: [], billingBaselines: [] });
  const arrays = ["charges", "payments", "refunds", "credits", "creditApplications", "expenses", "inflows", "prospects", "billingBaselines"];

  function readRaw() {
    if (typeof DataRestoreRecovery !== "undefined") DataRestoreRecovery.assertReadable();
    try { return localStorage.getItem(storageKey); }
    catch (cause) { throw Object.assign(new Error("Stockage des opérations inaccessible."), { code: "STORAGE_ACCESS", cause }); }
  }

  function readLedger() {
    const raw = readRaw();
    if (raw === null) return { ledger: emptyLedger(), raw };
    if (!raw.trim()) throw Object.assign(new Error("Le registre des opérations est vide et invalide."), { code: "STORAGE_EMPTY" });
    let ledger;
    try { ledger = JSON.parse(raw); }
    catch (cause) { throw Object.assign(new Error("Le registre des opérations contient un JSON invalide."), { code: "STORAGE_INVALID_JSON", cause }); }
    if (!ledger || typeof ledger !== "object" || Array.isArray(ledger) || arrays.some(key => ledger[key] !== undefined && !Array.isArray(ledger[key]))) {
      throw Object.assign(new Error("La structure du registre des opérations est invalide."), { code: "STORAGE_INVALID_ROOT" });
    }
    arrays.forEach(key => { if (!ledger[key]) ledger[key] = []; });
    return { ledger, raw };
  }

  async function commit(ledger, expectedRaw) {
    if (!ledger || arrays.some(key => !Array.isArray(ledger[key]))) throw new TypeError("Registre invalide.");
    const write = async () => {
      if (readRaw() !== expectedRaw) throw Object.assign(new Error("Le registre a changé. Enregistrement annulé; rechargez avant de réessayer."), { code: "STORAGE_CHANGED" });
      const serialized = JSON.stringify(ledger);
      try { localStorage.setItem(storageKey, serialized); }
      catch (cause) { throw Object.assign(new Error("Écriture impossible. Le résultat n'a pas été confirmé."), { code: "STORAGE_WRITE", cause }); }
      if (readRaw() !== serialized) throw Object.assign(new Error("Écriture effectuée, mais vérification impossible; l'état est incertain."), { code: "STORAGE_WRITE_UNCERTAIN" });
    };
    if (typeof DataRestoreRecovery !== "undefined") return DataRestoreRecovery.withLock(write);
    if (!navigator.locks?.request) throw new Error("Le verrouillage sécurisé des opérations n'est pas disponible dans ce navigateur.");
    return navigator.locks.request("cap-savoir-data-write", write);
  }

  function money(value) {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Saisis un montant positif entier en FCFA.");
    return amount;
  }

  function localDate() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Abidjan", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function addCalendarDays(dateText, days) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  }

  function validateDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "") || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
      throw new Error("La date saisie est invalide.");
    }
    if (value > localDate()) throw new Error("Une opération ne peut pas être enregistrée à une date future.");
  }

  function chargeBalance(ledger, charge) {
    const applied = ledger.payments.filter(item => item.chargeId === charge.id)
      .reduce((sum, item) => sum + (item.appliedAmount ?? item.amount), 0);
    const chargeRefunds = ledger.refunds.filter(item => item.chargeId === charge.id)
      .reduce((sum, item) => sum + (item.chargeAmount ?? item.amount), 0);
    const credits = ledger.creditApplications.filter(item => item.chargeId === charge.id)
      .reduce((sum, item) => sum + item.amount, 0);
    return Math.max(0, charge.amount - applied + chargeRefunds - credits);
  }

  function creditBalance(ledger, credit) {
    const applied = ledger.creditApplications.filter(item => item.creditId === credit.id)
      .reduce((sum, item) => sum + item.amount, 0);
    const refunded = ledger.refunds.filter(item => item.creditId === credit.id)
      .reduce((sum, item) => sum + (item.creditAmount ?? 0), 0);
    return Math.max(0, credit.amount - applied - refunded);
  }

  function show(message, kind = "status") {
    const node = document.getElementById("operations-message");
    if (node) { node.textContent = message; node.className = kind === "error" ? "message-error" : ""; }
  }

  function init() {
    const section = document.getElementById("operations-section");
    if (!section) return;
    section.innerHTML = `
      <div class="view-intro"><div><p class="eyebrow">ENCAISSEMENTS · DÉCAISSEMENTS · SUIVI</p><h2>Finances et opérations</h2><p>Les montants reflètent les opérations saisies et vérifiées dans le registre local.</p></div></div>
      <p id="operations-message" class="inline-message" role="status" aria-live="polite"></p>
      <div class="operations-summary" id="operations-summary" aria-label="Synthèse financière"></div>
      <div class="operations-shortcuts" aria-label="Actions financières courantes">
        <button type="button" data-open-form="payment-form">＋ Enregistrer un paiement</button>
        <button type="button" data-open-form="expense-form">＋ Ajouter une dépense</button>
        <button type="button" data-open-form="prospect-form">＋ Ajouter un prospect</button>
        <button type="button" id="prepare-charges">Préparer les échéances</button>
      </div>
      <details class="surface"><summary>Rapprocher manuellement les anciens élèves</summary>
        <p>Aucune ancienne échéance n'est déduite automatiquement. Vérifie le cahier, indique explicitement l'inscription déjà réglée, à facturer ou exonérée, puis saisis tout solde d'ouverture justifié.</p>
        <div id="billing-reconciliation"></div>
      </details>
      <details class="surface" id="payment-form-panel"><summary>Enregistrer un paiement reçu</summary>
        <form id="payment-form" class="operation-form">
          <label>Élève<select name="studentId" required></select></label>
          <label>Échéance à régler<select name="chargeId" required></select></label>
          <label>Montant reçu (FCFA)<input name="amount" type="number" min="1" step="1" required></label>
          <label>Date d'encaissement<input name="date" type="date" required></label>
          <label>Moyen<select name="method" required><option value="">Choisir</option><option>Espèces</option><option>Orange Money</option><option>MTN Money</option><option>Wave</option><option>Moov Money</option></select></label>
          <label>Référence opérateur (obligatoire pour paiement mobile)<input name="reference" maxlength="100"></label>
          <label>N° reçu papier (saisie manuelle, après vérification du cahier)<input name="receipt" inputmode="numeric" maxlength="20"></label>
          <label class="checkbox-field"><input name="receiptVerified" type="checkbox"> Numéro contrôlé dans le cahier physique</label>
          <button type="submit">Enregistrer l'encaissement</button>
        </form>
      </details>
      <details class="surface"><summary>Enregistrer un remboursement</summary>
        <form id="refund-form" class="operation-form">
          <label>Paiement concerné<select name="paymentId" required></select></label>
          <label>Montant remboursé (FCFA)<input name="amount" type="number" min="1" step="1" required></label>
          <label>Date<input name="date" type="date" required></label>
          <label>Moyen de remboursement<select name="method" required><option value="">Choisir</option><option>Espèces</option><option>Orange Money</option><option>MTN Money</option><option>Wave</option><option>Moov Money</option></select></label>
          <label>Référence opérateur (obligatoire pour remboursement mobile)<input name="reference" maxlength="100"></label>
          <label>Motif<input name="reason" required maxlength="200"></label>
          <button type="submit">Enregistrer le remboursement</button>
        </form>
      </details>
      <details class="surface"><summary>Appliquer un crédit à une échéance</summary>
        <form id="credit-application-form" class="operation-form">
          <label>Crédit disponible<select name="creditId" required></select></label>
          <label>Échéance du même élève<select name="chargeId" required></select></label>
          <label>Montant appliqué (FCFA)<input name="amount" type="number" min="1" step="1" required></label>
          <button type="submit">Appliquer le crédit</button>
        </form>
      </details>
      <details class="surface" id="expense-form-panel"><summary>Enregistrer une dépense</summary>
        <form id="expense-form" class="operation-form">
          <label>Libellé<input name="label" required maxlength="120"></label>
          <label>Catégorie<input name="category" required maxlength="80"></label>
          <label>Montant décaissé (FCFA)<input name="amount" type="number" min="1" step="1" required></label>
          <label>Date de paiement<input name="date" type="date" required></label>
          <label>Moyen de paiement<input name="method" required maxlength="50"></label>
          <button type="submit">Enregistrer la dépense</button>
        </form>
      </details>
      <details class="surface"><summary>Enregistrer une autre entrée encaissée</summary>
        <form id="inflow-form" class="operation-form">
          <label>Libellé<input name="label" required maxlength="120"></label>
          <label>Montant reçu (FCFA)<input name="amount" type="number" min="1" step="1" required></label>
          <label>Date d'encaissement<input name="date" type="date" required></label>
          <label>Origine<input name="source" required maxlength="100"></label>
          <button type="submit">Enregistrer l'entrée</button>
        </form>
      </details>
      <details class="surface" id="prospect-form-panel"><summary>Ajouter un prospect</summary>
        <form id="prospect-form" class="operation-form">
          <label>Nom<input name="name" required maxlength="100"></label>
          <label>Téléphone<input name="phone" type="tel" maxlength="25"></label>
          <label>Niveau souhaité<select name="level" required><option value="">Choisir</option><option>CP1</option><option>CP2</option><option>CE1</option><option>CE2</option><option>CM1</option><option>CM2</option><option>6e</option><option>5e</option><option>4e</option></select></label>
          <label>Groupe souhait?<select name="group" required><option value="">Choisir</option><option value="G1">G1 ? mercredi, samedi, dimanche ? 16 h?18 h</option><option value="G2">G2 ? lundi, mercredi, vendredi ? 19 h?21 h</option><option value="G3">G3 ? samedi ? 19 h?21 h</option></select></label>
          <label>Suivi<select name="status"><option>À contacter</option><option>Contacté</option><option>Inscrit</option><option>Non retenu</option></select></label>
          <button type="submit">Enregistrer le prospect</button>
        </form>
      </details>
      <section class="surface records-section"><div class="section-heading"><div><p class="eyebrow">JOURNAL</p><h3>Historique des opérations</h3></div></div>
        <div class="operations-toolbar">
          <label class="field"><span>Rechercher une opération</span><input type="search" id="operations-search" placeholder="Élève, référence, montant" autocomplete="off"></label>
          <label class="field"><span>Type d’opération</span><select id="operations-kind-filter"><option value="all">Toutes</option><option value="payment">Paiements</option><option value="refund">Remboursements</option><option value="credit">Crédits appliqués</option><option value="expense">Dépenses</option><option value="inflow">Autres entrées</option></select></label>
        </div>
        <div id="operations-history" class="record-list"></div>
      </section>
      <section class="surface records-section" id="expense-history-section"><div class="section-heading"><div><p class="eyebrow">DÉCAISSEMENTS SAISIS</p><h3>Dépenses</h3><p class="muted-copy">Cette liste présente les dépenses enregistrées comme payées; aucun budget prévisionnel n’est suivi ici.</p></div></div>
        <label class="field"><span>Rechercher une dépense</span><input type="search" id="expense-search" placeholder="Libellé, catégorie, moyen" autocomplete="off"></label>
        <div id="expense-list" class="record-list"></div>
      </section>
      <section class="surface records-section"><div class="section-heading"><div><p class="eyebrow">SUIVI DES CONTACTS</p><h3>Prospects</h3></div></div>
        <label class="field"><span>Rechercher un prospect</span><input type="search" id="prospect-search" placeholder="Nom, téléphone, niveau, statut" autocomplete="off"></label>
        <div id="prospects-list" class="record-list"></div>
      </section>`;

    for (const id of ["payment-form", "refund-form", "credit-application-form", "expense-form", "inflow-form", "prospect-form"]) {
      section.querySelector(`#${id}`).addEventListener("submit", event => handleSubmit(event, id));
    }
    section.querySelector("#prepare-charges").addEventListener("click", prepareCharges);
    section.querySelectorAll("[data-open-form]").forEach(button => button.addEventListener("click", () => {
      const formId = button.dataset.openForm;
      const form = document.getElementById(formId);
      const panel = form?.closest("details");
      if (panel) panel.open = true;
      form?.querySelector("input, select, textarea")?.focus({ preventScroll: true });
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    ["operations-search", "operations-kind-filter", "expense-search", "prospect-search"].forEach(id => {
      const control = document.getElementById(id);
      control?.addEventListener("input", render);
      control?.addEventListener("change", render);
    });
    section.querySelector('#payment-form [name="studentId"]').addEventListener("change", () => populateCharges());
    section.querySelector('#credit-application-form [name="creditId"]').addEventListener("change", () => populateCreditCharges());
    section.querySelectorAll('input[type="date"]').forEach(input => { input.value = localDate(); });
    render();
  }

  async function handleSubmit(event, formId) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    try {
      data.amount = form.elements.amount ? money(form.elements.amount.value) : undefined;
      if (data.date) validateDate(data.date);
      const state = readLedger();
      const ledger = state.ledger;
      const now = new Date().toISOString();
      if (formId === "payment-form") {
        const student = StudentManager.getAll().find(item => item.id === data.studentId && !item.archived);
        if (!student) throw new Error("Élève actif introuvable; paiement non enregistré.");
        const charge = ledger.charges.find(item => item.id === data.chargeId && item.studentId === student.id);
        if (!charge) throw new Error("Échéance introuvable. Prépare les échéances avant de saisir le paiement.");
        const balance = chargeBalance(ledger, charge);
        const mobile = ["Orange Money", "MTN Money", "Wave", "Moov Money"].includes(data.method);
        const reference = String(data.reference || "").trim();
        if (mobile && !reference) throw new Error("La référence opérateur est obligatoire pour un paiement mobile.");
        if (mobile && ledger.payments.some(item => item.method === data.method && item.reference.toLowerCase() === reference.toLowerCase())) throw new Error("Cette référence de paiement existe déjà.");
        if (!mobile && ledger.payments.some(item => item.studentId === student.id && item.amount === data.amount && item.date === data.date && item.method === data.method)) throw new Error("Un encaissement identique existe déjà. Vérifie le cahier avant toute nouvelle saisie.");
        let paperReceipt = String(data.receipt || "").trim();
        if (paperReceipt && !form.elements.receiptVerified.checked) throw new Error("Confirme d'abord la vérification du numéro dans le cahier physique.");
        if (paperReceipt && ledger.payments.some(item => item.paperReceipt === paperReceipt)) throw new Error("Ce numéro de reçu est déjà enregistré.");
        if (paperReceipt === "009" && !(student.name === "Kuya Marie Imelda" && data.amount === 5000 && data.date === "2026-10-29")) throw new Error("Le reçu 009 est réservé au paiement historique identifié.");
        const appliedAmount = Math.min(data.amount, balance);
        const creditAmount = data.amount - appliedAmount;
        const payment = { id: crypto.randomUUID(), chargeId: charge.id, studentId: student.id, studentName: student.name, amount: data.amount, appliedAmount, creditAmount, date: data.date, method: data.method, reference, paperReceipt, receivedAt: now };
        ledger.payments.push(payment);
        if (creditAmount > 0) {
          ledger.credits.push({ id: crypto.randomUUID(), paymentId: payment.id, studentId: student.id, studentName: student.name, amount: creditAmount, createdAt: now });
        }
      } else if (formId === "refund-form") {
        const payment = ledger.payments.find(item => item.id === data.paymentId);
        if (!payment) throw new Error("Paiement introuvable.");
        const refunded = ledger.refunds.filter(item => item.paymentId === payment.id).reduce((sum, item) => sum + item.amount, 0);
        if (data.amount > payment.amount - refunded) throw new Error("Le remboursement dépasse le montant disponible de ce paiement.");
        const mobileRefund = ["Orange Money", "MTN Money", "Wave", "Moov Money"].includes(data.method);
        const refundReference = String(data.reference || "").trim();
        if (mobileRefund && !refundReference) throw new Error("La référence opérateur est obligatoire pour un remboursement mobile.");
        if (mobileRefund && ledger.refunds.some(item => item.method === data.method && String(item.reference || "").toLowerCase() === refundReference.toLowerCase())) throw new Error("Cette référence de remboursement existe déjà.");
        if (ledger.refunds.some(item => item.paymentId === payment.id && item.amount === data.amount && item.date === data.date && item.reason === String(data.reason).trim())) throw new Error("Un remboursement identique est déjà enregistré.");
        const credit = ledger.credits.find(item => item.paymentId === payment.id);
        const creditRefunded = ledger.refunds.filter(item => item.creditId === credit?.id).reduce((sum, item) => sum + (item.creditAmount ?? item.amount), 0);
        const creditApplied = ledger.creditApplications.filter(item => item.creditId === credit?.id).reduce((sum, item) => sum + item.amount, 0);
        const refundableCredit = Math.max(0, (payment.creditAmount || 0) - creditRefunded - creditApplied);
        const creditAmount = Math.min(data.amount, refundableCredit);
        const chargeAmount = data.amount - creditAmount;
        const chargeRefunded = ledger.refunds.filter(item => item.paymentId === payment.id).reduce((sum, item) => sum + (item.chargeAmount ?? (item.creditAmount === undefined ? item.amount : 0)), 0);
        const appliedAmount = payment.appliedAmount ?? payment.amount;
        if (chargeAmount > appliedAmount - chargeRefunded) throw new Error("Le remboursement dépasse le solde disponible du paiement.");
        ledger.refunds.push({ id: crypto.randomUUID(), paymentId: payment.id, creditId: credit?.id || null, chargeId: payment.chargeId, studentId: payment.studentId, studentName: payment.studentName || "", amount: data.amount, creditAmount, chargeAmount, date: data.date, method: data.method, reference: refundReference, reason: String(data.reason).trim(), createdAt: now });
      } else if (formId === "credit-application-form") {
        const credit = ledger.credits.find(item => item.id === data.creditId);
        const charge = ledger.charges.find(item => item.id === data.chargeId);
        if (!credit || !charge || credit.studentId !== charge.studentId) throw new Error("Le crédit et l'échéance doivent appartenir au même élève.");
        if (data.amount > creditBalance(ledger, credit)) throw new Error("Le montant dépasse le crédit encore disponible.");
        if (data.amount > chargeBalance(ledger, charge)) throw new Error("Le montant dépasse le solde de l'échéance.");
        ledger.creditApplications.push({ id: crypto.randomUUID(), creditId: credit.id, studentId: credit.studentId, chargeId: charge.id, amount: data.amount, appliedAt: now });
      } else if (formId === "expense-form") {
        if (ledger.expenses.some(item => item.label === String(data.label).trim() && item.amount === data.amount && item.date === data.date && item.method === String(data.method).trim())) throw new Error("Une dépense identique est déjà enregistrée.");
        ledger.expenses.push({ id: crypto.randomUUID(), label: String(data.label).trim(), category: String(data.category).trim(), amount: data.amount, date: data.date, method: String(data.method).trim(), createdAt: now });
      } else if (formId === "inflow-form") {
        if (ledger.inflows.some(item => item.label === String(data.label).trim() && item.amount === data.amount && item.date === data.date && item.source === String(data.source).trim())) throw new Error("Une autre entrée identique est déjà enregistrée.");
        ledger.inflows.push({ id: crypto.randomUUID(), label: String(data.label).trim(), amount: data.amount, date: data.date, source: String(data.source).trim(), createdAt: now });
      } else {
        ledger.prospects.push({ id: crypto.randomUUID(), name: String(data.name).trim(), phone: String(data.phone || "").trim(), level: data.level, group: data.group, status: data.status, createdAt: now, updatedAt: now });
      }
      await commit(ledger, state.raw);
      form.reset();
      form.querySelectorAll('input[type="date"]').forEach(input => { input.value = localDate(); });
      show("Opération enregistrée et vérifiée.");
      render();
    } catch (error) {
      console.error("Opération non confirmée :", error);
      show(`${error.message} Aucune réussite n'est annoncée.`, "error");
    }
  }

  async function prepareCharges() {
    try {
      const state = readLedger();
      const ledger = state.ledger;
      const students = StudentManager.getAll().filter(student => !student.archived);
      const today = localDate();
      const feeFor = level => ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"].includes(level) ? 5000 : ["6e", "5e", "4e"].includes(level) ? 10000 : null;
      const cycleStart = (start, offset) => {
        const [year, month, day] = start.split("-").map(Number);
        const monthDate = new Date(Date.UTC(year, month - 1 + offset, 1));
        const maxDay = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
        monthDate.setUTCDate(Math.min(day, maxDay));
        return monthDate.toISOString().slice(0, 10);
      };
      const createdAt = new Date().toISOString();
      let skippedUnverified = 0;
      for (const student of students) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(student.startDate || "")) continue;
        const baseline = student.billingHistoryVerified === true
          ? null
          : ledger.billingBaselines.find(item => item.studentId === student.id);
        if (student.billingHistoryVerified !== true && !baseline) {
          skippedUnverified++;
          continue;
        }
        const levelAt = date => {
          if (baseline) {
            const changes = (Array.isArray(student.levelHistory) ? student.levelHistory : [])
              .filter(item => item.effectiveFrom >= baseline.firstBillPeriod && item.effectiveFrom <= date)
              .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
            return changes.at(-1)?.level || baseline.level;
          }
          const history = Array.isArray(student.levelHistory) && student.levelHistory.length
            ? [...student.levelHistory].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
            : [{ level: student.level, effectiveFrom: student.startDate }];
          return history.filter(item => item.effectiveFrom <= date).at(-1)?.level || student.level;
        };
        if (!baseline && !student.registrationExempted && !ledger.charges.some(charge => charge.studentId === student.id && charge.kind === "registration")) {
          ledger.charges.push({ id: `${student.id}:registration`, studentId: student.id, studentName: student.name, kind: "registration", label: "Frais d'inscription", amount: 2000, periodStart: student.startDate, dueDate: student.startDate, graceUntil: addCalendarDays(student.startDate, 15), createdAt });
        }
        for (let offset = 0; offset < 600; offset++) {
          const periodStart = cycleStart(student.startDate, offset);
          if (periodStart > today) break;
          if (baseline && periodStart < baseline.firstBillPeriod) continue;
          const id = `${student.id}:tuition:${periodStart}`;
          if (!ledger.charges.some(charge => charge.id === id)) {
            const level = levelAt(periodStart);
            const monthlyFee = feeFor(level);
            if (!monthlyFee) continue;
            ledger.charges.push({ id, studentId: student.id, studentName: student.name, kind: "tuition", label: `Scolarité ${periodStart.slice(0, 7)}`, amount: monthlyFee, periodStart, dueDate: periodStart, graceUntil: addCalendarDays(periodStart, 15), level, createdAt });
          }
        }
      }
      await commit(ledger, state.raw);
      show(`Échéances préparées et écriture vérifiée. Les tarifs restent figés.${skippedUnverified ? ` ${skippedUnverified} ancien(s) élève(s) ignoré(s) : historique tarifaire à vérifier avant facturation.` : ""}`);
      render();
    } catch (error) {
      show(`Échéances non préparées : ${error.message}`, "error");
    }
  }

  function populateCharges(ledgerArg) {
    const select = document.querySelector('#payment-form [name="chargeId"]');
    if (!select) return;
    try {
      const ledger = ledgerArg || readLedger().ledger;
      const studentId = document.querySelector('#payment-form [name="studentId"]')?.value;
      const previous = select.value;
      select.replaceChildren(new Option("Choisir une échéance", ""));
      ledger.charges.filter(charge => charge.studentId === studentId).forEach(charge => {
        const balance = chargeBalance(ledger, charge);
        if (balance > 0) select.add(new Option(`${charge.label} — ${balance.toLocaleString("fr-FR")} FCFA restant — échéance ${charge.dueDate}`, charge.id));
      });
      select.value = previous;
    } catch (error) {
      show(`Échéances indisponibles : ${error.message}`, "error");
    }
  }

  function populateCreditCharges(ledgerArg) {
    const creditId = document.querySelector('#credit-application-form [name="creditId"]')?.value;
    const select = document.querySelector('#credit-application-form [name="chargeId"]');
    if (!select) return;
    try {
      const ledger = ledgerArg || readLedger().ledger;
      const credit = ledger.credits.find(item => item.id === creditId);
      const previous = select.value;
      select.replaceChildren(new Option("Choisir une échéance", ""));
      if (credit) ledger.charges.filter(item => item.studentId === credit.studentId).forEach(charge => {
        const balance = chargeBalance(ledger, charge);
        if (balance > 0) select.add(new Option(`${charge.label} — ${balance.toLocaleString("fr-FR")} FCFA restant`, charge.id));
      });
      select.value = previous;
    } catch (error) {
      show(`Échéances indisponibles : ${error.message}`, "error");
    }
  }

  function downloadReceipt(payment) {
    try {
      const receipt = {
        application: "CAP SAVOIR MANAGER",
        type: "reçu numérique",
        receiptId: `DIG-${payment.id}`,
        student: payment.studentName,
        amountXOF: payment.amount,
        appliedToChargeXOF: payment.appliedAmount ?? payment.amount,
        creditedXOF: payment.creditAmount || 0,
        chargeId: payment.chargeId,
        receivedOn: payment.date,
        method: payment.method,
        operatorReference: payment.reference || null,
        paperReceiptNumber: payment.paperReceipt || null,
        generatedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `recu-${receipt.receiptId}-${payment.date}.json`;
      document.body.appendChild(link);
      try { link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (error) {
      show(`Reçu non préparé : ${error.message}`, "error");
    }
  }

  function printReceipt(payment) {
    const printWindow = window.open("", "_blank", "popup,width=480,height=720");
    if (!printWindow) {
      show("Impression non ouverte. Autorise la fenêtre d’impression puis réessaie.", "error");
      return;
    }
    printWindow.opener = null;
    const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
    const receipt = {
      id: `DIG-${payment.id}`,
      student: payment.studentName || "Élève non renseigné",
      amount: `${Number(payment.amount).toLocaleString("fr-FR")} FCFA`,
      date: payment.date || "Date non renseignée",
      method: payment.method || "Moyen non renseigné",
      reference: payment.reference || "Sans référence opérateur",
      paperNumber: payment.paperReceipt || "Aucun numéro papier renseigné"
    };
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reçu ${escape(receipt.id)}</title><style>
      @page{size:80mm auto;margin:5mm}*{box-sizing:border-box}body{margin:0;color:#101D40;font:14px/1.45 Arial,sans-serif}.receipt{width:100%;max-width:70mm;margin:0 auto;padding:3mm 0}.brand{padding-bottom:12px;border-bottom:2px solid #FF781F}.brand strong{display:block;font-size:18px;letter-spacing:.04em}.brand span{font-size:11px;letter-spacing:.18em;color:#667085}.title{margin:18px 0 4px;font-size:19px}.muted{color:#667085;font-size:11px}.amount{margin:16px 0;padding:13px;border-radius:8px;background:#FFF9F0;text-align:center}.amount strong{font-size:20px}.line{padding:8px 0;border-bottom:1px solid #E2E6ED;overflow-wrap:anywhere}.line span{display:block;color:#667085;font-size:11px}.footer{margin-top:18px;padding-top:10px;border-top:1px solid #E2E6ED;color:#667085;font-size:10px;text-align:center}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body><main class="receipt"><header class="brand"><strong>CAP SAVOIR</strong><span>MANAGER</span></header><h1 class="title">Reçu numérique</h1><p class="muted">Copie d’une opération enregistrée · ${escape(receipt.id)}</p><div class="amount"><span>Montant reçu</span><br><strong>${escape(receipt.amount)}</strong></div><div class="line"><span>Élève</span>${escape(receipt.student)}</div><div class="line"><span>Date d’encaissement</span>${escape(receipt.date)}</div><div class="line"><span>Moyen de paiement</span>${escape(receipt.method)}</div><div class="line"><span>Référence opérateur</span>${escape(receipt.reference)}</div><div class="line"><span>Numéro du reçu papier</span>${escape(receipt.paperNumber)}</div><footer class="footer">Document généré depuis le registre local de CAP SAVOIR MANAGER.</footer></main></body></html>`);
    printWindow.document.close();
    setTimeout(() => {
      try { printWindow.focus(); printWindow.print(); }
      catch (error) { console.error("Impression du reçu impossible :", error); }
    }, 250);
  }

  function nextCycleOnOrAfter(startDate, today) {
    for (let offset = 0; offset < 600; offset++) {
      const [year, month, day] = startDate.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1 + offset, 1));
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(day, last));
      const value = date.toISOString().slice(0, 10);
      if (value >= today) return value;
    }
    throw new Error("Impossible de calculer le prochain cycle à partir de la date de début.");
  }

  async function reconcileLegacy(studentId, registrationStatus, openingValue, evidence, confirmed) {
    try {
      if (!confirmed) throw new Error("Confirme le rapprochement avec les pièces du centre.");
      const amount = Number(openingValue);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Le solde d'ouverture doit être un montant entier positif ou nul.");
      const source = String(evidence || "").trim();
      if (!source) throw new Error("Indique la référence du cahier ou de la pièce vérifiée pour ce rapprochement.");
      if (!["paid", "due", "exempted"].includes(registrationStatus)) throw new Error("Indique l'état vérifié des frais d'inscription.");
      const state = readLedger();
      const ledger = state.ledger;
      const student = StudentManager.getAll().find(item => item.id === studentId && !item.archived);
      if (!student) throw new Error("Élève actif introuvable.");
      if (student.billingHistoryVerified === true || ledger.billingBaselines.some(item => item.studentId === studentId)) {
        throw new Error("Cet élève a déjà un historique tarifaire vérifié.");
      }
      const today = localDate();
      const firstBillPeriod = nextCycleOnOrAfter(student.startDate, today);
      const confirmedPlan = confirm(
        `Le rapprochement n'ajoutera aucune ancienne échéance automatiquement. La facturation périodique commencera le ${firstBillPeriod}. ` +
        `${amount ? `Un solde d'ouverture manuel de ${amount} FCFA sera enregistré avec la référence « ${source} ». ` : "Aucun solde d'ouverture manuel ne sera créé. "}` +
        `${registrationStatus === "due" ? "Les frais d'inscription de 2 000 FCFA seront créés comme montant dû. " : "Les frais d'inscription seront marqués comme déjà réglés ou exonérés, sans créer de transaction. "}` +
        "Confirme l'exactitude de ce rapprochement ?"
      );
      if (!confirmedPlan) return;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      ledger.billingBaselines.push({
        id, studentId, studentName: student.name, anchorDate: student.startDate,
        firstBillPeriod, level: student.level, registrationStatus,
        openingBalance: amount, evidence: source || null, reconciledAt: now
      });
      if (registrationStatus === "due") {
        ledger.charges.push({ id: `${id}:registration`, studentId, studentName: student.name, kind: "registration", label: "Frais d'inscription — rapprochement vérifié", amount: 2000, periodStart: today, dueDate: today, graceUntil: addCalendarDays(today, 15), evidence: "État confirmé lors du rapprochement manuel", createdAt: now });
      }
      if (amount > 0) {
        ledger.charges.push({ id: `${id}:opening`, studentId, studentName: student.name, kind: "opening_balance", label: "Solde antérieur saisi manuellement", amount, periodStart: today, dueDate: today, graceUntil: addCalendarDays(today, 15), evidence: source, createdAt: now });
      }
      await commit(ledger, state.raw);
      show(`Rapprochement vérifié pour ${student.name}. Aucune ancienne échéance n'a été inventée; le prochain cycle sera ${firstBillPeriod}.`);
      render();
    } catch (error) {
      show(`Rapprochement non enregistré : ${error.message}`, "error");
    }
  }

  function renderLegacyReconciliation(ledger, students) {
    const container = document.getElementById("billing-reconciliation");
    if (!container) return;
    const pending = students.filter(student => !student.archived && student.billingHistoryVerified !== true &&
      !ledger.billingBaselines.some(item => item.studentId === student.id));
    container.replaceChildren();
    if (!pending.length) {
      container.textContent = "Aucun ancien élève en attente de rapprochement.";
      return;
    }
    pending.forEach(student => {
      const row = document.createElement("div");
      row.className = "reconciliation-row";
      const title = document.createElement("p");
      title.textContent = `${student.name} — ${student.level} — date de début enregistrée : ${student.startDate}`;

      const registrationLabel = document.createElement("label");
      registrationLabel.textContent = "Frais d'inscription selon le cahier";
      const registration = document.createElement("select");
      registration.required = true;
      registration.add(new Option("Choisir après vérification", ""));
      registration.add(new Option("Déjà réglés — vérifié", "paid"));
      registration.add(new Option("À facturer : 2 000 FCFA", "due"));
      registration.add(new Option("Exonérés — vérifié", "exempted"));
      registrationLabel.appendChild(registration);

      const amountLabel = document.createElement("label");
      amountLabel.textContent = "Solde d'ouverture antérieur vérifié (FCFA; 0 si aucun)";
      const amount = document.createElement("input");
      amount.type = "number"; amount.min = "0"; amount.step = "1"; amount.value = "0";
      amountLabel.appendChild(amount);

      const evidenceLabel = document.createElement("label");
      evidenceLabel.textContent = "Référence du cahier ou de la pièce justificative";
      const evidence = document.createElement("input");
      evidence.maxLength = 160;
      evidenceLabel.appendChild(evidence);

      const confirmationLabel = document.createElement("label");
      const confirmation = document.createElement("input");
      confirmation.type = "checkbox";
      confirmationLabel.append(confirmation, document.createTextNode("J'ai rapproché les montants et l'inscription avec les pièces du centre."));

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Enregistrer le rapprochement";
      button.addEventListener("click", () => reconcileLegacy(
        student.id, registration.value, amount.value, evidence.value, confirmation.checked
      ));
      row.append(title, registrationLabel, amountLabel, evidenceLabel, confirmationLabel, button);
      container.appendChild(row);
    });
  }

  function render() {
    try {
      const ledger = readLedger().ledger;
      const students = StudentManager.getAll();
      renderLegacyReconciliation(ledger, students);
      const studentSelect = document.querySelector('#payment-form [name="studentId"]');
      const refundSelect = document.querySelector('#refund-form [name="paymentId"]');
      const creditSelect = document.querySelector('#credit-application-form [name="creditId"]');
      const creditChargeSelect = document.querySelector('#credit-application-form [name="chargeId"]');
      if (studentSelect) {
        const old = studentSelect.value;
        studentSelect.replaceChildren(new Option("Choisir un élève", ""));
        students.filter(item => !item.archived).forEach(item => studentSelect.add(new Option(`${item.name} — ${item.level}`, item.id)));
        studentSelect.value = old;
      }
      populateCharges(ledger);
      if (creditSelect) {
        const previousCredit = creditSelect.value;
        creditSelect.replaceChildren(new Option("Choisir un crédit", ""));
        ledger.credits.forEach(credit => {
          const balance = creditBalance(ledger, credit);
          if (balance > 0) creditSelect.add(new Option(`${credit.studentName} — ${balance.toLocaleString("fr-FR")} FCFA`, credit.id));
        });
        creditSelect.value = previousCredit;
      }
      populateCreditCharges(ledger);
      if (refundSelect) {
        const old = refundSelect.value;
        refundSelect.replaceChildren(new Option("Choisir le paiement", ""));
        ledger.payments.forEach(item => {
          const refunded = ledger.refunds.filter(refund => refund.paymentId === item.id).reduce((sum, refund) => sum + refund.amount, 0);
          if (refunded < item.amount) refundSelect.add(new Option(`${item.studentName} — ${item.amount - refunded} FCFA disponibles (${item.date})`, item.id));
        });
        refundSelect.value = old;
      }
      const summary = document.getElementById("operations-summary");
      const paid = ledger.payments.reduce((sum, item) => sum + item.amount, 0);
      const refunds = ledger.refunds.reduce((sum, item) => sum + item.amount, 0);
      const expenses = ledger.expenses.reduce((sum, item) => sum + item.amount, 0);
      const inflows = ledger.inflows.reduce((sum, item) => sum + item.amount, 0);
      const credits = ledger.credits.reduce((sum, item) => sum + creditBalance(ledger, item), 0);
      const cards = [[paid.toLocaleString("fr-FR") + " FCFA", "Paiements reçus"], [refunds.toLocaleString("fr-FR") + " FCFA", "Remboursements"], [credits.toLocaleString("fr-FR") + " FCFA", "Crédits disponibles"], [expenses.toLocaleString("fr-FR") + " FCFA", "Dépenses décaissées"], [(paid - refunds + inflows - expenses).toLocaleString("fr-FR") + " FCFA", "Trésorerie nette déclarée"]].map(([value, label]) => {
        const card = document.createElement("div"); card.className = "metric-card";
        const strong = document.createElement("strong"); strong.textContent = value;
        const caption = document.createElement("span"); caption.textContent = label;
        card.append(strong, caption); return card;
      });
      summary.replaceChildren(...cards);
      const history = document.getElementById("operations-history");
      const entries = [
        ...ledger.payments.map(item => ({ ...item, kind: "Paiement reçu", type: "payment" })),
        ...ledger.refunds.map(item => ({ ...item, kind: "Remboursement", type: "refund" })),
        ...ledger.creditApplications.map(item => ({ ...item, date: item.appliedAt.slice(0, 10), kind: "Crédit appliqué", type: "credit" })),
        ...ledger.expenses.map(item => ({ ...item, kind: `Dépense — ${item.label}`, type: "expense" })),
        ...ledger.inflows.map(item => ({ ...item, kind: `Autre entrée — ${item.label}`, type: "inflow" }))
      ].sort((a, b) => b.date.localeCompare(a.date));
      history.replaceChildren();
      const historySearch = (document.getElementById("operations-search")?.value || "").trim().toLocaleLowerCase("fr");
      const historyType = document.getElementById("operations-kind-filter")?.value || "all";
      let visibleHistory = 0;
      entries.forEach(item => {
        const searchText = [item.kind, item.studentName, item.label, item.method, item.reference, item.paperReceipt, item.category, item.source, item.reason, item.amount].filter(Boolean).join(" ").toLocaleLowerCase("fr");
        if ((historyType !== "all" && item.type !== historyType) || (historySearch && !searchText.includes(historySearch))) return;
        visibleHistory++;
        const card = document.createElement("article");
        card.className = "transaction-card";
        card.dataset.kind = item.type;
        const title = document.createElement("strong");
        title.textContent = item.kind;
        const details = document.createElement("p");
        const subject = item.studentName || item.label || "Opération";
        details.textContent = `${item.date} · ${subject} · ${item.amount.toLocaleString("fr-FR")} FCFA`;
        card.append(title, details);
        const meta = [];
        if (item.method) meta.push(`Moyen : ${item.method}`);
        if (item.reference) meta.push(`Référence : ${item.reference}`);
        if (item.paperReceipt) meta.push(`Reçu papier : ${item.paperReceipt}`);
        if (item.reason) meta.push(`Motif : ${item.reason}`);
        if (item.category) meta.push(`Catégorie : ${item.category}`);
        if (item.creditAmount > 0) meta.push(`Crédit créé : ${item.creditAmount.toLocaleString("fr-FR")} FCFA`);
        if (meta.length) {
          const metadata = document.createElement("p");
          metadata.textContent = meta.join(" · ");
          card.appendChild(metadata);
        }
        if (item.type === "payment") {
          const actions = document.createElement("div");
          actions.className = "transaction-actions";
          const printButton = document.createElement("button");
          printButton.type = "button";
          printButton.textContent = "Imprimer le reçu";
          printButton.addEventListener("click", () => printReceipt(item));
          const downloadButton = document.createElement("button");
          downloadButton.type = "button";
          downloadButton.textContent = "Télécharger le reçu JSON";
          downloadButton.addEventListener("click", () => downloadReceipt(item));
          actions.append(printButton, downloadButton);
          card.appendChild(actions);
        }
        history.appendChild(card);
      });
      if (!visibleHistory) history.textContent = entries.length ? "Aucune opération ne correspond aux filtres." : "Aucune opération enregistrée.";

      const expenseList = document.getElementById("expense-list");
      const expenseSearch = (document.getElementById("expense-search")?.value || "").trim().toLocaleLowerCase("fr");
      if (expenseList) {
        expenseList.replaceChildren();
        const visibleExpenses = ledger.expenses.filter(item => [item.label, item.category, item.method, item.reference, item.evidence, item.date, item.amount].filter(Boolean).join(" ").toLocaleLowerCase("fr").includes(expenseSearch));
        if (!visibleExpenses.length) expenseList.textContent = ledger.expenses.length ? "Aucune dépense ne correspond à cette recherche." : "Aucune dépense enregistrée.";
        visibleExpenses.forEach(item => {
          const card = document.createElement("article");
          card.className = "expense-card";
          const title = document.createElement("strong");
          title.textContent = item.label;
          const details = document.createElement("p");
          details.textContent = `${item.date} · ${item.amount.toLocaleString("fr-FR")} FCFA · ${item.category || "Catégorie non renseignée"}`;
          const payment = document.createElement("p");
          payment.textContent = `Décaissement saisi · ${item.method || "Moyen non renseigné"}${item.reference || item.evidence ? ` · Référence : ${item.reference || item.evidence}` : ""}`;
          card.append(title, details, payment);
          expenseList.appendChild(card);
        });
      }

      const prospects = document.getElementById("prospects-list");
      const prospectSearch = (document.getElementById("prospect-search")?.value || "").trim().toLocaleLowerCase("fr");
      if (prospects) {
        prospects.replaceChildren();
        const visibleProspects = ledger.prospects.filter(item => [item.name, item.phone, item.level, item.group, item.status].filter(Boolean).join(" ").toLocaleLowerCase("fr").includes(prospectSearch));
        if (!visibleProspects.length) prospects.textContent = ledger.prospects.length ? "Aucun prospect ne correspond à cette recherche." : "Aucun prospect enregistré.";
        visibleProspects.forEach(item => {
          const card = document.createElement("article");
          card.className = "prospect-card";
          const name = document.createElement("strong");
          name.textContent = item.name;
          const details = document.createElement("p");
          details.textContent = `${item.level || "Niveau non renseigné"} · ${item.group || "Groupe non renseigné"} · ${item.status || "Statut non renseigné"}`;
          card.append(name, details);
          if (item.phone) {
            const phone = document.createElement("a");
            phone.href = `tel:${item.phone.replace(/[^+\d]/g, "")}`;
            phone.className = "prospect-phone";
            phone.textContent = item.phone;
            card.appendChild(phone);
          } else {
            const phone = document.createElement("p");
            phone.textContent = "Aucun téléphone renseigné.";
            card.appendChild(phone);
          }
          const created = document.createElement("p");
          created.textContent = item.createdAt ? `Contact enregistré le ${item.createdAt.slice(0, 10)}.` : "Date de création non renseignée.";
          card.appendChild(created);
          prospects.appendChild(card);
        });
      }
      if (!studentSelect?.options.length || studentSelect.options.length === 1) show("Aucun élève actif disponible pour enregistrer un paiement.", "error");
    } catch (error) {
      show(`Registre indisponible; affichage précédent conservé si présent : ${error.message}`, "error");
    }
  }

  function getAll() { return readLedger().ledger; }

  function captureRestoreSnapshot() {
    if (typeof DataRestoreRecovery !== "undefined") DataRestoreRecovery.assertReadable();
    const raw = {
      students: localStorage.getItem(StudentManager.storageKey),
      attendance: localStorage.getItem(AttendanceManager.storageKey),
      operations: readRaw()
    };
    return {
      students: StudentManager.getAll(),
      attendance: AttendanceManager.getAll(),
      operations: readLedger().ledger,
      raw
    };
  }

  function validateFullBackup(backup) {
    if (!backup || backup.application !== "CAP SAVOIR MANAGER" || ![3, 4].includes(backup.version) ||
        !Array.isArray(backup.students) || !Array.isArray(backup.attendance) ||
        !backup.operations || typeof backup.operations !== "object" || Array.isArray(backup.operations)) {
      throw new Error("Sauvegarde incomplète ou version non prise en charge. Aucun registre n'a été modifié.");
    }
    const isDate = value => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    const studentIds = new Set();
    for (const student of backup.students) {
      if (!student || typeof student.id !== "string" || !student.id || studentIds.has(student.id) ||
          typeof student.name !== "string" || typeof student.level !== "string" ||
          (student.parent !== undefined && typeof student.parent !== "string") ||
          (student.phone !== undefined && typeof student.phone !== "string") ||
          typeof student.group !== "string" || !isDate(student.startDate) ||
          typeof student.archived !== "boolean") throw new Error("La liste des élèves de la sauvegarde est invalide.");
      studentIds.add(student.id);
    }
    const sessionIds = new Set();
    const sessionKeys = new Set();
    for (const session of backup.attendance) {
      if (!session || typeof session.id !== "string" || !session.id || sessionIds.has(session.id) ||
          !isDate(session.date) || typeof session.group !== "string" ||
          (session.sessionStatus !== undefined && !["planned", "completed", "cancelled"].includes(session.sessionStatus)) ||
          !Array.isArray(session.entries)) throw new Error("L'historique des présences de la sauvegarde est invalide.");
      sessionIds.add(session.id);
      const sessionKey = `${session.date}\u0000${session.group}`;
      if (sessionKeys.has(sessionKey)) throw new Error("La sauvegarde contient deux fiches pour la même séance.");
      sessionKeys.add(sessionKey);
      const entryIds = new Set();
      if (session.entries.some(entry => {
        if (!entry || typeof entry.studentId !== "string" || !studentIds.has(entry.studentId) ||
            !["present", "absent", "late", "excused"].includes(entry.status) || entryIds.has(entry.studentId)) return true;
        entryIds.add(entry.studentId);
        return false;
      })) {
        throw new Error("Une présence dans la sauvegarde est invalide.");
      }
    }
    const ledger = { ...backup.operations };
    arrays.forEach(key => {
      if (ledger[key] === undefined && backup.version === 3) ledger[key] = [];
      if (!Array.isArray(ledger[key])) throw new Error(`Le registre ${key} de la sauvegarde est invalide.`);
    });
    const paymentIds = new Set();
    const paymentsById = new Map();
    const paperReceiptIds = new Set();
    const mobileReferences = new Set();
    const mobileRefundReferences = new Set();
    const refundIds = new Set();
    for (const payment of ledger.payments) {
      if (!payment || typeof payment.id !== "string" || !payment.id || paymentIds.has(payment.id) ||
          typeof payment.studentId !== "string" || typeof payment.chargeId !== "string" ||
          !Number.isSafeInteger(payment.amount) || payment.amount <= 0 || !isDate(payment.date) ||
          typeof payment.method !== "string") {
        throw new Error("Un paiement de la sauvegarde est invalide ou dupliqué.");
      }
      const hasAppliedAmount = Object.prototype.hasOwnProperty.call(payment, "appliedAmount");
      const hasCreditAmount = Object.prototype.hasOwnProperty.call(payment, "creditAmount");
      if (hasAppliedAmount !== hasCreditAmount) throw new Error("La ventilation d'un paiement est incomplète.");
      if (hasAppliedAmount && (!Number.isSafeInteger(payment.appliedAmount) || payment.appliedAmount < 0 ||
          !Number.isSafeInteger(payment.creditAmount) || payment.creditAmount < 0 ||
          payment.appliedAmount + payment.creditAmount !== payment.amount)) {
        throw new Error("La ventilation d'un paiement doit correspondre exactement au montant reçu.");
      }
      if (!hasAppliedAmount && ledger.credits.some(item => item?.paymentId === payment.id)) {
        throw new Error("Un paiement historique lié à un crédit n'a pas de ventilation non ambiguë.");
      }
      paymentIds.add(payment.id);
      if (payment.paperReceipt) {
        if (payment.paperReceipt === "009" &&
            !(payment.studentName === "Kuya Marie Imelda" && payment.amount === 5000 && payment.date === "2026-10-29")) {
          throw new Error("Le reçu papier 009 ne correspond pas au paiement historique identifié.");
        }
        if (paperReceiptIds.has(payment.paperReceipt)) throw new Error("La sauvegarde réutilise un numéro de reçu papier.");
        paperReceiptIds.add(payment.paperReceipt);
      }
      paymentsById.set(payment.id, payment);
      if (["Orange Money", "MTN Money", "Wave", "Moov Money"].includes(payment.method) && payment.reference) {
        if (typeof payment.reference !== "string") throw new Error("Une référence de paiement mobile est invalide.");
        const reference = `${payment.method}\u0000${payment.reference.toLowerCase()}`;
        if (mobileReferences.has(reference)) throw new Error("La sauvegarde contient une référence mobile en double.");
        mobileReferences.add(reference);
      }
    }
    const chargeIds = new Set();
    const chargesById = new Map();
    for (const charge of ledger.charges) {
      if (!charge || typeof charge.id !== "string" || !charge.id || chargeIds.has(charge.id) ||
          typeof charge.studentId !== "string" || !studentIds.has(charge.studentId) || !Number.isSafeInteger(charge.amount) || charge.amount <= 0) {
        throw new Error("Une échéance de la sauvegarde est invalide.");
      }
      chargeIds.add(charge.id);
      chargesById.set(charge.id, charge);
    }
    for (const payment of ledger.payments) {
      const charge = chargesById.get(payment.chargeId);
      if (!charge || charge.studentId !== payment.studentId || !studentIds.has(payment.studentId)) {
        throw new Error("Un paiement de la sauvegarde ne correspond pas à une échéance et un élève existants.");
      }
    }
    const creditIds = new Set();
    const creditAmountsByPayment = new Map();
    for (const credit of ledger.credits) {
      if (!credit || typeof credit.id !== "string" || creditIds.has(credit.id) || !paymentIds.has(credit.paymentId) ||
          typeof credit.studentId !== "string" || !Number.isSafeInteger(credit.amount) || credit.amount <= 0) throw new Error("Un crédit de la sauvegarde est invalide.");
      const payment = paymentsById.get(credit.paymentId);
      if (payment.studentId !== credit.studentId || payment.creditAmount === undefined || credit.amount > payment.creditAmount) throw new Error("Le crédit ne correspond pas au paiement source.");
      creditIds.add(credit.id);
      creditAmountsByPayment.set(credit.paymentId, (creditAmountsByPayment.get(credit.paymentId) || 0) + credit.amount);
    }
    for (const payment of ledger.payments) {
      const expectedCredit = payment.creditAmount ?? 0;
      if ((creditAmountsByPayment.get(payment.id) || 0) !== expectedCredit) {
        throw new Error("Les crédits associés à un paiement ne correspondent pas à sa ventilation.");
      }
    }
    const applicationIds = new Set();
    for (const application of ledger.creditApplications) {
      if (!application || typeof application.id !== "string" || !application.id || applicationIds.has(application.id) ||
          !creditIds.has(application.creditId) || !chargeIds.has(application.chargeId) ||
          !Number.isSafeInteger(application.amount) || application.amount <= 0 ||
          typeof application.appliedAt !== "string" || Number.isNaN(Date.parse(application.appliedAt))) {
        throw new Error("Une application de crédit de la sauvegarde est invalide ou dupliquée.");
      }
      applicationIds.add(application.id);
      const credit = ledger.credits.find(item => item.id === application.creditId);
      const charge = chargesById.get(application.chargeId);
      if (credit.studentId !== application.studentId || charge.studentId !== application.studentId) throw new Error("Le crédit appliqué et l'échéance ne correspondent pas au même élève.");
    }
    const chargeRefundsByPayment = new Map();
    for (const refund of ledger.refunds) {
      if (!refund || typeof refund.id !== "string" || !refund.id || refundIds.has(refund.id) ||
          !paymentIds.has(refund.paymentId) || !Number.isSafeInteger(refund.amount) || refund.amount <= 0 || !isDate(refund.date) ||
          (refund.chargeId && !chargeIds.has(refund.chargeId)) || (refund.creditId && !creditIds.has(refund.creditId))) throw new Error("Un remboursement de la sauvegarde est invalide.");
      refundIds.add(refund.id);
      const payment = paymentsById.get(refund.paymentId);
      const hasChargeAmount = Object.prototype.hasOwnProperty.call(refund, "chargeAmount");
      const hasCreditRefund = Object.prototype.hasOwnProperty.call(refund, "creditAmount");
      if (hasChargeAmount !== hasCreditRefund) throw new Error("La ventilation d'un remboursement est incomplète.");
      let chargeAmount;
      let creditRefundAmount;
      if (hasChargeAmount) {
        chargeAmount = refund.chargeAmount;
        creditRefundAmount = refund.creditAmount;
        if (!Number.isSafeInteger(chargeAmount) || chargeAmount < 0 ||
            !Number.isSafeInteger(creditRefundAmount) || creditRefundAmount < 0 ||
            chargeAmount + creditRefundAmount !== refund.amount) {
          throw new Error("La ventilation d'un remboursement ne correspond pas exactement au montant remboursé.");
        }
      } else {
        const paymentHasCredit = (payment.creditAmount ?? 0) > 0 || ledger.credits.some(item => item?.paymentId === payment.id);
        if (paymentHasCredit || refund.creditId) throw new Error("Un ancien remboursement lié à un crédit a une ventilation ambiguë.");
        chargeAmount = refund.amount;
        creditRefundAmount = 0;
      }
      if (creditRefundAmount > 0 && !refund.creditId) throw new Error("Un remboursement de crédit doit référencer son crédit source.");
      if (chargeAmount > 0 && refund.chargeId !== payment.chargeId) throw new Error("Un remboursement imputé à une échéance doit référencer celle du paiement.");
      if (refund.studentId !== undefined && refund.studentId !== payment.studentId) throw new Error("Le remboursement ne correspond pas à l'élève du paiement.");
      if (refund.method !== undefined && typeof refund.method !== "string") throw new Error("Le moyen d'un remboursement de la sauvegarde est invalide.");
      if (["Orange Money", "MTN Money", "Wave", "Moov Money"].includes(refund.method)) {
        if (typeof refund.reference !== "string" || !refund.reference.trim()) throw new Error("Un remboursement mobile de la sauvegarde n'a pas de référence opérateur.");
        const reference = `${refund.method}\u0000${refund.reference.trim().toLowerCase()}`;
        if (mobileRefundReferences.has(reference)) throw new Error("La sauvegarde contient une référence de remboursement mobile en double.");
        mobileRefundReferences.add(reference);
      }
      if (refund.reason !== undefined && typeof refund.reason !== "string") throw new Error("Le motif d'un remboursement de la sauvegarde est invalide.");
      if (refund.chargeId && refund.chargeId !== payment.chargeId) throw new Error("Le remboursement référence une autre échéance que son paiement.");
      if (refund.creditId && ledger.credits.find(item => item.id === refund.creditId)?.paymentId !== refund.paymentId) throw new Error("Le crédit remboursé ne correspond pas au paiement.");
      chargeRefundsByPayment.set(refund.paymentId, (chargeRefundsByPayment.get(refund.paymentId) || 0) + chargeAmount);
    }
    for (const payment of ledger.payments) {
      const refunded = ledger.refunds.filter(item => item.paymentId === payment.id).reduce((sum, item) => sum + item.amount, 0);
      if (refunded > payment.amount) throw new Error("Les remboursements dépassent le paiement d'origine.");
      if ((chargeRefundsByPayment.get(payment.id) || 0) > (payment.appliedAmount ?? payment.amount)) {
        throw new Error("Les remboursements imputés à l'échéance dépassent la part affectée du paiement.");
      }
    }
    for (const credit of ledger.credits) {
      const applied = ledger.creditApplications.filter(item => item.creditId === credit.id).reduce((sum, item) => sum + item.amount, 0);
      const refunded = ledger.refunds.filter(item => item.creditId === credit.id).reduce((sum, item) => sum + (item.creditAmount ?? 0), 0);
      if (applied + refunded > credit.amount) throw new Error("Les utilisations du crédit dépassent son montant initial.");
    }
    for (const charge of ledger.charges) {
      const payments = ledger.payments.filter(item => item.chargeId === charge.id).reduce((sum, item) => sum + (item.appliedAmount ?? item.amount), 0);
      const refunds = ledger.refunds.filter(item => item.chargeId === charge.id).reduce((sum, item) => sum + (item.chargeAmount ?? item.amount), 0);
      const creditsApplied = ledger.creditApplications.filter(item => item.chargeId === charge.id).reduce((sum, item) => sum + item.amount, 0);
      if (payments + creditsApplied - refunds > charge.amount) throw new Error("Les paiements et crédits appliqués dépassent le montant de l'échéance.");
    }
    for (const baseline of ledger.billingBaselines) {
      if (!baseline || typeof baseline.id !== "string" || typeof baseline.studentId !== "string" || !studentIds.has(baseline.studentId) ||
          !isDate(baseline.firstBillPeriod) || !["paid", "due", "exempted"].includes(baseline.registrationStatus) ||
          !Number.isSafeInteger(baseline.openingBalance) || baseline.openingBalance < 0) throw new Error("Un rapprochement tarifaire de la sauvegarde est invalide.");
    }
    for (const row of [...ledger.expenses, ...ledger.inflows]) {
      if (!row || typeof row.id !== "string" || !Number.isSafeInteger(row.amount) || row.amount <= 0 || !isDate(row.date)) throw new Error("Une opération de trésorerie de la sauvegarde est invalide.");
    }
    for (const prospect of ledger.prospects) {
      if (!prospect || !prospect.id || !prospect.name || prospect.id.constructor !== String || prospect.name.constructor !== String) throw new Error("Un prospect de la sauvegarde est invalide.");
    }
    return { students: backup.students, attendance: backup.attendance, operations: ledger };
  }

  async function restoreAll(backup, expectedRaw) {
    const validated = validateFullBackup(backup);
    const targets = [
      { name: "students", key: StudentManager.storageKey, value: JSON.stringify(validated.students) },
      { name: "attendance", key: AttendanceManager.storageKey, value: JSON.stringify(validated.attendance) },
      { name: "operations", key: storageKey, value: JSON.stringify(validated.operations) }
    ];
    const preflight = () => captureRestoreSnapshot();
    if (typeof DataRestoreRecovery !== "undefined") return DataRestoreRecovery.restore(targets, expectedRaw, preflight);
    throw new Error("Le journal sécurisé de restauration n'est pas initialisé. Restauration refusée.");
  }

  function getReminders() {
    const ledger = readLedger().ledger;
    const today = localDate();
    const now = new Date(`${today}T00:00:00Z`);
    const limit = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3));
    const through = limit.toISOString().slice(0, 10);
    return ledger.charges.filter(charge =>
      charge.dueDate <= through && chargeBalance(ledger, charge) > 0
    );
  }

  return { init, getAll, getReminders, captureRestoreSnapshot, validateBackup: validateFullBackup, restoreAll, refresh: render };
})();
