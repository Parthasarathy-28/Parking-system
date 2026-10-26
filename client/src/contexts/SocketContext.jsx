// Socket.IO context
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    // Get token from cookie
    const token = document.cookie.split(';').find(c => c.trim().startsWith('parkpulse_token='))?.split('=')[1];

    const socket = io('/', {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Join slot updates room
      socket.emit('join:slots');
    });

    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.disconnect();
    };
  }, [user?.id]); // Reconnect if user changes

  const on = (event, handler) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  };

  const off = (event, handler) => {
    socketRef.current?.off(event, handler);
  };

  return (
    <SocketContext.Provider value={{ connected, on, off, socket: socketRef }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

// Hook to subscribe to a socket event
export function useSocketEvent(event, handler) {
  const { on } = useSocket() || {};
  useEffect(() => {
    if (!on || !event) return;
    return on(event, handler);
  }, [event, on]); // eslint-disable-line
}
