import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const App = () => {
  const [activeUsers, setActiveUsers] = useState([]);
  const [talkingWith, setTalkingWith] = useState("");
  const [incomingCall, setIncomingCall] = useState(null);
  const [isAlreadyCalling, setIsAlreadyCalling] = useState(false);
  const [getCalled, setGetCalled] = useState(false);
  const hasAcceptedCall = useRef(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socket = useRef(null);
  const iceCandidateQueue = useRef([]);
  const isRemoteDescSet = useRef(false);

  const peerConnection = useRef(
    new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    })
  );

  useEffect(() => {
    socket.current = io("https://video-chat-wjxh.onrender.com");

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        stream.getTracks().forEach((track) => {
          peerConnection.current.addTrack(track, stream);
        });
      })
      .catch((err) => {
        console.error("getUserMedia error:", err);
      });

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        if (talkingWith) {
          socket.current.emit("ice-candidate", {
            candidate: event.candidate,
            to: talkingWith,
          });
        } else {
          // Queue if talkingWith not yet available
          iceCandidateQueue.current.push(event.candidate);
        }
      }
    };

    peerConnection.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    socket.current.on("update-user-list", ({ users }) => {
      setActiveUsers(users);
    });

    socket.current.on("remove-user", ({ socketId }) => {
      setActiveUsers((prev) => prev.filter((id) => id !== socketId));
    });

    socket.current.on("call-made", async (data) => {
      if (hasAcceptedCall.current || incomingCall) return;
      setIncomingCall(data);
    });

    socket.current.on("answer-made", async (data) => {
      await peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
      isRemoteDescSet.current = true;
      flushCandidateQueue(data.socket);

      if (!isAlreadyCalling) {
        callUser(data.socket);
        setIsAlreadyCalling(true);
      }
    });

    socket.current.on("call-rejected", (data) => {
      alert(`User: "Socket: ${data.socket}" rejected your call.`);
      setTalkingWith("");
      setIncomingCall(null);
    });

    socket.current.on("ice-candidate", async (data) => {
      const candidate = new RTCIceCandidate(data.candidate);
      if (isRemoteDescSet.current) {
        await peerConnection.current.addIceCandidate(candidate);
      } else {
        iceCandidateQueue.current.push(candidate);
      }
    });

    return () => {
      socket.current.disconnect();
    };
  }, []);

  const flushCandidateQueue = (toSocketId) => {
    iceCandidateQueue.current.forEach((candidate) => {
      socket.current.emit("ice-candidate", {
        candidate,
        to: toSocketId,
      });
    });
    iceCandidateQueue.current = [];
  };

  const callUser = async (socketId) => {
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(
      new RTCSessionDescription(offer)
    );

    socket.current.emit("call-user", {
      offer,
      to: socketId,
    });

    setTalkingWith(socketId);
  };

  const handleUserClick = (socketId) => {
    callUser(socketId); // handles setting talkingWith
  };

  const acceptCall = async () => {
    if (!incomingCall || hasAcceptedCall.current) return;

    hasAcceptedCall.current = true;

    const { socket: callerSocket, offer } = incomingCall;

    await peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(offer)
    );
    isRemoteDescSet.current = true;
    flushCandidateQueue(callerSocket);

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);

    socket.current.emit("make-answer", {
      answer,
      to: callerSocket,
    });

    setTalkingWith(callerSocket);
    setGetCalled(true);
    setIncomingCall(null);
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    socket.current.emit("reject-call", { from: incomingCall.socket });
    setIncomingCall(null);
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
        <div className="incoming-call-popup">
          <p>Incoming call from Socket: {incomingCall.socket}</p>
          <div className="incoming-call-buttons">
            <button className="accept-button" onClick={acceptCall}>
              Accept
            </button>
            <button className="reject-button" onClick={rejectCall}>
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
