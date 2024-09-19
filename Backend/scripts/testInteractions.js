// scripts/testInteractions.js

const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    // Adresse du contrat déployé
    const contractAddress = "0x70e2a18bad703DeAc057436F0719cCa67B1457FB"; // Remplacez par votre adresse de contrat déployé

    // Obtenir les signers
    const [owner, user1] = await ethers.getSigners();

    console.log("Owner address:", owner.address);
    console.log("User1 address:", user1.address);

    // Obtenir l'instance du contrat
    const FundRaisingPlatform = await ethers.getContractFactory("FundRaisingPlatform");
    const fundRaisingPlatform = FundRaisingPlatform.attach(contractAddress);

    // 1. Inscription des Utilisateurs
    console.log("\n=== Inscription des Utilisateurs ===");

    // Fonction pour inscrire un utilisateur
    async function registerUserIfNotRegistered(user, amount) {
        try {
            let tx = await fundRaisingPlatform.connect(user).registerUser({ value: ethers.utils.parseEther(amount) });
            await tx.wait();
            console.log(`${user.address} inscrit avec ${amount} ETH.`);
        } catch (error) {
            if (error.message.includes("Already registered")) {
                console.log(`${user.address} est déjà inscrit. Passage à l'étape suivante.`);
            } else {
                console.error(`Erreur lors de l'inscription de ${user.address} :`, error);
                throw error; // Arrêter le script pour les autres erreurs
            }
        }
    }

    // Inscrire user1 avec 0.05 ETH
    await registerUserIfNotRegistered(user1, "0.05");

    // Inscrire owner avec 0.05 ETH
    await registerUserIfNotRegistered(owner, "0.05");

    // 2. Création d'une Campagne par User1
    console.log("\n=== Création d'une Campagne par User1 ===");

    const campaignName = "Campagne Alpha";
    const targetAmount = ethers.utils.parseEther("0.02"); // 0.02 ETH
    const sharePrice = ethers.utils.parseEther("0.001"); // 0.001 ETH
    const endTime = Math.floor(Date.now() / 1000) + 1200; // 20 minutes à partir de maintenant
    const certified = false;
    const lawyerAddress = ethers.constants.AddressZero; // Pas d'avocat

    let campaignId;

    try {
        let tx = await fundRaisingPlatform.connect(user1).createCampaign(
            campaignName,
            targetAmount,
            sharePrice,
            endTime,
            certified,
            lawyerAddress
        );
        let receipt = await tx.wait();
        console.log("Campagne créée par User1 avec un objectif de 0.02 ETH et un prix par part de 0.001 ETH.");

        // Récupérer le campaignId depuis les événements
        const campaignCreatedEvent = receipt.events.find(event => event.event === 'CampaignCreated');
        if (campaignCreatedEvent) {
            campaignId = campaignCreatedEvent.args.campaignId;
            console.log(`ID de la campagne créée : ${campaignId.toString()}`);
        } else {
            throw new Error("Événement 'CampaignCreated' non trouvé.");
        }
    } catch (error) {
        console.error("Erreur lors de la création de la campagne :", error);
        return;
    }

    // 3. Achat de Parts par Owner
    console.log("\n=== Achat de Parts par Owner ===");

    const numSharesToBuy = 2; // 2 parts à 0.001 ETH chacune pour atteindre 0.002 ETH
    const totalPrice = sharePrice.mul(numSharesToBuy); // 0.002 ETH

    try {
        // Vérifier si la campagne est toujours active
        const campaign = await fundRaisingPlatform.campaigns(campaignId);
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime > campaign.endTime) {
            console.error(`Erreur : La campagne ${campaignId} a déjà terminé.`);
            return;
        }

        let tx = await fundRaisingPlatform.connect(owner).buyShares(campaignId, numSharesToBuy, { value: totalPrice });
        await tx.wait();
        console.log(`Owner a acheté ${numSharesToBuy} parts de la campagne ${campaignId} pour un total de ${ethers.utils.formatEther(totalPrice)} ETH.`);
    } catch (error) {
        console.error("Erreur lors de l'achat de parts par Owner :", error);
        return;
    }

    // Vérifier les parts détenues par Owner
    try {
        let sharesOwned = await fundRaisingPlatform.sharesOwned(campaignId, owner.address);
        console.log(`Owner détient actuellement ${sharesOwned} parts dans la campagne ${campaignId}.`);
    } catch (error) {
        console.error("Erreur lors de la vérification des parts détenues par Owner :", error);
        return;
    }

    // 4. Remboursement de Parts par Owner
    console.log("\n=== Remboursement de Parts par Owner ===");

    const numSharesToRefund = 1; // Rembourser 1 part
    const refundAmount = ethers.utils.parseEther("0.00085"); // 1 * 0.001 * 0.85 = 0.00085 ETH

    try {
        let tx = await fundRaisingPlatform.connect(owner).refundShares(campaignId, numSharesToRefund);
        await tx.wait();
        console.log(`Owner a remboursé ${numSharesToRefund} part de la campagne ${campaignId} pour un montant de ${ethers.utils.formatEther(refundAmount)} ETH.`);
    } catch (error) {
        console.error("Erreur lors du remboursement de parts par Owner :", error);
        return;
    }

    // Vérifier les parts détenues par Owner après remboursement
    try {
        let sharesOwned = await fundRaisingPlatform.sharesOwned(campaignId, owner.address);
        console.log(`Owner détient maintenant ${sharesOwned} parts dans la campagne ${campaignId}.`);
    } catch (error) {
        console.error("Erreur lors de la vérification des parts détenues par Owner après remboursement :", error);
        return;
    }

    // 5. Attendre que la campagne se termine (20 minutes)
    console.log("\n=== Attente de la Fin de la Campagne ===");
    console.log("Veuillez attendre environ 20 minutes pour que la campagne se termine...");

    // Attente de 20 minutes (1200 secondes)
    await new Promise(resolve => setTimeout(resolve, 1200000)); // 1200000 ms = 20 minutes

    // 6. Finalisation de la Campagne par le Propriétaire
    console.log("\n=== Finalisation de la Campagne par le Propriétaire ===");

    try {
        let tx = await fundRaisingPlatform.connect(owner).finalizeCampaign(campaignId);
        await tx.wait();
        console.log(`Campagne ${campaignId} finalisée par le propriétaire.`);
    } catch (error) {
        console.error("Erreur lors de la finalisation de la campagne :", error);
        return;
    }

    // 7. Libération des Fonds vers le Créateur de la Campagne
    console.log("\n=== Libération des Fonds vers le Créateur de la Campagne ===");

    try {
        // Changer la connexion à user1, le startup de la campagne
        let tx = await fundRaisingPlatform.connect(user1).releaseFunds(campaignId);
        await tx.wait();
        console.log(`Fonds de la campagne ${campaignId} libérés vers le créateur.`);
    } catch (error) {
        console.error("Erreur lors de la libération des fonds :", error);
        return;
    }

    // 8. Vérifications Finales
    console.log("\n=== Vérifications Finales ===");

    try {
        const campaign = await fundRaisingPlatform.campaigns(campaignId);
        console.log(`Campagne ${campaignId} - Fonds Levés: ${ethers.utils.formatEther(campaign.fundsRaised)} ETH`);
        console.log(`Campagne ${campaignId} - Parts Vendues: ${campaign.sharesSold}`);
        console.log(`Campagne ${campaignId} - Fonds Libérés: ${campaign.fundsReleased}`);
    } catch (error) {
        console.error("Erreur lors des vérifications finales :", error);
        return;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Erreur lors de l'exécution du script de test :", error);
        process.exit(1);
    });
    
