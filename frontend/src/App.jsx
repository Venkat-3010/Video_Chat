import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import './App.css';

const App = () => {
  const [activeUsers, setActiveUsers] = useState([]);
  const [talkingWith, setTalkingWith] = useState('');
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(new RTCPeerConnection());
  const socket = useRef(null);
  const [isAlreadyCalling, setIsAlreadyCalling] = useState(false);
  const [getCalled, setGetCalled] = useState(false);

  useEffect(() => {
    socket.current = io('http://localhost:5000');

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        stream.getTracks().forEach(track => peerConnection.current.addTrack(track, stream));
      })
      .catch(error => {
        console.warn(error.message);
      });

    console.log(navigator.mediaDevices.getDisplayMedia());
    peerConnection.current.ontrack = ({ streams: [stream] }) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    socket.current.on('update-user-list', ({ users }) => {
      setActiveUsers(users);
    });

    socket.current.on('remove-user', ({ socketId }) => {
      setActiveUsers(prev => prev.filter(id => id !== socketId));
    });

    socket.current.on('call-made', async data => {
      if (getCalled) {
        const confirmed = window.confirm(`User "Socket: ${data.socket}" wants to call you. Do accept this call?`);
        if (!confirmed) {
          socket.current.emit('reject-call', { from: data.socket });
          return;
        }
      }

      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(new RTCSessionDescription(answer));

      socket.current.emit('make-answer', {
        answer,
        to: data.socket,
      });
      setGetCalled(true);
    });

    socket.current.on('answer-made', async data => {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      if (!isAlreadyCalling) {
        callUser(data.socket);
        setIsAlreadyCalling(true);
      }
    });

    socket.current.on('call-rejected', data => {
      alert(`User: "Socket: ${data.socket}" rejected your call.`);
      setTalkingWith('');
    });

    return () => {
      socket.current.disconnect();
    };
  }, []);

  const callUser = async (socketId) => {
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(new RTCSessionDescription(offer));

    socket.current.emit('call-user', {
      offer,
      to: socketId
    });
  };

  const handleUserClick = (socketId) => {
    setTalkingWith(socketId);
    callUser(socketId);
  };

  return (
    <div className="container">
      <div className="content-container">
        <div className="active-users-panel">
          <h3 className="panel-title">Active Users:</h3>
          {activeUsers.map(socketId => (
            <div
              key={socketId}
              className={`active-user ${talkingWith === socketId ? 'active-user--selected' : ''}`}
              onClick={() => handleUserClick(socketId)}
            >
              <p className="username">Socket: {socketId}</p>
            </div>
          ))}
        </div>
        <div className="video-chat-container">
          <h2 className="talk-info">
            {talkingWith ? `Talking with: Socket: ${talkingWith}` : 'Select active user on the left menu.'}
          </h2>
          <div className="video-container">
            <video autoPlay ref={remoteVideoRef} className="remote-video" />
            <video autoPlay muted ref={localVideoRef} className="local-video" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
