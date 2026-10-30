#!/usr/bin/env node

const hasValue = (value) => typeof value === "string" && value.trim().length > 0;

const hasCscLink = hasValue(process.env.CSC_LINK);
const hasWinCscLink = hasValue(process.env.WIN_CSC_LINK);
const hasCscName = hasValue(process.env.CSC_NAME);

if (hasCscLink || hasWinCscLink || hasCscName) {
  const signingMode = hasCscName && !hasCscLink && !hasWinCscLink
    ? "certificate-store"
    : "certificate-file";

  if (signingMode === "certificate-file" && !hasValue(process.env.CSC_KEY_PASSWORD) && !hasValue(process.env.WIN_CSC_KEY_PASSWORD)) {
    console.warn(
      "[warn] Aucun mot de passe de certificat n'est defini (CSC_KEY_PASSWORD/WIN_CSC_KEY_PASSWORD)." +
      " Si le certificat est protege, la signature echouera.",
    );
  }

  console.log(`[ok] Variables de signature detectees (${signingMode}).`);
  process.exit(0);
}

console.error("[error] Signature Windows non configuree.");
console.error("Definis au choix:");
console.error("- CSC_LINK (+ CSC_KEY_PASSWORD si necessaire)");
console.error("- WIN_CSC_LINK (+ WIN_CSC_KEY_PASSWORD si necessaire)");
console.error("- CSC_NAME (certificat present dans le store Windows)");
process.exit(1);
