import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const App = () => {
  const [activeUsers, setActiveUsers] = useState([]);
  const [talkingWith, setTalkingWith] = useState(""); // Track current call state
  const [incomingCall, setIncomingCall] = useState(null); // Track incoming call state
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(new RTCPeerConnection());
  const socket = useRef(null);
  const [isAlreadyCalling, setIsAlreadyCalling] = useState(false);
  const [getCalled, setGetCalled] = useState(false);

  useEffect(() => {
    socket.current = io("http://localhost:5000");

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        stream
          .getTracks()
          .forEach((track) => peerConnection.current.addTrack(track, stream));
      })
      .catch((error) => {
        console.warn(error.message);
      });

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.current.emit("ice-candidate", {
          candidate: event.candidate,
          to: talkingWith,
        });
      }
    };

    socket.current.on("ice-candidate", async (data) => {
      try {
        await peerConnection.current.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      } catch (e) {
        console.error("Error adding received ICE candidate", e);
      }
    });

    peerConnection.current.ontrack = ({ streams: [stream] }) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    socket.current.on("update-user-list", ({ users }) => {
      setActiveUsers(users);
    });

    socket.current.on("remove-user", ({ socketId }) => {
      setActiveUsers((prev) => prev.filter((id) => id !== socketId));
    });

    socket.current.on("call-made", async (data) => {
      // Prevent multiple popups for the same call
      if (getCalled || incomingCall) return;

      setIncomingCall(data); // Show the incoming call UI
    });

    socket.current.on("answer-made", async (data) => {
      await peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
      if (!isAlreadyCalling) {
        callUser(data.socket);
        setIsAlreadyCalling(true);
      }
    });

    socket.current.on("call-rejected", (data) => {
      alert(`User: "Socket: ${data.socket}" rejected your call.`);
      setTalkingWith("");
      setIncomingCall(null); // Clear the incoming call after rejection
    });

    return () => {
      socket.current.disconnect();
    };
  }, [getCalled, incomingCall]); // Include getCalled and incomingCall as dependencies

  const callUser = async (socketId) => {
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(
      new RTCSessionDescription(offer)
    );

    socket.current.emit("call-user", {
      offer,
      to: socketId,
    });
  };

  const handleUserClick = (socketId) => {
    setTalkingWith(socketId);
    callUser(socketId);
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    const { socket: callerSocket, offer } = incomingCall;

    await peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(offer)
    );
    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(
      new RTCSessionDescription(answer)
    );
    socket.current.emit("make-answer", {
      answer,
      to: callerSocket,
    });

    setTalkingWith(callerSocket); // Start talking with the caller
    setGetCalled(true); // You are now in a call
    setIncomingCall(null); // Reset the incoming call state
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    socket.current.emit("reject-call", { from: incomingCall.socket });
    setIncomingCall(null); // Clear the incoming call state after rejection
  };

  return (
    <div className="container">
      <div className="content-container">
        <div className="active-users-panel">
          <h3 className="panel-title">Active Users:</h3>
          {activeUsers.map((socketId) => (
            <div
              key={socketId}
              className={`active-user ${
                talkingWith === socketId ? "active-user--selected" : ""
              }`}
              onClick={() => handleUserClick(socketId)}
            >
              <p className="username">Socket: {socketId}</p>
            </div>
          ))}
        </div>
        <div className="video-chat-container">
          <h2 className="talk-info">
            {talkingWith
              ? `Talking with: Socket: ${talkingWith}`
              : "Select active user on the left menu."}
          </h2>
          <div className="video-container">
            <video autoPlay ref={remoteVideoRef} className="remote-video" />
            <video autoPlay muted ref={localVideoRef} className="local-video" />
          </div>
        </div>
      </div>

      {incomingCall && (
        <div
          style={{
            position: "fixed",
            top: "20%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "white",
            padding: "20px",
            border: "2px solid #444",
            borderRadius: "10px",
            zIndex: 1000,
            boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "18px", marginBottom: "10px" }}>
            Incoming call from Socket: {incomingCall.socket}
          </p>
          <button
            onClick={acceptCall}
            style={{
              padding: "10px 20px",
              marginRight: "10px",
              backgroundColor: "green",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Accept
          </button>
          <button
            onClick={rejectCall}
            style={{
              padding: "10px 20px",
              backgroundColor: "red",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
