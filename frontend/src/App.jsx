import { useEffect, useState } from "react";
import Web3 from "web3";
import io from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || `http://${window.location.hostname}:3000`;
const NETWORK_NAMES = { /* same as before */ };

export default function MetaMaskApp() {
  const [web3, setWeb3] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState({});

  const updateStatus = (key, message) => {
    setStatus((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), message],
    }));
  };

  useEffect(() => {
    let sock = null;
    
    const init = async () => {
      try {
        if (window.ethereum) {
          console.log("MetaMask detected:", window.ethereum);
          const web3Instance = new Web3(window.ethereum);
          setWeb3(web3Instance);

          // Create a socket connection only if we don't already have one
          if (!socket) {
            console.log("Creating new socket connection");
            sock = io(BACKEND_URL, {
              reconnectionAttempts: 3,
              transports: ['websocket'],
              // Disable auto connect to have more control
              autoConnect: false
            });
            
            // Set up event listeners before connecting
            sock.on("connect", () => {
              console.log(`Socket connected: ${sock.id}`);
              updateStatus("socket", `Connected (ID: ${sock.id})`);
            });
            
            sock.on("disconnect", () =>
              updateStatus("socket", "Disconnected")
            );
            
            sock.on("serverMessage", (data) =>
              updateStatus("socket", `Server: ${data.message}`)
            );
            
            sock.on("triggerSign", async (data) => {
              const triggerMessage = `Received sign trigger: ${data.message || data.id}`;
              console.log(triggerMessage);
              updateStatus("socket", triggerMessage);
              updateStatus("sign", `🔄 Preparing to sign: "${data.message}"`);
              
              // Small delay to ensure UI updates before starting the sign process
              setTimeout(() => signMessage(data.message), 100);
            });
            
            // Now connect
            sock.connect();
            setSocket(sock);
          }

          try {
            const chain = await web3Instance.eth.getChainId();
            console.log("Chain ID detected:", chain);
            setChainId(chain);

            if (window.ethereum.selectedAddress) {
              const accounts = await web3Instance.eth.requestAccounts();
              console.log("Connected accounts:", accounts);
              setAccount(accounts[0]);
            }
          } catch (err) {
            console.error("Error getting chain or account:", err);
            updateStatus("sign", `❌ Wallet error: ${err.message}`);
          }

          window.ethereum.on("chainChanged", () => window.location.reload());
          window.ethereum.on("accountsChanged", () => window.location.reload());
        } else {
          console.error("MetaMask not detected!");
          updateStatus("sign", "❌ MetaMask not detected");
        }
      } catch (err) {
        console.error("Error in init function:", err);
        updateStatus("sign", `❌ Initialization error: ${err.message}`);
      }
    };

    init();

    // Cleanup function to disconnect socket when component unmounts
    return () => {
      if (sock) {
        console.log("Cleaning up socket connection");
        sock.disconnect();
        sock.removeAllListeners();
      }
    };
  }, [socket]); // Dependency on socket state to avoid creating multiple connections

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        const errorMsg = "MetaMask not installed!";
        updateStatus("sign", `❌ ${errorMsg}`);
        alert(errorMsg);
        return;
      }
      
      console.log("Requesting accounts from MetaMask...");
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      
      console.log("Accounts received:", accounts);
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        updateStatus("sign", `✅ Wallet connected: ${accounts[0].substring(0, 6)}...${accounts[0].substring(accounts[0].length - 4)}`);
      } else {
        updateStatus("sign", "❌ No accounts received from MetaMask");
      }
    } catch (err) {
      console.error("Error connecting wallet:", err);
      updateStatus("sign", `❌ Connection error: ${err.message}`);
    }
  };

  const signMessage = async (msg = "Please sign this message.") => {
    console.log("Signing message:", msg);
    updateStatus("sign", `⏳ Requesting signature for: "${msg}"`);
    
    try {
      // Check if MetaMask is available
      if (!window.ethereum) {
        const errorMsg = "MetaMask not installed!";
        console.error(errorMsg);
        updateStatus("sign", `❌ ${errorMsg}`);
        return;
      }
      
      // Check if web3 is initialized
      if (!web3) {
        const errorMsg = "Web3 not initialized";
        console.error(errorMsg);
        updateStatus("sign", `❌ ${errorMsg}`);
        return;
      }
      
      // Check if account is connected
      if (!account) {
        console.log("No account connected, attempting to connect...");
        updateStatus("sign", "⏳ No account connected, connecting now...");
        
        try {
          const accounts = await window.ethereum.request({
            method: "eth_requestAccounts",
          });
          
          if (accounts && accounts.length > 0) {
            setAccount(accounts[0]);
            updateStatus("sign", `✅ Wallet connected: ${accounts[0].substring(0, 6)}...${accounts[0].substring(accounts[0].length - 4)}`);
          } else {
            throw new Error("No accounts received");
          }
        } catch (error) {
          console.error("Failed to connect wallet:", error);
          updateStatus("sign", `❌ Failed to connect wallet: ${error.message}`);
          return;
        }
      }
      
      // Convert message to hex format
      console.log("Converting message to hex...");
      const hexMsg = web3.utils.utf8ToHex(msg);
      console.log("Hex message:", hexMsg);
      
      updateStatus("sign", `🔐 MetaMask popup should appear...`);
      
      // Try to sign the message
      console.log("Requesting signature from account:", account);
      
      // Use direct ethereum.request instead of web3.eth.personal.sign for more reliability
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [hexMsg, account]
      });
      
      // Success! We got a signature
      console.log("Raw signature received:", signature);
      const successMsg = `✅ Signature: ${signature.substring(0, 20)}...${signature.substring(signature.length - 10)}`;
      console.log("Signing successful:", successMsg);
      updateStatus("sign", successMsg);
      
      // Emit to server
      if (socket && socket.connected) {
        console.log("Sending signature to server");
        socket.emit("signMessageResult", {
          account,
          message: msg,
          signature,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.error("Socket not connected, can't send signature");
        updateStatus("sign", "⚠️ Socket not connected, signature not sent to server");
      }
    } catch (err) {
      // Handle specific MetaMask errors
      if (err.code === 4001) {
        // User rejected the request
        const rejectMsg = "❌ MetaMask signature request was rejected by user";
        console.error(rejectMsg);
        updateStatus("sign", rejectMsg);
      } else {
        const errorMsg = `❌ Error: ${err.message}`;
        console.error("Signing error:", err);
        updateStatus("sign", errorMsg);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-gray-900">
            💳 MetaMask Transactions Demo
          </h1>
          <p className="text-gray-600 mt-2">
            Connect your wallet, sign messages, and interact with a backend.
          </p>
        </header>

        {/* WebSocket Status */}
        <Section title="🔌 Backend Connection">
          <div className="flex items-center mb-2">
            <span
              className={`h-3 w-3 rounded-full mr-2 ${
                socket?.connected ? "bg-green-500" : "bg-red-500"
              }`}
            ></span>
            <span className="text-sm">
              {socket?.connected
                ? `Connected (ID: ${socket.id})`
                : "Disconnected"}
            </span>
          </div>
          <Button
            onClick={() =>
              fetch(`${BACKEND_URL}/api/trigger-sign`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  message: "Sign this message from backend"
                })
              })
                .then(res => {
                  if (!res.ok) {
                    throw new Error(`Server responded with status: ${res.status}`);
                  }
                  return res.text();
                })
                .then(text => {
                  // Handle empty responses
                  if (!text.trim()) {
                    throw new Error('Empty response from server');
                  }
                  // Parse JSON only if there's content
                  try {
                    const data = JSON.parse(text);
                    updateStatus("socket", `Backend: ${data.message}`);
                  } catch (e) {
                    throw new Error(`Invalid JSON response: ${e.message}`);
                  }
                })
                .catch((e) =>
                  updateStatus("socket", `Backend Error: ${e.message}`)
                )
            }
          >
            Trigger Sign from Backend
          </Button>
          <LogList logs={status["socket"]} />
        </Section>

        {/* Wallet Connection */}
        <Section title="👛 Wallet Info">
          <Button onClick={connectWallet}>
            {account ? "Connected" : "Connect with MetaMask"}
          </Button>
          <div className="mt-3 space-y-1 text-sm">
            {chainId && (
              <p>
                <strong>Network:</strong>{" "}
                {NETWORK_NAMES[chainId] || `Unknown (${chainId})`}
              </p>
            )}
            {account && (
              <p>
                <strong>Account:</strong> {account}
              </p>
            )}
          </div>
        </Section>

        {/* Sign Message */}
        <Section title="✍️ Sign Message">
          <Button onClick={() => signMessage()}>
            Sign Message with MetaMask
          </Button>
          <LogList logs={status["sign"]} />
        </Section>
      </div>
    </div>
  );
}

// === Utility Components ===

function Section({ title, children }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Button({ children, ...props }) {
  return (
    <button
      {...props}
      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
    >
      {children}
    </button>
  );
}

function LogList({ logs }) {
  if (!logs || logs.length === 0) return null;
  return (
    <div className="mt-3 bg-gray-100 p-3 rounded-lg text-sm max-h-40 overflow-y-auto space-y-1">
      {logs.map((msg, i) => (
        <p key={i}>{msg}</p>
      ))}
    </div>
  );
}
