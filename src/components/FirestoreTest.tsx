import React, { useState } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';

const FirestoreTest: React.FC = () => {
  const [message, setMessage] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // 메시지 추가 테스트
  const addMessage = async () => {
    if (!message.trim()) return;
    
    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, 'test'), {
        text: message,
        timestamp: new Date(),
        createdAt: new Date()
      });
      console.log('문서 추가됨:', docRef.id);
      setMessage('');
      loadMessages(); // 목록 새로고침
    } catch (error) {
      console.error('오류:', error);
      alert('오류 발생: ' + error);
    } finally {
      setLoading(false);
    }
  };

  // 메시지 목록 로드 테스트
  const loadMessages = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'test'));
      const docs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(docs);
      console.log('문서 목록:', docs);
    } catch (error) {
      console.error('오류:', error);
      alert('오류 발생: ' + error);
    } finally {
      setLoading(false);
    }
  };

  // 메시지 삭제 테스트
  const deleteMessage = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'test', id));
      console.log('문서 삭제됨:', id);
      loadMessages(); // 목록 새로고침
    } catch (error) {
      console.error('오류:', error);
      alert('오류 발생: ' + error);
    }
  };

  return (
    <div style={{ 
      padding: '20px', 
      border: '1px solid #ccc', 
      borderRadius: '8px', 
      margin: '20px',
      backgroundColor: '#f9f9f9'
    }}>
      <h3>🔥 Firestore 연결 테스트</h3>
      
      {/* 메시지 추가 */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="테스트 메시지 입력..."
          style={{ 
            padding: '8px', 
            marginRight: '10px', 
            width: '200px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
        />
        <button 
          onClick={addMessage}
          disabled={loading || !message.trim()}
          style={{
            padding: '8px 16px',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '추가 중...' : '메시지 추가'}
        </button>
      </div>

      {/* 목록 새로고침 */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={loadMessages}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#34a853',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '로딩 중...' : '목록 새로고침'}
        </button>
      </div>

      {/* 메시지 목록 */}
      <div>
        <h4>저장된 메시지 ({messages.length}개):</h4>
        {messages.length === 0 ? (
          <p style={{ color: '#666' }}>메시지가 없습니다. 위에서 추가해보세요!</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {messages.map((msg) => (
              <li key={msg.id} style={{ 
                padding: '10px', 
                margin: '5px 0', 
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{msg.text}</span>
                <button 
                  onClick={() => deleteMessage(msg.id)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#ea4335',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 상태 표시 */}
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <p>✅ Firebase 연결: 성공</p>
        <p>📝 테스트 컬렉션: 'test'</p>
        <p>🔧 브라우저 개발자 도구 콘솔에서 로그 확인 가능</p>
      </div>
    </div>
  );
};

export default FirestoreTest;
