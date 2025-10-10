import React, { useEffect, useState } from 'react';
import { firestoreSyncManager as syncManager } from '../services/FirestoreSyncManager';
import './Toast.css';

interface ToastMessage {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

const Toast: React.FC = () => {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleSystemMessage = (data: { message: string; type?: string }) => {
      const id = `toast_${Date.now()}_${Math.random()}`;
      const newMessage: ToastMessage = {
        id,
        message: data.message,
        type: (data.type as any) || 'info'
      };

      setMessages(prev => [...prev, newMessage]);

      // 3초 후 자동 제거
      setTimeout(() => {
        setMessages(prev => prev.filter(m => m.id !== id));
      }, 3000);
    };

    // syncManager만 구독 (모든 탭/페이지가 동일하게 받음)
    (syncManager as any).addEventListener?.('SYSTEM_MESSAGE', handleSystemMessage);
    
    return () => {
      try {
        (syncManager as any).removeEventListener?.('SYSTEM_MESSAGE', handleSystemMessage);
      } catch {}
    };
  }, []);

  return (
    <div className="toast-container">
      {messages.map(msg => (
        <div key={msg.id} className={`toast toast--${msg.type}`}>
          {msg.message}
        </div>
      ))}
    </div>
  );
};

export default Toast;

