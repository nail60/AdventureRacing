import { useCallback, useState, useRef } from 'react';

interface Props {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

export function FileDropZone({ files, onFilesChange }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => {
      const ext = f.name.toLowerCase().split('.').pop();
      return ['igc', 'kmz', 'kml', 'xctsk', 'tsk'].includes(ext || '');
    });
    onFilesChange([...files, ...dropped]);
  }, [files, onFilesChange]);

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    onFilesChange([...files, ...selected]);
    if (inputRef.current) inputRef.current.value = '';
  }, [files, onFilesChange]);

  const removeFile = useCallback((index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  }, [files, onFilesChange]);

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#4fc3f7' : '#444'}`,
          borderRadius: 8,
          padding: 40,
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'rgba(79,195,247,0.05)' : 'transparent',
          transition: 'all 0.2s',
        }}
      >
        <p style={{ fontSize: 16, color: '#aaa' }}>
          Drop IGC/KMZ/KML/TSK files here or click to browse
        </p>
        <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
          Up to 120 files supported
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".igc,.kmz,.kml,.xctsk,.tsk"
          onChange={handleSelect}
          style={{ display: 'none' }}
        />
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 14, color: '#aaa', marginBottom: 8 }}>
            {files.length} file{files.length !== 1 ? 's' : ''} selected
          </p>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {files.map((f, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                background: i % 2 === 0 ? '#1a1a1a' : 'transparent',
                borderRadius: 4,
                fontSize: 13,
              }}>
                <span>{f.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f44',
                    fontSize: 16,
                    padding: '2px 6px',
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
