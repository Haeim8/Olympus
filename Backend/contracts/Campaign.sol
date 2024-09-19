// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title Campaign
 * @dev Contrat individuel pour une campagne de levée de fonds.
 */
contract Campaign is ERC721, ERC721Enumerable, ERC721Royalty, Ownable {
    using Address for address payable;

    // Informations de la campagne
    string public campaignName;
    address public startup;
    uint256 public targetAmount;
    uint256 public sharePrice;
    uint256 public endTime;
    uint256 public totalShares;
    uint256 public sharesSold;
    uint256 public fundsRaised;
    bool public finalized;
    bool public certified;
    address public lawyer;
    address public treasury;
    uint256 public commissionPercent;

    // Adresse pour les royalties (déployeur du contrat principal)
    address public royaltyReceiver;

    // Mapping des parts détenues par utilisateur
    mapping(address => uint256) public sharesOwned;

    /// @notice Événements pour suivre les actions importantes
    event SharesPurchased(address indexed investor, uint256 numShares);
    event SharesRefunded(address indexed investor, uint256 numShares, uint256 refundAmount);
    event CampaignFinalized(bool success);
    event RoyaltiesUpdated(uint96 newRoyaltyFee);
    event LogDebugDetail(string message, uint256 value1, uint256 value2, uint256 value3, uint256 value4);
    event LogDebugAddress(string message, uint256 value, address to);
    event ResidualETHWithdrawn(address indexed owner, uint256 amount); // Déclaration de l'événement manquant

    /// @notice Modificateur pour restreindre l'accès aux startups
    modifier onlyStartup() {
        require(msg.sender == startup, "Only the campaign creator can call this.");
        _;
    }

    /**
     * @dev Constructeur du contrat.
     */
    constructor(
        address _startup,
        string memory _campaignName,
        uint256 _targetAmount,
        uint256 _sharePrice,
        uint256 _endTime,
        bool _certified,
        address _lawyer,
        address _treasury,
        uint256 _commissionPercent,
        uint96 _royaltyFee,
        address _royaltyReceiver
    ) ERC721("CampaignShares", "CSH") {
        require(_startup != address(0), "Invalid startup address");
        require(_treasury != address(0), "Invalid treasury address");
        require(_sharePrice > 0, "Share price must be greater than zero");
        require(_targetAmount > 0, "Target amount must be greater than zero");
        require(_endTime > block.timestamp, "End time must be in the future");
        require(_commissionPercent <= 100, "Commission percent cannot exceed 100");
        require(_royaltyReceiver != address(0), "Invalid royalty receiver address");

        campaignName = _campaignName;
        startup = _startup;
        targetAmount = _targetAmount;
        sharePrice = _sharePrice;
        endTime = _endTime;
        certified = _certified;
        lawyer = _certified ? _lawyer : address(0);
        treasury = _treasury;
        commissionPercent = _commissionPercent;
        royaltyReceiver = _royaltyReceiver;

        totalShares = _targetAmount / _sharePrice;
        require(totalShares > 0, "Total shares must be greater than zero");

        // Définir les royalties
        _setDefaultRoyalty(royaltyReceiver, _royaltyFee);
    }

    /**
     * @dev Permet d'acheter des parts dans la campagne.
     * @param _numShares Nombre de parts à acheter.
     */
    function buyShares(uint256 _numShares) external payable {
        require(block.timestamp <= endTime, "Campaign has ended.");
        require(!finalized, "Campaign is finalized.");
        require(sharesSold + _numShares <= totalShares, "Not enough shares available.");
        require(msg.value == _numShares * sharePrice, "Incorrect ETH amount sent.");
        require(msg.sender != startup, "Campaign creator cannot buy their own shares.");

        uint256 commission = (msg.value * commissionPercent) / 100;
        uint256 amountToPot = msg.value - commission;

        // Transfert de la commission au trésorier
        payable(treasury).sendValue(commission);

        // Mise à jour des fonds et parts
        fundsRaised += amountToPot;
        sharesSold += _numShares;
        sharesOwned[msg.sender] += _numShares;

        // Mint des NFTs pour chaque part achetée
        for (uint256 i = 0; i < _numShares; i++) {
            uint256 tokenId = sharesSold - _numShares + i + 1;
            _mint(msg.sender, tokenId);
        }

        emit SharesPurchased(msg.sender, _numShares);

        // Vérifier si la campagne doit être finalisée
        _checkAndFinalize();
    }

    /**
     * @dev Permet de rembourser des parts détenues en brûlant les NFTs.
     * @param _numShares Nombre de parts à rembourser.
     * @param _tokenIds Liste des Token IDs à brûler.
     */
    function refundShares(uint256 _numShares, uint256[] calldata _tokenIds) external {
        require(block.timestamp <= endTime, "Campaign has ended.");
        require(!finalized, "Campaign is finalized.");
        require(sharesOwned[msg.sender] >= _numShares, "Not enough shares to refund.");
        require(_tokenIds.length == _numShares, "Number of token IDs must match number of shares.");

        uint256 refundAmount = (_numShares * sharePrice * 85) / 100;

        // Vérifier et brûler les NFTs de l'utilisateur
        for (uint256 i = 0; i < _numShares; i++) {
            uint256 tokenId = _tokenIds[i];
            require(ownerOf(tokenId) == msg.sender, "You do not own this NFT.");
            _burn(tokenId);
        }

        // Mise à jour des états
        sharesOwned[msg.sender] -= _numShares;
        sharesSold -= _numShares;
        fundsRaised -= refundAmount;

        // Transfert des fonds de remboursement
        payable(msg.sender).sendValue(refundAmount);

        emit SharesRefunded(msg.sender, _numShares, refundAmount);

        // Vérifier si la campagne doit être finalisée
        _checkAndFinalize();
    }

    /**
     * @dev Vérifie les conditions de finalisation et finalise la campagne si nécessaire.
     */
    function _checkAndFinalize() internal {
        if (!finalized && (fundsRaised >= targetAmount || block.timestamp >= endTime)) {
            finalizeCampaign();
        }
    }

    /**
     * @dev Finalise la campagne si les conditions sont remplies.
     */
    function finalizeCampaign() public {
        require(!finalized, "Campaign is already finalized.");
        require(block.timestamp > endTime || fundsRaised >= targetAmount, "Campaign cannot be finalized yet");

        emit LogDebugDetail("Finalizing campaign", block.timestamp, endTime, fundsRaised, targetAmount);

        finalized = true;

        if (fundsRaised > 0) {
            emit LogDebugAddress("Transferring funds", fundsRaised, startup);
            payable(startup).sendValue(fundsRaised);
        }

        emit CampaignFinalized(fundsRaised >= targetAmount);
    }

    /**
     * @dev Permet au startup de mettre à jour les royalties.
     * @param _receiver Adresse recevant les royalties.
     * @param _feeNumerator Nouvelle valeur de royalties en basis points.
     */
    function setRoyaltyInfo(address _receiver, uint96 _feeNumerator) external onlyStartup {
        require(_receiver != address(0), "Invalid royalty receiver address");
        _setDefaultRoyalty(_receiver, _feeNumerator);
        emit RoyaltiesUpdated(_feeNumerator);
    }

    /**
     * @dev Permet au startup de mettre à jour l'adresse du trésorier.
     * @param _newTreasury Nouvelle adresse du trésorier.
     */
    function updateTreasury(address _newTreasury) external onlyStartup {
        require(_newTreasury != address(0), "Invalid treasury address");
        treasury = _newTreasury;
    }

    /**
     * @dev Override de la fonction _burn pour inclure ERC721Royalty et ERC721.
     * @param tokenId ID du token à brûler.
     */
    function _burn(uint256 tokenId) internal override(ERC721, ERC721Royalty) {
        super._burn(tokenId);
    }

    /**
     * @dev Override de la fonction supportsInterface pour inclure ERC721, ERC721Enumerable et ERC721Royalty.
     * @param interfaceId ID de l'interface.
     * @return bool Indique si l'interface est supportée.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, ERC721Enumerable, ERC721Royalty) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Override de la fonction _beforeTokenTransfer pour inclure ERC721Enumerable et ERC721.
     * @param from Adresse de l'expéditeur.
     * @param to Adresse du destinataire.
     * @param tokenId ID du token transféré.
     * @param batchSize Nombre de tokens transférés.
     */
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
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
     * @dev Permet au propriétaire de retirer tous les fonds du contrat en cas d'urgence.
     *      Utiliser uniquement en dernier recours.
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        payable(owner()).sendValue(balance);
    }

    /**
     * @dev Fallback pour recevoir des ETH envoyés directement au contrat.
     *      Rejette toutes les tentatives de transfert direct d'ETH.
     */
    fallback() external {
        revert("Function does not exist or direct ETH transfers not allowed");
    }

    /**
     * @dev Receive pour permettre les transferts d'ETH lors de l'achat de parts.
     *      Assure que seuls les appels avec une valeur sont acceptés.
     */
    receive() external payable {
        require(msg.value > 0, "ETH transfer must have a value");
    }
}
