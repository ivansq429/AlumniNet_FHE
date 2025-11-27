import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface AlumniData {
  id: string;
  name: string;
  graduationYear: string;
  encryptedDonation: string;
  publicValue1: number;
  publicValue2: number;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [alumniList, setAlumniList] = useState<AlumniData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingAlumni, setCreatingAlumni] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newAlumniData, setNewAlumniData] = useState({ name: "", graduationYear: "", donation: "" });
  const [selectedAlumni, setSelectedAlumni] = useState<AlumniData | null>(null);
  const [decryptedDonation, setDecryptedDonation] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ visible: true, status: "error", message: "FHEVM initialization failed" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const alumniDataList: AlumniData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          alumniDataList.push({
            id: businessId,
            name: businessData.name,
            graduationYear: businessData.description,
            encryptedDonation: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setAlumniList(alumniDataList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createAlumni = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingAlumni(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating alumni record with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const donationValue = parseInt(newAlumniData.donation) || 0;
      const businessId = `alumni-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, donationValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newAlumniData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newAlumniData.graduationYear) || 0,
        0,
        newAlumniData.graduationYear
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Alumni record created!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewAlumniData({ name: "", graduationYear: "", donation: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingAlumni(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to check availability" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredAlumni = alumniList.filter(alumni => 
    alumni.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    alumni.graduationYear.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Private Alumni Network 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <h2>Connect Your Wallet</h2>
            <p>Verify your alumni status and access the encrypted network</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Initialize FHE system</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Access encrypted alumni network</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading alumni data...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Private Alumni Network 🔐</h1>
        </div>
        
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + Add Alumni
          </button>
          <button onClick={checkAvailability} className="check-btn">
            Check Availability
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="search-section">
          <input
            type="text"
            placeholder="Search alumni..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        
        <div className="alumni-stats">
          <div className="stat-card">
            <h3>Total Alumni</h3>
            <p>{alumniList.length}</p>
          </div>
          <div className="stat-card">
            <h3>Verified Data</h3>
            <p>{alumniList.filter(a => a.isVerified).length}</p>
          </div>
          <div className="stat-card">
            <h3>Avg Graduation Year</h3>
            <p>{alumniList.length > 0 ? 
              Math.round(alumniList.reduce((sum, a) => sum + a.publicValue1, 0) / alumniList.length) : 
              'N/A'}
            </p>
          </div>
        </div>
        
        <div className="alumni-list">
          {filteredAlumni.length === 0 ? (
            <div className="no-alumni">
              <p>No alumni records found</p>
              <button className="create-btn" onClick={() => setShowCreateModal(true)}>
                Add First Alumni
              </button>
            </div>
          ) : filteredAlumni.map((alumni, index) => (
            <div 
              className={`alumni-item ${selectedAlumni?.id === alumni.id ? "selected" : ""} ${alumni.isVerified ? "verified" : ""}`} 
              key={index}
              onClick={() => setSelectedAlumni(alumni)}
            >
              <div className="alumni-name">{alumni.name}</div>
              <div className="alumni-meta">
                <span>Graduated: {alumni.graduationYear}</span>
                <span>Joined: {new Date(alumni.timestamp * 1000).toLocaleDateString()}</span>
              </div>
              <div className="alumni-status">
                {alumni.isVerified ? 
                  `✅ Verified Donation: ${alumni.decryptedValue}` : 
                  "🔓 Encrypted Donation"}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateAlumni 
          onSubmit={createAlumni} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingAlumni} 
          alumniData={newAlumniData} 
          setAlumniData={setNewAlumniData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedAlumni && (
        <AlumniDetailModal 
          alumni={selectedAlumni} 
          onClose={() => { 
            setSelectedAlumni(null); 
            setDecryptedDonation(null); 
          }} 
          decryptedDonation={decryptedDonation} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedAlumni.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateAlumni: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  alumniData: any;
  setAlumniData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, alumniData, setAlumniData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAlumniData({ ...alumniData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-alumni-modal">
        <div className="modal-header">
          <h2>Add Alumni Record</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label>Name *</label>
            <input 
              type="text" 
              name="name" 
              value={alumniData.name} 
              onChange={handleChange} 
              placeholder="Enter name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Graduation Year *</label>
            <input 
              type="number" 
              name="graduationYear" 
              value={alumniData.graduationYear} 
              onChange={handleChange} 
              placeholder="Enter graduation year..." 
              min="1900"
              max="2099"
            />
          </div>
          
          <div className="form-group">
            <label>Donation Amount (FHE Encrypted) *</label>
            <input 
              type="number" 
              name="donation" 
              value={alumniData.donation} 
              onChange={handleChange} 
              placeholder="Enter donation amount..." 
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !alumniData.name || !alumniData.graduationYear || !alumniData.donation} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Record"}
          </button>
        </div>
      </div>
    </div>
  );
};

const AlumniDetailModal: React.FC<{
  alumni: AlumniData;
  onClose: () => void;
  decryptedDonation: number | null;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ alumni, onClose, decryptedDonation, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    if (decryptedDonation !== null) return;
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedDonation(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="alumni-detail-modal">
        <div className="modal-header">
          <h2>Alumni Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="alumni-info">
            <div className="info-item">
              <span>Name:</span>
              <strong>{alumni.name}</strong>
            </div>
            <div className="info-item">
              <span>Graduation Year:</span>
              <strong>{alumni.graduationYear}</strong>
            </div>
            <div className="info-item">
              <span>Record Created:</span>
              <strong>{new Date(alumni.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Donation</h3>
            
            <div className="data-row">
              <div className="data-label">Donation Amount:</div>
              <div className="data-value">
                {alumni.isVerified ? 
                  `${alumni.decryptedValue} (Verified)` : 
                  decryptedDonation !== null ? 
                  `${decryptedDonation} (Decrypted)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              {!alumni.isVerified && (
                <button 
                  className={`decrypt-btn ${decryptedDonation !== null ? 'decrypted' : ''}`}
                  onClick={handleDecrypt} 
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : "Decrypt"}
                </button>
              )}
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE Encrypted Data</strong>
                <p>Donation amount is encrypted on-chain using FHE technology.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;