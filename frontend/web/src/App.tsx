import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface AlumniRequest {
  id: string;
  name: string;
  encryptedValue: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<AlumniRequest[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newRequestData, setNewRequestData] = useState({ title: "", amount: "", category: "" });
  const [selectedRequest, setSelectedRequest] = useState<AlumniRequest | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [userHistory, setUserHistory] = useState<AlumniRequest[]>([]);
  const [stats, setStats] = useState({ total: 0, verified: 0, pending: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
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
      const requestsList: AlumniRequest[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          requestsList.push({
            id: businessId,
            name: businessData.name,
            encryptedValue: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setRequests(requestsList);
      updateStats(requestsList);
      updateUserHistory(requestsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const updateStats = (requests: AlumniRequest[]) => {
    const total = requests.length;
    const verified = requests.filter(r => r.isVerified).length;
    setStats({ total, verified, pending: total - verified });
  };

  const updateUserHistory = (requests: AlumniRequest[]) => {
    if (!address) return;
    const userRequests = requests.filter(r => r.creator.toLowerCase() === address.toLowerCase());
    setUserHistory(userRequests);
  };

  const createRequest = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingRequest(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating request with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract");
      
      const amountValue = parseInt(newRequestData.amount) || 0;
      const businessId = `request-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, amountValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newRequestData.title,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newRequestData.category) || 0,
        0,
        "Alumni Support Request"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Request created!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewRequestData({ title: "", amount: "", category: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Submission failed";
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingRequest(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Connect wallet first" });
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
        setTransactionStatus({ visible: true, status: "success", message: "Already verified" });
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
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Verified successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Already verified" });
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

  const handleDecrypt = async (requestId: string) => {
    const decrypted = await decryptData(requestId);
    if (decrypted !== null) {
      setDecryptedAmount(decrypted);
    }
  };

  const filteredRequests = requests.filter(request => 
    request.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    request.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvail = await contract.isAvailable();
      if (isAvail) {
        setTransactionStatus({ visible: true, status: "success", message: "System available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>隱私校友圈</h1>
            <p>FHE加密校友网络</p>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎓</div>
            <h2>连接钱包加入校友网络</h2>
            <p>使用加密技术保护校友隐私，实现匿名互助</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>连接钱包</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>初始化FHE加密系统</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>开始加密互助</p>
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
        <p>初始化FHE加密系统...</p>
        <p className="loading-note">正在建立安全连接</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>加载加密校友网络...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>隱私校友圈</h1>
          <p>FHE加密校友网络</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + 创建互助请求
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <div className="stats-panel">
            <div className="stat-card">
              <h3>总请求</h3>
              <div className="stat-value">{stats.total}</div>
            </div>
            <div className="stat-card">
              <h3>已验证</h3>
              <div className="stat-value">{stats.verified}</div>
            </div>
            <div className="stat-card">
              <h3>待验证</h3>
              <div className="stat-value">{stats.pending}</div>
            </div>
          </div>
          
          <div className="fhe-flow">
            <div className="flow-step">
              <div className="step-icon">1</div>
              <div className="step-content">
                <h4>数据加密</h4>
                <p>敏感数据使用FHE加密保护</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-icon">2</div>
              <div className="step-content">
                <h4>链上存储</h4>
                <p>加密数据存储在区块链上</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-icon">3</div>
              <div className="step-content">
                <h4>离线解密</h4>
                <p>客户端离线解密验证数据</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="requests-section">
          <div className="section-header">
            <h2>校友互助请求</h2>
            <div className="search-bar">
              <input 
                type="text" 
                placeholder="搜索请求..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "刷新中..." : "刷新"}
              </button>
            </div>
          </div>
          
          <div className="requests-list">
            {filteredRequests.length === 0 ? (
              <div className="no-requests">
                <p>未找到互助请求</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  创建第一个请求
                </button>
              </div>
            ) : filteredRequests.map((request, index) => (
              <div 
                className={`request-card ${selectedRequest?.id === request.id ? "selected" : ""} ${request.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedRequest(request)}
              >
                <div className="request-title">{request.name}</div>
                <div className="request-meta">
                  <span>类型: {request.publicValue1 === 1 ? "捐赠" : "求助"}</span>
                  <span>日期: {new Date(request.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="request-description">{request.description}</div>
                <div className="request-status">
                  {request.isVerified ? (
                    <span className="verified">✅ 已验证金额: {request.decryptedValue}</span>
                  ) : (
                    <span className="pending">🔒 加密金额待验证</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="history-section">
          <h2>我的操作记录</h2>
          <div className="history-list">
            {userHistory.length === 0 ? (
              <div className="no-history">
                <p>暂无操作记录</p>
              </div>
            ) : userHistory.map((item, index) => (
              <div className="history-item" key={index}>
                <div className="history-title">{item.name}</div>
                <div className="history-meta">
                  <span>{new Date(item.timestamp * 1000).toLocaleDateString()}</span>
                  <span>{item.isVerified ? "已验证" : "待验证"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateRequest 
          onSubmit={createRequest} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingRequest} 
          requestData={newRequestData} 
          setRequestData={setNewRequestData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedRequest && (
        <RequestDetailModal 
          request={selectedRequest} 
          onClose={() => { 
            setSelectedRequest(null); 
            setDecryptedAmount(null); 
          }} 
          decryptedAmount={decryptedAmount}
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => handleDecrypt(selectedRequest.id)}
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
      
      <div className="system-check">
        <button onClick={checkAvailability} className="system-btn">
          检查系统状态
        </button>
      </div>
    </div>
  );
};

const ModalCreateRequest: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  requestData: any;
  setRequestData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, requestData, setRequestData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'amount') {
      const intValue = value.replace(/[^\d]/g, '');
      setRequestData({ ...requestData, [name]: intValue });
    } else {
      setRequestData({ ...requestData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-request-modal">
        <div className="modal-header">
          <h2>创建互助请求</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE加密保护</strong>
            <p>金额将使用全同态加密技术保护</p>
          </div>
          
          <div className="form-group">
            <label>请求标题 *</label>
            <input 
              type="text" 
              name="title" 
              value={requestData.title} 
              onChange={handleChange} 
              placeholder="输入请求标题..." 
            />
          </div>
          
          <div className="form-group">
            <label>金额 (整数) *</label>
            <input 
              type="number" 
              name="amount" 
              value={requestData.amount} 
              onChange={handleChange} 
              placeholder="输入金额..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE加密整数</div>
          </div>
          
          <div className="form-group">
            <label>请求类型 *</label>
            <select 
              name="category" 
              value={requestData.category} 
              onChange={handleChange}
            >
              <option value="">选择类型</option>
              <option value="1">捐赠</option>
              <option value="2">求助</option>
            </select>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">取消</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !requestData.title || !requestData.amount || !requestData.category} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "加密中..." : "创建请求"}
          </button>
        </div>
      </div>
    </div>
  );
};

const RequestDetailModal: React.FC<{
  request: AlumniRequest;
  onClose: () => void;
  decryptedAmount: number | null;
  isDecrypting: boolean;
  decryptData: () => void;
}> = ({ request, onClose, decryptedAmount, isDecrypting, decryptData }) => {
  return (
    <div className="modal-overlay">
      <div className="request-detail-modal">
        <div className="modal-header">
          <h2>请求详情</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="request-info">
            <div className="info-item">
              <span>标题:</span>
              <strong>{request.name}</strong>
            </div>
            <div className="info-item">
              <span>创建者:</span>
              <strong>{request.creator.substring(0, 6)}...{request.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>日期:</span>
              <strong>{new Date(request.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>类型:</span>
              <strong>{request.publicValue1 === 1 ? "捐赠" : "求助"}</strong>
            </div>
          </div>
          
          <div className="description-section">
            <h3>详细描述</h3>
            <p>{request.description}</p>
          </div>
          
          <div className="data-section">
            <h3>加密金额</h3>
            <div className="data-row">
              <div className="data-label">金额:</div>
              <div className="data-value">
                {request.isVerified ? 
                  `${request.decryptedValue} (已验证)` : 
                  decryptedAmount !== null ? 
                  `${decryptedAmount} (已解密)` : 
                  "🔒 FHE加密整数"
                }
              </div>
              <button 
                className={`decrypt-btn ${(request.isVerified || decryptedAmount !== null) ? 'decrypted' : ''}`}
                onClick={decryptData} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 验证中..."
                ) : request.isVerified ? (
                  "✅ 已验证"
                ) : decryptedAmount !== null ? (
                  "🔄 重新验证"
                ) : (
                  "🔓 验证金额"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE全同态加密</strong>
                <p>金额在链上加密存储，点击验证进行解密和链上验证</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">关闭</button>
          {!request.isVerified && (
            <button 
              onClick={decryptData} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "链上验证中..." : "链上验证"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

