#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const contrat = "Plateforme.IA.Socle/00-gouvernance/contrat-collaboration-ia.md";

const lectures = new Set([
  "view", "glob", "rg", "skill", "ask_user",
  "read_file", "file_search", "grep_search", "semantic_search",
  "list_dir", "get_errors", "view_image", "vscode_listCodeUsages",
  "tool_search", "tool_search_tool", "tool_search.tool_search_tool",
  "fetch_webpage", "vscode_askQuestions", "manage_todo_list",
  "get_terminal_output", "read_powershell", "get_task_output", "terminal_last_command",
  "terminal_selection", "read_notebook_cell_output",
  "copilot_getNotebookSummary"
]);

const ecritures = new Set([
  "powershell",
  "apply_patch", "create_file", "create_directory",
  "replace_string_in_file", "multi_replace_string_in_file",
  "insert_edit_into_file", "edit_notebook_file",
  "create_new_jupyter_notebook", "vscode_renameSymbol",
  "run_in_terminal", "send_to_terminal", "create_and_run_task",
  "run_notebook_cell",
  "mcp_azure-devops_wit_work_item_write",
  "mcp_azure-devops_wit_work_item_link_write"
]);

const outilsPia = /^mcp_(?:plateforme-pi|plateforme-pia|plateforme-p[0-9]+|plateforme-ia|plateforme-i[0-9]+|plateforme-ia-socle(?:-beta)?)_(router_demande|lire_document_socle|verifier_sante_projet)$/;

const outilsPiaLocaux = new Set([
  "retirer_socle_local_mcp", "actualiser_version_projet_local",
  "synchroniser_packages_dotnet_local", "calculer_tokens_table_matieres_locale",
  "precommit_version_produit_local", "preparer_version_produit_locale",
  "diagnostiquer_authentification_azure_devops_locale",
  "valider_pr_socle_verrouillee_locale", "enrichir_statistiques_impact_ia_local",
  "calculer_impact_ia_local_sans_ecriture", "installer_localdb_windows_local",
  "verifier_localdb_local",
  "initialiser_composant_local", "configurer_composant_local",
  "valider_structure_api_rest_locale", "valider_structure_api_hub_locale",
  "valider_structure_funcapp_locale", "valider_swagger_runtime_api_rest_local",
  "initialiser_bootstrap_react_local", "valider_structure_react_locale",
  "valider_structure_librairie_npm_locale",
  "valider_structure_librairie_csharp_locale",
  "valider_donnees_reference_solution_locale",
  "valider_structure_docs_app_locale", "valider_ears_specs_app_locale",
  "valider_ears_donnees_reference_locale",
  "valider_non_duplication_docs_app_locale",
  "valider_encodage_docs_app_locale",
  "enregistrer_validation_socle_projet_local",
  "resynchroniser_projet_local"
]);

const outilsPiaDistants = new Set([
  "journaliser_conversation", "valider_pipelines",
  "inventorier_mise_a_niveau", "preparer_mise_a_niveau", "executer_tests_node_isoles",
  "lire_workspace_mise_a_niveau", "preparer_plan_workspace", "appliquer_plan_workspace", "reprendre_application_workspace",
  "resoudre_versions_workspace", "executer_tests_workspace_isoles",
  "calculer_impact_ia", "generer_bootstrap_react", "lire_artefact_agent",
  "lister_artefacts_agents", "preparer_artefacts_hooks", "preparer_connexion_native",
  "preparer_documentation_projet", "preparer_impact_projet", "preparer_preuves_validation",
  "preparer_version_demande", "valider_donnees_reference_solution",
  "valider_ears_donnees_reference", "valider_ears_specs_app", "valider_encodage_docs_app",
  "valider_non_duplication_docs_app", "valider_structure_api_hub_statique",
  "valider_structure_api_rest_statique", "valider_structure_docs_app",
  "valider_structure_funcapp_statique", "valider_structure_librairie_csharp",
  "valider_structure_librairie_npm", "valider_structure_react_statique"
]);

const outilsPiaControles = new Set([...outilsPiaLocaux, ...outilsPiaDistants]);
const operationPia = (nom) => /^mcp_(?:plateforme-pi|plateforme-pia|plateforme-p[0-9]+|plateforme-ia|plateforme-i[0-9]+|plateforme-ia-socle(?:-beta)?)_([a-z_]+)$/.exec(nom)?.[1];
const outilPiaControle = (nom) => outilsPiaControles.has(operationPia(nom));
const controlesInterface = new Set(["ask_user", "vscode_askQuestions", "tool_search", "tool_search_tool",
  "tool_search.tool_search_tool", "manage_todo_list"]);

const evenementAttendu = process.argv[2];
const consultationStricte = process.env.PIA_HOOK_CONSULTATION_MODE === "strict";
let modeMcpExclusif = false;
const empreinte = (texte) => createHash("sha256").update(texte).digest("hex");
const objet = (valeur) =>
  valeur !== null && typeof valeur === "object" && !Array.isArray(valeur);

function decision(autorise, raison) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: autorise ? "allow" : "deny",
      permissionDecisionReason: raison
    }
  })}\n`);
}

function dossierReel(chemin) {
  const reel = fs.realpathSync(chemin);

  return process.platform === "win32"
    ? reel.toLowerCase()
    : reel;
}

function normaliserNomOutil(nom) {
  if (typeof nom !== "string") {
    return "";
  }

  const normalise = nom
    .replace(/^functions\./, "")
    .replace(/^mcp_azure_devops__([a-z_]+)$/, "mcp_azure-devops_$1")
    .replace(
      /^plateforme-pia-([a-z_]+)$/,
      "mcp_plateforme-pia_$1"
    );

  return {
    Read: "view",
    Grep: "rg",
    Glob: "glob",
    Bash: "run_in_terminal",
    Edit: "apply_patch",
    AskUserQuestion: "ask_user"
  }[normalise] ?? normalise;
}

function parametresValides(nom, parametres) {
  return objet(parametres)
    || (nom === "apply_patch"
      && typeof parametres === "string"
      && Boolean(parametres.trim()));
}

function estDepotSource() {
  let dossier = fs.realpathSync(process.cwd());
  const marqueurs = [contrat, "Plateforme.IA.slnx", "Plateforme.IA.Cli/package.json", "Plateforme.IA.Mcp/package.json"];
  while (true) {
    if (marqueurs.every((fichier) => fs.existsSync(path.join(dossier, fichier)))) return true;
    const parent = path.dirname(dossier);
    if (parent === dossier) return false;
    dossier = parent;
  }
}

function operationDepotSourcePermise(nom, parametres) {
  if (!parametresValides(nom, parametres)) return false;
  if (/^mcp_(?:plateforme-pi|plateforme-pia|plateforme-p[0-9]+|plateforme-ia|plateforme-i[0-9]+|plateforme-ia-socle(?:-beta)?)_/.test(nom)) return false;
  if (nom === "task_complete") {
    return typeof parametres.summary === "string" && Boolean(parametres.summary.trim());
  }
  if (nom === "multi_tool_use.parallel") {
    return Array.isArray(parametres.tool_uses) && parametres.tool_uses.length > 0
      && parametres.tool_uses.every((outil) => objet(outil)
        && typeof outil.recipient_name === "string"
        && operationDepotSourcePermise(normaliserNomOutil(outil.recipient_name), outil.parameters));
  }
  return lectures.has(nom) || ecritures.has(nom) || lectureWorkItemControlee(nom, parametres);
}

function lectureWorkItemControlee(nom, parametres) {
  return ["azure-devops-wit_work_item", "mcp_azure-devops_wit_work_item"].includes(nom)
    && objet(parametres)
    && parametres.action === "get"
    && Number.isSafeInteger(parametres.id)
    && parametres.id > 0
    && typeof parametres.project === "string"
    && Boolean(parametres.project.trim());
}

function lecturePermise(nom, parametres) {
  return objet(parametres) && (lectures.has(nom)
    || (["run_in_terminal", "powershell"].includes(nom)
      && typeof parametres.command === "string"
      && /^(?:Get-Location|pwd)$/i.test(parametres.command.trim())));
}

function operationLocalePermise(nom, parametres) {
  if (lecturePermise(nom, parametres)) return true;
  if (!["run_in_terminal", "powershell"].includes(nom)
    || !objet(parametres) || typeof parametres.command !== "string"
    || parametres.command.length > 512 || /[\r\n]/.test(parametres.command)) {
    return false;
  }
  const commande = parametres.command.trim().split(/[ \t]+/).join(" ");
  // Eviter les programmes configures par Git, y compris les hooks de changement de branche.
  const prefixe = "git --no-pager -c core.hooksPath=/dev/null -c core.fsmonitor=false ";
  if (!commande.startsWith(prefixe)) return false;
  const argumentsGit = commande.slice(prefixe.length);
  return /^(?:status(?: --short| --porcelain=v1)?|branch --(?:show-current|list)|log --oneline -n [1-9][0-9]?|diff --no-ext-diff --no-textconv(?: --stat| --check)?|show --no-ext-diff --no-textconv --stat --oneline [a-fA-F0-9]{7,40})$/.test(argumentsGit)
    || (argumentsGit.length <= 140
      && /^switch -c [a-zA-Z0-9][a-zA-Z0-9_-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_-]*)*$/.test(argumentsGit));
}

function operationMcpExclusivePermise(nom, parametres) {
  if (!parametresValides(nom, parametres)) return false;
  if (nom === "multi_tool_use.parallel") {
    return Array.isArray(parametres.tool_uses) && parametres.tool_uses.length > 0
      && parametres.tool_uses.every((outil) => objet(outil)
        && typeof outil.recipient_name === "string"
        && operationMcpExclusivePermise(normaliserNomOutil(outil.recipient_name), outil.parameters));
  }
  return controlesInterface.has(nom) || outilsPia.test(nom) || outilsPiaDistants.has(operationPia(nom));
}

function lireModeMcpExclusif(entree) {
  if (typeof entree.session_id !== "string" || !entree.session_id.trim()) return false;
  const cwd = dossierReel(process.cwd());
  const fichier = path.join(os.tmpdir(), "pia-consultation-maintenance-v1",
    `${empreinte(`${entree.session_id}\0${cwd}`)}.json`);
  if (!fs.existsSync(fichier)) return false;
  modeMcpExclusif = null;
  const etat = JSON.parse(fs.readFileSync(fichier, "utf8"));
  return etat?.session === entree.session_id && etat.cwd === cwd && etat.mcpExclusif === true;
}

function signatureAppel(nom, parametres) {
  const trier = (valeur) => Array.isArray(valeur)
    ? valeur.map(trier)
    : objet(valeur)
      ? Object.fromEntries(
        Object.keys(valeur).sort().map(
          (cle) => [cle, trier(valeur[cle])]
        )
      )
      : valeur;

  return empreinte(JSON.stringify([nom, trier(parametres)]));
}

function cleAppel(entree, nom) {
  if (entree.tool_use_id !== undefined) {
    if (
      typeof entree.tool_use_id !== "string"
      || !entree.tool_use_id.trim()
    ) {
      throw new Error("Identifiant d'appel invalide.");
    }

    return `id:${entree.tool_use_id}`;
  }

  return `parametres:${signatureAppel(nom, entree.tool_input)}`;
}

function contexte(entree, reinitialisation) {
  const session = entree.session_id;
  const temps = Date.parse(entree.timestamp);
  const cwd = dossierReel(process.cwd());
  let cwdDeclare;

  try {
    cwdDeclare = dossierReel(entree.cwd ?? cwd);
  } catch {
    cwdDeclare = null;
  }

  const valide = Number.isFinite(temps)
    && Math.abs(Date.now() - temps) <= 120000
    && cwdDeclare === cwd;

  if (
    typeof session !== "string"
    || !session.trim()
    || session.length > 500
    || (!valide && !reinitialisation)
  ) {
    throw new Error("Contexte session/cwd/horodatage absent ou invalide.");
  }

  return {
    session,
    cwd,
    temps: Number.isFinite(temps) ? temps : Date.now(),
    valide
  };
}

function cheminDocument(chemin) {
  return typeof chemin === "string"
    && /^Plateforme\.IA\.Socle\/[a-zA-Z0-9@._ /-]+\.(md|json)$/.test(chemin)
    && !chemin.split("/").some(
      (partie) => partie === ".." || partie === "."
    );
}

function resultatMcp(reponse) {
  let valeur = reponse;

  if (
    objet(valeur)
    && typeof valeur.text_result_for_llm === "string"
  ) {
    valeur = valeur.text_result_for_llm;
  }

  if (
    typeof valeur === "string"
    && valeur.startsWith("Output too large to read at once")
  ) {
    const correspondance =
      /([A-Za-z]:[\\/][^\r\n]*?\d+-copilot-tool-output-[a-f0-9]+\.txt|\/[^\r\n]*?\d+-copilot-tool-output-[a-f0-9]+\.txt)/i.exec(valeur);
    if (!correspondance) {
      throw new Error("Resultat MCP externalise sans chemin valide.");
    }

    const fichier = correspondance[1].trim();

    if (
      !path.isAbsolute(fichier)
      || !/^\d+-copilot-tool-output-[a-f0-9]+\.txt$/i.test(
        path.basename(fichier)
      )
      || dossierReel(path.dirname(fichier)) !== dossierReel(os.tmpdir())
    ) {
      throw new Error("Chemin du resultat MCP externalise refuse.");
    }

    const informations = fs.lstatSync(fichier);

    if (
      informations.isSymbolicLink()
      || !informations.isFile()
      || informations.size === 0
      || informations.size > 2 * 1024 * 1024
    ) {
      throw new Error("Fichier de resultat MCP externalise invalide.");
    }

    valeur = fs.readFileSync(fichier, "utf8");
  }

  if (typeof valeur === "string") {
    try {
      valeur = JSON.parse(valeur);
    } catch {
      return valeur;
    }
  }

  if (objet(valeur) && valeur.isError === true) {
    throw new Error("Consultation MCP en echec.");
  }

  if (objet(valeur) && Array.isArray(valeur.content)) {
    if (
      !valeur.content.length
      || valeur.content.some(
        (bloc) => bloc.type !== "text" || typeof bloc.text !== "string"
      )
    ) {
      throw new Error("Reponse MCP non textuelle.");
    }

    return valeur.content.map((bloc) => bloc.text).join("\n");
  }

  return valeur;
}

function enregistrerSucces(etat, appel, reponse) {
  const resultat = resultatMcp(reponse);

  if (appel.operation === "router_demande") {
    const rapport = typeof resultat === "string"
      ? JSON.parse(resultat)
      : resultat;

    const recommandation = rapport?.routage?.recommandation;
    const documents = rapport?.documentsAConsulter;
    if (typeof rapport?.provenance?.instanceId === "string" && rapport.provenance.instanceId
      && recommandation?.parcours?.type === "mise-a-niveau-complete"
      && recommandation.parcours.execution === "mcp-distant-exclusivement"
      && recommandation.parcours.repliLocalAutorise === false) {
      etat.mcpExclusif = true;
    }

    if (
      typeof rapport?.provenance?.instanceId !== "string"
      || !rapport.provenance.instanceId
      || !objet(recommandation)
      || !Array.isArray(documents)
      || !documents.length
      || documents.some((document) => !cheminDocument(document.chemin))
      || !Array.isArray(recommandation.agentsCandidats)
      || recommandation.agentsCandidats.length !== 1
      || typeof recommandation.agentsCandidats[0]?.nom !== "string"
      || !recommandation.agentsCandidats[0].nom.trim()
      || recommandation.agentConfirme !== recommandation.agentsCandidats[0].nom
      || !Array.isArray(recommandation.scopes)
      || (!recommandation.scopes.length
        && recommandation.agentConfirme !== "Mainteneur CLI")
    ) {
      throw new Error("Routage absent, ambigu ou incomplet.");
    }

    const prioritaires = recommandation.scopes.flatMap(
      (scope) => scope.documentsPrioritaires ?? []
    );

    if (prioritaires.some((chemin) => !cheminDocument(chemin))) {
      throw new Error("Standards invalides.");
    }

    etat.requis = [...new Set([
      contrat,
      ...documents.map((document) => document.chemin),
      ...prioritaires
    ])];

    etat.lus = [];
    etat.instanceId = rapport.provenance.instanceId;
    etat.serveur = appel.nom.slice(0, -appel.operation.length);
    etat.route = true;
    delete etat.diagnostic;
  } else if (appel.operation === "lire_document_socle" && etat.route) {
    if (typeof resultat !== "string") {
      throw new Error("Document non textuel.");
    }

    const debutMetadata = resultat.lastIndexOf(
      '{"source":"lire_document_socle",'
    );

    if (debutMetadata < 0) {
      throw new Error("Provenance du document non verifiee.");
    }

    const metadata = JSON.parse(resultat.slice(debutMetadata));
    let contenu = resultat.slice(0, debutMetadata);

    if (
      metadata.sha256 !== empreinte(contenu)
      && contenu.endsWith("\n")
    ) {
      contenu = contenu.slice(0, -1);
    }

    if (metadata.provenance?.instanceId !== etat.instanceId) {
      throw new Error("Instance MCP du document differente du routage.");
    }
    if (appel.nom.slice(0, -appel.operation.length) !== etat.serveur) {
      throw new Error("Serveur MCP du document different du routage.");
    }
    if (
      metadata.source !== "lire_document_socle"
      || metadata.chemin !== appel.chemin
      || !contenu.trim()
    ) {
      throw new Error("Provenance du document non verifiee.");
    }
    if (metadata.sha256 !== empreinte(contenu)) {
      throw new Error("Empreinte du document differente du contenu observe.");
    }

    if (etat.requis.includes(appel.chemin)) {
      etat.lus = [...new Set([...etat.lus, appel.chemin])];
    }
  }
}

function diagnosticConsultation(appel, reponse, erreur) {
  const raisons = [
    "Consultation MCP en echec.",
    "Reponse MCP non textuelle.",
    "Routage absent, ambigu ou incomplet.",
    "Standards invalides.",
    "Document non textuel.",
    "Provenance du document non verifiee.",
    "Instance MCP du document differente du routage.",
    "Serveur MCP du document different du routage.",
    "Empreinte du document differente du contenu observe.",
    "Resultat MCP externalise sans chemin valide.",
    "Chemin du resultat MCP externalise refuse.",
    "Fichier de resultat MCP externalise invalide."
  ];

  const diagnostic = {
    date: new Date().toISOString(),
    evenement: "PostToolUse",
    operation: appel.operation,
    ...(appel.chemin ? { chemin: appel.chemin } : {}),
    raison: raisons.includes(erreur?.message)
      ? erreur.message
      : erreur instanceof SyntaxError
        ? "Reponse JSON invalide."
        : "Erreur interne de verification.",
    typeReponse: typeof reponse,
    nombreBlocsMcp: Array.isArray(reponse?.content)
      ? reponse.content.length
      : null
  };

  try {
    let resultat = resultatMcp(reponse);

    if (typeof resultat === "string") {
      if (appel.operation === "lire_document_socle") {
        const debutMetadata = resultat.lastIndexOf(
          '{"source":"lire_document_socle",'
        );

        if (debutMetadata < 0) {
          throw new Error("Provenance du document non verifiee.");
        }

        resultat = JSON.parse(resultat.slice(debutMetadata));
      } else {
        resultat = JSON.parse(resultat);
      }
    }

    const recommandation = resultat?.routage?.recommandation;

    diagnostic.instancePresente =
      typeof resultat?.provenance?.instanceId === "string"
      && Boolean(resultat.provenance.instanceId);

    if (appel.operation === "router_demande") {
      diagnostic.nombreScopes = Array.isArray(recommandation?.scopes)
        ? recommandation.scopes.length
        : null;

      diagnostic.nombreAgents = Array.isArray(recommandation?.agentsCandidats)
        ? recommandation.agentsCandidats.length
        : null;

      diagnostic.agentConfirmePresent =
        typeof recommandation?.agentConfirme === "string"
        && Boolean(recommandation.agentConfirme);

      diagnostic.nombreDocuments = Array.isArray(resultat?.documentsAConsulter)
        ? resultat.documentsAConsulter.length
        : null;
    }
  } catch {
    diagnostic.formatDecodable = false;
  }

  return diagnostic;
}

function decrirePreuveManquante(etat, valide) {
  if (!valide) return "Contexte de consultation du tour absent, expire ou non concordant.";
  if (!etat.route) {
    const diagnostic = etat.diagnostic;
    return diagnostic
      ? `Consultation rejetee (${diagnostic.operation}${diagnostic.chemin ? `, ${diagnostic.chemin}` : ""}): ${diagnostic.raison}${diagnostic.nombreAgents !== undefined ? ` Candidats observes: ${diagnostic.nombreAgents}.` : ""}`
      : "Routage unique confirme non observe dans ce tour.";
  }
  const manquants = etat.requis.filter((chemin) => !etat.lus.includes(chemin));
  return `Documents requis non observes avec provenance valide: ${manquants.join(", ")}.`;
}

function executer(entree) {
  if (!objet(entree) || entree.hook_event_name !== evenementAttendu) {
    throw new Error("Evenement de hook invalide.");
  }

  const nom = normaliserNomOutil(entree.tool_name);
  const operation = outilsPia.exec(nom)?.[1];

  if (estDepotSource()) {
    if (evenementAttendu === "PreToolUse") {
      const autorise = operationDepotSourcePermise(nom, entree.tool_input);
      decision(autorise, autorise
        ? "Depot source Plateforme.IA: operation reconnue permise; utiliser les fichiers et scripts locaux."
        : "Depot source Plateforme.IA: MCP PIA interdit; utiliser les fichiers et scripts locaux. Les outils inconnus ou invalides restent refuses.");
    }
    return;
  }

  if (
    evenementAttendu === "PreToolUse"
    && outilPiaControle(nom)
    && nom.endsWith("_journaliser_conversation")
    && objet(entree.tool_input)
    && ["sonde", "ecriture"].includes(entree.tool_input.mode)
  ) {
    decision(true, "Journalisation PIA permise sans preuve de consultation.");
    return;
  }

  if (evenementAttendu === "PreToolUse") {
    modeMcpExclusif = lireModeMcpExclusif(entree);
    if (modeMcpExclusif && !operationMcpExclusivePermise(nom, entree.tool_input)) {
      decision(false, "Parcours de mise a niveau tout-MCP: outils locaux, appels natifs et lots mixtes refuses.");
      return;
    }
  }

  const lotLocal = entree.tool_name === "multi_tool_use.parallel"
    && Array.isArray(entree.tool_input?.tool_uses)
    && entree.tool_input.tool_uses.length > 0
    && entree.tool_input.tool_uses.every((outil) =>
      typeof outil.recipient_name === "string"
      && operationLocalePermise(normaliserNomOutil(outil.recipient_name), outil.parameters)
    );

  const lotControle = entree.tool_name === "multi_tool_use.parallel"
    && Array.isArray(entree.tool_input?.tool_uses)
    && entree.tool_input.tool_uses.length > 0
    && entree.tool_input.tool_uses.every((outil) => {
      if (
        typeof outil.recipient_name !== "string"
        || !parametresValides(
          normaliserNomOutil(outil.recipient_name),
          outil.parameters
        )
      ) {
        return false;
      }

      const nomEnfant = normaliserNomOutil(outil.recipient_name);

      return operationLocalePermise(nomEnfant, outil.parameters)
        || ecritures.has(nomEnfant)
        || outilPiaControle(nomEnfant)
        || lectureWorkItemControlee(nomEnfant, outil.parameters);
    });

  if (
    evenementAttendu === "PreToolUse"
    && (operationLocalePermise(nom, entree.tool_input) || lotLocal)
    && objet(entree.tool_input)
  ) {
    decision(true, "Lecture ou operation Git locale ciblee permise sans preuve de consultation.");
    return;
  }

  const reinitialisation = [
    "SessionStart",
    "UserPromptSubmit"
  ].includes(evenementAttendu);

  const identite = contexte(entree, reinitialisation);
  const dossier = path.join(os.tmpdir(), "pia-consultation-maintenance-v1");

  fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });

  const fichier = path.join(
    dossier,
    `${empreinte(`${identite.session}\0${identite.cwd}`)}.json`
  );

  const verrou = `${fichier}.lock`;
  const descripteur = fs.openSync(verrou, "wx", 0o600);

  try {
    let etat;

    try {
      etat = JSON.parse(fs.readFileSync(fichier, "utf8"));
    } catch {
      etat = null;
    }

    if (reinitialisation) {
      etat = {
        session: identite.session,
        cwd: identite.cwd,
        tour: randomUUID(),
        debut: identite.temps,
        soumis: identite.valide && evenementAttendu === "UserPromptSubmit",
        mcpExclusif: false,
        route: false,
        requis: [],
        lus: [],
        appels: {}
      };
    } else {
      const valide = etat?.session === identite.session
        && etat.cwd === identite.cwd
        && etat.soumis
        && typeof etat.tour === "string"
        && identite.temps >= etat.debut
        && identite.temps - etat.debut < 7200000;

      if (evenementAttendu === "PreToolUse") {
        if (!parametresValides(nom, entree.tool_input)) {
          throw new Error("Appel d'outil incomplet.");
        }

        if (operation) {
          const cle = cleAppel(entree, nom);

          if (valide) {
            const doublon = etat.appels[cle];

            if (operation === "router_demande") {
              etat.route = false;
              etat.requis = [];
              etat.lus = [];
              etat.appels = {};
              delete etat.diagnostic;
            }

            if (operation === "lire_document_socle") {
              etat.lus = etat.lus.filter(
                (chemin) => chemin !== entree.tool_input.chemin
              );
            }

            etat.appels[cle] = {
              tour: etat.tour,
              debut: identite.temps,
              signature: signatureAppel(nom, entree.tool_input),
              ambigu: Boolean(doublon),
              nom,
              operation,
              ...(operation === "lire_document_socle"
                && cheminDocument(entree.tool_input.chemin)
                ? { chemin: entree.tool_input.chemin }
                : {})
            };
          }

          decision(
            true,
            "Consultation PIA permise; verification de provenance conservee."
          );
        } else {
          const consulte = valide
            && etat.route
            && etat.requis.length > 0
            && etat.requis.every((chemin) => etat.lus.includes(chemin));
          const reconnu = ecritures.has(nom) || outilPiaControle(nom)
            || lectureWorkItemControlee(nom, entree.tool_input) || lotControle;

          decision(
            Boolean(reconnu && (consulte || !consultationStricte && !etat?.mcpExclusif)),
            !reconnu
              ? "Outil inconnu refuse par defaut."
              : consulte
              ? "Consultation du tour verifiee; operation reconnue permise."
              : consultationStricte || etat?.mcpExclusif
                ? `Ecriture refusee: ${decrirePreuveManquante(etat, valide)} Consulter router_demande puis le contrat et tous les documents requis via PIA dans ce tour.`
                : "Avertissement: consultation PIA du tour non verifiee; operation reconnue permise sans attestation de conformite."
          );
        }
      } else if (
        evenementAttendu === "PostToolUse"
        && operation
        && valide
      ) {
        const cle = cleAppel(entree, nom);
        const appel = etat.appels[cle];
        delete etat.appels[cle];

        if (
          appel?.tour === etat.tour
          && !appel.ambigu
          && identite.temps >= appel.debut
          && appel.nom === nom
          && appel.signature === signatureAppel(nom, entree.tool_input)
          && (
            operation !== "lire_document_socle"
            || appel.chemin === entree.tool_input?.chemin
          )
        ) {
          const reponse = entree.tool_response ?? entree.tool_result;

          try {
            enregistrerSucces(etat, appel, reponse);
          } catch (erreur) {
            etat.route = false;
            etat.lus = [];

            etat.diagnostic = diagnosticConsultation(
              appel,
              reponse,
              erreur
            );

            etat.diagnostic.champsEntree = Object.fromEntries(
              Object.entries(entree).map(
                ([cle, valeur]) => [cle, typeof valeur]
              )
            );

            etat.diagnostic.champsResultat = Object.fromEntries(
              Object.entries(entree.tool_result ?? {}).map(
                ([cle, valeur]) => [cle, typeof valeur]
              )
            );

            process.stderr.write(
              `PIA_HOOK_DIAGNOSTIC=${JSON.stringify(etat.diagnostic)}\n`
            );
          }
        }
      }
    }

    if (etat) {
      fs.writeFileSync(fichier, JSON.stringify(etat), { mode: 0o600 });
    }
  } finally {
    fs.closeSync(descripteur);
    fs.unlinkSync(verrou);
  }
}

let entree;

try {
  entree = JSON.parse(fs.readFileSync(0, "utf8"));
  executer(entree);
} catch (erreur) {
  if (evenementAttendu === "PreToolUse") {
    const consultation = entree?.hook_event_name === "PreToolUse"
      && outilsPia.test(normaliserNomOutil(entree?.tool_name))
      && objet(entree?.tool_input);
    const nom = normaliserNomOutil(entree?.tool_name);
    const maintenancePermise = !consultationStricte && modeMcpExclusif === false
      && entree?.hook_event_name === "PreToolUse"
      && parametresValides(nom, entree?.tool_input)
      && (lectures.has(nom) || ecritures.has(nom) || outilPiaControle(nom)
        || lectureWorkItemControlee(nom, entree.tool_input));

    const erreursContexte = [
      "Evenement de hook invalide.",
      "Contexte session/cwd/horodatage absent ou invalide.",
      "Appel d'outil incomplet."
    ];

    const raison = maintenancePermise
      ? "Avertissement: suivi de consultation PIA indisponible; operation reconnue permise sans attestation de conformite."
      : consultation
      ? "Consultation PIA permise sans enregistrement de preuve."
      : erreursContexte.includes(erreur?.message)
        ? `Ecriture refusee: ${erreur.message} Diagnostic=${JSON.stringify({
          sessionValide: typeof entree?.session_id === "string"
            && Boolean(entree.session_id.trim())
            && entree.session_id.length <= 500,
          horodatageValide: Number.isFinite(Date.parse(entree?.timestamp)),
          ecartMs: Date.now() - Date.parse(entree?.timestamp),
          outil: normaliserNomOutil(entree?.tool_name),
          parametresValides: objet(entree?.tool_input),
          identifiantAppelValide:
            typeof entree?.tool_use_id === "string"
            && Boolean(entree.tool_use_id),
          cwdRecu: entree?.cwd,
          cwdProcessus: process.cwd(),
          cwdValide: (() => {
            try {
              return dossierReel(entree?.cwd ?? process.cwd())
                === dossierReel(process.cwd());
            } catch {
              return false;
            }
          })()
        })}`
        : "Ecriture refusee: erreur interne du hook.";

    decision(consultation || maintenancePermise, raison);
  } else {
    process.stderr.write(
      "Preuve de consultation non enregistree: contexte ou evenement invalide.\n"
    );
    process.exitCode = consultationStricte ? 2 : 0;
  }
}