const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FundRaisingPlatform", function () {
  let fundRaisingPlatform;
  let deployer, investor;

  beforeEach(async function () {
    // Déployer le contrat
    [deployer, investor] = await ethers.getSigners();
    const FundRaisingPlatform = await ethers.getContractFactory("FundRaisingPlatform");
    fundRaisingPlatform = await FundRaisingPlatform.deploy(deployer.address); // Remplacez avec le trésorier (treasury)
    await fundRaisingPlatform.deployed();

    // Enregistrer le déployeur et l'investisseur comme utilisateurs
    const registrationFee = ethers.utils.parseEther("0.055");  // Correspond au montant du "registrationFee" dans le contrat
    await fundRaisingPlatform.connect(deployer).registerUser({ value: registrationFee });
    await fundRaisingPlatform.connect(investor).registerUser({ value: registrationFee });
  });

  it("should create a campaign and allow buying shares", async function () {
    const targetAmount = ethers.utils.parseEther("1000");  // 1000 ETH
    const sharePrice = ethers.utils.parseEther("1");       // 1 ETH par part
    const futureEndTime = Math.floor(Date.now() / 1000) + 86400; // Fin dans 24h

    // Créer une campagne
    const createTx = await fundRaisingPlatform.connect(deployer).createCampaign(
      "Test Campaign",
      targetAmount,
      sharePrice,
      futureEndTime,
      false,  // Non certifiée
      ethers.constants.AddressZero  // Pas d'avocat
    );
    await createTx.wait();

    // Vérifier si la campagne a été créée
    const campaign = await fundRaisingPlatform.campaigns(1);
    expect(campaign.name).to.equal("Test Campaign");
    expect(campaign.targetAmount).to.equal(targetAmount);

    // Acheter 2 parts
    const buyTx = await fundRaisingPlatform.connect(investor).buyShares(1, 2, { value: ethers.utils.parseEther("2") });
    await buyTx.wait();

    // Vérifier si les parts ont été achetées
    const sharesOwned = await fundRaisingPlatform.sharesOwned(1, investor.address);
    expect(sharesOwned).to.equal(2);

    // Finaliser la campagne
    const finalizeTx = await fundRaisingPlatform.connect(deployer).finalizeCampaign(1);
    await finalizeTx.wait();

    // Vérifier si la campagne est finalisée
    const finalizedCampaign = await fundRaisingPlatform.campaigns(1);
    expect(finalizedCampaign.finalized).to.be.true;
  });
});
