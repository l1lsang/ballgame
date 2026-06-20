const env = import.meta.env || {};
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const ready = Object.values(firebaseConfig).every(Boolean);
let playerRef = null;
let database = null;
let lastPublish = 0;
let currentName = '';

export async function connectArena(name, onPlayers) {
  currentName = name;
  if (!ready) return { online: false, reason: 'Firebase 환경 변수가 없습니다.' };

  try {
    const { initializeApp } = await import('firebase/app');
    const { getAuth, signInAnonymously } = await import('firebase/auth');
    const { getDatabase, onDisconnect, onValue, ref, serverTimestamp, set, update: updateData } = await import('firebase/database');
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    database = getDatabase(app);
    const credential = await signInAnonymously(auth);
    playerRef = ref(database, `players/${credential.user.uid}`);
    await onDisconnect(playerRef).remove();
    await set(playerRef, {
      name,
      x: 0,
      y: 0,
      level: 1,
      color: '#7c5cff',
      updatedAt: serverTimestamp(),
    });

    onValue(ref(database, 'players'), (snapshot) => {
      const all = snapshot.val() || {};
      delete all[credential.user.uid];
      onPlayers(all);
    });

    publishPlayer.updateData = updateData;
    publishPlayer.serverTimestamp = serverTimestamp;
    return { online: true, uid: credential.user.uid };
  } catch (error) {
    console.warn('Firebase 연결 실패, 로컬 모드로 전환합니다.', error);
    return { online: false, reason: error.message };
  }
}

export function publishPlayer(player) {
  if (!playerRef || !publishPlayer.updateData || performance.now() - lastPublish < 90) return;
  lastPublish = performance.now();
  publishPlayer.updateData(playerRef, {
    name: currentName,
    x: Math.round(player.x),
    y: Math.round(player.y),
    level: player.level,
    color: player.color,
    updatedAt: publishPlayer.serverTimestamp(),
  }).catch(() => {});
}
