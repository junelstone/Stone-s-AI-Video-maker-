// Video library: every video is kept on this device (IndexedDB).
// Signed-in users also get a copy in Supabase Storage so it follows them anywhere.
import { CONFIG } from './config.js';
import { supabase, currentUser } from './supabase.js';

const DB_NAME = 'stone-ai-video';
const STORE = 'videos';
let dbPromise;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const r = fn(s);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

export const localStore = {
  put: (item) => tx('readwrite', (s) => s.put(item)),
  get: (id) => tx('readonly', (s) => s.get(id)),
  delete: (id) => tx('readwrite', (s) => s.delete(id)),
  all: async () => {
    const items = (await tx('readonly', (s) => s.getAll())) || [];
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },
};

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function saveVideo(meta, blob) {
  const item = { ...meta, blob, createdAt: Date.now(), cloud: false };
  await localStore.put(item);
  const user = currentUser();
  if (user && supabase) {
    try {
      await uploadToCloud(item, user);
      item.cloud = true;
      await localStore.put(item);
    } catch (e) {
      console.warn('Cloud save failed, kept on device', e);
      item.cloudError = e.message;
    }
  }
  return item;
}

async function uploadToCloud(item, user) {
  const base = `${user.id}/${item.id}`;
  const videoPath = `${base}.${item.ext}`;
  const thumbPath = `${base}.jpg`;
  const bucket = supabase.storage.from(CONFIG.STORAGE_BUCKET);
  let { error } = await bucket.upload(videoPath, item.blob, { contentType: item.mime, upsert: true });
  if (error) throw error;
  ({ error } = await bucket.upload(thumbPath, dataUrlToBlob(item.thumb), { contentType: 'image/jpeg', upsert: true }));
  if (error) throw error;
  ({ error } = await supabase.from('videos').insert({
    id: item.id,
    user_id: user.id,
    title: item.title,
    prompt: item.prompt,
    mode: item.mode,
    style: item.style,
    aspect: item.aspect,
    duration: item.duration,
    mime: item.mime,
    storage_path: videoPath,
    thumb_path: thumbPath,
    engine: item.engine,
  }));
  if (error) throw error;
}

// Cloud videos not on this device yet.
export async function listCloudVideos() {
  const user = currentUser();
  if (!user || !supabase) return [];
  const { data, error } = await supabase.from('videos').select('*').order('created_at', { ascending: false }).limit(60);
  if (error) {
    console.warn(error);
    return [];
  }
  const bucket = supabase.storage.from(CONFIG.STORAGE_BUCKET);
  const thumbs = await bucket.createSignedUrls(data.map((v) => v.thumb_path), 3600);
  return data.map((v, i) => ({
    id: v.id,
    title: v.title,
    prompt: v.prompt,
    mode: v.mode,
    style: v.style,
    aspect: v.aspect,
    duration: v.duration,
    mime: v.mime,
    ext: v.storage_path.split('.').pop(),
    thumb: thumbs.data?.[i]?.signedUrl || '',
    createdAt: new Date(v.created_at).getTime(),
    storagePath: v.storage_path,
    thumbPath: v.thumb_path,
    cloud: true,
    remoteOnly: true,
  }));
}

export async function signedVideoUrl(item, seconds = 3600) {
  if (!supabase) return null;
  const path = item.storagePath || `${currentUser()?.id}/${item.id}.${item.ext}`;
  const { data, error } = await supabase.storage.from(CONFIG.STORAGE_BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteVideo(item) {
  await localStore.delete(item.id);
  const user = currentUser();
  if (item.cloud && user && supabase) {
    const path = item.storagePath || `${user.id}/${item.id}.${item.ext}`;
    const thumb = item.thumbPath || `${user.id}/${item.id}.jpg`;
    await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove([path, thumb]);
    await supabase.from('videos').delete().eq('id', item.id);
  }
}
