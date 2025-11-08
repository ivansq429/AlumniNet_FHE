pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AlumniNetFHE is ZamaEthereumConfig {
    struct AlumniProfile {
        string encryptedAlumniId;
        euint32 encryptedGraduationYear;
        euint32 encryptedDonationAmount;
        string publicBio;
        address owner;
        uint256 creationTimestamp;
        uint32 decryptedGraduationYear;
        uint32 decryptedDonationAmount;
        bool isVerified;
    }

    mapping(string => AlumniProfile) private alumniProfiles;
    string[] private profileIds;

    event ProfileCreated(string indexed profileId, address indexed owner);
    event VerificationCompleted(string indexed profileId, uint32 graduationYear, uint32 donationAmount);

    constructor() ZamaEthereumConfig() {
    }

    function createProfile(
        string calldata profileId,
        externalEuint32 encryptedGraduationYear,
        externalEuint32 encryptedDonationAmount,
        bytes calldata gradYearProof,
        bytes calldata donationProof,
        string calldata publicBio
    ) external {
        require(bytes(alumniProfiles[profileId].encryptedAlumniId).length == 0, "Profile already exists");
        
        euint32 gradYear = FHE.fromExternal(encryptedGraduationYear, gradYearProof);
        euint32 donation = FHE.fromExternal(encryptedDonationAmount, donationProof);
        
        require(FHE.isInitialized(gradYear), "Invalid graduation year encryption");
        require(FHE.isInitialized(donation), "Invalid donation amount encryption");

        alumniProfiles[profileId] = AlumniProfile({
            encryptedAlumniId: profileId,
            encryptedGraduationYear: gradYear,
            encryptedDonationAmount: donation,
            publicBio: publicBio,
            owner: msg.sender,
            creationTimestamp: block.timestamp,
            decryptedGraduationYear: 0,
            decryptedDonationAmount: 0,
            isVerified: false
        });

        FHE.allowThis(gradYear);
        FHE.allowThis(donation);
        FHE.makePubliclyDecryptable(gradYear);
        FHE.makePubliclyDecryptable(donation);

        profileIds.push(profileId);
        emit ProfileCreated(profileId, msg.sender);
    }

    function verifyProfile(
        string calldata profileId,
        bytes memory abiEncodedGradYear,
        bytes memory abiEncodedDonation,
        bytes memory gradYearProof,
        bytes memory donationProof
    ) external {
        require(bytes(alumniProfiles[profileId].encryptedAlumniId).length > 0, "Profile does not exist");
        require(!alumniProfiles[profileId].isVerified, "Profile already verified");

        bytes32[] memory gradCts = new bytes32[](1);
        gradCts[0] = FHE.toBytes32(alumniProfiles[profileId].encryptedGraduationYear);
        
        bytes32[] memory donationCts = new bytes32[](1);
        donationCts[0] = FHE.toBytes32(alumniProfiles[profileId].encryptedDonationAmount);

        FHE.checkSignatures(gradCts, abiEncodedGradYear, gradYearProof);
        FHE.checkSignatures(donationCts, abiEncodedDonation, donationProof);

        uint32 decodedGradYear = abi.decode(abiEncodedGradYear, (uint32));
        uint32 decodedDonation = abi.decode(abiEncodedDonation, (uint32));

        alumniProfiles[profileId].decryptedGraduationYear = decodedGradYear;
        alumniProfiles[profileId].decryptedDonationAmount = decodedDonation;
        alumniProfiles[profileId].isVerified = true;

        emit VerificationCompleted(profileId, decodedGradYear, decodedDonation);
    }

    function getEncryptedData(string calldata profileId) external view returns (
        euint32 encryptedGraduationYear,
        euint32 encryptedDonationAmount
    ) {
        require(bytes(alumniProfiles[profileId].encryptedAlumniId).length > 0, "Profile does not exist");
        return (
            alumniProfiles[profileId].encryptedGraduationYear,
            alumniProfiles[profileId].encryptedDonationAmount
        );
    }

    function getProfileDetails(string calldata profileId) external view returns (
        string memory encryptedAlumniId,
        string memory publicBio,
        address owner,
        uint256 creationTimestamp,
        bool isVerified,
        uint32 decryptedGraduationYear,
        uint32 decryptedDonationAmount
    ) {
        require(bytes(alumniProfiles[profileId].encryptedAlumniId).length > 0, "Profile does not exist");
        AlumniProfile storage profile = alumniProfiles[profileId];

        return (
            profile.encryptedAlumniId,
            profile.publicBio,
            profile.owner,
            profile.creationTimestamp,
            profile.isVerified,
            profile.decryptedGraduationYear,
            profile.decryptedDonationAmount
        );
    }

    function getAllProfileIds() external view returns (string[] memory) {
        return profileIds;
    }

    function serviceStatus() external pure returns (bool operational) {
        return true;
    }
}

