import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const App = () => {
  const [activeUsers, setActiveUsers] = useState([]);
  const [talkingWith, setTalkingWith] = useState("");
  const [incomingCall, setIncomingCall] = useState(null);
  const [isAlreadyCalling, setIsAlreadyCalling] = useState(false);
  const [getCalled, setGetCalled] = useState(false);
  const [devices, setDevices] = useState({ audioIn: [], audioOut: [], videoIn: [] });
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");
  const [stream, setStream] = useState(null);
  const [videoEnabled, setVideoEnabled] = useState(true);

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

  const attachPeerHandlers = () => {
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && talkingWith) {
        socket.current.emit("ice-candidate", {
          candidate: event.candidate,
          to: talkingWith,
        });
      } else if (event.candidate) {
        iceCandidateQueue.current.push(event.candidate);
      }
    };

    peerConnection.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };
  };

  useEffect(() => {
    socket.current = io("https://video-chat-wjxh.onrender.com");

    const updateDeviceList = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioIn = devices.filter((d) => d.kind === "audioinput");
      const audioOut = devices.filter((d) => d.kind === "audiooutput");
      const videoIn = devices.filter((d) => d.kind === "videoinput");
      setDevices({ audioIn, audioOut, videoIn });
    };

    updateDeviceList();

    return () => socket.current.disconnect();
  }, []);

  useEffect(() => {
    const getMedia = async () => {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamera ? { deviceId: selectedCamera } : true,
        audio: selectedMic ? { deviceId: selectedMic } : true,
      });

      setStream(newStream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }

      newStream.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, newStream);
      });
    };

    getMedia();
  }, [selectedMic, selectedCamera]);

  useEffect(() => {
    if (
      remoteVideoRef.current &&
      selectedSpeaker &&
      typeof remoteVideoRef.current.setSinkId === "function"
    ) {
      remoteVideoRef.current.setSinkId(selectedSpeaker).catch(console.error);
    }
  }, [selectedSpeaker]);

  useEffect(() => {
    attachPeerHandlers();

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
  }, [getCalled]);

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
    await peerConnection.current.setLocalDescription(offer);
    socket.current.emit("call-user", { offer, to: socketId });
    setTalkingWith(socketId);
  };

  const handleUserClick = (socketId) => {
    callUser(socketId);
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
    socket.current.emit("make-answer", { answer, to: callerSocket });

    setTalkingWith(callerSocket);
    setGetCalled(true);
    setIncomingCall(null);
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    socket.current.emit("reject-call", { from: incomingCall.socket });
    setIncomingCall(null);
  };

  const toggleCamera = () => {
    const videoTrack = stream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setVideoEnabled(videoTrack.enabled);
    }
  };

  const hangUp = () => {
    stream?.getTracks().forEach((track) => track.stop());

    peerConnection.current.getSenders().forEach((sender) => {
      peerConnection.current.removeTrack(sender);
    });

    peerConnection.current.close();

    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    attachPeerHandlers();

    hasAcceptedCall.current = false;
    isRemoteDescSet.current = false;
    iceCandidateQueue.current = [];

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setTalkingWith("");
    setIncomingCall(null);
    setIsAlreadyCalling(false);
    setGetCalled(false);
    setStream(null);

    navigator.mediaDevices
      .getUserMedia({
        video: selectedCamera ? { deviceId: selectedCamera } : true,
        audio: selectedMic ? { deviceId: selectedMic } : true,
      })
      .then((newStream) => {
        setStream(newStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }
        newStream.getTracks().forEach((track) => {
          peerConnection.current.addTrack(track, newStream);
        });
      })
      .catch(console.error);
  };

  return (
    <div className="container">
      <div className="device-selectors">
        <select onChange={(e) => setSelectedMic(e.target.value)} value={selectedMic}>
          <option value="">Select Microphone</option>
          {devices.audioIn.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>
          ))}
        </select>

        <select onChange={(e) => setSelectedSpeaker(e.target.value)} value={selectedSpeaker}>
          <option value="">Select Speaker</option>
          {devices.audioOut.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || "Speaker"}</option>
          ))}
        </select>

        <select onChange={(e) => setSelectedCamera(e.target.value)} value={selectedCamera}>
          <option value="">Select Camera</option>
          {devices.videoIn.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || "Camera"}</option>
          ))}
        </select>
      </div>

      <div className="content-container">
        <div className="active-users-panel">
          <h3 className="panel-title">Active Users:</h3>
          {activeUsers.map((socketId) => (
            <div
              key={socketId}
              className={`active-user ${talkingWith === socketId ? "active-user--selected" : ""}`}
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

      <div className="control-buttons">
        <button className="toggle-video-button" onClick={toggleCamera}>
          {videoEnabled ? "Turn Camera Off" : "Turn Camera On"}
        </button>
        <button className="hangup-button" onClick={hangUp}>
          Hang Up
        </button>
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
