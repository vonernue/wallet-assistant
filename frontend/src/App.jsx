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
      if (window.ethereum) {
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
            updateStatus("socket", `Received sign trigger: ${data.message}`);
            await signMessage(data.message);
          });
          
          // Now connect
          sock.connect();
          setSocket(sock);
        }

        const chain = await web3Instance.eth.getChainId();
        setChainId(chain);

        if (window.ethereum.selectedAddress) {
          const accounts = await web3Instance.eth.requestAccounts();
          setAccount(accounts[0]);
        }

        window.ethereum.on("chainChanged", () => window.location.reload());
        window.ethereum.on("accountsChanged", () => window.location.reload());
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
    if (!window.ethereum) return alert("Install MetaMask");
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    setAccount(accounts[0]);
  };

  const signMessage = async (msg = "Please sign this message.") => {
    console.log("Signing message:", msg);
    if (!web3 || !account) return;
    try {
      const hexMsg = web3.utils.utf8ToHex(msg);
      const signature = await web3.eth.personal.sign(hexMsg, account, "");
      updateStatus("sign", `✅ Signature: ${signature}`);
      socket?.emit("signMessageResult", {
        account,
        message: msg,
        signature,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      updateStatus("sign", `❌ Error: ${err.message}`);
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
