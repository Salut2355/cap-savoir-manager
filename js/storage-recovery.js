"use strict";

// Journal local de restauration. Il rend les interruptions récupérables, mais
// ne transforme pas localStorage en transaction atomique multi-clé.
const DataRestoreRecovery = (() => {
  const journalKey = "cap-savoir-restore-journal-v1";
  const lockName = "cap-savoir-data-write";
  const stores = {
    students: "cap-savoir-students-v1",
    attendance: "cap-savoir-attendance-v1",
    operations: "cap-savoir-operations-v1"
  };
  const operationArrays = ["charges", "payments", "refunds", "credits", "creditApplications", "expenses", "inflows", "prospects", "billingBaselines"];
  let state = "ready";
  let stateError = null;
  let recoveryNotice = "";

  try {
    if (localStorage.getItem(journalKey) !== null) state = "pending";
  } catch (cause) {
    state = "blocked";
    stateError = error("Le journal de restauration ne peut pas être contrôlé.", "RECOVERY_STORAGE_ACCESS", cause);
  }

  function error(message, code, cause) {
    return Object.assign(new Error(message), { code, cause });
  }

  function getRaw(key) {
    try { return localStorage.getItem(key); }
    catch (cause) { throw error("Stockage local inaccessible pendant la récupération.", "RECOVERY_STORAGE_ACCESS", cause); }
  }

  function setRaw(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (cause) { throw error(`Écriture locale impossible pour ${key}.`, "RECOVERY_STORAGE_WRITE", cause); }
    if (getRaw(key) !== value) throw error(`Vérification locale impossible pour ${key}.`, "RECOVERY_STORAGE_VERIFY");
  }

  function validateRoot(name, raw, strictOperations = true) {
    let value;
    try { value = JSON.parse(raw); }
    catch (cause) { throw error(`Le contenu journalisé de ${name} n'est pas un JSON lisible.`, "RECOVERY_JOURNAL_INVALID", cause); }
    if (name === "students" || name === "attendance") {
      if (!Array.isArray(value)) throw error(`Le contenu journalisé de ${name} n'est pas une liste.`, "RECOVERY_JOURNAL_INVALID");
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        operationArrays.some(key => value[key] !== undefined && !Array.isArray(value[key])) ||
        (strictOperations && operationArrays.some(key => !Array.isArray(value[key])))) {
      throw error("Le contenu journalisé des opérations est incomplet.", "RECOVERY_JOURNAL_INVALID");
    }
  }

  function parseJournal(raw) {
    let journal;
    try { journal = JSON.parse(raw); }
    catch (cause) { throw error("Le journal de restauration est illisible. Les opérations métier restent bloquées.", "RECOVERY_JOURNAL_INVALID", cause); }
    const names = Object.keys(stores);
    if (!journal || journal.version !== 1 || typeof journal.id !== "string" ||
        !["ROLLBACK", "COMMIT!!"].includes(journal.decision) ||
        typeof journal.integrity !== "string" || !/^[0-9a-f]{64}$/.test(journal.integrity) ||
        !journal.originals || !journal.targets ||
        names.some(name => !(name in journal.originals) || !(name in journal.targets)) ||
        names.some(name => journal.originals[name] !== null && typeof journal.originals[name] !== "string") ||
        names.some(name => typeof journal.targets[name] !== "string")) {
      throw error("La structure du journal de restauration est invalide. Les registres n'ont pas été interprétés.", "RECOVERY_JOURNAL_INVALID");
    }
    names.forEach(name => {
      validateRoot(name, journal.targets[name]);
      if (journal.originals[name] !== null) validateRoot(name, journal.originals[name], false);
    });
    return journal;
  }

  function readJournal() {
    const raw = getRaw(journalKey);
    if (raw === null) return null;
    return verifyJournal(raw);
  }

  async function journalDigest(journal) {
    if (!globalThis.crypto?.subtle?.digest || typeof TextEncoder === "undefined") {
      throw error("SHA-256 indisponible; journal non écrit et restauration annulée.", "RECOVERY_HASH_UNAVAILABLE");
    }
    const payload = {
      version: journal.version,
      id: journal.id,
      decision: journal.decision,
      originals: journal.originals,
      targets: journal.targets
    };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function verifyJournal(raw) {
    const journal = parseJournal(raw);
    if (await journalDigest(journal) !== journal.integrity) {
      throw error("L'empreinte du journal de restauration ne correspond pas. Les opérations métier restent bloquées.", "RECOVERY_JOURNAL_INTEGRITY");
    }
    return { raw, journal };
  }

  function lock(callback) {
    if (!globalThis.navigator?.locks?.request) {
      throw error("Le verrouillage inter-onglets est indisponible. Aucune restauration ni écriture métier n'est autorisée.", "RECOVERY_LOCK_UNAVAILABLE");
    }
    return navigator.locks.request(lockName, callback);
  }

  function assertReadable() {
    if (state !== "ready") {
      throw error(stateError?.message || "La récupération des données n'est pas terminée. Opérations métier bloquées.", "RECOVERY_NOT_READY", stateError);
    }
    if (getRaw(journalKey) !== null) {
      throw error("Une restauration est en cours ou doit être récupérée. Recharge l'application avant de lire les registres.", "RECOVERY_PENDING");
    }
  }

  async function writeJournal(journal) {
    journal.integrity = await journalDigest(journal);
    const serialized = JSON.stringify(journal);
    try { localStorage.setItem(journalKey, serialized); }
    catch (cause) { throw error("Le journal n'a pas pu être enregistré. Aucun registre métier n'a été modifié.", "RECOVERY_JOURNAL_WRITE", cause); }
    const reread = getRaw(journalKey);
    if (reread !== serialized) throw error("Le journal écrit n'a pas été relu à l'identique. Aucun registre métier n'a été modifié.", "RECOVERY_JOURNAL_VERIFY");
    const checked = await verifyJournal(reread);
    if (checked.raw !== serialized) throw error("Le journal relu ne correspond pas exactement au journal préparé.", "RECOVERY_JOURNAL_VERIFY");
  }

  function removeJournal() {
    try { localStorage.removeItem(journalKey); }
    catch (cause) { throw error("Le journal n'a pas pu être nettoyé; la récupération reste nécessaire.", "RECOVERY_JOURNAL_CLEANUP", cause); }
    if (getRaw(journalKey) !== null) throw error("Le journal est toujours présent; la récupération reste nécessaire.", "RECOVERY_JOURNAL_CLEANUP");
  }

  function applyValues(values, strictOperations = true) {
    Object.entries(stores).forEach(([name, key]) => setRaw(key, values[name]));
    Object.entries(stores).forEach(([name, key]) => {
      if (getRaw(key) !== values[name]) throw error(`Le registre ${name} n'a pas passé la vérification après récupération.`, "RECOVERY_STORE_VERIFY");
      if (values[name] !== null) validateRoot(name, values[name], strictOperations);
    });
  }

  async function recoverJournalUnlocked() {
    const item = await readJournal();
    if (!item) return false;
    const { journal } = item;
    if (journal.decision === "ROLLBACK") {
      applyValues(journal.originals, false);
      removeJournal();
      recoveryNotice = "Une restauration interrompue a été annulée; les trois valeurs antérieures ont été rétablies et vérifiées.";
    } else {
      applyValues(journal.targets);
      removeJournal();
      recoveryNotice = "Une restauration interrompue a été finalisée conformément à sa décision enregistrée; les trois registres ont été vérifiés.";
    }
    return true;
  }

  async function initialize() {
    if (!navigator?.locks?.request) {
      if (getRaw(journalKey) !== null) throw error("Un journal existe mais ce navigateur ne peut pas le récupérer sans verrou inter-onglets.", "RECOVERY_LOCK_UNAVAILABLE");
      return;
    }
    await lock(recoverJournalUnlocked);
  }

  const ready = initialize().then(() => {
    state = "ready";
  }).catch(cause => {
    state = "blocked";
    stateError = cause;
    throw cause;
  });
  ready.catch(() => {});

 async function withLock(callback) {
  await ready;

  return lock(async () => {
    await recoverJournalUnlocked();
    assertReadable();
    return callback();
  });
}

  async function restore(targets, expectedRaw, preflight) {
    if (state !== "ready") assertReadable();
    return lock(async () => {
      await recoverJournalUnlocked();
      const names = Object.keys(stores);
      if (!Array.isArray(targets) || targets.length !== names.length ||
          names.some(name => !targets.some(item => item.name === name && item.key === stores[name] && typeof item.value === "string"))) {
        throw error("La restauration doit contenir exactement les trois registres attendus.", "RESTORE_INVALID_TARGETS");
      }
      const originals = Object.fromEntries(names.map(name => [name, getRaw(stores[name])]));
      if (!expectedRaw || names.some(name => originals[name] !== expectedRaw[name])) {
        throw error("Les registres ont changé depuis la sauvegarde préalable. Restauration annulée.", "RESTORE_STALE");
      }
      if (typeof preflight === "function") preflight();
      const targetValues = Object.fromEntries(targets.map(item => [item.name, item.value]));
      names.forEach(name => validateRoot(name, targetValues[name]));
      const journal = { version: 1, id: crypto.randomUUID(), decision: "ROLLBACK", originals, targets: targetValues };
      let journalPrepared = false;
      try {
        await writeJournal(journal);
        journalPrepared = true;
      } catch (cause) {
        const current = getRaw(journalKey);
        if (current !== null) {
          state = "blocked";
          stateError = cause;
          throw error("L'état du journal est incertain. Aucun registre n'a été écrit; recharge l'application pour lancer la récupération.", "RESTORE_PARTIAL", cause);
        }
        throw cause;
      }

      try {
        applyValues(targetValues);
        journal.decision = "COMMIT!!";
        await writeJournal(journal);
        removeJournal();
        return true;
      } catch (cause) {
        if (!journalPrepared) throw cause;
        try {
          const current = await readJournal();
          if (!current) {
            // Le marqueur a déjà été supprimé après vérification de la décision durable.
            if (Object.entries(stores).every(([name, key]) => getRaw(key) === targetValues[name])) return true;
            throw error("Le journal a disparu alors que les registres ne correspondent pas à la cible.", "RESTORE_PARTIAL");
          }
          await recoverJournalUnlocked();
          if (current.journal.decision === "ROLLBACK") {
            throw error("La restauration a échoué; les valeurs antérieures ont été rétablies et vérifiées.", "RESTORE_ROLLED_BACK", cause);
          }
          return true;
        } catch (recoveryError) {
          if (recoveryError.code === "RESTORE_ROLLED_BACK") throw recoveryError;
          state = "blocked";
          stateError = recoveryError;
          throw error("La restauration n'a pas pu être confirmée. Le journal est conservé et les opérations métier sont bloquées jusqu'à récupération.", "RESTORE_PARTIAL", recoveryError);
        }
      }
    });
  }

  function showBlocked(cause) {
    const message = document.getElementById("dashboard-message");
    if (message) {
      message.textContent = `Application bloquée pour protéger les données : ${cause?.message || "récupération impossible"}`;
      message.className = "message-error";
    }
  }

  function consumeNotice() {
    const notice = recoveryNotice;
    recoveryNotice = "";
    return notice;
  }

  return { ready, assertReadable, withLock, restore, showBlocked, consumeNotice, journalKey };
})();
