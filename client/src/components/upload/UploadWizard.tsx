import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDropZone } from './FileDropZone';
import { uploadScene } from '../../api/scenesApi';

export function UploadWizard() {
  const [files, setFiles] = useState<File[]>([]);
  const [sceneName, setSceneName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleUpload = useCallback(async () => {
    if (!sceneName.trim()) {
      setError('Please enter a scene name');
      return;
    }
    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    const taskFileCount = files.filter(f => /\.(xctsk|tsk)$/i.test(f.name)).length;
    if (taskFileCount > 1) {
      setError('Only one task file per scene is allowed');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const result = await uploadScene(sceneName.trim(), files, setProgress);
      navigate(`/scenes/${result.sceneId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Upload failed');
      setUploading(false);
    }
  }, [files, sceneName, navigate]);

  return (
    <div style={{
      background: '#161616',
      borderRadius: 8,
      padding: 24,
      border: '1px solid #333',
    }}>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>Create New Scene</h2>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, color: '#aaa', marginBottom: 6 }}>
          Scene Name
        </label>
        <input
          type="text"
          value={sceneName}
          onChange={(e) => setSceneName(e.target.value)}
          placeholder="e.g., Red Bull X-Alps Day 3"
          disabled={uploading}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: '#222',
            border: '1px solid #444',
            borderRadius: 6,
            color: '#fff',
            fontSize: 14,
            outline: 'none',
          }}
        />
      </div>

      <FileDropZone files={files} onFilesChange={uploading ? () => {} : setFiles} />

      {error && (
        <p style={{ color: '#f44', fontSize: 14, marginTop: 12 }}>{error}</p>
      )}

      <button
        onClick={handleUpload}
        disabled={uploading || files.length === 0 || !sceneName.trim()}
        style={{
          marginTop: 16,
          width: '100%',
          padding: '12px',
          background: uploading ? '#333' : '#1976d2',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 15,
          fontWeight: 600,
          opacity: (uploading || files.length === 0 || !sceneName.trim()) ? 0.5 : 1,
        }}
      >
        {uploading ? `Uploading... ${progress}%` : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}
