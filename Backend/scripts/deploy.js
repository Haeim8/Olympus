async function main() {
    // Adresse du trésor (remplace avec une adresse valide pour ton trésor)
    const treasuryAddress = "0xYourTreasuryAddressHere"; // Remplace par l'adresse de ton trésor
  
    // Obtenir le contrat
    const FundRaisingPlatform = await ethers.getContractFactory("FundRaisingPlatform");
  
    // Déployer le contrat avec l'adresse du trésor
    const fundRaisingPlatform = await FundRaisingPlatform.deploy(treasuryAddress);
  
    // Attendre que le contrat soit déployé
    await fundRaisingPlatform.deployed();
  
    // Afficher l'adresse du contrat déployé
    console.log("FundRaisingPlatform deployed to:", fundRaisingPlatform.address);
  }
  
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
  