import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

// 컬렉션 이름 상수
export const COLLECTIONS = {
  ROOMS: 'rooms',
  GAMES: 'games',
  PLAYERS: 'players',
  QUESTIONS: 'questions'
};

// 방(Room) 관련 함수
export const createRoom = async (roomData: any) => {
  try {
    const docRef = await addDoc(collection(db, COLLECTIONS.ROOMS), {
      ...roomData,
      createdAt: serverTimestamp(),
      lastActivity: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error('방 생성 오류:', error);
    throw error;
  }
};

export const updateRoom = async (roomId: string, updateData: any) => {
  try {
    const roomRef = doc(db, COLLECTIONS.ROOMS, roomId);
    await updateDoc(roomRef, {
      ...updateData,
      lastActivity: serverTimestamp()
    });
  } catch (error) {
    console.error('방 업데이트 오류:', error);
    throw error;
  }
};

export const deleteRoom = async (roomId: string) => {
  try {
    await deleteDoc(doc(db, COLLECTIONS.ROOMS, roomId));
  } catch (error) {
    console.error('방 삭제 오류:', error);
    throw error;
  }
};

export const getRoom = async (roomId: string) => {
  try {
    const roomRef = doc(db, COLLECTIONS.ROOMS, roomId);
    const roomSnap = await getDoc(roomRef);
    
    if (roomSnap.exists()) {
      return { id: roomSnap.id, ...roomSnap.data() };
    } else {
      return null;
    }
  } catch (error) {
    console.error('방 조회 오류:', error);
    throw error;
  }
};

export const getPublicRooms = async () => {
  try {
    const q = query(
      collection(db, COLLECTIONS.ROOMS),
      where('isPublic', '==', true),
      orderBy('lastActivity', 'desc'),
      limit(50)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('공개 방 목록 조회 오류:', error);
    throw error;
  }
};

// 실시간 방 상태 구독
export const subscribeToRoom = (roomId: string, callback: (data: any) => void) => {
  const roomRef = doc(db, COLLECTIONS.ROOMS, roomId);
  
  return onSnapshot(roomRef, (doc) => {
    if (doc.exists()) {
      callback({ id: doc.id, ...doc.data() });
    } else {
      callback(null);
    }
  });
};

// 게임 관련 함수
export const createGame = async (roomId: string, gameData: any) => {
  try {
    const gameRef = await addDoc(collection(db, COLLECTIONS.GAMES), {
      roomId,
      ...gameData,
      createdAt: serverTimestamp()
    });
    return gameRef.id;
  } catch (error) {
    console.error('게임 생성 오류:', error);
    throw error;
  }
};

export const updateGame = async (gameId: string, updateData: any) => {
  try {
    const gameRef = doc(db, COLLECTIONS.GAMES, gameId);
    await updateDoc(gameRef, updateData);
  } catch (error) {
    console.error('게임 업데이트 오류:', error);
    throw error;
  }
};

// 플레이어 관련 함수
export const addPlayer = async (roomId: string, playerData: any) => {
  try {
    const playerRef = await addDoc(collection(db, COLLECTIONS.PLAYERS), {
      roomId,
      ...playerData,
      joinedAt: serverTimestamp()
    });
    return playerRef.id;
  } catch (error) {
    console.error('플레이어 추가 오류:', error);
    throw error;
  }
};

export const updatePlayer = async (playerId: string, updateData: any) => {
  try {
    const playerRef = doc(db, COLLECTIONS.PLAYERS, playerId);
    await updateDoc(playerRef, updateData);
  } catch (error) {
    console.error('플레이어 업데이트 오류:', error);
    throw error;
  }
};

export const getRoomPlayers = async (roomId: string) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.PLAYERS),
      where('roomId', '==', roomId)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('방 플레이어 목록 조회 오류:', error);
    throw error;
  }
};

// 실시간 플레이어 목록 구독
export const subscribeToRoomPlayers = (roomId: string, callback: (players: any[]) => void) => {
  const q = query(
    collection(db, COLLECTIONS.PLAYERS),
    where('roomId', '==', roomId)
  );
  
  return onSnapshot(q, (querySnapshot) => {
    const players = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(players);
  });
};

// 문제 관련 함수
export const addQuestion = async (roomId: string, questionData: any) => {
  try {
    const questionRef = await addDoc(collection(db, COLLECTIONS.QUESTIONS), {
      roomId,
      ...questionData,
      createdAt: serverTimestamp()
    });
    return questionRef.id;
  } catch (error) {
    console.error('문제 추가 오류:', error);
    throw error;
  }
};

export const getRoomQuestions = async (roomId: string) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.QUESTIONS),
      where('roomId', '==', roomId),
      orderBy('createdAt', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('방 문제 목록 조회 오류:', error);
    throw error;
  }
};

// 실시간 문제 목록 구독
export const subscribeToRoomQuestions = (roomId: string, callback: (questions: any[]) => void) => {
  const q = query(
    collection(db, COLLECTIONS.QUESTIONS),
    where('roomId', '==', roomId),
    orderBy('createdAt', 'asc')
  );
  
  return onSnapshot(q, (querySnapshot) => {
    const questions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(questions);
  });
};
