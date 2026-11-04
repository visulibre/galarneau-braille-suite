#!/usr/bin/env node

import fs from "node:fs";

const templatesSansFramework = new Set([
  "sln",
  "slnx",
  "globaljson",
  "gitignore",
  "editorconfig",
  "list",
  "search",
  "install",
  "uninstall",
  "update"
]);

function repondre(decision, raison) {
  process.stdout.write(`${JSON.stringify({
    continue: decision !== "deny",
    stopReason: decision === "deny" ? raison : undefined,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: raison
    }
  })}\n`);
}

function chargerEvenement() {
  try {
    const brut = fs.readFileSync(0, "utf8").trim();
    return brut ? JSON.parse(brut) : {};
  } catch {
    return {};
  }
}

function extraireNomOutil(evenement) {
  return [
    evenement?.tool_name,
    evenement?.toolName,
    evenement?.tool?.name
  ].find((valeur) => typeof valeur === "string") ?? "";
}

function extraireCommande(evenement) {
  const entrees = [
    evenement?.tool_input,
    evenement?.toolInput,
    evenement?.input,
    evenement?.parameters,
    evenement
  ];

  for (const entree of entrees) {
    if (typeof entree?.command === "string") {
      return entree.command;
    }
  }

  return "";
}

function verifierCommande(commande) {
  for (const segment of commande.split(/(?:\r?\n|&&|;)/u)) {
    const correspondance = /\bdotnet(?:\.exe)?\s+new\s+([^\s]+)/i.exec(segment);
    if (!correspondance) {
      continue;
    }

    const template = correspondance[1].toLowerCase();
    if (template.startsWith("--") || templatesSansFramework.has(template)) {
      continue;
    }

    if (template === "xunit" || template === "nunit") {
      return "Generation C# refusee: utiliser le template MSTest impose par le socle.";
    }

    const framework = /(?:--framework|-f)\s+([^\s]+)/i.exec(segment)?.[1]?.trim().toLowerCase() ?? "";
    if (framework !== "net10.0") {
      return "Generation C# refusee: chaque dotnet new doit fournir --framework net10.0.";
    }
  }

  return "";
}

const evenement = chargerEvenement();
const nomOutil = extraireNomOutil(evenement);
const commande = extraireCommande(evenement);
const outilTerminal = !nomOutil || /terminal|shell|bash|powershell|run_in_terminal/i.test(nomOutil);

if (!outilTerminal || !commande) {
  repondre("allow", "Aucune commande de generation C# a verifier.");
} else {
  const erreur = verifierCommande(commande);
  repondre(erreur ? "deny" : "allow", erreur || "Commande conforme a la baseline C# net10.0.");
}