import axios from 'axios';
import type { SceneMeta, SceneDetail, TrackData, TracklogMeta, TaskData } from '@adventure-racing/shared';

const api = axios.create({ baseURL: '/api' });

export async function uploadScene(
  sceneName: string,
  files: File[],
  onProgress?: (pct: number) => void
): Promise<{ sceneId: string; status: string }> {
  const form = new FormData();
  form.append('sceneName', sceneName);
  files.forEach(f => form.append('files', f));

  const { data } = await api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (e.total && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return data;
}

export async function listScenes(): Promise<SceneMeta[]> {
  const { data } = await api.get('/scenes');
  return data;
}

export async function getScene(id: string): Promise<SceneDetail> {
  const { data } = await api.get(`/scenes/${id}`);
  return data;
}

export async function getCompressedTrack(sceneId: string, tracklogId: string): Promise<TrackData> {
  const { data } = await api.get(`/scenes/${sceneId}/tracks/${tracklogId}`);
  return data;
}

export async function deleteScene(id: string): Promise<void> {
  await api.delete(`/scenes/${id}`);
}

export async function addTaskToScene(sceneId: string, file: File): Promise<TaskData> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post(`/scenes/${sceneId}/task`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteTaskFromScene(sceneId: string): Promise<void> {
  await api.delete(`/scenes/${sceneId}/task`);
}

export async function listTracklogs(): Promise<TracklogMeta[]> {
  const { data } = await api.get('/tracklogs');
  return data;
}
