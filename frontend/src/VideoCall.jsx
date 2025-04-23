import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./VideoCall.css";

const socket = io("http://localhost:5000");

const VideoCall = () => {
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnection = useRef(null);
  const [roomId] = useState("room1");

  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");

  useEffect(() => {
    socket.emit("join", roomId);

    socket.on("user-joined", () => {
      createOffer();
    });

    socket.on("offer", async ({ offer }) => {
      await createAnswer(offer);
    });

    socket.on("answer", async ({ answer }) => {
      await peerConnection.current.setRemoteDescription(answer);
    });

    socket.on("ice-candidate", ({ candidate }) => {
      peerConnection.current.addIceCandidate(candidate);
    });

    getAudioDevices();
  }, []);

  useEffect(() => {
    if (selectedMic) {
      startLocalStream(selectedMic);
    }
  }, [selectedMic]);

  const getAudioDevices = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter(device => device.kind === "audioinput");
    const outputs = devices.filter(device => device.kind === "audiooutput");

    setAudioInputs(inputs);
    setAudioOutputs(outputs);
    setSelectedMic(inputs[0]?.deviceId || "");
    setSelectedSpeaker(outputs[0]?.deviceId || "");
  };

  const startLocalStream = async (deviceId) => {
    const constraints = {
      video: true,
      audio: { deviceId: { exact: deviceId } },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideoRef.current.srcObject = stream;

    peerConnection.current = new RTCPeerConnection();

    stream.getTracks().forEach(track => peerConnection.current.addTrack(track, stream));

    peerConnection.current.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];

      if (remoteVideoRef.current.setSinkId && selectedSpeaker) {
        remoteVideoRef.current.setSinkId(selectedSpeaker).catch(console.error);
      }
    };

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { roomId, candidate: event.candidate });
      }
    };
  };

  const createOffer = async () => {
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    socket.emit("offer", { roomId, offer });
  };

  const createAnswer = async (offer) => {
    await peerConnection.current.setRemoteDescription(offer);
    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);
    socket.emit("answer", { roomId, answer });
  };

  return (
    <div className="container">
      <div className="video-container">
        <video ref={localVideoRef} autoPlay playsInline muted className="video" />
        <video ref={remoteVideoRef} autoPlay playsInline className="video" />
      </div>
      <div className="controls">
        <label>
          Microphone:
          <select value={selectedMic} onChange={e => setSelectedMic(e.target.value)}>
            {audioInputs.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "Mic"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Speaker:
          <select value={selectedSpeaker} onChange={e => setSelectedSpeaker(e.target.value)}>
            {audioOutputs.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "Speaker"}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};

export default VideoCall;
