// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./Campaign.sol";

/**
 * @title FundRaisingPlatform
 * @dev Plateforme décentralisée de levée de fonds utilisant des factories pour créer des campagnes individuelles.
 */
contract FundRaisingPlatform is Ownable {
    using Address for address payable;

    /// @notice Adresse du trésorier pour recevoir les commissions et frais
    address public treasury;

    /// @notice Frais d'inscription en wei (0.05 ETH)
    uint256 public registrationFee = 0.05 ether;

    /// @notice Frais de création de campagne en wei (0.02 ETH)
    uint256 public campaignCreationFee = 0.02 ether;

    /// @notice Pourcentage de commission prélevé sur chaque achat de part (15%)
    uint256 public constant COMMISSION_PERCENT = 15;

    /// @notice Mapping des utilisateurs enregistrés
    mapping(address => bool) public registeredUsers;

    /// @notice Liste des campagnes déployées
    address[] public deployedCampaigns;

    /// @notice Mapping pour filtrer les campagnes par startup
    mapping(address => address[]) public campaignsByStartup;

    /// @notice Événements pour suivre les actions importantes
    event InvestorRegistered(address indexed investor);
    event CampaignCreated(address indexed campaignAddress, address indexed startup, bool certified, address indexed lawyer);
    event ResidualETHWithdrawn(address indexed owner, uint256 amount);

    /// @notice Modificateur pour restreindre l'accès aux utilisateurs enregistrés
    modifier onlyRegisteredUser() {
        require(registeredUsers[msg.sender], "You must be registered.");
        _;
    }

    /**
     * @dev Constructeur du contrat.
     * @param _treasury Adresse du trésorier.
     */
    constructor(address _treasury) {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
    }

    /**
     * @dev Permet à un utilisateur de s'enregistrer en payant les frais d'inscription.
     */
    function registerUser() external payable {
        require(!registeredUsers[msg.sender], "Already registered");
        require(msg.value == registrationFee, "Incorrect registration fee");

        payable(treasury).sendValue(msg.value);
        registeredUsers[msg.sender] = true;
        emit InvestorRegistered(msg.sender);
    }

    /**
     * @dev Crée une nouvelle campagne de levée de fonds en déployant un contrat `Campaign`.
     */
    function createCampaign(
        string memory _name,
        uint256 _targetAmount,
        uint256 _sharePrice,
        uint256 _endTime,
        bool _certified,
        address _lawyer,
        uint96 _royaltyFee
    ) external payable onlyRegisteredUser {
        require(bytes(_name).length > 0, "Campaign name is required");
        require(_targetAmount > 0, "Invalid target amount");
        require(_sharePrice > 0, "Invalid share price");
        require(_endTime > block.timestamp, "End time must be in the future");
        require(msg.value == campaignCreationFee, "Incorrect campaign creation fee");
        if (_certified) {
            require(_lawyer != address(0), "Lawyer address required for certified campaigns");
        }

        payable(treasury).sendValue(msg.value);

        Campaign newCampaign = new Campaign(
            msg.sender,                // _startup
            _name,                     // _campaignName
            _targetAmount,             // _targetAmount
            _sharePrice,               // _sharePrice
            _endTime,                  // _endTime
            _certified,                // _certified
            _lawyer,                   // _lawyer
            treasury,                  // _treasury
            COMMISSION_PERCENT,        // _commissionPercent
            _royaltyFee,               // _royaltyFee
            owner()                    // _royaltyReceiver
        );

        deployedCampaigns.push(address(newCampaign));
        campaignsByStartup[msg.sender].push(address(newCampaign));

        emit CampaignCreated(address(newCampaign), msg.sender, _certified, _certified ? _lawyer : address(0));
    }

    /**
     * @dev Permet de récupérer toutes les campagnes déployées.
     * @return Array d'adresses des campagnes.
     */
    function getAllCampaigns() external view returns (address[] memory) {
        return deployedCampaigns;
    }

    /**
     * @dev Permet de récupérer les campagnes d'un startup spécifique.
     * @param _startup Adresse du startup.
     * @return Array d'adresses des campagnes du startup.
     */
    function getCampaignsByStartup(address _startup) external view returns (address[] memory) {
        return campaignsByStartup[_startup];
    }

    /**
     * @dev Permet au propriétaire de retirer tout ETH résiduel envoyé accidentellement au contrat.
     */
    function withdrawResidualETH() external onlyOwner {
        uint256 contractBalance = address(this).balance;
        require(contractBalance > 0, "No ETH to withdraw");
        payable(owner()).sendValue(contractBalance);
        emit ResidualETHWithdrawn(owner(), contractBalance);
    }

    /**
     * @dev Fallback pour recevoir des ETH envoyés directement au contrat.
     *      Rejette toutes les tentatives de transfert direct d'ETH.
     */
    fallback() external {
        revert("Direct ETH transfers not allowed");
    }
}
