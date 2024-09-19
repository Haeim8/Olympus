// /Users/mathieu/Desktop/Olympus/Backend/ignition/modules/FundRaisingModule.js
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("FundRaisingModule", (m) => {
  // Adresse du trésor
  const treasuryAddress = m.getParameter("treasuryAddress", "0x8dfE7918F36ddabF0DcfaB01B2762c6c0a4b9dfC");

  // Déploiement du contrat FundRaisingPlatform avec l'adresse du trésor
  const fundRaisingPlatform = m.contract("FundRaisingPlatform", [treasuryAddress]);

  return { fundRaisingPlatform };
});
