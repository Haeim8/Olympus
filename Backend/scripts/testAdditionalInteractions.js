// scripts/testAdditionalInteractions.js
const { ethers } = require("hardhat");
const { expect } = require("chai");

async function main() {
    // Obtenir les signers
    const [deployer, user1, user2, user3] = await ethers.getSigners();

    console.log("Adresse du déployeur :", deployer.address);
    console.log("Adresse de user1 :", user1.address);
    console.log("Adresse de user2 :", user2.address);
    console.log("Adresse de user3 :", user3.address);

    // Vérifier le solde du déployeur
    const deployerBalance = await ethers.provider.getBalance(deployer.address);
    console.log(`Solde du déployeur: ${ethers.utils.formatEther(deployerBalance)} ETH`);

    if (deployerBalance.lt(ethers.utils.parseEther("0.02"))) {
        console.log("Le déployeur n'a pas assez de fonds pour exécuter les tests. Veuillez financer le compte du déployeur.");
        return;
    }

    // Fonction pour financer un utilisateur
    async function fundUser(user, amount) {
        const fundAmount = ethers.utils.parseEther(amount);
        const tx = await deployer.sendTransaction({
            to: user.address,
            value: fundAmount
        });
        await tx.wait();
        console.log(`${user.address} financé avec ${amount} ETH`);
    }

    // Financer user3 pour les tests
    await fundUser(user3, "0.01");

    // Adresse du contrat FundRaisingPlatform déployé
    const fundRaisingPlatformAddress = "0x7F653f23F128Af8DdB2C0d3B579a18526e1444E4"; // Remplacez par votre adresse réelle
    const FundRaisingPlatform = await ethers.getContractFactory("FundRaisingPlatform");
    const fundRaisingPlatform = FundRaisingPlatform.attach(fundRaisingPlatformAddress);
    console.log("FundRaisingPlatform connecté à l'adresse :", fundRaisingPlatform.address);

    // **Étape 1 : Inscription des Utilisateurs**
    console.log("\n--- Étape 1 : Inscription des Utilisateurs ---");
    async function registerUserIfNeeded(user, userName) {
        const isRegistered = await fundRaisingPlatform.registeredUsers(user.address);
        if (!isRegistered) {
            const registrationTx = await fundRaisingPlatform.connect(user).registerUser({ value: ethers.utils.parseEther("0.05") });
            await registrationTx.wait();
            console.log(`${userName} inscrit avec succès.`);
        } else {
            console.log(`${userName} est déjà inscrit.`);
        }
    }

    await registerUserIfNeeded(user1, "User1");
    await registerUserIfNeeded(user2, "User2");

    // **Étape 2 : Création de Campagnes Multiples**
    console.log("\n--- Étape 2 : Création de Campagnes Multiples ---");
    const campaignsToCreate = [
        {
            name: "Projet Alpha",
            targetAmount: "0.005",
            sharePrice: "0.001",
            durationInMinutes: 2,
            certified: true,
            lawyer: user2.address,
            royaltyFee: 300
        },
        {
            name: "Projet Beta",
            targetAmount: "0.01",
            sharePrice: "0.002",
            durationInMinutes: 4,
            certified: false,
            lawyer: ethers.constants.AddressZero,
            royaltyFee: 200
        }
    ];

    let createdCampaigns = [];
    let initialTreasuryBalance = await ethers.provider.getBalance(deployer.address);

    for (const campaignData of campaignsToCreate) {
        try {
            const endTime = Math.floor(Date.now() / 1000) + (campaignData.durationInMinutes * 60);
            const createCampaignTx = await fundRaisingPlatform.connect(user1).createCampaign(
                campaignData.name,
                ethers.utils.parseEther(campaignData.targetAmount),
                ethers.utils.parseEther(campaignData.sharePrice),
                endTime,
                campaignData.certified,
                campaignData.certified ? campaignData.lawyer : ethers.constants.AddressZero,
                campaignData.royaltyFee,
                { value: ethers.utils.parseEther("0.02") }
            );
            const receipt = await createCampaignTx.wait();
            console.log(`Campagne "${campaignData.name}" créée avec succès.`);

            const event = receipt.events.find(event => event.event === "CampaignCreated");
            if (event) {
                const [createdCampaignAddress, startup, isCertified, lawyerAddress] = event.args;
                console.log(`Adresse extraite de l'événement CampaignCreated : ${createdCampaignAddress}`);

                // Vérifiez que l'adresse du contrat Campaign est correcte
                const codeAtAddress = await ethers.provider.getCode(createdCampaignAddress);
                if (codeAtAddress === "0x") {
                    console.error(`L'adresse ${createdCampaignAddress} ne contient aucun code. Vérifiez le déploiement du contrat Campaign.`);
                    continue;
                }

                // Optionnel : Afficher une partie du bytecode pour confirmation
                console.log(`Code à l'adresse ${createdCampaignAddress}: ${codeAtAddress.substring(0, 10)}...`);

                createdCampaigns.push({
                    address: createdCampaignAddress,
                    name: campaignData.name,
                    startup: startup,
                    certified: isCertified,
                    lawyer: lawyerAddress,
                    sharePrice: ethers.utils.parseEther(campaignData.sharePrice),
                    targetAmount: ethers.utils.parseEther(campaignData.targetAmount),
                    royaltyFee: campaignData.royaltyFee,
                    endTime: endTime
                });
                console.log(`Nouvelle campagne déployée à l'adresse : ${createdCampaignAddress}`);

                // Vérification de la création des NFTs
                const Campaign = await ethers.getContractFactory("Campaign");
                const campaignContract = Campaign.attach(createdCampaignAddress);
                try {
                    // Vérifiez le nom de la campagne
                    const campaignName = await campaignContract.campaignName();
                    console.log(`Nom de la campagne : ${campaignName}`);

                    // Vérification du totalSupply
                    const totalSupply = await campaignContract.totalSupply();
                    console.log(`Nombre total de NFTs créés pour la campagne "${campaignData.name}": ${totalSupply}`);
                    expect(totalSupply).to.equal(0, "Aucun NFT ne devrait être créé au départ");
                } catch (error) {
                    console.error(`Erreur lors de la vérification du totalSupply pour "${campaignData.name}":`, error.message);
                }
            } else {
                console.log("Événement CampaignCreated non trouvé.");
            }
        } catch (error) {
            console.error(`Erreur lors de la création de la campagne "${campaignData.name}" :`, error);
        }
    }

    // **Étape 3 : Achat de Parts dans Chaque Campagne**
    console.log("\n--- Étape 3 : Achat de Parts dans Chaque Campagne ---");
    for (const campaign of createdCampaigns) {
        try {
            const Campaign = await ethers.getContractFactory("Campaign");
            const campaignContract = Campaign.attach(campaign.address);
            const campaignAsUser3 = campaignContract.connect(user3);

            const buyNumShares = 2;
            const buyValue = campaign.sharePrice.mul(buyNumShares);

            console.log(`\nUser3 achète ${buyNumShares} parts dans la campagne "${campaign.name}" à l'adresse ${campaign.address}...`);
            const buySharesTx = await campaignAsUser3.buyShares(buyNumShares, { value: buyValue });
            await buySharesTx.wait();
            console.log(`User3 a acheté ${buyNumShares} parts avec succès dans "${campaign.name}".`);

            const sharesOwned = await campaignContract.sharesOwned(user3.address);
            console.log(`User3 détient ${sharesOwned.toString()} parts dans "${campaign.name}".`);

            expect(sharesOwned.toNumber()).to.equal(2);
            console.log("Assertion réussie : Nombre de parts détenues correct.");

            // Vérification du transfert des NFTs
            try {
                const balanceOfUser3 = await campaignContract.balanceOf(user3.address);
                expect(balanceOfUser3).to.equal(buyNumShares, "Le nombre de NFTs transférés devrait correspondre au nombre de parts achetées");
                console.log(`User3 possède ${balanceOfUser3} NFTs de la campagne "${campaign.name}"`);

                // Vérification des IDs des NFTs
                for (let i = 0; i < buyNumShares; i++) {
                    const tokenId = await campaignContract.tokenOfOwnerByIndex(user3.address, i);
                    console.log(`NFT ID ${tokenId} appartient à User3`);
                    const owner = await campaignContract.ownerOf(tokenId);
                    expect(owner).to.equal(user3.address, `Le propriétaire du NFT ${tokenId} devrait être User3`);
                }
            } catch (error) {
                console.error(`Erreur lors de la vérification des NFTs pour "${campaign.name}":`, error.message);
            }
        } catch (error) {
            console.error(`Erreur lors de l'achat de parts dans la campagne "${campaign.name}" :`, error.message);
        }
    }

    // **Étape 4 : Vérification des Soldes du Treasury**
    console.log("\n--- Étape 4 : Vérification des Soldes du Treasury ---");
    try {
        const treasuryBalance = await ethers.provider.getBalance(deployer.address);
        console.log(`Solde du Treasury (${deployer.address}) : ${ethers.utils.formatEther(treasuryBalance)} ETH`);

        const expectedCommissions = ethers.utils.parseEther("0.0003").add(ethers.utils.parseEther("0.0006")); // 0.0003 ETH pour Projet Alpha et 0.0006 ETH pour Projet Beta
        const actualIncrease = treasuryBalance.sub(initialTreasuryBalance);

        console.log(`Augmentation réelle du Treasury : ${ethers.utils.formatEther(actualIncrease)} ETH`);

        expect(actualIncrease.gte(expectedCommissions)).to.be.true;
        console.log("Les commissions ont été correctement transférées au Treasury.");
    } catch (error) {
        console.error("Erreur lors de la vérification du solde du Treasury :", error);
    }

    // **Étape 5 : Vérification de l'Indépendance des Campagnes**
    console.log("\n--- Étape 5 : Vérification de l'Indépendance des Campagnes ---");
    try {
        for (const campaign of createdCampaigns) {
            const Campaign = await ethers.getContractFactory("Campaign");
            const campaignContract = Campaign.attach(campaign.address);

            const sharesUser3 = await campaignContract.sharesOwned(user3.address);
            console.log(`User3 détient ${sharesUser3.toString()} parts dans la campagne "${campaign.name}" (${campaign.address}).`);

            if (sharesUser3.gt(0)) {
                expect(sharesUser3.toNumber()).to.equal(2);
                console.log("Assertion réussie : Indépendance des campagnes vérifiée.");
            } else {
                console.log("Pas de parts achetées dans cette campagne.");
            }
        }
    } catch (error) {
        console.error("Erreur lors de la vérification de l'indépendance des campagnes :", error);
    }

    // **Étape 6 : Tests de Scénarios de Bord**
    console.log("\n--- Étape 6 : Tests de Scénarios de Bord ---");
    const alphaCampaign = createdCampaigns.find(c => c.name === "Projet Alpha");
    if (alphaCampaign) {
        try {
            const Campaign = await ethers.getContractFactory("Campaign");
            const alphaContract = Campaign.attach(alphaCampaign.address);
            const alphaAsUser3 = alphaContract.connect(user3);

            const totalShares = alphaCampaign.targetAmount.div(alphaCampaign.sharePrice);
            const sharesSold = await alphaContract.sharesSold();
            const sharesAvailable = totalShares.sub(sharesSold);

            console.log(`Total Shares : ${totalShares.toString()}`);
            console.log(`Shares Sold : ${sharesSold.toString()}`);
            console.log(`Shares Available : ${sharesAvailable.toString()}`);

            const buyNumShares = sharesAvailable.add(1);
            const buyValue = alphaCampaign.sharePrice.mul(buyNumShares);

            console.log(`\nUser3 tente d'acheter ${buyNumShares} parts dans la campagne "${alphaCampaign.name}" à l'adresse ${alphaCampaign.address} (dépassant l'objectif)...`);

            try {
                await alphaAsUser3.buyShares(buyNumShares, { value: buyValue });
                throw new Error("L'achat excessif aurait dû être rejeté");
            } catch (error) {
                if (error.message.includes("Not enough shares available")) {
                    console.log("Assertion réussie : Achat excessif correctement rejeté.");
                } else if (error.message.includes("insufficient funds")) {
                    console.error("Erreur : Fonds insuffisants pour le test. Veuillez financer le compte.");
                } else {
                    console.error("Erreur inattendue :", error.message);
                }
            }
        } catch (error) {
            console.error(`Erreur inattendue lors de l'achat excessif de parts dans la campagne "${alphaCampaign.name}" :`, error);
        }
    } else {
        console.log("Campagne 'Projet Alpha' non trouvée pour le test de dépassement de l'objectif.");
    }

    // **Étape 7 : Vérification de la finalisation et du transfert des fonds**
    console.log("\n--- Étape 7 : Vérification de la finalisation et du transfert des fonds ---");

    // Calculer le temps d'attente nécessaire
    const maxEndTime = Math.max(...createdCampaigns.map(c => c.endTime));
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < maxEndTime) {
        const waitTime = (maxEndTime - currentTime + 60) * 1000; // Ajouter 60 secondes buffer
        console.log(`Attente de ${waitTime / 1000} secondes pour que toutes les campagnes se terminent...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    for (const campaign of createdCampaigns) {
        const Campaign = await ethers.getContractFactory("Campaign");
        const campaignContract = Campaign.attach(campaign.address);

        console.log(`Vérification de la campagne "${campaign.name}" à l'adresse ${campaign.address}`);

        const startupBalance = await ethers.provider.getBalance(campaign.startup);

        try {
            const tx = await campaignContract.connect(user1).finalizeCampaign({
                gasLimit: 500000
            });
            const receipt = await tx.wait();
            console.log("Campagne finalisée avec succès. Gas utilisé:", receipt.gasUsed.toString());
        } catch (error) {
            console.log("Erreur détaillée lors de la finalisation de la campagne:", error);
        }

        const isFinalized = await campaignContract.finalized();
        console.log(`La campagne est-elle finalisée ? ${isFinalized}`);

        const newStartupBalance = await ethers.provider.getBalance(campaign.startup);
        const fundsRaised = await campaignContract.fundsRaised();

        console.log(`Fonds levés : ${ethers.utils.formatEther(fundsRaised)} ETH`);
        console.log(`Changement du solde de la startup: ${ethers.utils.formatEther(newStartupBalance.sub(startupBalance))} ETH`);

        if (isFinalized) {
            const balanceDifference = newStartupBalance.sub(startupBalance);
            expect(balanceDifference).to.be.closeTo(fundsRaised, ethers.utils.parseEther("0.001"));
            console.log("Assertion réussie : Les fonds ont été correctement transférés à la startup.");
        } else {
            console.log("La campagne n'a pas encore été finalisée.");
        }

        console.log("---");
    }

    // Vérification finale des NFTs
    console.log("\n--- Vérification finale des NFTs ---");
    for (const campaign of createdCampaigns) {
        const Campaign = await ethers.getContractFactory("Campaign");
        const campaignContract = Campaign.attach(campaign.address);

        try {
            const totalSupply = await campaignContract.totalSupply();
            console.log(`Nombre total de NFTs pour la campagne "${campaign.name}": ${totalSupply}`);

            const balanceOfUser3 = await campaignContract.balanceOf(user3.address);
            console.log(`User3 possède ${balanceOfUser3} NFTs de la campagne "${campaign.name}"`);

            for (let i = 0; i < balanceOfUser3; i++) {
                try {
                    const tokenId = await campaignContract.tokenOfOwnerByIndex(user3.address, i);
                    const owner = await campaignContract.ownerOf(tokenId);
                    console.log(`NFT ID ${tokenId} appartient toujours à User3: ${owner === user3.address}`);
                } catch (error) {
                    console.error(`Erreur lors de la vérification du NFT ${i} de User3:`, error.message);
                }
            }
        } catch (error) {
            console.error(`Erreur lors de la vérification finale des NFTs pour "${campaign.name}":`, error.message);
        }

        console.log("---");
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error("Erreur dans le script de test :", error);
        process.exit(1);
    });
